import asyncio

import pytest
from arcgis.geometry import Point
from pydantic import ValidationError

from backend.arcgis_connector import (
    ArcGISConnector,
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMatrixDiagnostic,
    TravelMatrixDiagnosticCode,
    TravelMetric,
    TravelMatrixProvider,
    validate_current_location,
)
from backend.types import Store


def metric(distance: float, travel_time: float) -> TravelMetric:
    return TravelMetric(distanceMiles=distance, travelTimeMinutes=travel_time)


def store(store_id: int) -> Store:
    return Store(
        id=store_id,
        name=f"Store {store_id}",
        address=f"{store_id} Main St, Redlands, CA 92373",
    )


def current_location() -> Point:
    return Point(
        {
            "x": -117.1825,
            "y": 34.0556,
            "spatialReference": {"wkid": 4326},
        }
    )


def test_store_matrix_preserves_direction_and_store_order() -> None:
    matrix = StoreTravelMatrix(
        storeIds=[30, 10, 20],
        matrix=[
            [metric(0, 0), metric(3.1, 8), metric(5.2, 13)],
            [metric(3.8, 10), metric(0, 0), metric(2.4, 7)],
            [metric(5.0, 12), metric(2.9, 9), metric(0, 0)],
        ],
    )

    assert matrix.store_ids == [30, 10, 20]
    assert matrix.matrix[0][1].distance_miles == 3.1
    assert matrix.matrix[1][0].distance_miles == 3.8
    assert matrix.model_dump(by_alias=True)["matrix"][0][1] == {
        "distanceMiles": 3.1,
        "travelTimeMinutes": 8.0,
    }


def test_current_location_matrix_uses_outbound_then_return_rows() -> None:
    location = validate_current_location(current_location())
    matrix = CurrentLocationTravelMatrix(
        storeIds=[10, 20],
        matrix=[
            [metric(1.7, 5), metric(4.2, 11)],
            [metric(2.1, 6), metric(4.8, 13)],
        ],
    )

    assert location.spatial_reference["wkid"] == 4326
    assert matrix.matrix[0][0].distance_miles == 1.7
    assert matrix.matrix[1][0].distance_miles == 2.1


def test_route_matrices_require_identical_store_order() -> None:
    store_matrix = StoreTravelMatrix(
        storeIds=[10, 20],
        matrix=[[metric(0, 0), metric(1, 2)], [metric(1, 2), metric(0, 0)]],
    )
    with pytest.raises(ValidationError, match="identical storeIds order"):
        RouteTravelMatrices(
            storeMatrix=store_matrix,
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=[20, 10],
                matrix=[[metric(2, 4), metric(3, 6)], [metric(2, 4), metric(3, 6)]],
            ),
        )


def test_null_cells_preserve_shape_and_require_diagnostics() -> None:
    matrix = StoreTravelMatrix(
        storeIds=[10, 20],
        matrix=[[metric(0, 0), None], [None, metric(0, 0)]],
        diagnostics=[
            TravelMatrixDiagnostic(
                row=0,
                column=1,
                code=TravelMatrixDiagnosticCode.ROUTE_UNREACHABLE,
                message="No drivable route was found.",
            ),
            TravelMatrixDiagnostic(
                row=1,
                column=0,
                code=TravelMatrixDiagnosticCode.GEOCODING_FAILED,
                message="The store address could not be matched.",
            ),
        ],
    )

    assert len(matrix.matrix) == 2
    assert all(len(row) == 2 for row in matrix.matrix)
    assert matrix.matrix[0][1] is None


@pytest.mark.parametrize(
    ("store_ids", "matrix_rows", "message"),
    [
        ([], [], "at least one store"),
        ([10, 10], [[metric(0, 0)] * 2] * 2, "must not contain duplicates"),
        ([10, 20], [[metric(0, 0)] * 2], "exactly 2 rows"),
        (
            [10, 20],
            [[metric(0, 0)], [metric(1, 2), metric(0, 0)]],
            "exactly 2 columns",
        ),
    ],
)
def test_store_matrix_rejects_invalid_labels_or_dimensions(
    store_ids: list[int],
    matrix_rows: list[list[TravelMetric]],
    message: str,
) -> None:
    with pytest.raises(ValidationError, match=message):
        StoreTravelMatrix(storeIds=store_ids, matrix=matrix_rows)


def test_current_location_matrix_requires_exactly_two_rows() -> None:
    with pytest.raises(ValidationError, match="exactly 2 rows"):
        CurrentLocationTravelMatrix(
            storeIds=[10],
            matrix=[[metric(1, 2)]],
        )


