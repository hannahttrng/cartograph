"""Single-process orchestration for the global active-list route calculation."""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass
from pathlib import Path
from threading import Event
from time import time

from arcgis.geometry import Point

from backend.arcgis_connector import RouteTravelMatrices, TravelMatrixProvider
from backend.resolvers import (
    ActiveShoppingListSnapshot,
    begin_route_calculation,
    complete_empty_route_calculation,
    connect_database,
    fail_route_calculation,
    get_route_calculation,
    load_active_shopping_list_snapshot,
    load_optimization_catalog,
    publish_route_calculation,
)
from backend.route_optimizer import (
    DirectedTravelMatrix,
    NoEligibleProductsError,
    NoFeasibleRouteError,
    OptimizationFailedError,
    RouteOptimizationCancelled,
    RouteScorePolicy,
    SolverSettings,
    optimize_routes,
)
from backend.shopping_list_aggregation import combine_active_shopping_list_items
from backend.types import RouteCalculationResponse, RouteCalculationStatus, RouteOptimizationErrorCode
from backend.unit_conversion import UnitConversionError


logger = logging.getLogger(__name__)
FIXED_REDLANDS_ORIGIN = Point(
    {
        "x": -117.1825,
        "y": 34.0556,
        "spatialReference": {"wkid": 4326},
    }
)


@dataclass(slots=True)
class _ActiveCalculation:
    generation: int
    cancellation: Event
    task: asyncio.Task[None]
    matrix_task: asyncio.Task[RouteTravelMatrices] | None = None


class _MatrixUnavailableError(RuntimeError):
    pass


class RouteCalculationManager:
    """Own the one in-process worker for the current global generation."""

    def __init__(
        self,
        database_path: str | Path,
        provider: TravelMatrixProvider,
        policy: RouteScorePolicy,
        settings: SolverSettings,
        *,
        limit: int = 10,
    ) -> None:
        self._database_path = Path(database_path)
        self._provider = provider
        self._policy = policy
        self._settings = settings
        self._limit = limit
        self._lock = asyncio.Lock()
        self._active: _ActiveCalculation | None = None

    def get_status(self) -> RouteCalculationResponse:
        connection = connect_database(self._database_path)
        try:
            return get_route_calculation(connection)
        finally:
            connection.close()

    async def recover(self) -> None:
        status = self.get_status()
        connection = connect_database(self._database_path)
        try:
            snapshot = load_active_shopping_list_snapshot(connection)
        finally:
            connection.close()
        if status.status == RouteCalculationStatus.RUNNING or (
            status.generation == 0 and snapshot.active_list_count > 0
        ):
            await self.request_recalculation()

    async def request_recalculation(self) -> RouteCalculationResponse:
        async with self._lock:
            previous = self._active
            if previous is not None:
                previous.cancellation.set()
                if previous.matrix_task is not None:
                    previous.matrix_task.cancel()

            connection = connect_database(self._database_path)
            try:
                snapshot = load_active_shopping_list_snapshot(connection)
                running = begin_route_calculation(
                    connection,
                    active_list_count=snapshot.active_list_count,
                    item_count=len({item.tag for item in snapshot.items}),
                    started_at=time(),
                )
            finally:
                connection.close()

            cancellation = Event()
            previous_task = previous.task if previous is not None else None
            task = asyncio.create_task(
                self._run_generation(
                    running.generation,
                    snapshot,
                    cancellation,
                    previous_task,
                ),
                name=f"route-calculation-{running.generation}",
            )
            self._active = _ActiveCalculation(
                generation=running.generation,
                cancellation=cancellation,
                task=task,
            )
            return running

    async def wait_for_current(self) -> None:
        active = self._active
        if active is not None:
            await active.task

    async def shutdown(self) -> None:
        async with self._lock:
            active = self._active
            if active is None:
                return
            active.cancellation.set()
            if active.matrix_task is not None:
                active.matrix_task.cancel()
        await active.task

    async def _run_generation(
        self,
        generation: int,
        snapshot: ActiveShoppingListSnapshot,
        cancellation: Event,
        previous_task: asyncio.Task[None] | None,
    ) -> None:
        try:
            if previous_task is not None:
                await previous_task
            if cancellation.is_set():
                return

            items = combine_active_shopping_list_items(
                snapshot.items, snapshot.tag_defaults
            )
            if not items:
                self._complete_empty(generation)
                return

            connection = connect_database(self._database_path)
            try:
                catalog = load_optimization_catalog(connection, items)
            finally:
                connection.close()
            if not catalog.products:
                raise NoEligibleProductsError(
                    "No active-list item has an eligible current-price product"
                )
            if cancellation.is_set():
                return

            matrix_task = asyncio.create_task(
                self._provider.get_route_travel_matrices(
                    FIXED_REDLANDS_ORIGIN,
                    catalog.stores,
                )
            )
            active = self._active
            if active is not None and active.generation == generation:
                active.matrix_task = matrix_task
            try:
                try:
                    matrices = await matrix_task
                    travel = DirectedTravelMatrix.compose(matrices)
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    raise _MatrixUnavailableError(
                        "Travel matrix could not be generated"
                    ) from error
            except asyncio.CancelledError:
                if cancellation.is_set():
                    return
                raise
            finally:
                active = self._active
                if active is not None and active.generation == generation:
                    active.matrix_task = None

            result = await asyncio.to_thread(
                optimize_routes,
                catalog,
                travel,
                limit=self._limit,
                policy=self._policy,
                settings=self._settings,
                should_cancel=cancellation.is_set,
            )
            if cancellation.is_set():
                return

            connection = connect_database(self._database_path)
            try:
                publish_route_calculation(
                    connection,
                    generation,
                    result,
                    catalog,
                    completed_at=time(),
                )
            finally:
                connection.close()
        except RouteOptimizationCancelled:
            return
        except UnitConversionError as error:
            self._fail(
                generation,
                RouteOptimizationErrorCode.UNIT_CONVERSION_FAILED,
                str(error),
            )
        except NoEligibleProductsError as error:
            self._fail(
                generation,
                RouteOptimizationErrorCode.NO_ELIGIBLE_PRODUCTS,
                str(error),
            )
        except _MatrixUnavailableError as error:
            self._fail(
                generation,
                RouteOptimizationErrorCode.MATRIX_UNAVAILABLE,
                str(error),
            )
        except (NoFeasibleRouteError, OptimizationFailedError, ValueError) as error:
            self._fail(
                generation,
                RouteOptimizationErrorCode.OPTIMIZATION_FAILED,
                str(error),
            )
        except asyncio.CancelledError:
            if not cancellation.is_set():
                raise
        except Exception as error:
            logger.exception("route calculation failed for generation=%s", generation)
            self._fail(
                generation,
                RouteOptimizationErrorCode.OPTIMIZATION_FAILED,
                "Route calculation failed",
            )
        finally:
            async with self._lock:
                active = self._active
                if active is not None and active.generation == generation:
                    self._active = None

    def _complete_empty(self, generation: int) -> None:
        connection = connect_database(self._database_path)
        try:
            complete_empty_route_calculation(
                connection,
                generation,
                completed_at=time(),
            )
        finally:
            connection.close()

    def _fail(
        self,
        generation: int,
        error_code: RouteOptimizationErrorCode,
        detail: str,
    ) -> None:
        connection = connect_database(self._database_path)
        try:
            fail_route_calculation(
                connection,
                generation,
                error_code=error_code,
                detail=detail,
                completed_at=time(),
            )
        finally:
            connection.close()
