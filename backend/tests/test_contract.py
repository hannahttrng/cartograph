import json
import sqlite3
from pathlib import Path

import pytest
from arcgis.geometry import Point
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.arcgis_connector import (
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMetric,
)
from backend.index import create_app
from backend.resolvers import (
    ProductPriceConflictError,
    clear_product_current_price,
    connect_database,
    create_shopping_list,
    delete_shopping_list,
    get_shopping_list,
    initialize_database,
    is_product_route_eligible,
    list_tag_modifiers,
    list_tags,
    list_shopping_lists,
    load_active_shopping_list_snapshot,
    record_product_price,
    replace_shopping_list,
    update_shopping_list_active,
    update_shopping_list_name,
)
from backend.types import (
    AssistantRecipeImportResponse,
    Price,
    Product,
    ProductCreate,
    Route,
    RouteCandidate,
    RouteCandidateResult,
    RouteCandidatesResponse,
    RouteCalculationResponse,
    RouteCalculationStatus,
    RouteCreate,
    RouteErrorCode,
    RouteOptimizationRequest,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    ShoppingList,
    ShoppingListActiveUpdate,
    ShoppingListCreate,
    ShoppingListNameUpdate,
    ShoppingListReplace,
    StoreCreate,
    Tag,
)


SHOPPING_LIST_CONTRACT_FIXTURE = (
    Path(__file__).parents[2] / "tests" / "fixtures" / "shopping-list-contract.json"
)


def _travel_metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(distanceMiles=distance, travelTimeMinutes=travel_time)


class _FakeTravelMatrixProvider:
    def __init__(self) -> None:
        self.current_location: Point | None = None

    async def get_route_travel_matrices(
        self, current_location: Point, stores: object
    ) -> RouteTravelMatrices:
        self.current_location = current_location
        store_items = list(stores)  # type: ignore[arg-type]
        store_ids = [store.id for store in store_items]
        size = len(store_ids)
        return RouteTravelMatrices(
            storeMatrix=StoreTravelMatrix(
                storeIds=store_ids,
                matrix=[
                    [
                        _travel_metric(0, 0)
                        if row == column
                        else _travel_metric(1, 3)
                        for column in range(size)
                    ]
                    for row in range(size)
                ],
            ),
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=store_ids,
                matrix=[
                    [_travel_metric(1, 3) for _ in store_ids],
                    [_travel_metric(1, 3) for _ in store_ids],
                ],
            ),
        )


def _wait_for_terminal_route_calculation(
    client: TestClient,
    *,
    attempts: int = 200,
) -> dict[str, object]:
    for _ in range(attempts):
        response = client.get("/api/v1/route-calculation")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] != "RUNNING":
            return payload
    raise AssertionError("route calculation did not reach a terminal state")


class _FakeRecipeImportProvider:
    async def import_recipe(self, recipe_text: str) -> AssistantRecipeImportResponse:
        assert "tacos" in recipe_text.lower()
        return AssistantRecipeImportResponse(
            title="Taco Night",
            ingredients=[
                {"name": "Ground Beef", "quantity": "1", "unit": "lb", "tags": ["ground beef"]},
                {"name": "Corn Tortillas", "quantity": "12", "unit": "count", "tags": ["corn tortilla"]},
            ],
            tags=["ground beef", "corn tortilla"],
            warnings=[],
        )

    async def answer_question(self, question: str, history: list[object]) -> str:
        assert question
        assert len(history) <= 12
        return "Cartograph can help plan a grocery trip."


def test_tag_normalizes_defaults_and_serializes_aliases() -> None:
    tag = Tag(
        tag=" Ground Beef ",
        defaultUnit=" POUND ",
        defaultQuantity=1.5,
        products=[20, 10],
    )

    assert tag.tag == "ground beef"
    assert tag.default_unit == "pound"
    assert tag.default_quantity == 1.5
    assert tag.model_dump(by_alias=True) == {
        "tag": "ground beef",
        "defaultUnit": "pound",
        "defaultQuantity": 1.5,
        "products": [10, 20],
    }


def test_tag_rejects_duplicate_products() -> None:
    with pytest.raises(ValidationError, match="products must not contain duplicates"):
        Tag(
            tag="milk",
            defaultUnit="gallon",
            defaultQuantity=1,
            products=[10, 10],
        )


@pytest.mark.parametrize(
    ("field_name", "value", "message"),
    [
        ("tag", "   ", "tag must not be blank"),
        ("defaultUnit", "   ", "defaultUnit must not be blank"),
    ],
)
def test_tag_rejects_blank_text(
    field_name: str, value: str, message: str
) -> None:
    payload = {
        "tag": "milk",
        "defaultUnit": "gallon",
        "defaultQuantity": 1,
    }
    payload[field_name] = value

    with pytest.raises(ValidationError, match=message):
        Tag.model_validate(payload)


@pytest.mark.parametrize(
    "quantity",
    [0, -1, float("nan"), float("inf"), float("-inf")],
)
def test_tag_rejects_nonpositive_or_nonfinite_default_quantity(
    quantity: float,
) -> None:
    with pytest.raises(ValidationError):
        Tag(tag="milk", defaultUnit="gallon", defaultQuantity=quantity)


def test_price_computes_unit_price() -> None:
    price = Price(date=100, price=12, quantity=2.5)

    assert price.unit_price == 4.8
    assert price.model_dump(by_alias=True) == {
        "date": 100.0,
        "price": 12.0,
        "quantity": 2.5,
        "sale": False,
        "unitPrice": 4.8,
    }


def test_price_rejects_zero_quantity() -> None:
    with pytest.raises(ValidationError):
        Price(date=100, price=12, quantity=0)


def test_product_name_is_trimmed_while_other_text_is_normalized() -> None:
    product = ProductCreate(
        name="  Trader Joe's Organic Milk  ",
        modifiers=[" Plant Based ", "ORGANIC"],
        store=1,
        unit=" GALLON ",
    )

    assert product.name == "Trader Joe's Organic Milk"
    assert product.modifiers == ["plant based", "organic"]
    assert product.unit == "gallon"


def test_store_name_and_address_are_trimmed_with_capitalization_preserved() -> None:
    store = StoreCreate(
        name="  Trader Joes  ",
        address=" 552 Orange St, Redlands, CA 92374 ",
        latitude=34.0613,
        longitude=-117.1826,
    )

    assert store.name == "Trader Joes"
    assert store.address == "552 Orange St, Redlands, CA 92374"
    assert store.latitude == 34.0613
    assert store.longitude == -117.1826


def test_store_coordinates_must_be_provided_together() -> None:
    with pytest.raises(
        ValidationError, match="latitude and longitude must be provided together"
    ):
        StoreCreate(name="Market", address="1 Main St", latitude=34.0)


def test_display_text_must_not_be_blank() -> None:
    with pytest.raises(ValidationError, match="name must not be blank"):
        ProductCreate(name="   ", modifiers=["organic"], store=1, unit="gallon")

    with pytest.raises(ValidationError, match="name must not be blank"):
        StoreCreate(name="   ", address="1 main st")

    with pytest.raises(ValidationError, match="address must not be blank"):
        StoreCreate(name="Market", address="   ")


def test_product_rejects_duplicate_modifiers_after_normalization() -> None:
    with pytest.raises(ValidationError, match="modifiers must not contain duplicates"):
        ProductCreate(
            name="Milk",
            modifiers=[" Plant Based ", "plant based"],
            store=1,
            unit="gallon",
        )


def test_shopping_list_contract_normalizes_client_managed_fields() -> None:
    create_request = ShoppingListCreate(
        name="  Weekly Shop  ",
        items=[
            {"tag": " Milk ", "modifiers": [" ORGANIC "]},
            {"tag": "Bread", "unit": " LOAF ", "quantity": 2},
        ],
    )
    replace_request = ShoppingListReplace(name="  Renamed  ", items=[])

    assert create_request.name == "Weekly Shop"
    assert create_request.active is True
    assert [item.tag for item in create_request.items] == ["milk", "bread"]
    assert create_request.items[0].modifiers == ["organic"]
    assert create_request.items[0].unit is None
    assert create_request.items[1].unit == "loaf"
    assert replace_request.name == "Renamed"
    assert replace_request.active is True
    assert replace_request.items == []
    assert ShoppingListCreate(items=[]).name is None
    assert ShoppingListNameUpdate(name="  Renamed Again  ").name == "Renamed Again"
    assert ShoppingListActiveUpdate(active=False).active is False


