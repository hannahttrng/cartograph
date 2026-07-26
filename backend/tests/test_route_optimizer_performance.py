from statistics import median
from time import perf_counter

import pytest

from backend.arcgis_connector import (
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMetric,
)
from backend.route_optimizer import (
    DirectedTravelMatrix,
    OptimizationCatalog,
    OptimizationProduct,
    SolverSettings,
    optimize_routes,
)
from backend.types import RouteOptimizationStatus, ShoppingListItem, Store


def _metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(
        distanceMiles=distance,
        travelTimeMinutes=travel_time,
    )


def _performance_fixture(
    tag_count: int,
    store_count: int = 10,
) -> tuple[OptimizationCatalog, DirectedTravelMatrix]:
    tags = tuple(f"tag-{index:02d}" for index in range(tag_count))
    store_ids = tuple(range(1, store_count + 1))
    store_products = {store_id: [] for store_id in store_ids}
    products: list[OptimizationProduct] = []
    product_id = 1
    for tag_index, tag in enumerate(tags):
        for store_id in store_ids:
            for variant in range(2):
                matching_tags = (tag,)
                if variant == 1 and tag_index % 4 == 0 and tag_index + 1 < tag_count:
                    matching_tags = (tag, tags[tag_index + 1])
                products.append(
                    OptimizationProduct(
                        id=product_id,
                        name=f"{tag}-{store_id}-{variant}",
                        store_id=store_id,
                        unit="each",
                        price=(
                            1
                            + (
                                tag_index * 17
                                + store_id * 7
                                + variant * 3
                            )
                            % 40
                            / 4
                        ),
                        price_quantity=1,
                        modifiers=(),
                        matching_item_indices=tuple(
                            tags.index(matching_tag)
                            for matching_tag in matching_tags
                        ),
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
        for store_id in store_ids
    )
    store_matrix = [
        [
            _metric(0, 0)
            if origin == destination
            else _metric(
                distance := 0.5 + ((origin * 11 + destination * 7) % 20) / 4,
                distance * 2.7 + ((origin + destination) % 3),
            )
            for destination in store_ids
        ]
        for origin in store_ids
    ]
    location_matrix = [
        [
            _metric(0.75 + store_id / 5, 3 + store_id / 2)
            for store_id in store_ids
        ],
        [
            _metric(1 + store_id / 6, 4 + store_id / 3)
            for store_id in store_ids
        ],
    ]
    catalog = OptimizationCatalog(
        requested_items=tuple(
            ShoppingListItem(
                tag=tag,
                modifiers=[],
                unit="each",
                quantity=1,
            )
            for tag in tags
        ),
        stores=stores,
        products=tuple(products),
    )
    travel = DirectedTravelMatrix.compose(
        RouteTravelMatrices(
            storeMatrix=StoreTravelMatrix(
                storeIds=list(store_ids),
                matrix=store_matrix,
            ),
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=list(store_ids),
                matrix=location_matrix,
            ),
        )
    )
    return catalog, travel


@pytest.mark.parametrize(
    ("tag_count", "maximum_median_seconds"),
    [(5, 1.0), (10, 1.0), (15, 4.0), (20, 4.0)],
)
def test_optimizer_meets_latency_target(
    tag_count: int,
    maximum_median_seconds: float,
) -> None:
    catalog, travel = _performance_fixture(tag_count)
    samples: list[float] = []
    result = None
    for _ in range(3):
        started_at = perf_counter()
        result = optimize_routes(
            catalog,
            travel,
            limit=20,
            settings=SolverSettings(timeout_seconds=10),
        )
        samples.append(perf_counter() - started_at)

    assert result is not None
    assert result.status == RouteOptimizationStatus.HEURISTIC
    assert len(result.candidates) == 20
    assert len({frozenset(candidate.stores) for candidate in result.candidates}) == len(
        result.candidates
    )
    assert median(samples) < maximum_median_seconds, (
        f"{tag_count}-item median exceeded {maximum_median_seconds}s: {samples}"
    )


def test_optimizer_meets_large_case_target_with_twelve_store_catalog() -> None:
    catalog, travel = _performance_fixture(10, store_count=12)

    started_at = perf_counter()
    result = optimize_routes(
        catalog,
        travel,
        limit=20,
        settings=SolverSettings(timeout_seconds=10),
    )
    elapsed = perf_counter() - started_at

    assert len(catalog.stores) == 12
    assert result.status == RouteOptimizationStatus.HEURISTIC
    assert len(result.candidates) == 20
    assert len({frozenset(candidate.stores) for candidate in result.candidates}) == len(
        result.candidates
    )
    assert elapsed < 4.0, f"12-store case exceeded 4.0s: {elapsed}"