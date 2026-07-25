"""Validated API contracts for the cartograph backend."""

from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from math import isfinite
from typing import Annotated, Self, TypeVar

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PositiveInt,
    computed_field,
    field_validator,
    model_validator,
)


NonNegativeFiniteFloat = Annotated[float, Field(ge=0, allow_inf_nan=False)]
PositiveFiniteFloat = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]
Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
RouteCandidateLimit = Annotated[int, Field(ge=1, le=20)]
NonNegativeInteger = Annotated[int, Field(ge=0)]

_SCORE_QUANTUM = Decimal("0.000001")
_UniqueValue = TypeVar("_UniqueValue")


def _quantize_score(value: float) -> Decimal:
    return Decimal(str(value)).quantize(_SCORE_QUANTUM, rounding=ROUND_HALF_UP)


def _normalize_text(value: str, field_name: str) -> str:
    normalized = value.strip().lower()
    if not normalized:
        raise ValueError(f"{field_name} must not be blank")
    return normalized


def _normalize_display_text(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} must not be blank")
    return normalized


def _require_unique(values: list[_UniqueValue], field_name: str) -> list[_UniqueValue]:
    if len(values) != len(set(values)):
        raise ValueError(f"{field_name} must not contain duplicates")
    return values


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class Tag(ApiModel):
    tag: str
    default_unit: str = Field(alias="defaultUnit")
    default_quantity: PositiveFiniteFloat = Field(alias="defaultQuantity")

    @field_validator("tag")
    @classmethod
    def normalize_tag(cls, tag: str) -> str:
        return _normalize_text(tag, "tag")

    @field_validator("default_unit")
    @classmethod
    def normalize_default_unit(cls, default_unit: str) -> str:
        return _normalize_text(default_unit, "defaultUnit")


class Price(ApiModel):
    date: NonNegativeFiniteFloat
    price: NonNegativeFiniteFloat
    quantity: PositiveFiniteFloat
    sale: bool = False

    @computed_field(alias="unitPrice")
    @property
    def unit_price(self) -> float:
        return self.price / self.quantity


class ProductCreate(ApiModel):
    name: str
    tags: list[str]
    store: PositiveInt
    unit: str
    price_history: list[Price] = Field(default_factory=list, alias="priceHistory")

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, unit: str) -> str:
        return _normalize_text(unit, "unit")

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: list[str]) -> list[str]:
        normalized = [_normalize_text(tag, "tag") for tag in tags]
        return list(_require_unique(normalized, "tags"))

    @field_validator("price_history")
    @classmethod
    def order_price_history(cls, history: list[Price]) -> list[Price]:
        dates = [entry.date for entry in history]
        _require_unique(dates, "price history dates")
        return sorted(history, key=lambda entry: entry.date)


class Product(ProductCreate):
    id: PositiveInt
    current_price: Price | None = Field(default=None, alias="currentPrice")

    @model_validator(mode="after")
    def validate_current_price(self) -> Self:
        if self.current_price is None:
            return self

        if self.price_history and self.price_history[-1].date >= self.current_price.date:
            raise ValueError("currentPrice must be newer than every priceHistory entry")
        return self


class StoreCreate(ApiModel):
    name: str
    address: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")

    @field_validator("address")
    @classmethod
    def validate_address(cls, address: str) -> str:
        return _normalize_display_text(address, "address")


class Store(StoreCreate):
    id: PositiveInt
    products: list[PositiveInt] = Field(default_factory=list)

    @field_validator("products")
    @classmethod
    def require_unique_products(cls, products: list[PositiveInt]) -> list[PositiveInt]:
        return list(_require_unique(products, "products"))


class RouteCreate(ApiModel):
    tags: list[str]

    @field_validator("tags")
    @classmethod
    def normalize_requested_tags(cls, tags: list[str]) -> list[str]:
        normalized_tags: list[str] = []
        seen: set[str] = set()
        for tag in tags:
            normalized = _normalize_text(tag, "tag")
            if normalized not in seen:
                seen.add(normalized)
                normalized_tags.append(normalized)
        if not normalized_tags:
            raise ValueError("tags must contain at least one tag")
        return normalized_tags


class RouteTagSelection(ApiModel):
    tag: str
    product: PositiveInt | None = None

    @field_validator("tag")
    @classmethod
    def normalize_tag(cls, tag: str) -> str:
        return _normalize_text(tag, "tag")


class RouteOptimizationRequest(ApiModel):
    latitude: Latitude
    longitude: Longitude
    limit: RouteCandidateLimit = 10


class ShoppingListTags(ApiModel):
    tags: set[str]

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: set[str]) -> set[str]:
        return {_normalize_text(tag, "tag") for tag in tags}


