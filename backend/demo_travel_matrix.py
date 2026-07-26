"""Deterministic offline travel matrices for the Redlands demo catalog."""

from math import asin, cos, radians, sin, sqrt
from typing import Sequence

from arcgis.geometry import Point

from backend.arcgis_connector import (
    CurrentLocationTravelMatrix,
    RouteTravelMatrices,
    StoreTravelMatrix,
    TravelMatrixDiagnostic,
    TravelMatrixDiagnosticCode,
    TravelMetric,
    validate_current_location,
)
from backend.types import Store


DEMO_STORE_COORDINATES: dict[str, tuple[float, float]] = {
    "560 W Stuart Ave, Redlands, CA 92374": (34.0622, -117.1906),
    "552 Orange St, Redlands, CA 92374": (34.0613, -117.1826),
    "11 E Colton Ave, Redlands, CA 92374": (34.0642, -117.1819),
    "800 E Lugonia Ave, Redlands, CA 92374": (34.0648, -117.1758),
    "27320 W Lugonia Ave, Redlands, CA 92374": (34.0704, -117.2058),
    "450 E Cypress Ave, Redlands, CA 92373": (34.0570, -117.1845),
    "705 W Cypress Ave, Redlands, CA 92373": (34.0560, -117.1925),
    "1536 Barton Rd, Redlands, CA 92373": (34.0485, -117.1805),
    "2070 W Redlands Blvd, Redlands, CA 92373": (34.0542, -117.2018),
    "1775 E Lugonia Ave, Redlands, CA 92374": (34.0680, -117.1618),
    "28000 Greenspot Rd, Highland, CA 92346": (34.1084, -117.2235),
    "27945 Greenspot Rd, Highland, CA 92346": (34.1078, -117.2227),
}

_EARTH_RADIUS_MILES = 3958.7613
_DEMO_SPEED_MPH = 30.0


def _metric(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> TravelMetric:
    latitude_delta = radians(destination_latitude - origin_latitude)
    longitude_delta = radians(destination_longitude - origin_longitude)
    origin_latitude_radians = radians(origin_latitude)
    destination_latitude_radians = radians(destination_latitude)
    haversine = (
        sin(latitude_delta / 2) ** 2
        + cos(origin_latitude_radians)
        * cos(destination_latitude_radians)
        * sin(longitude_delta / 2) ** 2
    )
    distance = _EARTH_RADIUS_MILES * 2 * asin(sqrt(haversine))
    return TravelMetric(
        distanceMiles=distance,
        travelTimeMinutes=distance / _DEMO_SPEED_MPH * 60,
    )


def _missing_coordinate_diagnostic(
    row: int,
    column: int,
    store: Store,
) -> TravelMatrixDiagnostic:
    return TravelMatrixDiagnostic(
        row=row,
        column=column,
        code=TravelMatrixDiagnosticCode.GEOCODING_FAILED,
        message=f"Store {store.id} has no demo coordinates.",
    )


class DemoTravelMatrixProvider:
    """Approximate travel with straight-line distance at a fixed urban speed."""

    async def get_route_travel_matrices(
        self,
        current_location: Point,
        stores: Sequence[Store],
    ) -> RouteTravelMatrices:
        location = validate_current_location(current_location)
        ordered_stores = tuple(stores)
        if not ordered_stores:
            raise ValueError("stores must contain at least one store")

        store_ids = [store.id for store in ordered_stores]
        store_rows: list[list[TravelMetric | None]] = []
        store_diagnostics: list[TravelMatrixDiagnostic] = []
        for row_index, origin in enumerate(ordered_stores):
            row: list[TravelMetric | None] = []
            for column_index, destination in enumerate(ordered_stores):
                if row_index == column_index:
                    row.append(TravelMetric(distanceMiles=0, travelTimeMinutes=0))
                elif (
                    origin.latitude is None
                    or origin.longitude is None
                    or destination.latitude is None
                    or destination.longitude is None
                ):
                    row.append(None)
                    missing_store = (
                        origin
                        if origin.latitude is None or origin.longitude is None
                        else destination
                    )
                    store_diagnostics.append(
                        _missing_coordinate_diagnostic(
                            row_index,
                            column_index,
                            missing_store,
                        )
                    )
                else:
                    row.append(
                        _metric(
                            origin.latitude,
                            origin.longitude,
                            destination.latitude,
                            destination.longitude,
                        )
                    )
            store_rows.append(row)

        longitude = float(location["x"])
        latitude = float(location["y"])
        outbound: list[TravelMetric | None] = []
        returning: list[TravelMetric | None] = []
        location_diagnostics: list[TravelMatrixDiagnostic] = []
        for column_index, store in enumerate(ordered_stores):
            if store.latitude is None or store.longitude is None:
                outbound.append(None)
                returning.append(None)
                location_diagnostics.extend(
                    _missing_coordinate_diagnostic(row, column_index, store)
                    for row in (0, 1)
                )
            else:
                metric = _metric(
                    latitude,
                    longitude,
                    store.latitude,
                    store.longitude,
                )
                outbound.append(metric)
                returning.append(metric.model_copy(deep=True))

        return RouteTravelMatrices(
            storeMatrix=StoreTravelMatrix(
                storeIds=store_ids,
                matrix=store_rows,
                diagnostics=store_diagnostics,
            ),
            currentLocationMatrix=CurrentLocationTravelMatrix(
                storeIds=store_ids,
                matrix=[outbound, returning],
                diagnostics=location_diagnostics,
            ),
        )