def test_shopping_list_contract_rejects_invalid_text_and_missing_fields() -> None:
    with pytest.raises(ValidationError, match="name must not be blank"):
        ShoppingListCreate(name="   ", items=[])

    with pytest.raises(ValidationError, match="tag must not be blank"):
        ShoppingListCreate(items=[{"tag": "   "}])

    with pytest.raises(ValidationError, match="item tags must not contain duplicates"):
        ShoppingListCreate(items=[{"tag": " Milk "}, {"tag": "milk"}])

    with pytest.raises(ValidationError, match="modifiers must not contain duplicates"):
        ShoppingListCreate(
            items=[{"tag": "milk", "modifiers": [" Organic ", "organic"]}]
        )

    with pytest.raises(ValidationError):
        ShoppingListCreate()  # type: ignore[call-arg]

    with pytest.raises(ValidationError):
        ShoppingListReplace(items=[])  # type: ignore[call-arg]

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ShoppingListCreate(items=[], tags=[])  # type: ignore[call-arg]


def test_shopping_list_contract_exposes_active_without_route_lifecycle() -> None:
    shopping_list = ShoppingList(
        id=1,
        name="New List 1",
        active=False,
        items=[{"tag": "milk", "unit": "gallon", "quantity": 1}],
    )

    assert shopping_list.active is False
    assert shopping_list.model_dump(by_alias=True) == {
        "items": [
            {
                "tag": "milk",
                "modifiers": [],
                "unit": "gallon",
                "quantity": 1.0,
            }
        ],
        "id": 1,
        "name": "New List 1",
        "active": False,
    }


def test_product_current_price_is_independent_from_history() -> None:
    product = Product(
        id=1,
        name="Milk",
        modifiers=["organic"],
        store=10,
        unit="gallon",
        priceHistory=[
            {"date": 200, "price": 4.25, "quantity": 1},
            {"date": 100, "price": 3.75, "quantity": 1, "sale": True},
        ],
        currentPrice={"date": 300, "price": 4.5, "quantity": 1, "sale": False},
    )

    assert [entry.date for entry in product.price_history] == [100, 200]
    assert product.model_dump(by_alias=True)["currentPrice"] == {
        "date": 300.0,
        "price": 4.5,
        "quantity": 1,
        "sale": False,
        "unitPrice": 4.5,
    }


@pytest.mark.parametrize("current_date", [100, 50])
def test_product_rejects_history_at_or_after_current_price(current_date: float) -> None:
    with pytest.raises(
        ValidationError, match="currentPrice must be newer than every priceHistory entry"
    ):
        Product(
            id=1,
            name="Milk",
            modifiers=["organic"],
            store=10,
            unit="gallon",
            priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
            currentPrice={"date": current_date, "price": 4.25, "quantity": 1},
        )


def test_product_without_history_has_no_current_price() -> None:
    product = Product(
        id=1,
        name="Milk",
        modifiers=[],
        store=10,
        unit="gallon",
    )

    assert product.price_history == []
    assert product.current_price is None


def test_product_history_does_not_imply_a_current_price() -> None:
    product = Product(
        id=1,
        name="Milk",
        modifiers=[],
        store=10,
        unit="gallon",
        priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
    )

    assert product.current_price is None


def test_only_products_with_current_prices_are_route_eligible() -> None:
    product = Product(
        id=1,
        name="Milk",
        modifiers=[],
        store=10,
        unit="gallon",
        priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
    )

    assert not is_product_route_eligible(product)

    product.current_price = Price(date=200, price=4.25, quantity=1)

    assert is_product_route_eligible(product)


def test_product_rejects_duplicate_price_history_dates() -> None:
    with pytest.raises(ValidationError, match="price history dates must not contain duplicates"):
        Product(
            id=1,
            name="Milk",
            modifiers=[],
            store=10,
            unit="gallon",
            priceHistory=[
                {"date": 100, "price": 3.75, "quantity": 1},
                {"date": 100, "price": 4.25, "quantity": 1},
            ],
        )


def test_route_create_normalizes_ordered_items() -> None:
    request = RouteCreate(
        items=[
            {"tag": " Ground Beef ", "unit": " POUND ", "quantity": 1},
            {"tag": "Bread", "unit": "loaf", "quantity": 2},
        ]
    )

    assert [item.tag for item in request.items] == ["ground beef", "bread"]
    assert request.items[0].unit == "pound"


def test_complete_route_keeps_explicit_relationships() -> None:
    route = Route(
        id=1,
        stores=[20, 10],
        products=[200, 100],
        selections=[
            {
                "tag": " GROUND BEEF ",
                "unit": "pound",
                "quantity": 1,
                "product": 100,
            },
            {"tag": "BREAD", "unit": "loaf", "quantity": 1, "product": 200},
        ],
        distance=1500,
        time=600,
        score=0.75,
    )

    assert "productTags" not in route.model_dump(by_alias=True)
    assert [selection.tag for selection in route.selections] == [
        "ground beef",
        "bread",
    ]
    assert route.error_code is None


def test_partial_route_preserves_unmatched_tags() -> None:
    route = Route(
        id=1,
        stores=[10],
        products=[100],
        selections=[
            {"tag": "milk", "unit": "gallon", "quantity": 1, "product": 100},
            {"tag": "bread", "unit": "loaf", "quantity": 1, "product": None},
        ],
        distance=0,
        time=0,
        score=0,
        errorCode=RouteErrorCode.PARTIAL_ITEM_MATCH,
    )

    assert route.selections[1].product is None


def test_empty_partial_route_requires_zero_metrics() -> None:
    route = Route(
        id=1,
        stores=[],
        products=[],
        selections=[
            {"tag": "unavailable", "unit": "each", "quantity": 1, "product": None}
        ],
        distance=0,
        time=0,
        score=0,
        errorCode="PARTIAL_ITEM_MATCH",
    )

    assert route.products == []


def test_route_rejects_inconsistent_product_assignments() -> None:
    with pytest.raises(ValidationError, match="matched selections must match products"):
        Route(
            id=1,
            stores=[10],
            products=[200],
            selections=[
                {"tag": "milk", "unit": "gallon", "quantity": 1, "product": 100}
            ],
            distance=0,
            time=0,
            score=0,
        )


def test_route_optimization_request_validates_location_and_limit() -> None:
    request = RouteOptimizationRequest(latitude=34.0556, longitude=-117.1825)

    assert request.limit == 10

    with pytest.raises(ValidationError):
        RouteOptimizationRequest(latitude=91, longitude=-117.1825)
    with pytest.raises(ValidationError):
        RouteOptimizationRequest(latitude=34.0556, longitude=-181)
    with pytest.raises(ValidationError):
        RouteOptimizationRequest(latitude=34.0556, longitude=-117.1825, limit=21)


def _partial_route_candidate() -> RouteCandidate:
    return RouteCandidate(
        stores=[10],
        products=[100],
        selections=[
            {
                "tag": "bread",
                "modifiers": ["sliced"],
                "unit": "loaf",
                "quantity": 1,
                "product": None,
            },
            {
                "tag": "milk",
                "modifiers": [],
                "unit": "gallon",
                "quantity": 2,
                "product": 100,
            },
        ],
        distance=2.5,
        time=6,
        productPrice=4.25,
        matchedItemCount=1,
        score=10.5,
        scoreComponents={
            "productPrice": 4.25,
            "distanceCost": 1.75,
            "timeCost": 2.0,
            "storeCost": 2.5,
        },
        errorCode="PARTIAL_ITEM_MATCH",
    )


def test_route_candidate_keeps_explainable_transient_result() -> None:
    candidate = _partial_route_candidate()
    payload = candidate.model_dump(by_alias=True)

    assert "id" not in payload
    assert payload["matchedItemCount"] == 1
    assert payload["selections"][0] == {
        "tag": "bread",
        "modifiers": ["sliced"],
        "unit": "loaf",
        "quantity": 1.0,
        "product": None,
    }
    assert payload["scoreComponents"] == {
        "productPrice": 4.25,
        "distanceCost": 1.75,
        "timeCost": 2.0,
        "storeCost": 2.5,
        "modifierPenalty": 0,
    }