class ShoppingListCreate(ShoppingListTags):
    name: str | None = None
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str | None) -> str | None:
        if name is None:
            return None
        return _normalize_display_text(name, "name")


class ShoppingListReplace(ShoppingListTags):
    name: str
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")


class ShoppingListNameUpdate(ApiModel):
    name: str

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")


class ShoppingListStatus(str, Enum):
    PENDING = "PENDING"
    COMPUTING = "COMPUTING"
    READY = "READY"
    FAILED = "FAILED"


class ShoppingList(ShoppingListReplace):
    id: PositiveInt
    routes: list[PositiveInt] = Field(default_factory=list)
    status: ShoppingListStatus = ShoppingListStatus.PENDING

    @field_validator("routes")
    @classmethod
    def require_unique_routes(cls, routes: list[PositiveInt]) -> list[PositiveInt]:
        return list(_require_unique(routes, "routes"))

    @model_validator(mode="after")
    def validate_routes_match_status(self) -> Self:
        if self.routes and self.status != ShoppingListStatus.READY:
            raise ValueError("routes may only be present when status is READY")
        return self


class RouteErrorCode(str, Enum):
    PARTIAL_TAG_MATCH = "PARTIAL_TAG_MATCH"


class RouteMetrics(ApiModel):
    distance: NonNegativeFiniteFloat
    time: NonNegativeFiniteFloat
    score: float

    @field_validator("score")
    @classmethod
    def require_finite_score(cls, score: float) -> float:
        if not isfinite(score):
            raise ValueError("score must be finite")
        return score


class Route(RouteMetrics):
    id: PositiveInt
    stores: list[PositiveInt]
    products: list[PositiveInt]
    product_tags: dict[PositiveInt, list[str]] = Field(alias="productTags")
    selections: list[RouteTagSelection]
    error_code: RouteErrorCode | None = Field(default=None, alias="errorCode")

    @field_validator("stores", "products")
    @classmethod
    def require_unique_ids(cls, ids: list[PositiveInt], info: object) -> list[PositiveInt]:
        field_name = getattr(info, "field_name", "ids")
        return list(_require_unique(ids, field_name))

    @field_validator("product_tags")
    @classmethod
    def normalize_product_tags(
        cls, product_tags: dict[PositiveInt, list[str]]
    ) -> dict[PositiveInt, list[str]]:
        normalized: dict[PositiveInt, list[str]] = {}
        for product_id, tags in product_tags.items():
            if len(tags) != 1:
                raise ValueError("each productTags entry must contain exactly one assigned tag")
            normalized[product_id] = [_normalize_text(tags[0], "assigned tag")]
        return normalized

    @model_validator(mode="after")
    def validate_route_consistency(self) -> Self:
        selection_tags = [selection.tag for selection in self.selections]
        _require_unique(selection_tags, "selection tags")

        matched_selections = [
            selection for selection in self.selections if selection.product is not None
        ]
        matched_products = [
            selection.product
            for selection in matched_selections
            if selection.product is not None
        ]
        _require_unique(matched_products, "selected products")

        if set(self.products) != set(self.product_tags):
            raise ValueError("productTags keys must match products")
        if set(self.products) != set(matched_products):
            raise ValueError("matched selections must match products")

        for selection in matched_selections:
            product_id = selection.product
            if product_id is not None and self.product_tags[product_id] != [selection.tag]:
                raise ValueError("productTags must match the assigned selection tag")

        has_unmatched_tags = len(matched_selections) != len(self.selections)
        expected_error = RouteErrorCode.PARTIAL_TAG_MATCH if has_unmatched_tags else None
        if self.error_code != expected_error:
            raise ValueError("errorCode must indicate whether tag matching is partial")

        if self.products and not self.stores:
            raise ValueError("a route with products must contain at least one store")
        if not self.products and self.stores:
            raise ValueError("a route without products cannot contain stores")
        if not self.products and any((self.distance, self.time, self.score)):
            raise ValueError("an empty partial route must have zero metrics")

        return self


class RouteScoreComponents(ApiModel):
    product_price: NonNegativeFiniteFloat = Field(alias="productPrice")
    distance_cost: NonNegativeFiniteFloat = Field(alias="distanceCost")
    time_cost: NonNegativeFiniteFloat = Field(alias="timeCost")
    store_cost: NonNegativeFiniteFloat = Field(alias="storeCost")

    def total(self) -> Decimal:
        return sum(
            (
                _quantize_score(component)
                for component in (
                    self.product_price,
                    self.distance_cost,
                    self.time_cost,
                    self.store_cost,
                )
            ),
            start=Decimal(0),
        ).quantize(_SCORE_QUANTUM, rounding=ROUND_HALF_UP)


