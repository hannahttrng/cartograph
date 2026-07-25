import sqlite3

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
    claim_pending_shopping_list,
    connect_database,
    create_shopping_list,
    delete_shopping_list,
    fail_shopping_list_computation,
    get_shopping_list,
    initialize_database,
    is_product_route_eligible,
    list_shopping_lists,
    publish_shopping_list_routes,
    replace_shopping_list,
    requeue_shopping_list,
    update_shopping_list_name,
)
from backend.types import (
    PriceHistory,
    Product,
    ProductCreate,
    Route,
    RouteCandidate,
    RouteCreate,
    RouteErrorCode,
    RouteOptimizationRequest,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    ShoppingList,
    ShoppingListCreate,
    ShoppingListNameUpdate,
    ShoppingListReplace,
    ShoppingListStatus,
    StoreCreate,
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


def test_price_history_computes_unit_price() -> None:
    history = PriceHistory(date=100, price=12, quantity=2.5)

    assert history.unit_price == 4.8
    assert history.model_dump(by_alias=True) == {
        "date": 100.0,
        "price": 12.0,
        "quantity": 2.5,
        "sale": False,
        "unitPrice": 4.8,
    }


def test_price_history_rejects_zero_quantity() -> None:
    with pytest.raises(ValidationError):
        PriceHistory(date=100, price=12, quantity=0)


def test_product_name_is_trimmed_while_other_text_is_normalized() -> None:
    product = ProductCreate(
        name="  Trader Joe's Organic Milk  ",
        tags=[" Plant Based ", "ORGANIC"],
        store=1,
        unit=" GALLON ",
    )

    assert product.name == "Trader Joe's Organic Milk"
    assert product.tags == ["plant based", "organic"]
    assert product.unit == "gallon"


def test_store_name_and_address_are_trimmed_with_capitalization_preserved() -> None:
    store = StoreCreate(
        name="  Trader Joes  ",
        address=" 552 Orange St, Redlands, CA 92374 ",
    )

    assert store.name == "Trader Joes"
    assert store.address == "552 Orange St, Redlands, CA 92374"


def test_display_text_must_not_be_blank() -> None:
    with pytest.raises(ValidationError, match="name must not be blank"):
        ProductCreate(name="   ", tags=["dairy"], store=1, unit="gallon")

    with pytest.raises(ValidationError, match="name must not be blank"):
        StoreCreate(name="   ", address="1 main st")

    with pytest.raises(ValidationError, match="address must not be blank"):
        StoreCreate(name="Market", address="   ")


def test_product_rejects_duplicate_tags_after_normalization() -> None:
    with pytest.raises(ValidationError, match="tags must not contain duplicates"):
        ProductCreate(
            name="Milk",
            tags=[" Plant Based ", "plant based"],
            store=1,
            unit="gallon",
        )


def test_shopping_list_contract_normalizes_client_managed_fields() -> None:
    create_request = ShoppingListCreate(
        name="  Weekly Shop  ",
        tags=[" Plant Based ", "plant based", "ORGANIC"],
    )
    replace_request = ShoppingListReplace(name="  Renamed  ", tags=[])

    assert create_request.name == "Weekly Shop"
    assert create_request.active is True
    assert create_request.tags == {"plant based", "organic"}
    assert replace_request.name == "Renamed"
    assert replace_request.active is True
    assert replace_request.tags == set()
    assert ShoppingListCreate(tags=[]).name is None
    assert ShoppingListNameUpdate(name="  Renamed Again  ").name == "Renamed Again"


def test_shopping_list_contract_rejects_invalid_text_and_missing_fields() -> None:
    with pytest.raises(ValidationError, match="name must not be blank"):
        ShoppingListCreate(name="   ", tags=[])

    with pytest.raises(ValidationError, match="tag must not be blank"):
        ShoppingListCreate(tags=["   "])

    with pytest.raises(ValidationError):
        ShoppingListCreate()  # type: ignore[call-arg]

    with pytest.raises(ValidationError):
        ShoppingListReplace(tags=[])  # type: ignore[call-arg]


def test_shopping_list_contract_keeps_routes_server_managed_and_ordered() -> None:
    shopping_list = ShoppingList(
        id=1,
        name="New List 1",
        active=False,
        tags={"milk"},
        routes=[20, 10],
        status=ShoppingListStatus.READY,
    )

    assert shopping_list.routes == [20, 10]
    assert shopping_list.active is False
    assert shopping_list.status == ShoppingListStatus.READY

    with pytest.raises(ValidationError, match="routes must not contain duplicates"):
        ShoppingList(
            id=1,
            name="New List 1",
            tags=set(),
            routes=[10, 10],
            status=ShoppingListStatus.READY,
        )

    with pytest.raises(
        ValidationError, match="routes may only be present when status is READY"
    ):
        ShoppingList(
            id=1,
            name="New List 1",
            tags=set(),
            routes=[10],
            status=ShoppingListStatus.COMPUTING,
        )


def test_product_current_price_points_to_owned_history_entry() -> None:
    product = Product(
        id=1,
        name="Milk",
        tags=["dairy"],
        store=10,
        unit="gallon",
        priceHistory=[
            {"date": 200, "price": 4.25, "quantity": 1},
            {"date": 100, "price": 3.75, "quantity": 1, "sale": True},
        ],
        currentPrice={"date": 100, "price": 3.75, "quantity": 1, "sale": True},
    )

    assert [entry.date for entry in product.price_history] == [100, 200]
    assert product.current_price is product.price_history[0]
    assert product.model_dump(by_alias=True)["currentPrice"] == {
        "date": 100.0,
        "price": 3.75,
        "quantity": 1,
        "sale": True,
        "unitPrice": 3.75,
    }


def test_product_current_price_sale_must_match_owned_history_entry() -> None:
    with pytest.raises(
        ValidationError, match="currentPrice must reference an entry in priceHistory"
    ):
        Product(
            id=1,
            name="Milk",
            tags=["dairy"],
            store=10,
            unit="gallon",
            priceHistory=[{"date": 100, "price": 3.75, "quantity": 1, "sale": True}],
            currentPrice={"date": 100, "price": 3.75, "quantity": 1, "sale": False},
        )


def test_product_without_history_has_no_current_price() -> None:
    product = Product(
        id=1,
        name="Milk",
        tags=["dairy"],
        store=10,
        unit="gallon",
    )

    assert product.price_history == []
    assert product.current_price is None


def test_product_history_does_not_imply_a_current_price() -> None:
    product = Product(
        id=1,
        name="Milk",
        tags=["dairy"],
        store=10,
        unit="gallon",
        priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
    )

    assert product.current_price is None


def test_product_rejects_current_price_outside_history() -> None:
    with pytest.raises(
        ValidationError, match="currentPrice must reference an entry in priceHistory"
    ):
        Product(
            id=1,
            name="Milk",
            tags=["dairy"],
            store=10,
            unit="gallon",
            priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
            currentPrice={"date": 200, "price": 4.25, "quantity": 1},
        )


def test_only_products_with_current_prices_are_route_eligible() -> None:
    product = Product(
        id=1,
        name="Milk",
        tags=["dairy"],
        store=10,
        unit="gallon",
        priceHistory=[{"date": 100, "price": 3.75, "quantity": 1}],
    )

    assert not is_product_route_eligible(product)

    product.current_price = product.price_history[0]

    assert is_product_route_eligible(product)


def test_product_rejects_duplicate_price_history_dates() -> None:
    with pytest.raises(ValidationError, match="price history dates must not contain duplicates"):
        Product(
            id=1,
            name="Milk",
            tags=["dairy"],
            store=10,
            unit="gallon",
            priceHistory=[
                {"date": 100, "price": 3.75, "quantity": 1},
                {"date": 100, "price": 4.25, "quantity": 1},
            ],
        )


def test_route_create_normalizes_and_collapses_duplicate_tags() -> None:
    request = RouteCreate(tags=[" Ground Beef ", "Bread", "ground beef"])

    assert request.tags == ["ground beef", "bread"]


def test_complete_route_keeps_explicit_relationships() -> None:
    route = Route(
        id=1,
        stores=[20, 10],
        products=[200, 100],
        productTags={200: [" Bread "], 100: [" Ground Beef "]},
        selections=[
            {"tag": " GROUND BEEF ", "product": 100},
            {"tag": "BREAD", "product": 200},
        ],
        distance=1500,
        time=600,
        score=0.75,
    )

    assert route.model_dump(by_alias=True)["productTags"] == {
        200: ["bread"],
        100: ["ground beef"],
    }
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
        productTags={100: ["milk"]},
        selections=[
            {"tag": "milk", "product": 100},
            {"tag": "bread", "product": None},
        ],
        distance=0,
        time=0,
        score=0,
        errorCode=RouteErrorCode.PARTIAL_TAG_MATCH,
    )

    assert route.selections[1].product is None


