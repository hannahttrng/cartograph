import asyncio
from pathlib import Path

from backend.arcgis_connector import (
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMetric,
)
from backend.route_calculation import RouteCalculationManager
from backend.resolvers import (
    begin_route_calculation,
    connect_database,
    fail_route_calculation,
    get_route_calculation,
    get_route_candidates,
    initialize_database,
    publish_route_calculation,
)
from backend.route_optimizer import (
    OptimizationCatalog,
    OptimizationProduct,
    RouteScorePolicy,
    SolverSettings,
)
from backend.types import (
    RouteCandidate,
    RouteCandidatesResponse,
    RouteCalculationResponse,
    RouteCalculationStatus,
    RouteOptimizationErrorCode,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    ShoppingListItem,
    Store,
)


def _seed_route_catalog(database_path: Path) -> OptimizationCatalog:
    connection = connect_database(database_path)
    try:
        connection.execute(
            """
            INSERT INTO stores (id, name, address, latitude, longitude)
            VALUES (10, 'Market', '1 Main St', 34.0, -117.0)
            """
        )
        connection.execute(
            """
            INSERT INTO products (
                id, name, store_id, unit, current_price_date,
                current_price, current_price_quantity, current_price_sale
            ) VALUES (100, 'Whole Milk', 10, 'gallon', 100, 4.25, 1, 0)
            """
        )
    finally:
        connection.close()

    item = ShoppingListItem(
        tag="milk", modifiers=["organic"], unit="gallon", quantity=2
    )
    return OptimizationCatalog(
        requested_items=(item,),
        stores=(
            Store(
                id=10,
                name="Market",
                address="1 Main St",
                latitude=34.0,
                longitude=-117.0,
                products=[100],
            ),
        ),
        products=(
            OptimizationProduct(
                id=100,
                name="Whole Milk",
                store_id=10,
                unit="gallon",
                price=4.25,
                price_quantity=1,
                modifiers=("on sale", "organic"),
                matching_item_indices=(0,),
            ),
        ),
    )


def _optimization_result() -> RouteOptimizationResponse:
    return RouteOptimizationResponse(
        candidates=[
            RouteCandidate(
                stores=[10],
                products=[100],
                selections=[
                    {
                        "tag": "milk",
                        "modifiers": ["organic"],
                        "unit": "gallon",
                        "quantity": 2,
                        "product": 100,
                    }
                ],
                distance=2.5,
                time=6,
                productPrice=8.5,
                matchedItemCount=1,
                score=14.75,
                scoreComponents={
                    "productPrice": 8.5,
                    "distanceCost": 1.75,
                    "timeCost": 2.0,
                    "storeCost": 2.5,
                    "modifierPenalty": 0,
                },
            )
        ],
        status=RouteOptimizationStatus.HEURISTIC,
        requestedLimit=10,
        provenPrefixCount=0,
        elapsedSeconds=0.25,
        timeoutSeconds=10,
    )


def _matrices(store_ids: list[int]) -> RouteTravelMatrices:
    metric = TravelMetric(distanceMiles=1, travelTimeMinutes=2)
    zero = TravelMetric(distanceMiles=0, travelTimeMinutes=0)
    return RouteTravelMatrices(
        storeMatrix=StoreTravelMatrix(
            storeIds=store_ids,
            matrix=[
                [zero if row == column else metric for column in range(len(store_ids))]
                for row in range(len(store_ids))
            ],
        ),
        currentLocationMatrix=CurrentLocationTravelMatrix(
            storeIds=store_ids,
            matrix=[
                [metric for _ in store_ids],
                [metric for _ in store_ids],
            ],
        ),
    )


def _seed_active_list(database_path: Path) -> None:
    connection = connect_database(database_path)
    try:
        connection.execute("INSERT INTO tags VALUES ('milk', 'gallon', 1)")
        connection.execute(
            """
            INSERT INTO stores (id, name, address, latitude, longitude)
            VALUES (10, 'Market', '1 Main St', 34.0, -117.0)
            """
        )
        connection.execute(
            """
            INSERT INTO products (
                id, name, store_id, unit, current_price_date,
                current_price, current_price_quantity, current_price_sale
            ) VALUES (100, 'Whole Milk', 10, 'gallon', 100, 4.25, 1, 0)
            """
        )
        connection.execute("INSERT INTO tag_products VALUES ('milk', 100)")
        connection.execute(
            "INSERT INTO shopping_lists (id, name, active) VALUES (1, 'Weekly', 1)"
        )
        connection.execute(
            """
            INSERT INTO shopping_list_items (
                shopping_list_id, position, tag, unit, quantity
            ) VALUES (1, 0, 'milk', 'gallon', 2)
            """
        )
    finally:
        connection.close()


class _ImmediateProvider:
    async def get_route_travel_matrices(
        self, _location: object, stores: object
    ) -> RouteTravelMatrices:
        return _matrices([store.id for store in stores])  # type: ignore[union-attr]


class _BlockingFirstProvider(_ImmediateProvider):
    def __init__(self) -> None:
        self.calls = 0
        self.first_started = asyncio.Event()
        self.first_cancelled = asyncio.Event()

    async def get_route_travel_matrices(
        self, location: object, stores: object
    ) -> RouteTravelMatrices:
        self.calls += 1
        if self.calls == 1:
            self.first_started.set()
            try:
                await asyncio.Future()
            except asyncio.CancelledError:
                self.first_cancelled.set()
                raise
        return await super().get_route_travel_matrices(location, stores)