def test_enriched_route_candidate_serializes_display_snapshots() -> None:
    candidate = RouteCandidateResult(
        id=7,
        stores=[
            {
                "id": 10,
                "name": "Market",
                "address": "1 Main St",
                "latitude": 34.0,
                "longitude": -117.0,
            }
        ],
        products=[
            {
                "id": 100,
                "name": "Whole Milk",
                "store": 10,
                "unit": "gallon",
                "selectionPrice": 8.5,
            }
        ],
        selections=[
            {"tag": "milk", "unit": "gallon", "quantity": 2, "product": 100}
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
        },
    )

    payload = RouteCandidatesResponse(
        generation=3, candidates=[candidate]
    ).model_dump(by_alias=True)
    assert payload["generation"] == 3
    assert payload["candidates"][0]["stores"][0]["name"] == "Market"
    assert payload["candidates"][0]["products"][0] == {
        "id": 100,
        "name": "Whole Milk",
        "store": 10,
        "unit": "gallon",
        "modifiers": [],
        "selectionPrice": 8.5,
    }


def test_route_calculation_contract_validates_state_metadata() -> None:
    assert RouteCalculationResponse().status == RouteCalculationStatus.IDLE
    running = RouteCalculationResponse(
        generation=2,
        status="RUNNING",
        activeListCount=3,
        itemCount=8,
        startedAt=100,
    )
    assert running.result_count == 0

    failed = RouteCalculationResponse(
        generation=2,
        status="FAILED",
        activeListCount=3,
        itemCount=8,
        startedAt=100,
        completedAt=101,
        errorCode="UNIT_CONVERSION_FAILED",
        detail="Cannot convert apples",
    )
    assert failed.error_code is not None

    with pytest.raises(ValidationError, match="require errorCode and detail"):
        RouteCalculationResponse(
            generation=2,
            status="FAILED",
            startedAt=100,
            completedAt=101,
        )


def test_route_candidate_rejects_inconsistent_score() -> None:
    with pytest.raises(ValidationError, match="score must equal"):
        _partial_route_candidate().model_copy(update={"score": 10.51}, deep=True).__class__(
            **{
                **_partial_route_candidate().model_dump(by_alias=True),
                "score": 10.51,
            }
        )

def test_route_optimization_response_validates_proven_prefix() -> None:
    response = RouteOptimizationResponse(
        candidates=[_partial_route_candidate()],
        status=RouteOptimizationStatus.OPTIMAL,
        requestedLimit=10,
        provenPrefixCount=1,
        elapsedSeconds=0.25,
        timeoutSeconds=5,
    )

    assert response.proven_prefix_count == 1

    with pytest.raises(ValidationError, match="must prove every candidate"):
        RouteOptimizationResponse(
            candidates=[_partial_route_candidate()],
            status="OPTIMAL",
            requestedLimit=10,
            provenPrefixCount=0,
            elapsedSeconds=0.25,
            timeoutSeconds=5,
        )

    heuristic = RouteOptimizationResponse(
        candidates=[_partial_route_candidate()],
        status="HEURISTIC",
        requestedLimit=10,
        provenPrefixCount=0,
        elapsedSeconds=0.1,
        timeoutSeconds=5,
    )
    assert heuristic.status == RouteOptimizationStatus.HEURISTIC

    with pytest.raises(ValidationError, match="cannot claim proven candidates"):
        RouteOptimizationResponse(
            candidates=[_partial_route_candidate()],
            status="HEURISTIC",
            requestedLimit=10,
            provenPrefixCount=1,
            elapsedSeconds=0.1,
            timeoutSeconds=5,
        )


def test_database_initialization_is_idempotent(tmp_path: object) -> None:
    database_path = tmp_path / "contract.db"  # type: ignore[operator]

    initialize_database(database_path)
    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
            )
        }
        foreign_keys_enabled = connection.execute("PRAGMA foreign_keys").fetchone()[0]
    finally:
        connection.close()

    assert tables == {
        "tags",
        "stores",
        "products",
        "tag_products",
        "product_modifiers",
        "price_history",
        "shopping_lists",
        "shopping_list_items",
        "shopping_list_item_modifiers",
        "routes",
        "route_stores",
        "route_item_selections",
        "route_item_selection_modifiers",
        "route_item_product_modifiers",
        "route_calculation_state",
    }
    assert foreign_keys_enabled == 1


def test_modifier_route_migration_discards_old_routes_and_resets_state(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "modifier-route-migration.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        for table_name in (
            "route_item_product_modifiers",
            "route_item_selection_modifiers",
            "route_item_selections",
            "route_stores",
            "routes",
        ):
            connection.execute(f"DROP TABLE {table_name}")
        connection.execute(
            """
            CREATE TABLE routes (
                id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
                distance REAL NOT NULL CHECK (distance >= 0),
                time REAL NOT NULL CHECK (time >= 0),
                score REAL NOT NULL,
                product_price REAL NOT NULL CHECK (product_price >= 0),
                matched_item_count INTEGER NOT NULL CHECK (matched_item_count > 0),
                distance_cost REAL NOT NULL CHECK (distance_cost >= 0),
                time_cost REAL NOT NULL CHECK (time_cost >= 0),
                store_cost REAL NOT NULL CHECK (store_cost >= 0),
                error_code TEXT
            )
            """
        )
        connection.execute(
            """
            INSERT INTO routes (
                position, distance, time, score, product_price,
                matched_item_count, distance_cost, time_cost, store_cost
            ) VALUES (0, 1, 2, 3, 1, 1, 1, 0, 1)
            """
        )
        connection.execute(
            """
            UPDATE route_calculation_state
            SET generation = 5, status = 'SUCCEEDED', active_list_count = 1,
                item_count = 1, result_count = 1,
                optimizer_status = 'HEURISTIC', started_at = 100,
                completed_at = 101, elapsed_seconds = 1, timeout_seconds = 10
            WHERE singleton = 1
            """
        )
    finally:
        connection.close()

    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        route_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(routes)")
        }
        route_count = connection.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
        state = connection.execute(
            """
            SELECT generation, status, active_list_count, item_count, result_count,
                   optimizer_status, started_at, completed_at, elapsed_seconds,
                   timeout_seconds, error_code, detail
            FROM route_calculation_state WHERE singleton = 1
            """
        ).fetchone()
    finally:
        connection.close()

    assert "modifier_penalty" in route_columns
    assert route_count == 0
    assert tuple(state) == (
        0,
        "IDLE",
        0,
        0,
        0,
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    )


