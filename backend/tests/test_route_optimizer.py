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
    RouteScorePolicy,
    SolverSettings,
    _assignment_tie_expressions,
    _build_problem,
    optimize_routes,
)
from backend.types import Store
from backend.types import RouteOptimizationStatus


def metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(distanceMiles=distance, travelTimeMinutes=travel_time)


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
            "INSERT INTO product_tags (product_id, tag, position) VALUES (?, ?, ?)",
            [
                (20, "dairy", 0),
                (20, "milk", 1),
                (10, "milk", 0),
                (30, "milk", 0),
                (30, "ignored", 1),
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

        catalog = load_optimization_catalog(connection, ["milk", "dairy", "milk"])
    finally:
        connection.close()

    assert catalog.requested_tags == ("dairy", "milk")
    assert [store.id for store in catalog.stores] == [1, 2]
    assert [product.id for product in catalog.products] == [20, 30]
    assert catalog.products[0].matching_tags == ("dairy", "milk")
    assert catalog.products[1].matching_tags == ("milk",)


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


def _catalog(products: list[OptimizationProduct]) -> OptimizationCatalog:
    store_ids = sorted({product.store_id for product in products})
    tags = sorted({tag for product in products for tag in product.matching_tags})
    return OptimizationCatalog(
        requested_tags=tuple(tags),
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
        products=tuple(sorted(products, key=lambda product: product.id)),
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


def test_optimizer_quantizes_and_explains_score() -> None:
    catalog = _catalog(
        [OptimizationProduct(10, "Milk", 1, "gallon", 3.495, ("milk",))]
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
    assert result.status.value == "OPTIMAL"
    assert result.proven_prefix_count == 1


def test_optimizer_prefers_coverage_before_lower_score() -> None:
    catalog = _catalog(
        [
            OptimizationProduct(10, "Milk", 1, "each", 1, ("milk",)),
            OptimizationProduct(20, "Bread", 2, "each", 100, ("bread",)),
        ]
    )

    result = optimize_routes(
        catalog,
        _complete_matrix([1, 2]),
        limit=4,
        settings=SolverSettings(timeout_seconds=5),
    )

    assert [candidate.matched_tag_count for candidate in result.candidates] == [2, 2, 1, 1]
    assert result.candidates[1].score > result.candidates[2].score
    assert all(candidate.error_code is None for candidate in result.candidates[:2])
    assert all(candidate.error_code is not None for candidate in result.candidates[2:])


def test_optimizer_uses_distinct_products_and_deterministic_ties() -> None:
    catalog = _catalog(
        [
            OptimizationProduct(10, "Multi", 1, "each", 1, ("dairy", "milk")),
            OptimizationProduct(20, "Milk", 1, "each", 1, ("milk",)),
            OptimizationProduct(30, "Dairy", 1, "each", 1, ("dairy",)),
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
            OptimizationProduct(product_id, f"Milk {product_id}", 1, "each", product_id, ("milk",))
            for product_id in range(1, 6)
        ]
        + [
            OptimizationProduct(10, "Other Store Milk", 2, "each", 10, ("milk",))
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
        requested_tags=("milk", "unavailable"),
        stores=(Store(id=1, name="Store 1", address="1 Main St", products=[10]),),
        products=(OptimizationProduct(10, "Milk", 1, "each", 2, ("milk",)),),
    )

    result = optimize_routes(catalog, _complete_matrix([1]), limit=1)

    candidate = result.candidates[0]
    assert [(selection.tag, selection.product) for selection in candidate.selections] == [
        ("milk", 10),
        ("unavailable", None),
    ]
    assert candidate.matched_tag_count == 1
    assert candidate.error_code is not None


def test_optimizer_rejects_store_without_origin_round_trip() -> None:
    catalog = _catalog(
        [OptimizationProduct(10, "Milk", 1, "each", 2, ("milk",))]
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


def test_optimizer_top_k_matches_exhaustive_directed_enumeration() -> None:
    products = [
        OptimizationProduct(10, "Milk One", 1, "each", 3, ("milk",)),
        OptimizationProduct(20, "Milk Two", 2, "each", 2, ("milk",)),
        OptimizationProduct(30, "Bread One", 1, "each", 4, ("bread",)),
        OptimizationProduct(40, "Bread Two", 2, "each", 5, ("bread",)),
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
        for tag in catalog.requested_tags
    }
    product_rank = {
        item.id: rank for rank, item in enumerate(products, start=1)
    }
    unmatched_rank = len(products) + 1
    exhaustive: list[
        tuple[int, float, tuple[int, ...], tuple[int, ...], tuple[int | None, ...]]
    ] = []
    for choices in product(
        *([None] + products_by_tag[tag] for tag in catalog.requested_tags)
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
    filtered: list[
        tuple[int, float, tuple[int, ...], tuple[int, ...], tuple[int | None, ...]]
    ] = []
    sequence_counts: dict[tuple[int, ...], int] = {}
    for expected in exhaustive:
        sequence = expected[2]
        if sequence_counts.get(sequence, 0) >= 3:
            continue
        sequence_counts[sequence] = sequence_counts.get(sequence, 0) + 1
        filtered.append(expected)
        if len(filtered) == 12:
            break

    actual = [
        (
            -candidate.matched_tag_count,
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
    assert actual == filtered


def test_optimizer_reports_unproven_candidate_when_deadline_hits_during_ties(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    catalog = _catalog(
        [OptimizationProduct(10, "Milk", 1, "each", 2, ("milk",))]
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


def test_large_primary_use_case_has_valid_tie_objectives() -> None:
    tags = tuple(f"tag-{index:02d}" for index in range(15))
    products = tuple(
        OptimizationProduct(
            id=product_id,
            name=f"Product {product_id}",
            store_id=1,
            unit="each",
            price=float(product_id),
            matching_tags=(tags[product_id % len(tags)],),
        )
        for product_id in range(1, 121)
    )
    catalog = OptimizationCatalog(
        requested_tags=tags,
        stores=(
            Store(
                id=1,
                name="Store 1",
                address="1 Main St",
                products=[item.id for item in products],
            ),
        ),
        products=products,
    )
    problem = _build_problem(catalog, _complete_matrix([1]), RouteScorePolicy())

    for expression in _assignment_tie_expressions(problem):
        model = problem.model.clone()
        model.minimize(expression)
        assert model.validate() == ""