def test_route_calculation_publishes_enriched_global_candidates(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "route-calculation.db"
    initialize_database(database_path)
    catalog = _seed_route_catalog(database_path)
    connection = connect_database(database_path)
    try:
        running = begin_route_calculation(
            connection,
            active_list_count=2,
            item_count=1,
            started_at=100,
        )
        assert running.status == RouteCalculationStatus.RUNNING
        assert publish_route_calculation(
            connection,
            running.generation,
            _optimization_result(),
            catalog,
            completed_at=101,
        )

        completed = get_route_calculation(connection)
        response = get_route_candidates(connection)
    finally:
        connection.close()

    assert completed.status == RouteCalculationStatus.SUCCEEDED
    assert completed.result_count == 1
    assert completed.optimizer_status == RouteOptimizationStatus.HEURISTIC
    assert response.generation == running.generation
    assert len(response.candidates) == 1
    candidate = response.candidates[0]
    assert candidate.stores[0].name == "Market"
    assert candidate.products[0].name == "Whole Milk"
    assert candidate.products[0].selection_price == 8.5
    assert candidate.products[0].modifiers == ["on sale", "organic"]
    assert candidate.selections[0].quantity == 2
    assert candidate.selections[0].modifiers == ["organic"]
    assert candidate.score_components.modifier_penalty == 0

    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO product_modifiers VALUES (100, 'changed later', 0)"
        )
        stable_response = get_route_candidates(connection)
    finally:
        connection.close()
    assert stable_response.candidates[0].products[0].modifiers == [
        "on sale",
        "organic",
    ]


def test_new_generation_clears_routes_and_rejects_stale_terminal_writes(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "route-generation.db"
    initialize_database(database_path)
    catalog = _seed_route_catalog(database_path)
    connection = connect_database(database_path)
    try:
        first = begin_route_calculation(
            connection,
            active_list_count=1,
            item_count=1,
            started_at=100,
        )
        assert publish_route_calculation(
            connection,
            first.generation,
            _optimization_result(),
            catalog,
            completed_at=101,
        )
        assert len(get_route_candidates(connection).candidates) == 1

        second = begin_route_calculation(
            connection,
            active_list_count=1,
            item_count=1,
            started_at=102,
        )
        assert get_route_candidates(connection).candidates == []
        assert not publish_route_calculation(
            connection,
            first.generation,
            _optimization_result(),
            catalog,
            completed_at=103,
        )
        assert not fail_route_calculation(
            connection,
            first.generation,
            error_code=RouteOptimizationErrorCode.OPTIMIZATION_FAILED,
            detail="stale",
            completed_at=103,
        )
        assert fail_route_calculation(
            connection,
            second.generation,
            error_code=RouteOptimizationErrorCode.MATRIX_UNAVAILABLE,
            detail="Matrix unavailable",
            completed_at=104,
        )
        failed = get_route_calculation(connection)
    finally:
        connection.close()

    assert failed.generation == second.generation
    assert failed.status == RouteCalculationStatus.FAILED
    assert failed.error_code == RouteOptimizationErrorCode.MATRIX_UNAVAILABLE
    assert failed.detail == "Matrix unavailable"


def test_manager_calculates_from_the_active_list_snapshot(tmp_path: Path) -> None:
    database_path = tmp_path / "manager-success.db"
    initialize_database(database_path)
    _seed_active_list(database_path)

    async def run() -> tuple[RouteCalculationResponse, RouteCandidatesResponse]:
        manager = RouteCalculationManager(
            database_path,
            _ImmediateProvider(),
            RouteScorePolicy(),
            SolverSettings(),
        )
        await manager.request_recalculation()
        await manager.wait_for_current()
        connection = connect_database(database_path)
        try:
            return get_route_calculation(connection), get_route_candidates(connection)
        finally:
            connection.close()

    status, candidates = asyncio.run(run())

    assert status.status == RouteCalculationStatus.SUCCEEDED
    assert status.active_list_count == 1
    assert status.item_count == 1
    assert status.result_count > 0
    assert candidates.generation == status.generation
    assert candidates.candidates[0].products[0].selection_price == 8.5


def test_manager_cancels_superseded_matrix_work(tmp_path: Path) -> None:
    database_path = tmp_path / "manager-cancel.db"
    initialize_database(database_path)
    _seed_active_list(database_path)

    async def run() -> tuple[int, int, _BlockingFirstProvider, RouteCalculationResponse]:
        provider = _BlockingFirstProvider()
        manager = RouteCalculationManager(
            database_path,
            provider,
            RouteScorePolicy(),
            SolverSettings(),
        )
        first = await manager.request_recalculation()
        await provider.first_started.wait()
        second = await manager.request_recalculation()
        await manager.wait_for_current()
        return first.generation, second.generation, provider, manager.get_status()

    first_generation, second_generation, provider, status = asyncio.run(run())

    assert second_generation == first_generation + 1
    assert provider.first_cancelled.is_set()
    assert provider.calls == 2
    assert status.generation == second_generation
    assert status.status == RouteCalculationStatus.SUCCEEDED
