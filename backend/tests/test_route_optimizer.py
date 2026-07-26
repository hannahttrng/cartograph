from dataclasses import dataclass
from itertools import permutations, product
from threading import Event

import pytest

import backend.route_optimizer as route_optimizer
from backend.arcgis_connector import (
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMetric,
)
from backend.resolvers import connect_database, initialize_database, load_optimization_catalog
from backend.route_optimizer import (
    DirectedTravelMatrix,
    NoFeasibleRouteError,
    OptimizationCatalog,
    OptimizationProduct,
    RouteOptimizationCancelled,
    RouteScorePolicy,
    SolverSettings,
    optimize_routes,
)
from backend.types import ShoppingListItem, Store
from backend.types import RouteCandidate, RouteOptimizationStatus


def metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(distanceMiles=distance, travelTimeMinutes=travel_time)


@dataclass(frozen=True, slots=True)
class _ProductFixture:
    id: int
    name: str
    store_id: int
    unit: str
    price: float
    matching_tags: tuple[str, ...]


def _fixture_product(
    product_id: int,
    name: str,
    store_id: int,
    unit: str,
    price: float,
    matching_tags: tuple[str, ...],
) -> _ProductFixture:
    return _ProductFixture(
        id=product_id,
        name=name,
        store_id=store_id,
        unit=unit,
        price=price,
        matching_tags=matching_tags,
    )


