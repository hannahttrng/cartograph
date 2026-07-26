import asyncio

from arcgis.geometry import Point

from backend.demo_travel_matrix import DemoTravelMatrixProvider
from backend.types import Store


def _location(latitude: float = 34.0556, longitude: float = -117.1825) -> Point:
    return Point(
        {
            "x": longitude,
            "y": latitude,
            "spatialReference": {"wkid": 4326},
        }
    )


def _store(store_id: int, latitude: float, longitude: float) -> Store:
    return Store(
        id=store_id,
        name=f"Store {store_id}",
        address=f"{store_id} Main St",
        latitude=latitude,
        longitude=longitude,
    )


def test_demo_provider_preserves_order_and_emits_directed_cells() -> None:
    provider = DemoTravelMatrixProvider()
    stores = [
        _store(20, 34.0613, -117.1826),
        _store(10, 34.0622, -117.1906),
    ]

    matrices = asyncio.run(
        provider.get_route_travel_matrices(_location(), stores)
    )

    assert matrices.store_matrix.store_ids == [20, 10]
    assert matrices.current_location_matrix.store_ids == [20, 10]
    assert matrices.store_matrix.matrix[0][0].distance_miles == 0
    assert (
        matrices.store_matrix.matrix[0][1].distance_miles
        == matrices.store_matrix.matrix[1][0].distance_miles
    )
    assert (
        matrices.current_location_matrix.matrix[0][0].distance_miles
        == matrices.current_location_matrix.matrix[1][0].distance_miles
    )


def test_demo_provider_honors_supplied_current_location() -> None:
    provider = DemoTravelMatrixProvider()
    store = _store(10, 34.0622, -117.1906)

    near = asyncio.run(
        provider.get_route_travel_matrices(
            _location(store.latitude, store.longitude), [store]
        )
    )
    far = asyncio.run(
        provider.get_route_travel_matrices(_location(35.0, -118.0), [store])
    )

    assert near.current_location_matrix.matrix[0][0].distance_miles == 0
    assert far.current_location_matrix.matrix[0][0].distance_miles > 50


def test_demo_provider_diagnoses_every_null_for_missing_coordinates() -> None:
    provider = DemoTravelMatrixProvider()
    stores = [
        _store(10, 34.0622, -117.1906),
        Store(id=20, name="Unknown", address="Unknown"),
    ]

    matrices = asyncio.run(
        provider.get_route_travel_matrices(_location(), stores)
    )

    store_nulls = {
        (row_index, column_index)
        for row_index, row in enumerate(matrices.store_matrix.matrix)
        for column_index, metric in enumerate(row)
        if metric is None
    }
    store_diagnostics = {
        (diagnostic.row, diagnostic.column)
        for diagnostic in matrices.store_matrix.diagnostics
    }
    location_nulls = {
        (row_index, column_index)
        for row_index, row in enumerate(matrices.current_location_matrix.matrix)
        for column_index, metric in enumerate(row)
        if metric is None
    }
    location_diagnostics = {
        (diagnostic.row, diagnostic.column)
        for diagnostic in matrices.current_location_matrix.diagnostics
    }

    assert store_nulls == store_diagnostics == {(0, 1), (1, 0)}
    assert location_nulls == location_diagnostics == {(0, 1), (1, 1)}