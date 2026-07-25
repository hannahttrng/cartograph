from dataclasses import dataclass
from itertools import permutations, product

import pytest

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
    SolverSettings,
    optimize_routes,
)
from backend.types import ShoppingListItem, Store
from backend.types import RouteOptimizationStatus


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
            "INSERT INTO stores VALUES (1, 'Market', '1 Main St')"
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

    assert [product.id for product in catalog.products] == [10]
    assert catalog.products[0].price_quantity == 12
    assert catalog.products[0].matching_item_indices == (0,)

    result = optimize_routes(catalog, _complete_matrix([1]), limit=1)

    candidate = result.candidates[0]
    assert candidate.products == [10]
    assert candidate.product_price == 2.0
    assert candidate.score_components.product_price == 2.0


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
    assert candidate.score_components.distance_cost == 1.4
    assert candidate.score_components.time_cost == 2
    assert candidate.score_components.store_cost == 2.5
    assert candidate.score == 9.4
    assert result.status.value == "HEURISTIC"
    assert result.proven_prefix_count == 0


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

    assert [candidate.matched_item_count for candidate in result.candidates] == [2, 2, 1, 1]
    assert result.candidates[1].score > result.candidates[2].score
    assert all(candidate.error_code is None for candidate in result.candidates[:2])
    assert all(candidate.error_code is not None for candidate in result.candidates[2:])


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
    assert all(len(candidate.products) == 2 for candidate in first.candidates)
    assert all(len(set(candidate.products)) == 2 for candidate in first.candidates)


def test_optimizer_caps_product_variants_per_store_sequence() -> None:
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

    assert len(result.candidates) == 4
    assert [candidate.products for candidate in result.candidates] == [
        [1],
        [2],
        [3],
        [10],
    ]


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
                + 0.70 * distance
                + 20 * travel_time / 60
                + 2.50 * len(store_sequence),
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
    assert len({(candidate[2], candidate[4]) for candidate in actual}) == len(actual)


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