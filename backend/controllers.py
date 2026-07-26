"""HTTP controllers for the cartograph API."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request, Response, status

from backend.resolvers import (
    connect_database,
    create_shopping_list,
    delete_shopping_list,
    get_route_candidates,
    get_shopping_list,
    list_tag_modifiers,
    list_tags,
    list_shopping_lists,
    replace_shopping_list,
    UnknownShoppingListTagError,
    update_shopping_list_active,
    update_shopping_list_name,
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
    RouteCalculationResponse,
    RouteCandidatesResponse,
    ShoppingList,
    ShoppingListActiveUpdate,
    ShoppingListCreate,
    ShoppingListNameUpdate,
    ShoppingListReplace,
    Tag,
)


router = APIRouter(prefix="/api/v1")


@contextmanager
def _request_database(request: Request) -> Iterator[sqlite3.Connection]:
    connection = connect_database(request.app.state.database_path)
    try:
        yield connection
    finally:
        connection.close()


def _shopping_list_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Shopping list not found")


def _tag_not_found() -> HTTPException:
    return HTTPException(status_code=404, detail="Tag not found")


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
        return AssistantChatResponse(
            message=await provider.answer_question(payload.message, payload.messages)
        )
    except RecipeImportProviderError as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.get("/health", response_model=HealthResponse, tags=["system"])
async def get_health() -> HealthResponse:
    return HealthResponse()


@router.get("/tags", response_model=list[Tag], tags=["catalog"])
def get_tags(request: Request) -> list[Tag]:
    with _request_database(request) as connection:
        return list_tags(connection)


@router.get(
    "/tags/{tag_id}/modifiers",
    response_model=list[str],
    tags=["catalog"],
)
def get_tag_modifiers(request: Request, tag_id: str) -> list[str]:
    with _request_database(request) as connection:
        modifiers = list_tag_modifiers(connection, tag_id)
    if modifiers is None:
        raise _tag_not_found()
    return modifiers


@router.post(
    "/shopping-lists",
    response_model=ShoppingList,
    status_code=status.HTTP_201_CREATED,
    tags=["shopping lists"],
)
async def post_shopping_list(
    request: Request, payload: ShoppingListCreate
) -> ShoppingList:
    with _request_database(request) as connection:
        try:
            shopping_list = create_shopping_list(connection, payload)
        except UnknownShoppingListTagError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(error),
            ) from error
    if shopping_list.active:
        await request.app.state.route_calculation_manager.request_recalculation()
    return shopping_list


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
async def put_shopping_list(
    request: Request,
    shopping_list_id: int,
    payload: ShoppingListReplace,
) -> ShoppingList:
    with _request_database(request) as connection:
        try:
            mutation = replace_shopping_list(
                connection, shopping_list_id, payload
            )
        except UnknownShoppingListTagError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(error),
            ) from error
    if mutation is None:
        raise _shopping_list_not_found()
    if mutation.route_calculation_required:
        await request.app.state.route_calculation_manager.request_recalculation()
    return mutation.shopping_list


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


@router.patch(
    "/shopping-lists/{shopping_list_id}/active",
    response_model=ShoppingList,
    tags=["shopping lists"],
)
async def patch_shopping_list_active(
    request: Request,
    shopping_list_id: int,
    payload: ShoppingListActiveUpdate,
) -> ShoppingList:
    with _request_database(request) as connection:
        mutation = update_shopping_list_active(
            connection, shopping_list_id, payload
        )
    if mutation is None:
        raise _shopping_list_not_found()
    if mutation.route_calculation_required:
        await request.app.state.route_calculation_manager.request_recalculation()
    return mutation.shopping_list


@router.get(
    "/route-calculation",
    response_model=RouteCalculationResponse,
    tags=["routes"],
)
def get_route_calculation_status(request: Request) -> RouteCalculationResponse:
    return request.app.state.route_calculation_manager.get_status()


@router.post(
    "/route-calculation",
    response_model=RouteCalculationResponse,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["routes"],
)
async def post_route_calculation(request: Request) -> RouteCalculationResponse:
    return await request.app.state.route_calculation_manager.request_recalculation()


@router.get(
    "/route-candidates",
    response_model=RouteCandidatesResponse,
    tags=["routes"],
)
def get_global_route_candidates(request: Request) -> RouteCandidatesResponse:
    with _request_database(request) as connection:
        return get_route_candidates(connection)


@router.delete(
    "/shopping-lists/{shopping_list_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["shopping lists"],
)
async def remove_shopping_list(request: Request, shopping_list_id: int) -> Response:
    with _request_database(request) as connection:
        deleted = delete_shopping_list(connection, shopping_list_id)
    if not deleted:
        raise _shopping_list_not_found()
    if deleted.active:
        await request.app.state.route_calculation_manager.request_recalculation()
    return Response(status_code=status.HTTP_204_NO_CONTENT)