def test_initialization_migrates_product_tags_without_overwriting_defaults(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "tag-catalog-migration.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (1, 'Apples', 1, 'lbs')
            """
        )
        connection.execute(
            """
            CREATE TABLE product_tags (
                product_id INTEGER NOT NULL,
                tag TEXT NOT NULL CHECK (length(trim(tag)) > 0),
                position INTEGER NOT NULL CHECK (position >= 0),
                PRIMARY KEY (product_id, tag),
                UNIQUE (product_id, position),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
            """
        )
        connection.executemany(
            """
            INSERT INTO product_tags (product_id, tag, position)
            VALUES (?, ?, ?)
            """,
            [(1, " Apple ", 0), (1, "apple", 1), (1, "fruit", 2)],
        )
        connection.execute(
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES ('fruit', 'count', 2)
            """
        )
    finally:
        connection.close()

    initialize_database(database_path)
    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        tags = {
            row["tag"]: (row["default_unit"], row["default_quantity"])
            for row in connection.execute(
                "SELECT tag, default_unit, default_quantity FROM tags"
            )
        }
        relationships = [
            (row["tag"], row["product_id"])
            for row in connection.execute(
                "SELECT tag, product_id FROM tag_products ORDER BY tag, product_id"
            )
        ]
        legacy_table_exists = connection.execute(
            """
            SELECT 1 FROM sqlite_master
            WHERE type = 'table' AND name = 'product_tags'
            """
        ).fetchone()
        modifier_count = connection.execute(
            "SELECT COUNT(*) FROM product_modifiers"
        ).fetchone()[0]
        foreign_key_violations = connection.execute("PRAGMA foreign_key_check").fetchall()
    finally:
        connection.close()

    assert tags == {"apple": ("lbs", 1.0), "fruit": ("count", 2.0)}
    assert relationships == [("apple", 1), ("fruit", 1)]
    assert legacy_table_exists is None
    assert modifier_count == 0
    assert foreign_key_violations == []


def test_tag_memberships_and_product_modifiers_enforce_schema_invariants(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "catalog-relationships.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO tags (tag, default_unit, default_quantity) VALUES ('milk', 'gallon', 1)"
        )
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            "INSERT INTO products (id, name, store_id, unit) VALUES (10, 'Milk', 1, 'gallon')"
        )
        connection.execute(
            "INSERT INTO tag_products (tag, product_id) VALUES ('milk', 10)"
        )
        connection.executemany(
            """
            INSERT INTO product_modifiers (product_id, modifier, position)
            VALUES (?, ?, ?)
            """,
            [(10, "organic", 0), (10, "lactose free", 1)],
        )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO tag_products (tag, product_id) VALUES ('missing', 10)"
            )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO product_modifiers (product_id, modifier, position)
                VALUES (10, ' Organic ', 2)
                """
            )

        connection.execute("DELETE FROM tags WHERE tag = 'milk'")
        assert connection.execute("SELECT COUNT(*) FROM tag_products").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM product_modifiers").fetchone()[0] == 2

        connection.execute(
            "INSERT INTO tags (tag, default_unit, default_quantity) VALUES ('milk', 'gallon', 1)"
        )
        connection.execute(
            "INSERT INTO tag_products (tag, product_id) VALUES ('milk', 10)"
        )
        connection.execute("DELETE FROM products WHERE id = 10")
        assert connection.execute("SELECT COUNT(*) FROM tag_products").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM product_modifiers").fetchone()[0] == 0
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        connection.close()


def test_schema_keeps_routes_global_and_calculation_state_singleton(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "shopping-lists.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO shopping_lists (id, name) VALUES (1, 'New List 1')"
        )
        connection.execute(
            "INSERT INTO tags VALUES ('milk', 'gallon', 1)"
        )
        connection.execute(
            """
            INSERT INTO shopping_list_items
                (shopping_list_id, position, tag, unit, quantity)
            VALUES (1, 0, 'milk', 'gallon', 1)
            """
        )
        connection.execute(
            """
            INSERT INTO routes (
                id, position, distance, time, score, product_price,
                matched_item_count, distance_cost, time_cost, store_cost
            ) VALUES (10, 0, 0, 0, 0, 0, 1, 0, 0, 0)
            """
        )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO routes (
                    position, distance, time, score, product_price,
                    matched_item_count, distance_cost, time_cost, store_cost
                ) VALUES (0, 0, 0, 0, 0, 1, 0, 0, 0)
                """
            )

        connection.execute("DELETE FROM shopping_lists WHERE id = 1")
        route_count = connection.execute(
            "SELECT COUNT(*) FROM routes WHERE id = 10"
        ).fetchone()[0]
        state = connection.execute(
            "SELECT generation, status FROM route_calculation_state"
        ).fetchone()
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    finally:
        connection.close()

    assert route_count == 1
    assert tuple(state) == (0, "IDLE")
    assert "shopping_list_routes" not in tables