def test_catalog_loads_only_current_products_and_preserves_matching_edges(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "optimizer.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            "INSERT INTO stores (id, name, address) VALUES (?, ?, ?)",
            [(2, "Second", "2 Main St"), (1, "First", "1 Main St")],
        )
        connection.executemany(
            "INSERT INTO products (id, name, store_id, unit) VALUES (?, ?, ?, 'each')",
            [(20, "Current Multi", 2), (10, "Stale", 1), (30, "Current Milk", 1)],
        )
        connection.executemany(
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES (?, 'each', 1)
            """,
            [("dairy",), ("ignored",), ("milk",)],
        )
        connection.executemany(
            "INSERT INTO tag_products (tag, product_id) VALUES (?, ?)",
            [
                ("dairy", 20),
                ("milk", 20),
                ("milk", 10),
                ("milk", 30),
                ("ignored", 30),
            ],
        )
        connection.executemany(
            "INSERT INTO price_history (product_id, date, price) VALUES (?, 50, ?)",
            [(20, 4.25), (10, 1.00), (30, 3.75)],
        )
        connection.executemany(
            """
            UPDATE products
            SET current_price_date = 100, current_price = ?,
                current_price_quantity = 1, current_price_sale = 0
            WHERE id = ?
            """,
            [(4.25, 20), (3.75, 30)],
        )

        catalog = load_optimization_catalog(
            connection,
            [
                ShoppingListItem(
                    tag="dairy", modifiers=[], unit="each", quantity=1
                ),
                ShoppingListItem(
                    tag="milk", modifiers=[], unit="each", quantity=1
                ),
            ],
        )
    finally:
        connection.close()

    assert tuple(item.tag for item in catalog.requested_items) == ("dairy", "milk")
    assert [store.id for store in catalog.stores] == [1, 2]
    assert [product.id for product in catalog.products] == [20, 30]
    assert catalog.products[0].matching_item_indices == (0, 1)
    assert catalog.products[1].matching_item_indices == (1,)


def test_directed_matrix_composes_store_and_location_rows() -> None:
    directed = DirectedTravelMatrix.compose(
        RouteTravelMatrices(
            storeMatrix=StoreTravelMatrix(
                storeIds=[10, 20],
                matrix=[
                    [metric(0, 0), metric(3, 8)],
                    [metric(4, 10), metric(0, 0)],
                ],
            ),
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=[10, 20],
                matrix=[
                    [metric(1, 3), metric(2, 5)],
                    [metric(1.5, 4), metric(2.5, 6)],
                ],
            ),
        )
    )

    assert directed.get(None, 10) == metric(1, 3)
    assert directed.get(10, None) == metric(1.5, 4)
    assert directed.get(10, 20) == metric(3, 8)
    assert directed.get(20, 10) == metric(4, 10)


def test_catalog_accepts_twelve_stores_and_rejects_thirteen() -> None:
    twelve_store_catalog = _catalog(
        [
            _fixture_product(
                store_id,
                f"Milk at Store {store_id}",
                store_id,
                "each",
                store_id,
                ("milk",),
            )
            for store_id in range(1, 13)
        ]
    )

    assert len(twelve_store_catalog.stores) == 12

    with pytest.raises(ValueError, match="at most 12 stores"):
        _catalog(
            [
                _fixture_product(
                    store_id,
                    f"Milk at Store {store_id}",
                    store_id,
                    "each",
                    store_id,
                    ("milk",),
                )
                for store_id in range(1, 14)
            ]
        )


def _catalog(products: list[_ProductFixture]) -> OptimizationCatalog:
    store_ids = sorted({product.store_id for product in products})
    tags = sorted({tag for product in products for tag in product.matching_tags})
    tag_indices = {tag: index for index, tag in enumerate(tags)}
    requested_items = tuple(
        ShoppingListItem(
            tag=tag,
            modifiers=[],
            unit=next(
                product.unit for product in products if tag in product.matching_tags
            ),
            quantity=1,
        )
        for tag in tags
    )
    return OptimizationCatalog(
        requested_items=requested_items,
        stores=tuple(
            Store(
                id=store_id,
                name=f"Store {store_id}",
                address=f"{store_id} Main St",
                products=[
                    product.id for product in products if product.store_id == store_id
                ],
            )
            for store_id in store_ids
        ),
        products=tuple(
            OptimizationProduct(
                id=product.id,
                name=product.name,
                store_id=product.store_id,
                unit=product.unit,
                price=product.price,
                price_quantity=1,
                modifiers=(),
                matching_item_indices=tuple(
                    tag_indices[tag] for tag in product.matching_tags
                ),
            )
            for product in sorted(products, key=lambda product: product.id)
        ),
    )


def _complete_matrix(store_ids: list[int]) -> DirectedTravelMatrix:
    size = len(store_ids)
    return DirectedTravelMatrix.compose(
        RouteTravelMatrices(
            storeMatrix=StoreTravelMatrix(
                storeIds=store_ids,
                matrix=[
                    [metric(0, 0) if row == column else metric(1, 3) for column in range(size)]
                    for row in range(size)
                ],
            ),
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=store_ids,
                matrix=[
                    [metric(1, 3) for _ in store_ids],
                    [metric(1, 3) for _ in store_ids],
                ],
            ),
        )
    )


def test_catalog_filters_item_constraints_and_prices_requested_quantity(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "item-eligibility.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute("INSERT INTO tags VALUES ('egg', 'count', 6)")
        connection.execute(
            """
            INSERT INTO stores (id, name, address)
            VALUES (1, 'Market', '1 Main St')
            """
        )
        connection.executemany(
            """
            INSERT INTO products (
                id, name, store_id, unit, current_price_date,
                current_price, current_price_quantity, current_price_sale
            )
            VALUES (?, ?, 1, ?, 100, ?, 12, 0)
            """,
            [
                (10, "Organic Eggs", "count", 4.00),
                (20, "Plain Eggs", "count", 2.00),
                (30, "Organic Dozen", "dozen", 3.00),
            ],
        )
        connection.executemany(
            "INSERT INTO tag_products VALUES ('egg', ?)",
            [(10,), (20,), (30,)],
        )
        connection.executemany(
            "INSERT INTO product_modifiers VALUES (?, 'organic', 0)",
            [(10,), (30,)],
        )

        catalog = load_optimization_catalog(
            connection,
            [
                ShoppingListItem(
                    tag="egg",
                    modifiers=["organic"],
                    unit="count",
                    quantity=6,
                )
            ],
        )
    finally:
        connection.close()

    assert [product.id for product in catalog.products] == [10, 20]
    assert catalog.products[0].price_quantity == 12
    assert catalog.products[0].matching_item_indices == (0,)
    assert catalog.products[1].matching_item_indices == (0,)

    result = optimize_routes(catalog, _complete_matrix([1]), limit=1)

    candidate = result.candidates[0]
    assert candidate.products == [20]
    assert candidate.product_price == 1.0
    assert candidate.score_components.product_price == 1.0
    assert candidate.score_components.modifier_penalty == 1.5


def test_optimizer_quantizes_and_explains_score() -> None:
    catalog = _catalog(
        [_fixture_product(10, "Milk", 1, "gallon", 3.495, ("milk",))]
    )

    result = optimize_routes(
        catalog,
        _complete_matrix([1]),
        limit=1,
        settings=SolverSettings(timeout_seconds=5),
    )

    candidate = result.candidates[0]
    assert candidate.product_price == 3.5
    assert candidate.distance == 2
    assert candidate.time == 6
    assert candidate.score_components.product_price == 3.5
    assert candidate.score_components.distance_cost == 0.8
    assert candidate.score_components.time_cost == 0.8
    assert candidate.score_components.store_cost == 1.5
    assert candidate.score_components.modifier_penalty == 0
    assert candidate.score == 6.6
    assert result.status.value == "HEURISTIC"
    assert result.proven_prefix_count == 0


def test_optimizer_uses_weighted_modifier_miss_penalty() -> None:
    requested_item = ShoppingListItem(
        tag="milk",
        modifiers=["organic"],
        unit="gallon",
        quantity=1,
    )
    stores = (
        Store(id=1, name="Market", address="1 Main St", products=[10]),
        Store(id=2, name="Value Market", address="2 Main St", products=[20]),
    )

    def catalog(plain_price: float) -> OptimizationCatalog:
        return OptimizationCatalog(
            requested_items=(requested_item,),
            stores=stores,
            products=(
                OptimizationProduct(
                    id=10,
                    name="Organic Milk",
                    store_id=1,
                    unit="gallon",
                    price=4,
                    price_quantity=1,
                    modifiers=("organic",),
                    matching_item_indices=(0,),
                ),
                OptimizationProduct(
                    id=20,
                    name="Plain Milk",
                    store_id=2,
                    unit="gallon",
                    price=plain_price,
                    price_quantity=1,
                    modifiers=(),
                    matching_item_indices=(0,),
                ),
            ),
        )

    preserved = optimize_routes(catalog(2.75), _complete_matrix([1, 2]), limit=2)
    cheaper_fallback = optimize_routes(catalog(2), _complete_matrix([1, 2]), limit=2)

    assert len(preserved.candidates) == 2
    assert preserved.candidates[0].products == [10]
    assert preserved.candidates[0].score_components.modifier_penalty == 0
    assert len(cheaper_fallback.candidates) == 2
    assert cheaper_fallback.candidates[0].products == [20]
    assert cheaper_fallback.candidates[0].score_components.modifier_penalty == 1.5


def test_optimizer_prefers_coverage_before_lower_score() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Milk", 1, "each", 1, ("milk",)),
            _fixture_product(20, "Bread", 2, "each", 100, ("bread",)),
        ]
    )

    result = optimize_routes(
        catalog,
        _complete_matrix([1, 2]),
        limit=4,
        settings=SolverSettings(timeout_seconds=5),
    )

    assert [candidate.matched_item_count for candidate in result.candidates] == [2, 1, 1]
    assert result.candidates[0].score > result.candidates[1].score
    assert result.candidates[0].error_code is None
    assert all(candidate.error_code is not None for candidate in result.candidates[1:])


def test_optimizer_uses_distinct_products_and_deterministic_ties() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Multi", 1, "each", 1, ("dairy", "milk")),
            _fixture_product(20, "Milk", 1, "each", 1, ("milk",)),
            _fixture_product(30, "Dairy", 1, "each", 1, ("dairy",)),
        ]
    )

    first = optimize_routes(catalog, _complete_matrix([1]), limit=3)
    second = optimize_routes(catalog, _complete_matrix([1]), limit=3)

    assert [
        candidate.model_dump(by_alias=True, exclude={"score"})
        for candidate in first.candidates
    ] == [
        candidate.model_dump(by_alias=True, exclude={"score"})
        for candidate in second.candidates
    ]
    assert all(
        len(set(candidate.products)) == len(candidate.products)
        for candidate in first.candidates
    )


def test_false_cancellation_callback_preserves_exact_output(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Milk One", 1, "each", 3, ("milk",)),
            _fixture_product(20, "Milk Two", 2, "each", 2, ("milk",)),
            _fixture_product(30, "Bread One", 1, "each", 4, ("bread",)),
            _fixture_product(40, "Bread Two", 2, "each", 5, ("bread",)),
        ]
    )
    travel = _complete_matrix([1, 2])
    monkeypatch.setattr("backend.route_optimizer.monotonic", lambda: 100.0)
    baseline = optimize_routes(catalog, travel, limit=12)
    callback_count = 0

    def should_cancel() -> bool:
        nonlocal callback_count
        callback_count += 1
        return False

    checked = optimize_routes(
        catalog,
        travel,
        limit=12,
        should_cancel=should_cancel,
    )

    assert callback_count > 0
    assert checked.model_dump(by_alias=True) == baseline.model_dump(by_alias=True)


def test_optimizer_raises_dedicated_cancellation_during_assignment() -> None:
    catalog = _catalog(
        [_fixture_product(10, "Milk", 1, "each", 2, ("milk",))]
    )
    callback_count = 0

    def should_cancel() -> bool:
        nonlocal callback_count
        callback_count += 1
        return callback_count >= 5

    with pytest.raises(RouteOptimizationCancelled, match="cancelled"):
        optimize_routes(
            catalog,
            _complete_matrix([1]),
            limit=1,
            should_cancel=should_cancel,
        )

    assert callback_count == 5


def test_optimizer_cancels_during_store_sequence_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "First", 1, "each", 1, ("first",)),
            _fixture_product(20, "Second", 2, "each", 1, ("second",)),
            _fixture_product(30, "Third", 3, "each", 1, ("third",)),
        ]
    )
    travel = _complete_matrix([1, 2, 3])
    cancel_event = Event()
    original_get = DirectedTravelMatrix.get

    def get_and_cancel_on_store_arc(
        matrix: DirectedTravelMatrix,
        origin_store_id: int | None,
        destination_store_id: int | None,
    ) -> TravelMetric | None:
        result = original_get(matrix, origin_store_id, destination_store_id)
        if (
            origin_store_id is not None
            and destination_store_id is not None
            and origin_store_id != destination_store_id
        ):
            cancel_event.set()
        return result

    monkeypatch.setattr(
        DirectedTravelMatrix,
        "get",
        get_and_cancel_on_store_arc,
    )

    with pytest.raises(RouteOptimizationCancelled):
        optimize_routes(
            catalog,
            travel,
            limit=1,
            should_cancel=cancel_event.is_set,
        )

    assert cancel_event.is_set()


@pytest.mark.parametrize(
    "helper_name",
    ["_build_candidate", "_rank_and_limit_candidates"],
)
def test_optimizer_cancels_at_late_deterministic_boundaries(
    monkeypatch: pytest.MonkeyPatch,
    helper_name: str,
) -> None:
    catalog = _catalog(
        [_fixture_product(10, "Milk", 1, "each", 2, ("milk",))]
    )
    cancel_event = Event()
    original_helper = getattr(route_optimizer, helper_name)

    def cancel_before_helper(*args: object, **kwargs: object):
        cancel_event.set()
        return original_helper(*args, **kwargs)

    monkeypatch.setattr(route_optimizer, helper_name, cancel_before_helper)

    with pytest.raises(RouteOptimizationCancelled):
        optimize_routes(
            catalog,
            _complete_matrix([1]),
            limit=1,
            should_cancel=cancel_event.is_set,
        )

    assert cancel_event.is_set()


def test_optimizer_returns_one_best_candidate_per_store_set() -> None:
    catalog = _catalog(
        [
            _fixture_product(product_id, f"Milk {product_id}", 1, "each", product_id, ("milk",))
            for product_id in range(1, 6)
        ]
        + [
            _fixture_product(10, "Other Store Milk", 2, "each", 10, ("milk",))
        ]
    )

    result = optimize_routes(catalog, _complete_matrix([1, 2]), limit=5)

    assert [candidate.products for candidate in result.candidates] == [[1], [10]]
    assert [frozenset(candidate.stores) for candidate in result.candidates] == [
        frozenset({1}),
        frozenset({2}),
    ]


def test_optimizer_preserves_cheapest_and_shortest_generated_candidates() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Balanced One", 1, "each", 5, ("milk",)),
            _fixture_product(20, "Balanced Two", 2, "each", 6, ("milk",)),
            _fixture_product(30, "Balanced Three", 3, "each", 7, ("milk",)),
            _fixture_product(40, "Cheapest", 4, "each", 0, ("milk",)),
            _fixture_product(50, "Shortest", 5, "each", 100, ("milk",)),
        ]
    )
    store_ids = [1, 2, 3, 4, 5]
    round_trip_distances = {1: 2, 2: 2, 3: 2, 4: 100, 5: 0.2}
    arcs = {
        (origin, destination): (
            metric(0, 0) if origin == destination else metric(1, 0)
        )
        for origin in store_ids
        for destination in store_ids
    }
    for store_id, distance in round_trip_distances.items():
        arcs[(None, store_id)] = metric(distance / 2, 0)
        arcs[(store_id, None)] = metric(distance / 2, 0)

    result = optimize_routes(
        catalog,
        DirectedTravelMatrix(store_ids=tuple(store_ids), arcs=arcs),
        limit=3,
    )

    assert [candidate.stores for candidate in result.candidates] == [[1], [4], [5]]
    assert min(result.candidates, key=lambda candidate: candidate.product_price).stores == [4]
    assert min(result.candidates, key=lambda candidate: candidate.distance).stores == [5]


def test_optimizer_limit_one_preserves_best_overall_candidate() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Best Overall", 1, "each", 5, ("milk",)),
            _fixture_product(20, "Cheapest", 2, "each", 0, ("milk",)),
            _fixture_product(30, "Shortest", 3, "each", 100, ("milk",)),
        ]
    )
    travel = DirectedTravelMatrix(
        store_ids=(1, 2, 3),
        arcs={
            (1, 1): metric(0, 0),
            (2, 2): metric(0, 0),
            (3, 3): metric(0, 0),
            (1, 2): metric(1, 0),
            (1, 3): metric(1, 0),
            (2, 1): metric(1, 0),
            (2, 3): metric(1, 0),
            (3, 1): metric(1, 0),
            (3, 2): metric(1, 0),
            (None, 1): metric(1, 0),
            (1, None): metric(1, 0),
            (None, 2): metric(50, 0),
            (2, None): metric(50, 0),
            (None, 3): metric(0.1, 0),
            (3, None): metric(0.1, 0),
        },
    )

    result = optimize_routes(catalog, travel, limit=1)

    assert result.candidates[0].stores == [1]


def test_cheapest_replaces_the_normal_representative_for_its_store_set() -> None:
    best_overall = route_optimizer._RankedCandidate(
        candidate=RouteCandidate(
            stores=[2, 1],
            products=[10],
            selections=[
                {
                    "tag": "milk",
                    "unit": "each",
                    "quantity": 1,
                    "product": 10,
                }
            ],
            distance=5,
            time=1,
            productPrice=10,
            matchedItemCount=1,
            score=10,
            scoreComponents={
                "productPrice": 10,
                "distanceCost": 0,
                "timeCost": 0,
                "storeCost": 0,
            },
        ),
        score_units=10 * route_optimizer.SCORE_UNITS_PER_DOLLAR,
        assignment_ranks=(1,),
    )
    cheapest_and_shortest = route_optimizer._RankedCandidate(
        candidate=RouteCandidate(
            stores=[1, 2],
            products=[20],
            selections=[
                {
                    "tag": "milk",
                    "unit": "each",
                    "quantity": 1,
                    "product": 20,
                }
            ],
            distance=1,
            time=1,
            productPrice=1,
            matchedItemCount=1,
            score=20,
            scoreComponents={
                "productPrice": 1,
                "distanceCost": 0,
                "timeCost": 19,
                "storeCost": 0,
            },
        ),
        score_units=20 * route_optimizer.SCORE_UNITS_PER_DOLLAR,
        assignment_ranks=(2,),
    )

    result = route_optimizer._rank_and_limit_candidates(
        [best_overall, cheapest_and_shortest],
        limit=2,
    )

    assert result == [cheapest_and_shortest.candidate]


def test_shortest_does_not_replace_best_representative_for_its_store_set() -> None:
    best_overall = route_optimizer._RankedCandidate(
        candidate=RouteCandidate(
            stores=[2, 1],
            products=[10],
            selections=[
                {
                    "tag": "milk",
                    "unit": "each",
                    "quantity": 1,
                    "product": 10,
                }
            ],
            distance=5,
            time=1,
            productPrice=1,
            matchedItemCount=1,
            score=10,
            scoreComponents={
                "productPrice": 1,
                "distanceCost": 0,
                "timeCost": 9,
                "storeCost": 0,
            },
        ),
        score_units=10 * route_optimizer.SCORE_UNITS_PER_DOLLAR,
        assignment_ranks=(1,),
    )
    shortest = route_optimizer._RankedCandidate(
        candidate=RouteCandidate(
            stores=[1, 2],
            products=[20],
            selections=[
                {
                    "tag": "milk",
                    "unit": "each",
                    "quantity": 1,
                    "product": 20,
                }
            ],
            distance=1,
            time=1,
            productPrice=20,
            matchedItemCount=1,
            score=20,
            scoreComponents={
                "productPrice": 20,
                "distanceCost": 0,
                "timeCost": 0,
                "storeCost": 0,
            },
        ),
        score_units=20 * route_optimizer.SCORE_UNITS_PER_DOLLAR,
        assignment_ranks=(2,),
    )

    result = route_optimizer._rank_and_limit_candidates(
        [best_overall, shortest],
        limit=2,
    )

    assert result == [best_overall.candidate]


def test_extrema_require_eighty_five_percent_of_best_item_coverage() -> None:
    total_items = 20

    def ranked_candidate(
        store_id: int,
        matched_count: int,
        product_price: float,
        distance: float,
    ) -> route_optimizer._RankedCandidate:
        product_ids = [store_id * 100 + index for index in range(matched_count)]
        selections = [
            {
                "tag": f"item-{index}",
                "unit": "each",
                "quantity": 1,
                "product": product_ids[index] if index < matched_count else None,
            }
            for index in range(total_items)
        ]
        candidate = RouteCandidate(
            stores=[store_id],
            products=product_ids,
            selections=selections,
            distance=distance,
            time=1,
            productPrice=product_price,
            matchedItemCount=matched_count,
            score=product_price,
            scoreComponents={
                "productPrice": product_price,
                "distanceCost": 0,
                "timeCost": 0,
                "storeCost": 0,
            },
            errorCode=(
                None if matched_count == total_items else "PARTIAL_ITEM_MATCH"
            ),
        )
        return route_optimizer._RankedCandidate(
            candidate=candidate,
            score_units=round(
                product_price * route_optimizer.SCORE_UNITS_PER_DOLLAR
            ),
            assignment_ranks=tuple(product_ids),
        )

    best = ranked_candidate(1, 20, 50, 10)
    threadbare_cheapest = ranked_candidate(2, 16, 0, 8)
    eligible_cheapest = ranked_candidate(3, 17, 5, 7)
    threadbare_shortest = ranked_candidate(4, 16, 8, 0.1)
    eligible_shortest = ranked_candidate(5, 17, 10, 1)

    result = route_optimizer._rank_and_limit_candidates(
        [
            best,
            threadbare_cheapest,
            eligible_cheapest,
            threadbare_shortest,
            eligible_shortest,
        ],
        limit=3,
    )

    assert [candidate.stores for candidate in result] == [[1], [3], [5]]
    assert all(candidate.matched_item_count >= 17 for candidate in result)


def test_optimizer_preserves_unavailable_tags_as_partial_selections() -> None:
    catalog = OptimizationCatalog(
        requested_items=(
            ShoppingListItem(tag="milk", modifiers=[], unit="each", quantity=1),
            ShoppingListItem(
                tag="unavailable", modifiers=[], unit="each", quantity=1
            ),
        ),
        stores=(Store(id=1, name="Store 1", address="1 Main St", products=[10]),),
        products=(
            OptimizationProduct(
                10,
                "Milk",
                1,
                "each",
                2,
                1,
                (),
                (0,),
            ),
        ),
    )

    result = optimize_routes(catalog, _complete_matrix([1]), limit=1)

    candidate = result.candidates[0]
    assert [(selection.tag, selection.product) for selection in candidate.selections] == [
        ("milk", 10),
        ("unavailable", None),
    ]
    assert candidate.matched_item_count == 1
    assert candidate.error_code is not None


def test_optimizer_rejects_store_without_origin_round_trip() -> None:
    catalog = _catalog(
        [_fixture_product(10, "Milk", 1, "each", 2, ("milk",))]
    )
    travel = DirectedTravelMatrix(
        store_ids=(1,),
        arcs={
            (1, 1): metric(0, 0),
            (None, 1): None,
            (1, None): metric(1, 3),
        },
    )

    with pytest.raises(NoFeasibleRouteError, match="round trip"):
        optimize_routes(catalog, travel, limit=1)


def test_optimizer_returns_ranked_feasible_candidates_on_small_fixture() -> None:
    products = [
        _fixture_product(10, "Milk One", 1, "each", 3, ("milk",)),
        _fixture_product(20, "Milk Two", 2, "each", 2, ("milk",)),
        _fixture_product(30, "Bread One", 1, "each", 4, ("bread",)),
        _fixture_product(40, "Bread Two", 2, "each", 5, ("bread",)),
    ]
    catalog = _catalog(products)
    arcs = {
        (None, 1): metric(1, 3),
        (1, None): metric(1.5, 4),
        (None, 2): metric(2, 5),
        (2, None): metric(2.5, 6),
        (1, 1): metric(0, 0),
        (2, 2): metric(0, 0),
        (1, 2): metric(0.75, 2),
        (2, 1): metric(1.25, 3),
    }
    travel = DirectedTravelMatrix(store_ids=(1, 2), arcs=arcs)
    result = optimize_routes(catalog, travel, limit=12)
    policy = RouteScorePolicy()

    products_by_tag = {
        tag: [item for item in products if tag in item.matching_tags]
        for tag in (item.tag for item in catalog.requested_items)
    }
    product_rank = {
        item.id: rank for rank, item in enumerate(products, start=1)
    }
    unmatched_rank = len(products) + 1
    exhaustive: list[
        tuple[int, float, tuple[int, ...], tuple[int, ...], tuple[int | None, ...]]
    ] = []
    for choices in product(
        *(
            [None] + products_by_tag[item.tag]
            for item in catalog.requested_items
        )
    ):
        selected = [item for item in choices if item is not None]
        if not selected or len({item.id for item in selected}) != len(selected):
            continue
        store_ids = sorted({item.store_id for item in selected})
        for store_sequence in permutations(store_ids):
            route_nodes: tuple[int | None, ...] = (None, *store_sequence, None)
            route_metrics = [
                arcs[(origin, destination)]
                for origin, destination in zip(route_nodes, route_nodes[1:])
            ]
            if any(route_metric is None for route_metric in route_metrics):
                continue
            distance = sum(
                route_metric.distance_miles
                for route_metric in route_metrics
                if route_metric is not None
            )
            travel_time = sum(
                route_metric.travel_time_minutes
                for route_metric in route_metrics
                if route_metric is not None
            )
            score = round(
                sum(item.price for item in selected)
                + float(policy.distance_dollars_per_mile) * distance
                + float(policy.time_dollars_per_hour) * travel_time / 60
                + float(policy.store_dollars) * len(store_sequence),
                6,
            )
            assignment_ids = tuple(item.id if item is not None else None for item in choices)
            assignment_ranks = tuple(
                product_rank[item.id] if item is not None else unmatched_rank
                for item in choices
            )
            exhaustive.append(
                (
                    -len(selected),
                    score,
                    store_sequence,
                    assignment_ranks,
                    assignment_ids,
                )
            )
    exhaustive.sort()
    actual = [
        (
            -candidate.matched_item_count,
            candidate.score,
            tuple(candidate.stores),
            tuple(
                product_rank[selection.product]
                if selection.product is not None
                else unmatched_rank
                for selection in candidate.selections
            ),
            tuple(selection.product for selection in candidate.selections),
        )
        for candidate in result.candidates
    ]
    feasible = set(exhaustive)
    assert actual == sorted(actual)
    assert all(candidate in feasible for candidate in actual)
    assert actual[0][0] == min(candidate[0] for candidate in exhaustive)
    assert len({frozenset(candidate[2]) for candidate in actual}) == len(actual)


def test_optimizer_uses_feasible_product_over_cheaper_unreachable_product() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "Unreachable Milk", 1, "each", 1, ("milk",)),
            _fixture_product(20, "Reachable Milk", 2, "each", 5, ("milk",)),
        ]
    )
    travel = DirectedTravelMatrix(
        store_ids=(1, 2),
        arcs={
            (None, 1): None,
            (1, None): None,
            (None, 2): metric(1, 3),
            (2, None): metric(1, 3),
            (1, 1): metric(0, 0),
            (2, 2): metric(0, 0),
            (1, 2): None,
            (2, 1): None,
        },
    )

    result = optimize_routes(catalog, travel, limit=2)

    assert result.candidates[0].products == [20]
    assert all(candidate.products != [10] for candidate in result.candidates)


def test_optimizer_finds_sparse_directed_store_sequence() -> None:
    catalog = _catalog(
        [
            _fixture_product(10, "First", 1, "each", 1, ("first",)),
            _fixture_product(20, "Second", 2, "each", 1, ("second",)),
            _fixture_product(30, "Third", 3, "each", 1, ("third",)),
        ]
    )
    travel = DirectedTravelMatrix(
        store_ids=(1, 2, 3),
        arcs={
            (None, 1): None,
            (None, 2): metric(1, 2),
            (None, 3): None,
            (1, None): None,
            (2, None): None,
            (3, None): metric(1, 2),
            (1, 1): metric(0, 0),
            (2, 2): metric(0, 0),
            (3, 3): metric(0, 0),
            (1, 2): None,
            (1, 3): metric(1, 2),
            (2, 1): metric(1, 2),
            (2, 3): None,
            (3, 1): None,
            (3, 2): None,
        },
    )

    result = optimize_routes(catalog, travel, limit=1)

    assert result.candidates[0].stores == [2, 1, 3]
    assert result.candidates[0].matched_item_count == 3


def test_optimizer_reports_unproven_candidate_when_deadline_hits_during_ties(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog = _catalog(
        [_fixture_product(10, "Milk", 1, "each", 2, ("milk",))]
    )
    clock = iter((0.0, 0.0, 6.0, 6.0))
    monkeypatch.setattr("backend.route_optimizer.monotonic", lambda: next(clock))

    result = optimize_routes(
        catalog,
        _complete_matrix([1]),
        limit=1,
        settings=SolverSettings(timeout_seconds=5),
    )

    assert result.status == RouteOptimizationStatus.FEASIBLE_TIMEOUT
    assert result.proven_prefix_count == 0
    assert len(result.candidates) == 1


def test_solver_settings_validate_heuristic_bounds() -> None:
    with pytest.raises(ValueError, match="assignment_beam_width must be positive"):
        SolverSettings(assignment_beam_width=0)

    with pytest.raises(ValueError, match="sequence_beam_width must be positive"):
        SolverSettings(sequence_beam_width=0)