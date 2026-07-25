"""HTTP controllers for the cartograph API."""

import asyncio
import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from arcgis.geometry import Point
from fastapi import APIRouter, HTTPException, Request, Response, status

from backend.resolvers import (
    connect_database,
    create_shopping_list,
    delete_shopping_list,
    get_shopping_list,
    list_shopping_lists,
    load_optimization_catalog,
    replace_shopping_list,
    update_shopping_list_name,
)
from backend.route_optimizer import (
    DirectedTravelMatrix,
    NoEligibleProductsError,
    NoFeasibleRouteError,
    OptimizationFailedError,
    optimize_routes,
)
from backend.recipe_import import (
    RecipeImportProviderError,
    RecipeImportSourceError,
    resolve_recipe_source,
)
from backend.types import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantRecipeImportRequest,
    AssistantRecipeImportResponse,
    HealthResponse,
    RouteOptimizationErrorCode,
    RouteOptimizationRequest,
    RouteOptimizationResponse,
    ShoppingList,
    ShoppingListCreate,
    ShoppingListNameUpdate,
    ShoppingListReplace,
)


router = APIRouter(prefix="/api/v1")
logger = logging.getLogger(__name__)


class RouteOptimizationHttpError(Exception):
    def __init__(
        self,
        status_code: int,
        detail: str,
        error_code: RouteOptimizationErrorCode,
    ) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code


@contextmanager
def _request_database(request: Request) -> Iterator[sqlite3.Connection]:
    connection = connect_database(request.app.state.database_path)
    try:
        yield connection
    finally:
        connection.close()


def _shopping_list_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Shopping list not found")


def _optimization_error(
    status_code: int, detail: str, error_code: RouteOptimizationErrorCode
) -> RouteOptimizationHttpError:
    return RouteOptimizationHttpError(status_code, detail, error_code)


@router.post(
    "/assistant/recipe-import",
    response_model=AssistantRecipeImportResponse,
    tags=["assistant"],
)
async def post_assistant_recipe_import(
    request: Request,
    payload: AssistantRecipeImportRequest,
) -> AssistantRecipeImportResponse:
    provider = request.app.state.recipe_import_provider
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Carter is not configured yet.",
        )

    try:
        recipe_text = await resolve_recipe_source(payload)
        return await provider.import_recipe(recipe_text)
    except RecipeImportSourceError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except RecipeImportProviderError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post(
    "/assistant/chat",
    response_model=AssistantChatResponse,
    tags=["assistant"],
)
async def post_assistant_chat(
    request: Request,
    payload: AssistantChatRequest,
) -> AssistantChatResponse:
    provider = request.app.state.recipe_import_provider
    if provider is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Carter is not configured yet.",
        )

    try:
        return AssistantChatResponse(message=await provider.answer_question(payload.message))
    except RecipeImportProviderError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def get_health() -> HealthResponse:
    return HealthResponse()


@router.post(
    "/shopping-lists",
    response_model=ShoppingList,
    status_code=status.HTTP_201_CREATED,
    tags=["shopping lists"],
)
def post_shopping_list(
    request: Request, payload: ShoppingListCreate
) -> ShoppingList:
    with _request_database(request) as connection:
        return create_shopping_list(connection, payload)


@router.get(
    "/shopping-lists",
    response_model=list[ShoppingList],
    tags=["shopping lists"],
)
def get_shopping_lists(request: Request) -> list[ShoppingList]:
    with _request_database(request) as connection:
        return list_shopping_lists(connection)


@router.get(
    "/shopping-lists/{shopping_list_id}",
    response_model=ShoppingList,
    tags=["shopping lists"],
)
def get_shopping_list_by_id(
    request: Request, shopping_list_id: int
) -> ShoppingList:
    with _request_database(request) as connection:
        shopping_list = get_shopping_list(connection, shopping_list_id)
    if shopping_list is None:
        raise _shopping_list_not_found()
    return shopping_list


@router.put(
    "/shopping-lists/{shopping_list_id}",
    response_model=ShoppingList,
    tags=["shopping lists"],
)
def put_shopping_list(
    request: Request,
    shopping_list_id: int,
    payload: ShoppingListReplace,
) -> ShoppingList:
    with _request_database(request) as connection:
        shopping_list = replace_shopping_list(connection, shopping_list_id, payload)
    if shopping_list is None:
        raise _shopping_list_not_found()
    return shopping_list