def test_empty_partial_route_requires_zero_metrics() -> None:
    route = Route(
        id=1,
        stores=[],
        products=[],
        productTags={},
        selections=[{"tag": "unavailable", "product": None}],
        distance=0,
        time=0,
        score=0,
        errorCode="PARTIAL_TAG_MATCH",
    )

    assert route.products == []


def test_route_rejects_inconsistent_product_mapping() -> None:
    with pytest.raises(ValidationError, match="productTags keys must match products"):
        Route(
            id=1,
            stores=[10],
            products=[100],
            productTags={200: ["milk"]},
            selections=[{"tag": "milk", "product": 100}],
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
        productTags={100: ["milk"]},
        selections=[
            {"tag": "bread", "product": None},
            {"tag": "milk", "product": 100},
        ],
        distance=2.5,
        time=6,
        productPrice=4.25,
        matchedTagCount=1,
        score=10.5,
        scoreComponents={
            "productPrice": 4.25,
            "distanceCost": 1.75,
            "timeCost": 2.0,
            "storeCost": 2.5,
        },
        errorCode="PARTIAL_TAG_MATCH",
    )


def test_route_candidate_keeps_explainable_transient_result() -> None:
    candidate = _partial_route_candidate()
    payload = candidate.model_dump(by_alias=True)

    assert "id" not in payload
    assert payload["matchedTagCount"] == 1
    assert payload["scoreComponents"] == {
        "productPrice": 4.25,
        "distanceCost": 1.75,
        "timeCost": 2.0,
        "storeCost": 2.5,
    }