def test_shopping_list_active_column_migrates_existing_rows(tmp_path: object) -> None:
    database_path = tmp_path / "shopping-list-active-migration.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            """
            CREATE TABLE shopping_lists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                revision INTEGER NOT NULL DEFAULT 1
            )
            """
        )
        connection.execute(
            "INSERT INTO shopping_lists (id, name) VALUES (1, 'Existing List')"
        )
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        migrated = connection.execute(
            "SELECT id, name, active FROM shopping_lists WHERE id = 1"
        ).fetchone()
        columns = {
            row["name"]
            for row in connection.execute("PRAGMA table_info(shopping_lists)")
        }
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO shopping_lists (name, active) VALUES ('Invalid', 2)"
            )
    finally:
        connection.close()

    assert tuple(migrated) == (1, "Existing List", 1)
    assert columns == {"id", "name", "active"}


def test_initialization_migrates_legacy_list_tags_and_invalidates_routes(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "shopping-list-items-migration.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.executescript(
            """
            CREATE TABLE tags (
                tag TEXT PRIMARY KEY,
                default_unit TEXT NOT NULL,
                default_quantity REAL NOT NULL
            );
            CREATE TABLE shopping_lists (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'PENDING',
                active INTEGER NOT NULL DEFAULT 1,
                revision INTEGER NOT NULL DEFAULT 1
            );
            CREATE TABLE shopping_list_tags (
                shopping_list_id INTEGER NOT NULL,
                tag TEXT NOT NULL,
                PRIMARY KEY (shopping_list_id, tag)
            );
            CREATE TABLE routes (
                id INTEGER PRIMARY KEY,
                distance REAL NOT NULL,
                time REAL NOT NULL,
                score REAL NOT NULL,
                error_code TEXT CHECK (
                    error_code IS NULL OR error_code IN ('PARTIAL_TAG_MATCH')
                )
            );
            CREATE TABLE route_stores (
                route_id INTEGER NOT NULL,
                store_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                PRIMARY KEY (route_id, store_id)
            );
            CREATE TABLE route_tag_selections (
                route_id INTEGER NOT NULL,
                requested_tag TEXT NOT NULL,
                position INTEGER NOT NULL,
                product_id INTEGER,
                PRIMARY KEY (route_id, requested_tag)
            );
            CREATE TABLE shopping_list_routes (
                shopping_list_id INTEGER NOT NULL,
                route_id INTEGER PRIMARY KEY,
                position INTEGER NOT NULL
            );
            INSERT INTO tags VALUES ('milk', 'gallon', 2);
            INSERT INTO shopping_lists VALUES
                (1, 'Owned', 'READY', 1, 4),
                (2, 'Failed', 'FAILED', 1, 7);
            INSERT INTO shopping_list_tags VALUES
                (1, 'milk'), (1, 'bread'), (2, 'orphan');
            INSERT INTO routes VALUES (9, 1, 2, 3, NULL);
            INSERT INTO shopping_list_routes VALUES (1, 9, 0);
            """
        )
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)
    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        items = [
            tuple(row)
            for row in connection.execute(
                """
                SELECT shopping_list_id, position, tag, unit, quantity
                FROM shopping_list_items
                ORDER BY shopping_list_id, position
                """
            )
        ]
        states = [
            tuple(row)
            for row in connection.execute(
                "SELECT id, active FROM shopping_lists ORDER BY id"
            )
        ]
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        route_count = connection.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
        foreign_key_violations = connection.execute(
            "PRAGMA foreign_key_check"
        ).fetchall()
    finally:
        connection.close()

    assert items == [
        (1, 0, "bread", "count", 1.0),
        (1, 1, "milk", "gallon", 2.0),
        (2, 0, "orphan", "count", 1.0),
    ]
    assert states == [(1, 1), (2, 1)]
    assert route_count == 0
    assert "shopping_list_tags" not in tables
    assert "route_tag_selections" not in tables
    assert "shopping_list_routes" not in tables
    assert {"shopping_list_items", "route_item_selections"} <= tables
    assert foreign_key_violations == []


def test_shopping_list_persistence_manages_names_and_crud(tmp_path: object) -> None:
    database_path = tmp_path / "shopping-list-crud.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            "INSERT INTO tags VALUES (?, ?, ?)",
            [("milk", "gallon", 1), ("bread", "loaf", 1)],
        )
        first = create_shopping_list(
            connection, ShoppingListCreate(items=[{"tag": " Milk "}], active=False)
        )
        custom = create_shopping_list(
            connection,
            ShoppingListCreate(name="  Weekend  ", items=[]),
        )
        second = create_shopping_list(connection, ShoppingListCreate(items=[]))

        assert first.name == "New List 1"
        assert first.active is False
        assert [item.tag for item in first.items] == ["milk"]
        assert first.items[0].unit == "gallon"
        assert custom.name == "Weekend"
        assert second.name == "New List 2"
        assert [item.id for item in list_shopping_lists(connection)] == [
            first.id,
            custom.id,
            second.id,
        ]

        deleted = delete_shopping_list(connection, first.id)
        assert deleted is not None
        assert deleted.id == first.id
        assert deleted.active is False
        replacement = create_shopping_list(
            connection, ShoppingListCreate(items=[])
        )
        assert replacement.name == "New List 1"
        assert get_shopping_list(connection, first.id) is None
        assert not delete_shopping_list(connection, 999)
        assert replace_shopping_list(
            connection,
            999,
            ShoppingListReplace(name="Missing", items=[], active=False),
        ) is None
        assert update_shopping_list_name(
            connection, 999, ShoppingListNameUpdate(name="Missing")
        ) is None
    finally:
        connection.close()


def test_shopping_list_mutations_report_global_route_recalculation(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "shopping-list-lifecycle.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            "INSERT INTO tags VALUES (?, ?, ?)",
            [("milk", "gallon", 1), ("bread", "loaf", 1)],
        )
        created = create_shopping_list(
            connection, ShoppingListCreate(items=[{"tag": "milk"}])
        )

        renamed = replace_shopping_list(
            connection,
            created.id,
            ShoppingListReplace(name="Renamed", items=[{"tag": "milk"}], active=True),
        )
        assert renamed is not None
        assert renamed.shopping_list.name == "Renamed"
        assert not renamed.route_calculation_required

        name_updated = update_shopping_list_name(
            connection,
            created.id,
            ShoppingListNameUpdate(name="  Display Name  "),
        )
        assert name_updated is not None
        assert name_updated.name == "Display Name"
        assert name_updated.active is True
        assert [item.tag for item in name_updated.items] == ["milk"]

        updated = replace_shopping_list(
            connection,
            created.id,
            ShoppingListReplace(name="Renamed", items=[{"tag": "bread"}], active=True),
        )
        assert updated is not None
        assert [item.tag for item in updated.shopping_list.items] == ["bread"]
        assert updated.route_calculation_required

        deactivated = update_shopping_list_active(
            connection, created.id, ShoppingListActiveUpdate(active=False)
        )
        assert deactivated is not None
        assert deactivated.route_calculation_required
        assert deactivated.shopping_list.active is False

        unchanged = update_shopping_list_active(
            connection, created.id, ShoppingListActiveUpdate(active=False)
        )
        assert unchanged is not None
        assert not unchanged.route_calculation_required

        inactive_edit = replace_shopping_list(
            connection,
            created.id,
            ShoppingListReplace(
                name="Inactive",
                items=[{"tag": "milk"}],
                active=False,
            ),
        )
        assert inactive_edit is not None
        assert not inactive_edit.route_calculation_required

        snapshot = load_active_shopping_list_snapshot(connection)
        assert snapshot.active_list_count == 0
        assert snapshot.items == ()
        assert [tag.tag for tag in snapshot.tag_defaults] == ["bread", "milk"]

        deleted = delete_shopping_list(connection, created.id)
        assert deleted is not None
        assert not deleted.active
    finally:
        connection.close()


def test_route_schema_enforces_order_and_distinct_product_assignments(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "constraints.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.executemany(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (?, ?, 1, 'each')
            """,
            [(10, "Milk",), (20, "Bread",), (30, "Fruit",)],
        )
        connection.executemany(
            """
            INSERT INTO price_history (product_id, date, price, quantity)
            VALUES (?, 100, 1.0, 1)
            """,
            [(10,), (20,)],
        )
        connection.executemany(
            """
            UPDATE products
            SET current_price_date = 200, current_price = 1.0,
                current_price_quantity = 1, current_price_sale = 0
            WHERE id = ?
            """,
            [(10,), (20,)],
        )
        connection.execute(
            """
            INSERT INTO routes (
                id, position, distance, time, score, product_price,
                matched_item_count, distance_cost, time_cost, store_cost
            ) VALUES (1, 0, 0, 0, 0, 1, 1, 0, 0, 0)
            """
        )
        connection.execute(
            "INSERT INTO route_stores (route_id, store_id, position) VALUES (1, 1, 0)"
        )
        connection.execute(
            """
            INSERT INTO route_item_selections
                (route_id, position, requested_tag, requested_unit,
                  requested_quantity, product_id, selection_price)
              VALUES (1, 0, 'milk', 'each', 1, 10, 1)
            """
        )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO route_item_selections
                    (route_id, position, requested_tag, requested_unit,
                     requested_quantity, product_id, selection_price)
                 VALUES (1, 1, 'dairy', 'each', 1, 10, 1)
                """
            )

        with pytest.raises(
            sqlite3.IntegrityError, match="route product must have a current price"
        ):
            connection.execute(
                """
                INSERT INTO route_item_selections
                    (route_id, position, requested_tag, requested_unit,
                     requested_quantity, product_id, selection_price)
                 VALUES (1, 2, 'fruit', 'each', 1, 30, 1)
                """
            )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO route_item_selections
                    (route_id, position, requested_tag, requested_unit,
                     requested_quantity, product_id, selection_price)
                 VALUES (1, 0, 'bread', 'each', 1, 20, 1)
                """
            )
    finally:
        connection.close()


def test_product_schema_owns_current_price_separately_from_history(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "prices.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (10, 'Milk', 1, 'gallon')
            """
        )
        connection.executemany(
            """
            INSERT INTO price_history (product_id, date, price, quantity)
            VALUES (10, ?, ?, ?)
            """,
            [(100, 7.50, 2.0), (200, 10.625, 2.5)],
        )
        connection.execute(
            """
            UPDATE products
            SET current_price_date = 300, current_price = 12.0,
                current_price_quantity = 3.0, current_price_sale = 1
            WHERE id = 10
            """
        )

        latest = connection.execute(
            """
            SELECT date, price, quantity, sale, price / quantity AS unit_price
            FROM price_history
            WHERE product_id = 10
            ORDER BY date DESC
            LIMIT 1
            """
        ).fetchone()
        product_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(products)")
        }
        current = connection.execute(
            """
            SELECT current_price_date AS date, current_price AS price,
                   current_price_quantity AS quantity,
                   current_price_sale AS sale,
                   current_price / current_price_quantity AS unit_price
            FROM products WHERE id = 10
            """
        ).fetchone()

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO price_history (product_id, date, price, quantity)
                VALUES (10, 200, 5.00, 1)
                """
            )
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO price_history (product_id, date, price, quantity)
                VALUES (10, 300, 5.00, 0)
                """
            )
        with pytest.raises(
            sqlite3.IntegrityError,
            match="current price fields must be all null or all populated",
        ):
            connection.execute(
                "UPDATE products SET current_price = NULL WHERE id = 10"
            )
        with pytest.raises(
            sqlite3.IntegrityError,
            match="price history must be older than current price",
        ):
            connection.execute(
                """
                INSERT INTO price_history (product_id, date, price, quantity)
                VALUES (10, 300, 12.0, 3.0)
                """
            )
        connection.execute(
            "DELETE FROM price_history WHERE product_id = 10 AND date = 100"
        )
    finally:
        connection.close()

    assert dict(latest) == {
        "date": 200.0,
        "price": 10.625,
        "quantity": 2.5,
        "sale": 0,
        "unit_price": 4.25,
    }
    assert dict(current) == {
        "date": 300.0,
        "price": 12.0,
        "quantity": 3.0,
        "sale": 1,
        "unit_price": 4.0,
    }
    assert "price" not in product_columns
    assert {
        "current_price_date",
        "current_price",
        "current_price_quantity",
        "current_price_sale",
    } <= product_columns


def test_product_price_lifecycle_orders_observations_and_archives_current(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "price-lifecycle.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (10, 'Milk', 1, 'gallon')
            """
        )

        assert record_product_price(
            connection, 10, Price(date=200, price=4.25, quantity=1)
        )
        assert record_product_price(
            connection, 10, Price(date=100, price=3.75, quantity=1, sale=True)
        )
        assert record_product_price(
            connection, 10, Price(date=300, price=4.5, quantity=1)
        )
        assert not record_product_price(
            connection, 10, Price(date=300, price=4.5, quantity=1)
        )

        with pytest.raises(ProductPriceConflictError):
            record_product_price(
                connection, 10, Price(date=300, price=9.0, quantity=1)
            )

        current = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = 10
            """
        ).fetchone()
        history = connection.execute(
            """
            SELECT date, price, quantity, sale
            FROM price_history WHERE product_id = 10 ORDER BY date
            """
        ).fetchall()

        assert dict(current) == {
            "current_price_date": 300.0,
            "current_price": 4.5,
            "current_price_quantity": 1.0,
            "current_price_sale": 0,
        }
        assert [dict(row) for row in history] == [
            {"date": 100.0, "price": 3.75, "quantity": 1.0, "sale": 1},
            {"date": 200.0, "price": 4.25, "quantity": 1.0, "sale": 0},
        ]

        assert clear_product_current_price(connection, 10)
        assert not clear_product_current_price(connection, 10)
        assert connection.execute(
            "SELECT current_price_date FROM products WHERE id = 10"
        ).fetchone()[0] is None
        assert connection.execute(
            "SELECT MAX(date) FROM price_history WHERE product_id = 10"
        ).fetchone()[0] == 300.0
    finally:
        connection.close()


def test_product_price_lifecycle_rejects_unknown_products_and_history_conflicts(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "price-conflicts.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (10, 'Milk', 1, 'gallon')
            """
        )
        connection.execute(
            """
            INSERT INTO price_history (product_id, date, price, quantity, sale)
            VALUES (10, 100, 3.75, 1, 0)
            """
        )

        assert not record_product_price(
            connection, 10, Price(date=100, price=3.75, quantity=1)
        )
        with pytest.raises(ProductPriceConflictError):
            record_product_price(
                connection, 10, Price(date=100, price=4.0, quantity=1)
            )
        with pytest.raises(LookupError, match="product 999 does not exist"):
            record_product_price(
                connection, 999, Price(date=100, price=4.0, quantity=1)
            )
        with pytest.raises(LookupError, match="product 999 does not exist"):
            clear_product_current_price(connection, 999)
    finally:
        connection.close()