@router.patch(
    "/shopping-lists/{shopping_list_id}/name",
    response_model=ShoppingList,
    tags=["shopping lists"],
)
def patch_shopping_list_name(
    request: Request,
    shopping_list_id: int,
    payload: ShoppingListNameUpdate,
) -> ShoppingList:
    with _request_database(request) as connection:
        shopping_list = update_shopping_list_name(
            connection, shopping_list_id, payload
        )
    if shopping_list is None:
        raise _shopping_list_not_found()
    return shopping_list


@router.post(
    "/shopping-lists/{shopping_list_id}/route-candidates",
    response_model=RouteOptimizationResponse,
    tags=["shopping lists"],
)
async def post_shopping_list_route_candidates(
    request: Request,
    shopping_list_id: int,
    payload: RouteOptimizationRequest,
) -> RouteOptimizationResponse:
    with _request_database(request) as connection:
        shopping_list = get_shopping_list(connection, shopping_list_id)
        if shopping_list is None:
            raise _shopping_list_not_found()
        if not shopping_list.tags:
            raise _optimization_error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                "Shopping list has no tags",
                RouteOptimizationErrorCode.NO_ELIGIBLE_PRODUCTS,
            )
        try:
            catalog = load_optimization_catalog(
                connection, sorted(shopping_list.tags)
            )
        except ValueError as error:
            raise _optimization_error(
                status.HTTP_422_UNPROCESSABLE_CONTENT,
                str(error),
                RouteOptimizationErrorCode.OPTIMIZATION_FAILED,
            ) from error

    if not catalog.products:
        raise _optimization_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "No requested tag has an eligible current-price product",
            RouteOptimizationErrorCode.NO_ELIGIBLE_PRODUCTS,
        )

    provider = request.app.state.travel_matrix_provider
    if provider is None:
        raise _optimization_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Travel matrix provider is unavailable",
            RouteOptimizationErrorCode.MATRIX_UNAVAILABLE,
        )

    current_location = Point(
        {
            "x": payload.longitude,
            "y": payload.latitude,
            "spatialReference": {"wkid": 4326},
        }
    )
    try:
        matrices = await provider.get_route_travel_matrices(
            current_location, catalog.stores
        )
        travel = DirectedTravelMatrix.compose(matrices)
    except Exception as error:
        logger.exception(
            "route matrix unavailable for shopping_list_id=%s stores=%s",
            shopping_list_id,
            len(catalog.stores),
        )
        raise _optimization_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Travel matrix could not be loaded or regenerated",
            RouteOptimizationErrorCode.MATRIX_UNAVAILABLE,
        ) from error

    try:
        result = await asyncio.to_thread(
            optimize_routes,
            catalog,
            travel,
            limit=payload.limit,
            policy=request.app.state.route_score_policy,
            settings=request.app.state.solver_settings,
        )
    except NoEligibleProductsError as error:
        raise _optimization_error(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            str(error),
            RouteOptimizationErrorCode.NO_ELIGIBLE_PRODUCTS,
        ) from error
    except (NoFeasibleRouteError, OptimizationFailedError, ValueError) as error:
        raise _optimization_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            str(error),
            RouteOptimizationErrorCode.OPTIMIZATION_FAILED,
        ) from error

    logger.info(
        "optimized shopping_list_id=%s tags=%s stores=%s products=%s "
        "requested=%s returned=%s status=%s proven_prefix=%s elapsed=%.3f",
        shopping_list_id,
        len(catalog.requested_tags),
        len(catalog.stores),
        len(catalog.products),
        payload.limit,
        len(result.candidates),
        result.status.value,
        result.proven_prefix_count,
        result.elapsed_seconds,
    )
    return result


@router.delete(
    "/shopping-lists/{shopping_list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["shopping lists"],
)
def remove_shopping_list(request: Request, shopping_list_id: int) -> Response:
    with _request_database(request) as connection:
        deleted = delete_shopping_list(connection, shopping_list_id)
    if not deleted:
        raise _shopping_list_not_found()
    return Response(status_code=status.HTTP_204_NO_CONTENT)