def test_route_candidate_rejects_inconsistent_score_and_selection_order() -> None:
    with pytest.raises(ValidationError, match="score must equal"):
        _partial_route_candidate().model_copy(update={"score": 10.51}, deep=True).__class__(
            **{
                **_partial_route_candidate().model_dump(by_alias=True),
                "score": 10.51,
            }
        )

    payload = _partial_route_candidate().model_dump(by_alias=True)
    payload["selections"] = list(reversed(payload["selections"]))
    with pytest.raises(ValidationError, match="ordered by tag"):
        RouteCandidate(**payload)


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
        "stores",
        "products",
        "product_tags",
        "price_history",
        "shopping_lists",
        "shopping_list_tags",
        "routes",
        "route_stores",
        "route_tag_selections",
        "shopping_list_routes",
    }
    assert foreign_keys_enabled == 1


def test_shopping_list_schema_enforces_status_and_route_ownership(
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
            "INSERT INTO shopping_list_tags (shopping_list_id, tag) VALUES (1, 'milk')"
        )
        connection.execute(
            "INSERT INTO routes (id, distance, time, score) VALUES (10, 0, 0, 0)"
        )

        with pytest.raises(
            sqlite3.IntegrityError,
            match="shopping list routes require READY status",
        ):
            connection.execute(
                """
                INSERT INTO shopping_list_routes
                    (shopping_list_id, route_id, position)
                VALUES (1, 10, 0)
                """
            )

        connection.execute(
            "UPDATE shopping_lists SET status = 'READY' WHERE id = 1"
        )
        connection.execute(
            """
            INSERT INTO shopping_list_routes (shopping_list_id, route_id, position)
            VALUES (1, 10, 0)
            """
        )

        with pytest.raises(
            sqlite3.IntegrityError,
            match="shopping list routes require READY status",
        ):
            connection.execute(
                "UPDATE shopping_lists SET status = 'PENDING' WHERE id = 1"
            )

        connection.execute("DELETE FROM shopping_lists WHERE id = 1")
        route_count = connection.execute(
            "SELECT COUNT(*) FROM routes WHERE id = 10"
        ).fetchone()[0]
    finally:
        connection.close()

    assert route_count == 0


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
            "SELECT active FROM shopping_lists WHERE id = 1"
        ).fetchone()["active"]
        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                "INSERT INTO shopping_lists (name, active) VALUES ('Invalid', 2)"
            )
    finally:
        connection.close()

    assert migrated == 1