# Product-assignment variants intentionally remain flat candidates. A nested
# representation must update this model, the optimizer/controller, queries.ts,
# optimizer/API tests, and client rendering together.
class RouteCandidate(RouteMetrics):
    score: NonNegativeFiniteFloat
    stores: list[PositiveInt]
    products: list[PositiveInt]
    product_tags: dict[PositiveInt, list[str]] = Field(alias="productTags")
    selections: list[RouteTagSelection]
    product_price: NonNegativeFiniteFloat = Field(alias="productPrice")
    matched_tag_count: PositiveInt = Field(alias="matchedTagCount")
    score_components: RouteScoreComponents = Field(alias="scoreComponents")
    error_code: RouteErrorCode | None = Field(default=None, alias="errorCode")

    @field_validator("stores", "products")
    @classmethod
    def require_unique_ids(cls, ids: list[PositiveInt], info: object) -> list[PositiveInt]:
        field_name = getattr(info, "field_name", "ids")
        return list(_require_unique(ids, field_name))

    @field_validator("product_tags")
    @classmethod
    def normalize_product_tags(
        cls, product_tags: dict[PositiveInt, list[str]]
    ) -> dict[PositiveInt, list[str]]:
        normalized: dict[PositiveInt, list[str]] = {}
        for product_id, tags in product_tags.items():
            if len(tags) != 1:
                raise ValueError("each productTags entry must contain exactly one assigned tag")
            normalized[product_id] = [_normalize_text(tags[0], "assigned tag")]
        return normalized

    @model_validator(mode="after")
    def validate_candidate_consistency(self) -> Self:
        selection_tags = [selection.tag for selection in self.selections]
        _require_unique(selection_tags, "selection tags")
        if selection_tags != sorted(selection_tags):
            raise ValueError("selections must be ordered by tag")

        matched_selections = [
            selection for selection in self.selections if selection.product is not None
        ]
        matched_products = [
            selection.product
            for selection in matched_selections
            if selection.product is not None
        ]
        _require_unique(matched_products, "selected products")

        if self.matched_tag_count != len(matched_selections):
            raise ValueError("matchedTagCount must match selections")
        if set(self.products) != set(self.product_tags):
            raise ValueError("productTags keys must match products")
        if set(self.products) != set(matched_products):
            raise ValueError("matched selections must match products")
        for selection in matched_selections:
            product_id = selection.product
            if product_id is not None and self.product_tags[product_id] != [selection.tag]:
                raise ValueError("productTags must match the assigned selection tag")

        expected_error = (
            RouteErrorCode.PARTIAL_TAG_MATCH
            if len(matched_selections) != len(self.selections)
            else None
        )
        if self.error_code != expected_error:
            raise ValueError("errorCode must indicate whether tag matching is partial")
        if not self.stores or not self.products:
            raise ValueError("a route candidate must contain stores and products")

        if _quantize_score(self.product_price) != _quantize_score(
            self.score_components.product_price
        ):
            raise ValueError("productPrice must match scoreComponents.productPrice")
        if _quantize_score(self.score) != self.score_components.total():
            raise ValueError("score must equal the sum of scoreComponents")
        return self


class RouteOptimizationStatus(str, Enum):
    OPTIMAL = "OPTIMAL"
    FEASIBLE_TIMEOUT = "FEASIBLE_TIMEOUT"


class RouteOptimizationErrorCode(str, Enum):
    NO_ELIGIBLE_PRODUCTS = "NO_ELIGIBLE_PRODUCTS"
    MATRIX_UNAVAILABLE = "MATRIX_UNAVAILABLE"
    OPTIMIZATION_FAILED = "OPTIMIZATION_FAILED"


class RouteOptimizationResponse(ApiModel):
    candidates: Annotated[list[RouteCandidate], Field(min_length=1, max_length=20)]
    status: RouteOptimizationStatus
    requested_limit: RouteCandidateLimit = Field(alias="requestedLimit")
    proven_prefix_count: NonNegativeInteger = Field(alias="provenPrefixCount")
    elapsed_seconds: NonNegativeFiniteFloat = Field(alias="elapsedSeconds")
    timeout_seconds: PositiveFiniteFloat = Field(alias="timeoutSeconds")

    @model_validator(mode="after")
    def validate_proof_metadata(self) -> Self:
        if len(self.candidates) > self.requested_limit:
            raise ValueError("candidates must not exceed requestedLimit")
        if self.proven_prefix_count > len(self.candidates):
            raise ValueError("provenPrefixCount must not exceed candidates")
        if (
            self.status == RouteOptimizationStatus.OPTIMAL
            and self.proven_prefix_count != len(self.candidates)
        ):
            raise ValueError("OPTIMAL responses must prove every candidate")
        return self


class HealthResponse(ApiModel):
    status: str = "ok"


class ApiError(ApiModel):
    detail: str
    error_code: str | None = Field(default=None, alias="errorCode")