def test_initialization_promotes_latest_legacy_price_and_is_idempotent(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "legacy-current-price.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                unit TEXT NOT NULL,
                current_price_date REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE price_history (
                product_id INTEGER NOT NULL,
                date REAL NOT NULL,
                price REAL NOT NULL,
                quantity REAL NOT NULL DEFAULT 1,
                sale INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (product_id, date)
            )
            """
        )
        connection.execute("INSERT INTO stores VALUES (1, 'Market', '1 Main St')")
        connection.execute("INSERT INTO products VALUES (10, 'Milk', 1, 'gallon', 100)")
        connection.executemany(
            "INSERT INTO price_history VALUES (10, ?, ?, ?, ?)",
            [(100, 3.75, 1, 0), (200, 4.25, 1, 1)],
        )
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)
    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        current = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = 10
            """
        ).fetchone()
        history = connection.execute(
            """
            SELECT date, price, quantity, sale
            FROM price_history WHERE product_id = 10 ORDER BY date
            """
        ).fetchall()
        foreign_key_violations = connection.execute(
            "PRAGMA foreign_key_check"
        ).fetchall()
    finally:
        connection.close()

    assert dict(current) == {
        "current_price_date": 200.0,
        "current_price": 4.25,
        "current_price_quantity": 1.0,
        "current_price_sale": 1,
    }
    assert [dict(row) for row in history] == [
        {"date": 100.0, "price": 3.75, "quantity": 1.0, "sale": 0}
    ]
    assert foreign_key_violations == []


def test_initialization_rejects_dangling_legacy_current_price(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "dangling-current-price.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                unit TEXT NOT NULL,
                current_price_date REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE price_history (
                product_id INTEGER NOT NULL,
                date REAL NOT NULL,
                price REAL NOT NULL,
                quantity REAL NOT NULL DEFAULT 1,
                sale INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (product_id, date)
            )
            """
        )
        connection.execute("INSERT INTO stores VALUES (1, 'Market', '1 Main St')")
        connection.execute("INSERT INTO products VALUES (10, 'Milk', 1, 'gallon', 999)")
        connection.execute("INSERT INTO price_history VALUES (10, 100, 3.75, 1, 0)")
        connection.commit()
    finally:
        connection.close()

    with pytest.raises(
        sqlite3.IntegrityError,
        match="current price must reference product price history",
    ):
        initialize_database(database_path)


def test_initialization_migrates_legacy_scalar_prices(tmp_path: object) -> None:
    database_path = tmp_path / "legacy.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                price REAL NOT NULL,
                unit TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "INSERT INTO stores VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            "INSERT INTO products VALUES (10, 'Milk', 1, 3.75, 'gallon')"
        )
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(products)")
        }
        migrated_price = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
        current_price_date = connection.execute(
            "SELECT current_price_date FROM products WHERE id = 10"
        ).fetchone()[0]
    finally:
        connection.close()

    assert "price" not in columns
    assert "current_price_date" in columns
    assert dict(migrated_price) == {
        "date": 0.0,
        "price": 3.75,
        "quantity": 1,
        "sale": 0,
    }
    assert current_price_date is None


def test_initialization_adds_quantity_to_existing_price_history(tmp_path: object) -> None:
    database_path = tmp_path / "history-v1.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                unit TEXT NOT NULL,
                current_price_date REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE price_history (
                product_id INTEGER NOT NULL,
                date REAL NOT NULL,
                price REAL NOT NULL,
                PRIMARY KEY (product_id, date)
            )
            """
        )
        connection.execute("INSERT INTO stores VALUES (1, 'Market', '1 Main St')")
        connection.execute("INSERT INTO products VALUES (10, 'Milk', 1, 'gallon', NULL)")
        connection.execute("INSERT INTO price_history VALUES (10, 100, 3.75)")
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        migrated = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
    finally:
        connection.close()

    assert dict(migrated) == {
        "date": 100.0,
        "price": 3.75,
        "quantity": 1,
        "sale": 0,
    }


def test_initialization_migrates_integer_quantity_to_real(tmp_path: object) -> None:
    database_path = tmp_path / "history-v2.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                unit TEXT NOT NULL,
                current_price_date REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE price_history (
                product_id INTEGER NOT NULL,
                date REAL NOT NULL,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                sale INTEGER NOT NULL DEFAULT 0 CHECK (sale IN (0, 1)),
                PRIMARY KEY (product_id, date)
            )
            """
        )
        connection.execute("INSERT INTO stores VALUES (1, 'Market', '1 Main St')")
        connection.execute("INSERT INTO products VALUES (10, 'Apples', 1, 'pound', 100)")
        connection.execute("INSERT INTO price_history VALUES (10, 100, 5.00, 2, 1)")
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        quantity_type = {
            row["name"]: row["type"]
            for row in connection.execute("PRAGMA table_info(price_history)")
        }["quantity"]
        migrated_history = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
        current = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = 10
            """
        ).fetchone()
        with pytest.raises(
            sqlite3.IntegrityError,
            match="current price fields must be all null or all populated",
        ):
            connection.execute(
                "UPDATE products SET current_price = NULL WHERE id = 10"
            )
    finally:
        connection.close()

    assert quantity_type == "REAL"
    assert migrated_history is None
    assert dict(current) == {
        "current_price_date": 100.0,
        "current_price": 5.0,
        "current_price_quantity": 2.0,
        "current_price_sale": 1,
    }