def test_shopping_list_persistence_manages_names_and_crud(tmp_path: object) -> None:
    database_path = tmp_path / "shopping-list-crud.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        first = create_shopping_list(
            connection, ShoppingListCreate(tags={" Milk "}, active=False)
        )
        custom = create_shopping_list(
            connection,
            ShoppingListCreate(name="  Weekend  ", tags=set()),
        )
        second = create_shopping_list(connection, ShoppingListCreate(tags=set()))

        assert first.name == "New List 1"
        assert first.active is False
        assert first.tags == {"milk"}
        assert first.routes == []
        assert first.status == ShoppingListStatus.PENDING
        assert custom.name == "Weekend"
        assert second.name == "New List 2"
        assert [item.id for item in list_shopping_lists(connection)] == [
            first.id,
            custom.id,
            second.id,
        ]

        assert delete_shopping_list(connection, first.id)
        replacement = create_shopping_list(
            connection, ShoppingListCreate(tags=set())
        )
        assert replacement.name == "New List 1"
        assert get_shopping_list(connection, first.id) is None
        assert not delete_shopping_list(connection, 999)
        assert replace_shopping_list(
            connection,
            999,
            ShoppingListReplace(name="Missing", tags=set(), active=False),
        ) is None
        assert update_shopping_list_name(
            connection, 999, ShoppingListNameUpdate(name="Missing")
        ) is None
    finally:
        connection.close()


