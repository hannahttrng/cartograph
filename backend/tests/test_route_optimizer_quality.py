from time import perf_counter

import pytest

pytest.importorskip(
    "ortools",
    reason="install backend/test-requirements.txt to run exact quality comparisons",
)

from backend.arcgis_connector import TravelMetric
from backend.route_optimizer import (
    DirectedTravelMatrix,
    OptimizationCatalog,
    OptimizationProduct,
    optimize_routes,
)
from backend.tests.prior_route_optimizer import (
    ExactSolverSettings,
    optimize_routes_exact,
)
from backend.types import RouteCandidate, RouteOptimizationStatus, ShoppingListItem, Store


def _metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(
        distanceMiles=distance,
        travelTimeMinutes=travel_time,
    )


def _quality_fixture(
    item_count: int,
) -> tuple[OptimizationCatalog, DirectedTravelMatrix]:
    requested_items = tuple(
        ShoppingListItem(
            tag=f"item-{item_index:02d}",
            modifiers=[],
            unit="each",
            quantity=1,
        )
        for item_index in range(item_count)
    )
    products: list[OptimizationProduct] = []
    store_products = {store_id: [] for store_id in (1, 2, 3)}
    product_id = 1
    for item_index in range(item_count):
        primary_store = 1 + item_index % 3
        alternate_store = 1 + (item_index + 1) % 3
        alternatives = (
            (primary_store, 0.0),
            (alternate_store, 0.55 + (item_index % 2) * 0.2),
        )
        for store_id, price_premium in alternatives:
            products.append(
                OptimizationProduct(
                    id=product_id,
                    name=f"Item {item_index} at Store {store_id}",
                    store_id=store_id,
                    unit="each",
                    price=1.5 + (item_index % 5) * 0.4 + price_premium,
                    price_quantity=1,
                    modifiers=(),
                    matching_item_indices=(item_index,),
                )
            )
            store_products[store_id].append(product_id)
            product_id += 1

    stores = tuple(
        Store(
            id=store_id,
            name=f"Store {store_id}",
            address=f"{store_id} Main St",
            products=store_products[store_id],
        )
        for store_id in (1, 2, 3)
    )
    travel = DirectedTravelMatrix(
        store_ids=(1, 2, 3),
        arcs={
            (None, 1): _metric(1.0, 3.0),
            (1, None): _metric(1.1, 3.2),
            (None, 2): _metric(1.5, 4.0),
            (2, None): _metric(1.4, 4.2),
            (None, 3): _metric(2.0, 5.0),
            (3, None): _metric(1.9, 5.2),
            (1, 1): _metric(0, 0),
            (2, 2): _metric(0, 0),
            (3, 3): _metric(0, 0),
            (1, 2): _metric(0.7, 2.0),
            (2, 1): _metric(0.9, 2.4),
            (1, 3): _metric(1.1, 3.0),
            (3, 1): _metric(1.0, 2.8),
            (2, 3): _metric(0.6, 1.8),
            (3, 2): _metric(0.8, 2.1),
        },
    )
    return (
        OptimizationCatalog(
            requested_items=requested_items,
            stores=stores,
            products=tuple(products),
        ),
        travel,
    )


def _candidate_identity(
    candidate: RouteCandidate,
) -> tuple[tuple[int | None, ...], tuple[int, ...]]:
    return (
        tuple(selection.product for selection in candidate.selections),
        tuple(candidate.stores),
    )


@pytest.mark.parametrize("item_count", [5, 10, 15])
def test_greedy_top_five_against_proven_exact_ranking(item_count: int) -> None:
    catalog, travel = _quality_fixture(item_count)

    greedy_started = perf_counter()
    greedy = optimize_routes(catalog, travel, limit=20)
    greedy_seconds = perf_counter() - greedy_started

    exact_started = perf_counter()
    exact = optimize_routes_exact(
        catalog,
        travel,
        limit=20,
        settings=ExactSolverSettings(timeout_seconds=120),
    )
    exact_seconds = perf_counter() - exact_started

    assert exact.status == RouteOptimizationStatus.OPTIMAL
    assert exact.proven_prefix_count == 20
    assert len(greedy.candidates) >= 5
    exact_ranks = {
        _candidate_identity(candidate): rank
        for rank, candidate in enumerate(exact.candidates, start=1)
    }
    optimal_score = exact.candidates[0].score
    proven_ranks: list[int] = []

    print(
        f"\n{item_count} items: greedy={greedy_seconds:.6f}s, "
        f"exact={exact_seconds:.6f}s, optimalScore={optimal_score:.6f}"
    )
    for greedy_rank, candidate in enumerate(greedy.candidates[:5], start=1):
        identity = _candidate_identity(candidate)
        proven_rank = exact_ranks.get(identity)
        assert proven_rank is not None, (
            f"greedy route {greedy_rank} was not in the 20-route proven prefix"
        )
        proven_ranks.append(proven_rank)
        score_gap = candidate.score - optimal_score
        print(
            f"  greedyRank={greedy_rank}, score={candidate.score:.6f}, "
            f"provenRank={proven_rank}, gap={score_gap:.6f}, "
            f"stores={candidate.stores}, "
            f"products={[selection.product for selection in candidate.selections]}"
        )

    assert proven_ranks == [1, 2, 3, 4, 5]
    assert greedy.candidates[0].score == pytest.approx(optimal_score)