def test_integer_quantity_migration_defaults_missing_sale_to_false(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "history-v2-without-sale.db"  # type: ignore[operator]
    connection = sqlite3.connect(database_path)
    try:
        connection.execute(
            "CREATE TABLE stores (id INTEGER PRIMARY KEY, name TEXT, address TEXT)"
        )
        connection.execute(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                store_id INTEGER NOT NULL,
                unit TEXT NOT NULL,
                current_price_date REAL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE price_history (
                product_id INTEGER NOT NULL,
                date REAL NOT NULL,
                price REAL NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                PRIMARY KEY (product_id, date)
            )
            """
        )
        connection.execute("INSERT INTO stores VALUES (1, 'Market', '1 Main St')")
        connection.execute("INSERT INTO products VALUES (10, 'Apples', 1, 'lbs', 100)")
        connection.execute("INSERT INTO price_history VALUES (10, 100, 5.00, 2)")
        connection.commit()
    finally:
        connection.close()

    initialize_database(database_path)
    initialize_database(database_path)

    connection = connect_database(database_path)
    try:
        columns = {
            row["name"]: row["type"]
            for row in connection.execute("PRAGMA table_info(price_history)")
        }
        migrated_history = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
        current = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = 10
            """
        ).fetchone()
    finally:
        connection.close()

    assert columns["quantity"] == "REAL"
    assert columns["sale"] == "INTEGER"
    assert migrated_history is None
    assert dict(current) == {
        "current_price_date": 100.0,
        "current_price": 5.0,
        "current_price_quantity": 2.0,
        "current_price_sale": 0,
    }


def test_health_endpoint_initializes_database(tmp_path: object) -> None:
    database_path = tmp_path / "api.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert database_path.exists()  # type: ignore[union-attr]


def test_tag_endpoint_returns_empty_catalog(tmp_path: object) -> None:
    database_path = tmp_path / "empty-tag-catalog.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        response = client.get("/api/v1/tags")

    assert response.status_code == 200
    assert response.json() == []


def test_tag_endpoints_list_catalog_and_aggregate_product_modifiers(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "tag-catalog-api.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES (?, ?, ?)
            """,
            [
                ("whole grain bread", "loaf", 1),
                ("fruit", "lbs", 2),
                ("empty", "count", 1),
            ],
        )
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.executemany(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (?, ?, 1, ?)
            """,
            [
                (20, "Seeded Bread", "loaf"),
                (10, "Organic Bread", "loaf"),
                (30, "Apples", "lbs"),
            ],
        )
        connection.executemany(
            "INSERT INTO tag_products (tag, product_id) VALUES (?, ?)",
            [
                ("whole grain bread", 20),
                ("fruit", 30),
                ("whole grain bread", 10),
            ],
        )
        connection.executemany(
            """
            INSERT INTO product_modifiers (product_id, modifier, position)
            VALUES (?, ?, ?)
            """,
            [
                (10, "sliced", 1),
                (10, "organic", 0),
                (20, "gluten free", 1),
                (20, "organic", 0),
                (30, "ripe", 0),
            ],
        )

        tags = [tag.model_dump(by_alias=True) for tag in list_tags(connection)]
        modifiers = list_tag_modifiers(connection, "whole grain bread")
        no_modifiers = list_tag_modifiers(connection, "empty")
        missing = list_tag_modifiers(connection, "missing")
    finally:
        connection.close()

    expected_tags = [
        {
            "tag": "empty",
            "defaultUnit": "count",
            "defaultQuantity": 1.0,
            "products": [],
        },
        {
            "tag": "fruit",
            "defaultUnit": "lbs",
            "defaultQuantity": 2.0,
            "products": [30],
        },
        {
            "tag": "whole grain bread",
            "defaultUnit": "loaf",
            "defaultQuantity": 1.0,
            "products": [10, 20],
        },
    ]
    assert tags == expected_tags
    assert modifiers == ["gluten free", "organic", "sliced"]
    assert no_modifiers == []
    assert missing is None

    with TestClient(create_app(database_path)) as client:
        collection_response = client.get("/api/v1/tags")
        modifier_response = client.get(
            "/api/v1/tags/whole%20grain%20bread/modifiers"
        )
        empty_response = client.get("/api/v1/tags/empty/modifiers")
        missing_response = client.get("/api/v1/tags/missing/modifiers")

    assert collection_response.status_code == 200
    assert collection_response.json() == expected_tags
    assert modifier_response.status_code == 200
    assert modifier_response.json() == ["gluten free", "organic", "sliced"]
    assert empty_response.status_code == 200
    assert empty_response.json() == []
    assert missing_response.status_code == 404
    assert missing_response.json() == {"detail": "Tag not found"}


def test_recipe_import_endpoint_returns_validated_grocery_items(tmp_path: object) -> None:
    database_path = tmp_path / "recipe-import.db"  # type: ignore[operator]
    application = create_app(
        database_path,
        recipe_import_provider=_FakeRecipeImportProvider(),
    )

    with TestClient(application) as client:
        response = client.post(
            "/api/v1/assistant/recipe-import",
            json={"source": "Tacos with ground beef and corn tortillas", "sourceType": "text"},
        )
        invalid = client.post(
            "/api/v1/assistant/recipe-import",
            json={"source": "   "},
        )

    assert response.status_code == 200
    assert response.json() == {
        "title": "Taco Night",
        "ingredients": [
            {
                "name": "Ground Beef",
                "quantity": "1",
                "unit": "lb",
                "note": None,
                "tags": ["ground beef"],
            },
            {
                "name": "Corn Tortillas",
                "quantity": "12",
                "unit": "count",
                "note": None,
                "tags": ["corn tortilla"],
            },
        ],
        "tags": ["ground beef", "corn tortilla"],
        "warnings": [],
    }
    assert invalid.status_code == 422


def test_recipe_import_endpoint_reports_missing_configuration(tmp_path: object) -> None:
    database_path = tmp_path / "recipe-import-unconfigured.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        response = client.post(
            "/api/v1/assistant/recipe-import",
            json={"source": "Tacos with ground beef"},
        )

    assert response.status_code == 503
    assert response.json() == {"detail": "Carter is not configured yet."}


def test_carter_chat_endpoint_returns_provider_answer(tmp_path: object) -> None:
    database_path = tmp_path / "carter-chat.db"  # type: ignore[operator]

    with TestClient(
        create_app(database_path, recipe_import_provider=_FakeRecipeImportProvider())
    ) as client:
        response = client.post(
            "/api/v1/assistant/chat",
            json={
                "message": "How does this app work?",
                "messages": [{"role": "user", "content": "I need dinner ideas."}],
            },
        )

    assert response.status_code == 200
    assert response.json() == {"message": "Cartograph can help plan a grocery trip."}