def test_shopping_list_persistence_invalidates_only_tag_changes(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "shopping-list-lifecycle.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        created = create_shopping_list(
            connection, ShoppingListCreate(tags={"milk"})
        )
        claim = claim_pending_shopping_list(connection)
        assert claim is not None
        assert claim.id == created.id
        assert claim.revision == 1
        assert claim.tags == {"milk"}

        connection.executemany(
            "INSERT INTO routes (id, distance, time, score) VALUES (?, 0, 0, 0)",
            [(10,), (20,)],
        )
        assert publish_shopping_list_routes(
            connection, claim.id, claim.revision, [20, 10]
        )

        renamed = replace_shopping_list(
            connection,
            claim.id,
            ShoppingListReplace(name="Renamed", tags={"milk"}, active=False),
        )
        assert renamed is not None
        assert renamed.name == "Renamed"
        assert renamed.active is False
        assert renamed.routes == [20, 10]
        assert renamed.status == ShoppingListStatus.READY

        revision_before_name_update = connection.execute(
            "SELECT revision FROM shopping_lists WHERE id = ?", (claim.id,)
        ).fetchone()["revision"]
        name_updated = update_shopping_list_name(
            connection,
            claim.id,
            ShoppingListNameUpdate(name="  Display Name  "),
        )
        revision_after_name_update = connection.execute(
            "SELECT revision FROM shopping_lists WHERE id = ?", (claim.id,)
        ).fetchone()["revision"]
        assert name_updated is not None
        assert name_updated.name == "Display Name"
        assert name_updated.active is False
        assert name_updated.tags == {"milk"}
        assert name_updated.routes == [20, 10]
        assert name_updated.status == ShoppingListStatus.READY
        assert revision_after_name_update == revision_before_name_update

        updated = replace_shopping_list(
            connection,
            claim.id,
            ShoppingListReplace(name="Renamed", tags={"bread"}, active=True),
        )
        assert updated is not None
        assert updated.tags == {"bread"}
        assert updated.active is True
        assert updated.routes == []
        assert updated.status == ShoppingListStatus.PENDING
        assert connection.execute("SELECT COUNT(*) FROM routes").fetchone()[0] == 0
        assert not publish_shopping_list_routes(
            connection, claim.id, claim.revision, [999]
        )

        next_claim = claim_pending_shopping_list(connection)
        assert next_claim is not None
        assert next_claim.revision == 2
        with pytest.raises(ValueError, match=r"route IDs do not exist: \[999\]"):
            publish_shopping_list_routes(
                connection, next_claim.id, next_claim.revision, [999]
            )
        computing = get_shopping_list(connection, next_claim.id)
        assert computing is not None
        assert computing.status == ShoppingListStatus.COMPUTING
        assert fail_shopping_list_computation(
            connection, next_claim.id, next_claim.revision
        )
        assert requeue_shopping_list(connection, next_claim.id)
        assert not requeue_shopping_list(connection, next_claim.id)
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
            "UPDATE products SET current_price_date = 100 WHERE id = ?",
            [(10,), (20,)],
        )
        connection.execute(
            "INSERT INTO routes (id, distance, time, score) VALUES (1, 0, 0, 0)"
        )
        connection.execute(
            "INSERT INTO route_stores (route_id, store_id, position) VALUES (1, 1, 0)"
        )
        connection.execute(
            """
            INSERT INTO route_tag_selections
                (route_id, requested_tag, position, product_id)
            VALUES (1, 'milk', 0, 10)
            """
        )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO route_tag_selections
                    (route_id, requested_tag, position, product_id)
                VALUES (1, 'dairy', 1, 10)
                """
            )

        with pytest.raises(
            sqlite3.IntegrityError, match="route product must have a current price"
        ):
            connection.execute(
                """
                INSERT INTO route_tag_selections
                    (route_id, requested_tag, position, product_id)
                VALUES (1, 'fruit', 2, 30)
                """
            )

        with pytest.raises(sqlite3.IntegrityError):
            connection.execute(
                """
                INSERT INTO route_tag_selections
                    (route_id, requested_tag, position, product_id)
                VALUES (1, 'bread', 0, 20)
                """
            )
    finally:
        connection.close()


def test_price_history_schema_owns_ordered_product_prices(tmp_path: object) -> None:
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
            "UPDATE products SET current_price_date = 100 WHERE id = 10"
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
            SELECT history.date, history.price, history.quantity, history.sale,
                   history.price / history.quantity AS unit_price
            FROM products AS product
            JOIN price_history AS history
                ON history.product_id = product.id
                AND history.date = product.current_price_date
            WHERE product.id = 10
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
            match="current price must reference product price history",
        ):
            connection.execute(
                "UPDATE products SET current_price_date = 300 WHERE id = 10"
            )
        with pytest.raises(
            sqlite3.IntegrityError,
            match="current price history entry is still referenced",
        ):
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
        "date": 100.0,
        "price": 7.5,
        "quantity": 2.0,
        "sale": 0,
        "unit_price": 3.75,
    }
    assert "price" not in product_columns
    assert "current_price_date" in product_columns


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
        migrated = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
        current_price_date = connection.execute(
            "SELECT current_price_date FROM products WHERE id = 10"
        ).fetchone()[0]
        with pytest.raises(
            sqlite3.IntegrityError,
            match="current price history entry is still referenced",
        ):
            connection.execute(
                "DELETE FROM price_history WHERE product_id = 10 AND date = 100"
            )
        with pytest.raises(
            sqlite3.IntegrityError,
            match="current price must reference product price history",
        ):
            connection.execute(
                "UPDATE products SET current_price_date = 200 WHERE id = 10"
            )
    finally:
        connection.close()

    assert quantity_type == "REAL"
    assert dict(migrated) == {
        "date": 100.0,
        "price": 5.0,
        "quantity": 2.0,
        "sale": 1,
    }
    assert current_price_date == 100.0


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
        migrated = connection.execute(
            "SELECT date, price, quantity, sale FROM price_history WHERE product_id = 10"
        ).fetchone()
        current_price_date = connection.execute(
            "SELECT current_price_date FROM products WHERE id = 10"
        ).fetchone()[0]
    finally:
        connection.close()

    assert columns["quantity"] == "REAL"
    assert columns["sale"] == "INTEGER"
    assert dict(migrated) == {
        "date": 100.0,
        "price": 5.0,
        "quantity": 2.0,
        "sale": 0,
    }
    assert current_price_date == 100.0


def test_health_endpoint_initializes_database(tmp_path: object) -> None:
    database_path = tmp_path / "api.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert database_path.exists()  # type: ignore[union-attr]


def test_shopping_list_endpoints_support_crud(tmp_path: object) -> None:
    database_path = tmp_path / "shopping-list-api.db"  # type: ignore[operator]

    with TestClient(create_app(database_path)) as client:
        created_response = client.post(
            "/api/v1/shopping-lists",
            json={"tags": [" Milk ", "milk", "ORGANIC"], "active": False},
        )
        assert created_response.status_code == 201
        created = created_response.json()
        assert created["name"] == "New List 1"
        assert set(created["tags"]) == {"milk", "organic"}
        assert created["active"] is False
        assert created["routes"] == []
        assert created["status"] == "PENDING"

        shopping_list_id = created["id"]
        fetched = client.get(f"/api/v1/shopping-lists/{shopping_list_id}")
        assert fetched.status_code == 200
        assert fetched.json() == created

        updated = client.put(
            f"/api/v1/shopping-lists/{shopping_list_id}",
            json={"name": "  Weekend  ", "tags": [], "active": True},
        )
        assert updated.status_code == 200
        assert updated.json() == {
            "name": "Weekend",
            "tags": [],
            "active": True,
            "id": shopping_list_id,
            "routes": [],
            "status": "PENDING",
        }

        renamed = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/name",
            json={"name": "  Weekly Essentials  "},
        )
        assert renamed.status_code == 200
        assert renamed.json() == {
            **updated.json(),
            "name": "Weekly Essentials",
        }

        collection = client.get("/api/v1/shopping-lists")
        assert collection.status_code == 200
        assert collection.json() == [renamed.json()]

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
            json={"name": "Missing", "tags": []},
        )
        assert missing_update.status_code == 404

        missing_name_update = client.patch(
            f"/api/v1/shopping-lists/{shopping_list_id}/name",
            json={"name": "Missing"},
        )
        assert missing_name_update.status_code == 404

        invalid = client.post("/api/v1/shopping-lists", json={"tags": ["   "]})
        assert invalid.status_code == 422


def test_route_candidate_endpoint_uses_saved_tags_without_persisting_results(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "route-candidate-api.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        shopping_list = create_shopping_list(
            connection, ShoppingListCreate(name="Weekend", tags={"milk"})
        )
        connection.execute(
            "INSERT INTO stores (id, name, address) VALUES (1, 'Market', '1 Main St')"
        )
        connection.execute(
            "INSERT INTO products (id, name, store_id, unit) VALUES (10, 'Milk', 1, 'gallon')"
        )
        connection.execute(
            "INSERT INTO product_tags (product_id, tag, position) VALUES (10, 'milk', 0)"
        )
        connection.execute(
            "INSERT INTO price_history (product_id, date, price) VALUES (10, 100, 3.50)"
        )
        connection.execute(
            "UPDATE products SET current_price_date = 100 WHERE id = 10"
        )
    finally:
        connection.close()

    provider = _FakeTravelMatrixProvider()
    application = create_app(database_path, travel_matrix_provider=provider)
    with TestClient(application) as client:
        response = client.post(
            f"/api/v1/shopping-lists/{shopping_list.id}/route-candidates",
            json={"latitude": 34.0556, "longitude": -117.1825, "limit": 1},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "OPTIMAL"
    assert payload["provenPrefixCount"] == 1
    assert payload["candidates"][0]["products"] == [10]
    assert provider.current_location is not None
    assert provider.current_location.x == -117.1825
    assert provider.current_location.y == 34.0556

    connection = connect_database(database_path)
    try:
        counts = {
            table: connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            for table in ("routes", "shopping_list_routes")
        }
        unchanged = get_shopping_list(connection, shopping_list.id)
    finally:
        connection.close()
    assert counts == {"routes": 0, "shopping_list_routes": 0}
    assert unchanged is not None
    assert unchanged.status == ShoppingListStatus.PENDING
    assert unchanged.routes == []

    with TestClient(create_app(database_path)) as client:
        unavailable = client.post(
            f"/api/v1/shopping-lists/{shopping_list.id}/route-candidates",
            json={"latitude": 34.0556, "longitude": -117.1825, "limit": 1},
        )
    assert unavailable.status_code == 503
    assert unavailable.json()["errorCode"] == "MATRIX_UNAVAILABLE"


def test_route_candidate_endpoint_returns_typed_unavailable_errors(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "route-candidate-errors.db"  # type: ignore[operator]
    with TestClient(create_app(database_path)) as client:
        empty = client.post("/api/v1/shopping-lists", json={"tags": []}).json()
        empty_response = client.post(
            f"/api/v1/shopping-lists/{empty['id']}/route-candidates",
            json={"latitude": 34, "longitude": -117},
        )
        missing_response = client.post(
            "/api/v1/shopping-lists/999/route-candidates",
            json={"latitude": 34, "longitude": -117},
        )

        no_match = client.post(
            "/api/v1/shopping-lists", json={"tags": ["unavailable"]}
        ).json()
        no_match_response = client.post(
            f"/api/v1/shopping-lists/{no_match['id']}/route-candidates",
            json={"latitude": 34, "longitude": -117},
        )

    assert empty_response.status_code == 422
    assert empty_response.json()["errorCode"] == "NO_ELIGIBLE_PRODUCTS"
    assert missing_response.status_code == 404
    assert no_match_response.status_code == 422
    assert no_match_response.json()["errorCode"] == "NO_ELIGIBLE_PRODUCTS"


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
        "/api/v1/health",
        "/api/v1/shopping-lists",
        "/api/v1/shopping-lists/{shopping_list_id}",
        "/api/v1/shopping-lists/{shopping_list_id}/name",
        "/api/v1/shopping-lists/{shopping_list_id}/route-candidates",
    }
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
        openapi["paths"][
            "/api/v1/shopping-lists/{shopping_list_id}/route-candidates"
        ]
    ) == {"post"}