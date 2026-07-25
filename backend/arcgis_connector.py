"""Contracts for ArcGIS geocoding and directional travel matrices."""

from enum import Enum
from math import isfinite
from numbers import Real
from typing import Protocol, Sequence, Self, runtime_checkable

from arcgis.geometry import Point
from pydantic import Field, NonNegativeInt, PositiveInt, field_validator, model_validator

from backend.types import ApiModel, NonNegativeFiniteFloat, Store


class TravelMetric(ApiModel):
    distance_miles: NonNegativeFiniteFloat = Field(alias="distanceMiles")
    travel_time_minutes: NonNegativeFiniteFloat = Field(alias="travelTimeMinutes")


class TravelMatrixDiagnosticCode(str, Enum):
    GEOCODING_FAILED = "GEOCODING_FAILED"
    ROUTE_UNREACHABLE = "ROUTE_UNREACHABLE"
    ARCGIS_SERVICE_ERROR = "ARCGIS_SERVICE_ERROR"


class TravelMatrixDiagnostic(ApiModel):
    row: NonNegativeInt
    column: NonNegativeInt
    code: TravelMatrixDiagnosticCode
    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, message: str) -> str:
        normalized = message.strip()
        if not normalized:
            raise ValueError("message must not be blank")
        return normalized


class TravelMatrix(ApiModel):
    store_ids: list[PositiveInt] = Field(alias="storeIds")
    matrix: list[list[TravelMetric | None]]
    diagnostics: list[TravelMatrixDiagnostic] = Field(default_factory=list)

    @field_validator("store_ids")
    @classmethod
    def validate_store_ids(cls, store_ids: list[PositiveInt]) -> list[PositiveInt]:
        if not store_ids:
            raise ValueError("storeIds must contain at least one store")
        if len(store_ids) != len(set(store_ids)):
            raise ValueError("storeIds must not contain duplicates")
        return store_ids

    def _validate_dimensions(self, expected_rows: int) -> None:
        if len(self.matrix) != expected_rows:
            raise ValueError(f"matrix must contain exactly {expected_rows} rows")

        expected_columns = len(self.store_ids)
        if any(len(row) != expected_columns for row in self.matrix):
            raise ValueError(
                f"each matrix row must contain exactly {expected_columns} columns"
            )

    def _validate_diagnostics(self) -> None:
        diagnostic_cells: set[tuple[int, int]] = set()
        for diagnostic in self.diagnostics:
            if diagnostic.row >= len(self.matrix) or diagnostic.column >= len(
                self.store_ids
            ):
                raise ValueError("diagnostic coordinates must identify a matrix cell")
            if self.matrix[diagnostic.row][diagnostic.column] is not None:
                raise ValueError("diagnostics must identify null matrix cells")
            diagnostic_cells.add((diagnostic.row, diagnostic.column))

        null_cells = {
            (row_index, column_index)
            for row_index, row in enumerate(self.matrix)
            for column_index, metric in enumerate(row)
            if metric is None
        }
        if not null_cells.issubset(diagnostic_cells):
            raise ValueError("every null matrix cell must have a diagnostic")


class StoreTravelMatrix(TravelMatrix):
    """An N x N matrix whose rows are origins and columns are destinations."""

    @model_validator(mode="after")
    def validate_matrix(self) -> Self:
        self._validate_dimensions(len(self.store_ids))
        self._validate_diagnostics()

        for index in range(len(self.store_ids)):
            diagonal = self.matrix[index][index]
            if diagonal is None or any(
                (diagonal.distance_miles, diagonal.travel_time_minutes)
            ):
                raise ValueError("store matrix diagonal cells must contain zero metrics")
        return self


class CurrentLocationTravelMatrix(TravelMatrix):
    """A 2 x N matrix containing outbound and return travel metrics."""

    @model_validator(mode="after")
    def validate_matrix(self) -> Self:
        self._validate_dimensions(2)
        self._validate_diagnostics()
        return self


class RouteTravelMatrices(ApiModel):
    store_matrix: StoreTravelMatrix = Field(alias="storeMatrix")
    current_location_matrix: CurrentLocationTravelMatrix = Field(
        alias="currentLocationMatrix"
    )

    @model_validator(mode="after")
    def validate_store_order(self) -> Self:
        if self.store_matrix.store_ids != self.current_location_matrix.store_ids:
            raise ValueError("route matrices must use identical storeIds order")
        return self


def validate_current_location(current_location: Point) -> Point:
    """Validate the minimum coordinate metadata required by the connector."""
    if not isinstance(current_location, Point):
        raise TypeError("current_location must be an arcgis.geometry.Point")

    for coordinate_name in ("x", "y"):
        coordinate = current_location.get(coordinate_name)
        if (
            isinstance(coordinate, bool)
            or not isinstance(coordinate, Real)
            or not isfinite(float(coordinate))
        ):
            raise ValueError(f"current_location {coordinate_name} must be finite")

    spatial_reference = current_location.get("spatialReference")
    if not isinstance(spatial_reference, dict) or not any(
        spatial_reference.get(key) for key in ("wkid", "latestWkid", "wkt")
    ):
        raise ValueError("current_location must have an explicit spatial reference")
    return current_location


@runtime_checkable
class ArcGISConnector(Protocol):
    """Resolve address-based directional travel metrics through ArcGIS."""

    async def get_store_travel_matrix(
        self, stores: Sequence[Store]
    ) -> StoreTravelMatrix:
        """Return all directional store pairs in the supplied store order."""
        ...

    async def get_location_travel_matrix(
        self, current_location: Point, stores: Sequence[Store]
    ) -> CurrentLocationTravelMatrix:
        """Return current-to-store row 0 and store-to-current row 1."""
        ...


@runtime_checkable
class TravelMatrixProvider(Protocol):
    """Load cached matrices or regenerate them through the ArcGIS boundary."""

    async def get_route_travel_matrices(
        self, current_location: Point, stores: Sequence[Store]
    ) -> RouteTravelMatrices:
        ...