def test_shopping_list_create_matches_shared_contract_fixture(
    tmp_path: object,
) -> None:
    fixture = json.loads(SHOPPING_LIST_CONTRACT_FIXTURE.read_text(encoding="utf-8"))
    database_path = tmp_path / "shopping-list-contract.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES (?, ?, ?)
            """,
            (
                (tag["tag"], tag["defaultUnit"], tag["defaultQuantity"])
                for tag in fixture["tags"]
            ),
        )
    finally:
        connection.close()

    with TestClient(create_app(database_path)) as client:
        response = client.post(
            "/api/v1/shopping-lists",
            json=fixture["createRequest"],
        )

    assert response.status_code == 201
    assert response.json() == fixture["expectedResponse"]


def test_shopping_list_endpoints_support_crud(tmp_path: object) -> None:
    database_path = tmp_path / "shopping-list-api.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute("INSERT INTO tags VALUES ('milk', 'gallon', 1)")
    finally:
        connection.close()

    with TestClient(create_app(database_path)) as client:
        created_response = client.post(
            "/api/v1/shopping-lists",
            json={
                "items": [{"tag": " Milk ", "modifiers": ["ORGANIC"]}],
                "active": False,
            },
        )
        assert created_response.status_code == 201
        created = created_response.json()
        assert created["name"] == "New List 1"
        assert created["items"] == [
            {
                "tag": "milk",
                "modifiers": ["organic"],
                "unit": "gallon",
                "quantity": 1.0,
            }
        ]
        assert created["active"] is False
        assert set(created) == {"id", "name", "items", "active"}

        shopping_list_id = created["id"]
        fetched = client.get(f"/api/v1/shopping-lists/{shopping_list_id}")
        assert fetched.status_code == 200
        assert fetched.json() == created

        updated = client.put(
            f"/api/v1/shopping-lists/{shopping_list_id}",
            json={"name": "  Weekend  ", "items": [], "active": True},
        )
        assert updated.status_code == 200
        assert updated.json() == {
            "name": "Weekend",
            "items": [],
            "active": True,
            "id": shopping_list_id,
        }
        activated_generation = client.get("/api/v1/route-calculation").json()[
            "generation"
        ]
        assert activated_generation == 1

        renamed = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/name",
            json={"name": "  Weekly Essentials  "},
        )
        assert renamed.status_code == 200
        assert renamed.json() == {
            **updated.json(),
            "name": "Weekly Essentials",
        }
        assert (
            client.get("/api/v1/route-calculation").json()["generation"]
            == activated_generation
        )

        deactivated = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/active",
            json={"active": False},
        )
        assert deactivated.status_code == 200
        assert deactivated.json()["active"] is False
        assert client.get("/api/v1/route-calculation").json()["generation"] == 2

        collection = client.get("/api/v1/shopping-lists")
        assert collection.status_code == 200
        assert collection.json() == [deactivated.json()]

        invalid_name = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/name",
            json={"name": "   "},
        )
        assert invalid_name.status_code == 422

        deleted = client.delete(f"/api/v1/shopping-lists/{shopping_list_id}")
        assert deleted.status_code == 204
        assert deleted.content == b""

        for method in (client.get, client.delete):
            missing = method(f"/api/v1/shopping-lists/{shopping_list_id}")
            assert missing.status_code == 404
            assert missing.json() == {"detail": "Shopping list not found"}

        missing_update = client.put(
            f"/api/v1/shopping-lists/{shopping_list_id}",
            json={"name": "Missing", "items": []},
        )
        assert missing_update.status_code == 404

        missing_name_update = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/name",
            json={"name": "Missing"},
        )
        assert missing_name_update.status_code == 404

        missing_active_update = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/active",
            json={"active": True},
        )
        assert missing_active_update.status_code == 404

        invalid = client.post(
            "/api/v1/shopping-lists", json={"items": [{"tag": "   "}]}
        )
        assert invalid.status_code == 422

        unknown = client.post(
            "/api/v1/shopping-lists", json={"items": [{"tag": "missing"}]}
        )
        assert unknown.status_code == 422
        assert unknown.json()["detail"] == "unknown shopping list tags: missing"


def test_global_route_calculation_persists_enriched_candidates(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "route-candidate-api.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute(
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES ('milk', 'gallon', 1)
            """
        )
        shopping_list = create_shopping_list(
            connection,
            ShoppingListCreate(
                name="Weekend",
                items=[
                    {
                        "tag": "milk",
                        "modifiers": ["organic"],
                        "unit": "gallon",
                        "quantity": 2,
                    }
                ],
            ),
        )
        connection.execute(
            """
            INSERT INTO stores (id, name, address, latitude, longitude)
            VALUES (1, 'Market', '1 Main St', 34.06, -117.18)
            """
        )
        connection.execute(
            "INSERT INTO products (id, name, store_id, unit) VALUES (10, 'Milk', 1, 'gallon')"
        )
        connection.execute(
            "INSERT INTO tag_products (tag, product_id) VALUES ('milk', 10)"
        )
        connection.execute(
            "INSERT INTO product_modifiers VALUES (10, 'organic', 0)"
        )
        connection.execute(
            "INSERT INTO price_history (product_id, date, price) VALUES (10, 100, 3.50)"
        )
        connection.execute(
            """
            UPDATE products
            SET current_price_date = 200, current_price = 3.75,
                current_price_quantity = 1, current_price_sale = 0
            WHERE id = 10
            """
        )
    finally:
        connection.close()

    provider = _FakeTravelMatrixProvider()
    application = create_app(database_path, travel_matrix_provider=provider)
    with TestClient(application) as client:
        started = client.post("/api/v1/route-calculation")
        assert started.status_code == 202
        status_payload = _wait_for_terminal_route_calculation(client)
        response = client.get("/api/v1/route-candidates")

    assert status_payload["status"] == "SUCCEEDED"
    assert status_payload["resultCount"] > 0
    assert response.status_code == 200
    payload = response.json()
    assert payload["generation"] == status_payload["generation"]
    assert payload["candidates"][0]["stores"] == [
        {
            "id": 1,
            "name": "Market",
            "address": "1 Main St",
            "latitude": 34.06,
            "longitude": -117.18,
        }
    ]
    assert payload["candidates"][0]["products"] == [
        {
            "id": 10,
            "name": "Milk",
            "store": 1,
            "unit": "gallon",
            "modifiers": ["organic"],
            "selectionPrice": 7.5,
        }
    ]
    assert payload["candidates"][0]["selections"] == [
        {
            "tag": "milk",
            "modifiers": ["organic"],
            "unit": "gallon",
            "quantity": 2.0,
            "product": 10,
        }
    ]
    assert provider.current_location is not None
    assert provider.current_location.x == -117.1825
    assert provider.current_location.y == 34.0556

    connection = connect_database(database_path)
    try:
        route_count = connection.execute("SELECT COUNT(*) FROM routes").fetchone()[0]
        unchanged = get_shopping_list(connection, shopping_list.id)
    finally:
        connection.close()
    assert route_count > 0
    assert unchanged is not None
    assert unchanged.active


def test_global_route_calculation_reports_empty_and_typed_failure_states(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "route-candidate-errors.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute("INSERT INTO tags VALUES ('unavailable', 'each', 1)")
    finally:
        connection.close()
    with TestClient(create_app(database_path)) as client:
        empty = client.post("/api/v1/shopping-lists", json={"items": []})
        assert empty.status_code == 201
        empty_status = _wait_for_terminal_route_calculation(client)
        assert empty_status["status"] == "SUCCEEDED"
        assert empty_status["resultCount"] == 0
        assert client.get("/api/v1/route-candidates").json()["candidates"] == []

        no_match = client.post(
            "/api/v1/shopping-lists", json={"items": [{"tag": "unavailable"}]}
        )
        assert no_match.status_code == 201
        no_match_status = _wait_for_terminal_route_calculation(client)

    assert no_match_status["status"] == "FAILED"
    assert no_match_status["errorCode"] == "NO_ELIGIBLE_PRODUCTS"
    assert no_match_status["detail"]


def test_app_uses_cartograph_database_environment_variable(
    tmp_path: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "configured.db"  # type: ignore[operator]
    monkeypatch.setenv("CARTOGRAPH_DB_PATH", str(database_path))
    application = create_app()

    with TestClient(application) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert application.state.database_path == database_path


def test_openapi_only_publishes_implemented_operations(tmp_path: object) -> None:
    database_path = tmp_path / "openapi.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        openapi = client.get("/openapi.json").json()

    assert openapi["info"]["title"] == "Cartograph API"
    assert set(openapi["paths"]) == {
        "/api/v1/assistant/chat",
        "/api/v1/assistant/recipe-import",
        "/api/v1/health",
        "/api/v1/route-calculation",
        "/api/v1/route-candidates",
        "/api/v1/shopping-lists",
        "/api/v1/shopping-lists/{shopping_list_id}",
        "/api/v1/shopping-lists/{shopping_list_id}/active",
        "/api/v1/shopping-lists/{shopping_list_id}/name",
        "/api/v1/tags",
        "/api/v1/tags/{tag_id}/modifiers",
    }
    assert set(openapi["paths"]["/api/v1/assistant/chat"]) == {"post"}
    assert set(openapi["paths"]["/api/v1/assistant/recipe-import"]) == {"post"}
    assert set(openapi["paths"]["/api/v1/shopping-lists"]) == {"get", "post"}
    assert set(openapi["paths"]["/api/v1/shopping-lists/{shopping_list_id}"]) == {
        "delete",
        "get",
        "put",
    }
    assert set(
        openapi["paths"]["/api/v1/shopping-lists/{shopping_list_id}/name"]
    ) == {"patch"}
    assert set(
        openapi["paths"]["/api/v1/shopping-lists/{shopping_list_id}/active"]
    ) == {"patch"}
    assert set(openapi["paths"]["/api/v1/route-calculation"]) == {"get", "post"}
    assert set(openapi["paths"]["/api/v1/route-candidates"]) == {"get"}
    assert set(openapi["paths"]["/api/v1/tags"]) == {"get"}
    assert set(openapi["paths"]["/api/v1/tags/{tag_id}/modifiers"]) == {"get"}