def test_store_matrix_requires_zero_diagonal_metrics() -> None:
    with pytest.raises(ValidationError, match="diagonal cells must contain zero metrics"):
        StoreTravelMatrix(
            storeIds=[10, 20],
            matrix=[
                [metric(0.1, 0), metric(1, 2)],
                [metric(1, 2), metric(0, 0)],
            ],
        )


@pytest.mark.parametrize("value", [-1, float("inf"), float("nan")])
def test_travel_metric_rejects_negative_or_nonfinite_values(value: float) -> None:
    with pytest.raises(ValidationError):
        TravelMetric(distanceMiles=value, travelTimeMinutes=1)

    with pytest.raises(ValidationError):
        TravelMetric(distanceMiles=1, travelTimeMinutes=value)


def test_matrix_rejects_null_cell_without_diagnostic() -> None:
    with pytest.raises(ValidationError, match="every null matrix cell"):
        CurrentLocationTravelMatrix(
            storeIds=[10],
            matrix=[[None], [metric(2, 5)]],
        )


@pytest.mark.parametrize(
    ("row", "column", "message"),
    [
        (2, 0, "coordinates must identify a matrix cell"),
        (0, 1, "coordinates must identify a matrix cell"),
        (1, 0, "must identify null matrix cells"),
    ],
)
def test_matrix_rejects_invalid_diagnostic_target(
    row: int, column: int, message: str
) -> None:
    with pytest.raises(ValidationError, match=message):
        CurrentLocationTravelMatrix(
            storeIds=[10],
            matrix=[[None], [metric(2, 5)]],
            diagnostics=[
                TravelMatrixDiagnostic(
                    row=row,
                    column=column,
                    code=TravelMatrixDiagnosticCode.ARCGIS_SERVICE_ERROR,
                    message="ArcGIS did not return a route.",
                )
            ],
        )


def test_current_location_requires_finite_coordinates_and_spatial_reference() -> None:
    with pytest.raises(ValueError, match="explicit spatial reference"):
        validate_current_location(Point({"x": -117.18, "y": 34.05}))

    with pytest.raises(ValueError, match="x must be finite"):
        validate_current_location(
            Point(
                {
                    "x": float("nan"),
                    "y": 34.05,
                    "spatialReference": {"wkid": 4326},
                }
            )
        )


def test_async_connector_protocol_can_be_implemented_without_network_access() -> None:
    class FakeArcGISConnector:
        async def get_store_travel_matrix(
            self, stores: list[Store]
        ) -> StoreTravelMatrix:
            store_ids = [item.id for item in stores]
            return StoreTravelMatrix(
                storeIds=store_ids,
                matrix=[
                    [metric(0, 0) if row == column else metric(1, 3) for column in range(2)]
                    for row in range(2)
                ],
            )

        async def get_location_travel_matrix(
            self, location: Point, stores: list[Store]
        ) -> CurrentLocationTravelMatrix:
            validate_current_location(location)
            return CurrentLocationTravelMatrix(
                storeIds=[item.id for item in stores],
                matrix=[[metric(2, 6), metric(3, 8)], [metric(2.2, 7), metric(3.4, 9)]],
            )

    connector = FakeArcGISConnector()
    stores = [store(10), store(20)]

    assert isinstance(connector, ArcGISConnector)
    store_matrix = asyncio.run(connector.get_store_travel_matrix(stores))
    location_matrix = asyncio.run(
        connector.get_location_travel_matrix(current_location(), stores)
    )
    assert store_matrix.store_ids == [10, 20]
    assert location_matrix.store_ids == [10, 20]


def test_async_matrix_provider_protocol_can_be_implemented_without_network_access() -> None:
    class FakeTravelMatrixProvider:
        async def get_route_travel_matrices(
            self, location: Point, stores: list[Store]
        ) -> RouteTravelMatrices:
            validate_current_location(location)
            store_ids = [item.id for item in stores]
            return RouteTravelMatrices(
                storeMatrix=StoreTravelMatrix(
                    storeIds=store_ids,
                    matrix=[[metric(0, 0), metric(1, 3)], [metric(2, 4), metric(0, 0)]],
                ),
                currentLocationMatrix=CurrentLocationTravelMatrix(
                    storeIds=store_ids,
                    matrix=[[metric(2, 6), metric(3, 8)], [metric(2.2, 7), metric(3.4, 9)]],
                ),
            )

    assert isinstance(FakeTravelMatrixProvider(), TravelMatrixProvider)