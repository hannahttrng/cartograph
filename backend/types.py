"""Validated API contracts for the cartograph backend."""

from decimal import Decimal, ROUND_HALF_UP
from enum import Enum
from math import isfinite
from typing import Annotated, Literal, Self, TypeVar

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
    products: list[PositiveInt] = Field(default_factory=list)

    @field_validator("tag")
    @classmethod
    def normalize_tag(cls, tag: str) -> str:
        return _normalize_text(tag, "tag")

    @field_validator("default_unit")
    @classmethod
    def normalize_default_unit(cls, default_unit: str) -> str:
        return _normalize_text(default_unit, "defaultUnit")

    @field_validator("products")
    @classmethod
    def normalize_products(cls, products: list[PositiveInt]) -> list[PositiveInt]:
        return sorted(_require_unique(products, "products"))


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
    modifiers: list[str]
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

    @field_validator("modifiers")
    @classmethod
    def normalize_modifiers(cls, modifiers: list[str]) -> list[str]:
        normalized = [_normalize_text(modifier, "modifier") for modifier in modifiers]
        return list(_require_unique(normalized, "modifiers"))

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


class ShoppingListItemInput(ApiModel):
    tag: str
    modifiers: list[str] = Field(default_factory=list)
    unit: str | None = None
    quantity: PositiveFiniteFloat | None = None

    @field_validator("tag")
    @classmethod
    def normalize_tag(cls, tag: str) -> str:
        return _normalize_text(tag, "tag")

    @field_validator("modifiers")
    @classmethod
    def normalize_modifiers(cls, modifiers: list[str]) -> list[str]:
        normalized = [
            _normalize_text(modifier, "modifier") for modifier in modifiers
        ]
        return sorted(_require_unique(normalized, "modifiers"))

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, unit: str | None) -> str | None:
        if unit is None:
            return None
        return _normalize_text(unit, "unit")


class ShoppingListItem(ShoppingListItemInput):
    unit: str
    quantity: PositiveFiniteFloat


class ShoppingListItemsInput(ApiModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    items: list[ShoppingListItemInput]

    @field_validator("items")
    @classmethod
    def require_unique_item_tags(
        cls, items: list[ShoppingListItemInput]
    ) -> list[ShoppingListItemInput]:
        _require_unique([item.tag for item in items], "item tags")
        return items


class ShoppingListItems(ApiModel):
    items: list[ShoppingListItem]

    @field_validator("items")
    @classmethod
    def require_unique_item_tags(
        cls, items: list[ShoppingListItem]
    ) -> list[ShoppingListItem]:
        _require_unique([item.tag for item in items], "item tags")
        return items


class RouteCreate(ShoppingListItems):
    @field_validator("items")
    @classmethod
    def require_items(cls, items: list[ShoppingListItem]) -> list[ShoppingListItem]:
        if not items:
            raise ValueError("items must contain at least one item")
        return items


class RouteItemSelection(ShoppingListItem):
    product: PositiveInt | None = None


class RouteOptimizationRequest(ApiModel):
    latitude: Latitude
    longitude: Longitude
    limit: RouteCandidateLimit = 10


class ShoppingListCreate(ShoppingListItemsInput):
    name: str | None = None
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str | None) -> str | None:
        if name is None:
            return None
        return _normalize_display_text(name, "name")


class ShoppingListReplace(ShoppingListItemsInput):
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


class ShoppingList(ShoppingListItems):
    id: PositiveInt
    name: str
    active: bool = True
    routes: list[PositiveInt] = Field(default_factory=list)
    status: ShoppingListStatus = ShoppingListStatus.PENDING

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")

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
    PARTIAL_ITEM_MATCH = "PARTIAL_ITEM_MATCH"


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
    selections: list[RouteItemSelection]
    error_code: RouteErrorCode | None = Field(default=None, alias="errorCode")

    @field_validator("stores", "products")
    @classmethod
    def require_unique_ids(cls, ids: list[PositiveInt], info: object) -> list[PositiveInt]:
        field_name = getattr(info, "field_name", "ids")
        return list(_require_unique(ids, field_name))

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

        if set(self.products) != set(matched_products):
            raise ValueError("matched selections must match products")

        has_unmatched_items = len(matched_selections) != len(self.selections)
        expected_error = (
            RouteErrorCode.PARTIAL_ITEM_MATCH if has_unmatched_items else None
        )
        if self.error_code != expected_error:
            raise ValueError("errorCode must indicate whether item matching is partial")

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


class RouteCandidate(RouteMetrics):
    score: NonNegativeFiniteFloat
    stores: list[PositiveInt]
    products: list[PositiveInt]
    selections: list[RouteItemSelection]
    product_price: NonNegativeFiniteFloat = Field(alias="productPrice")
    matched_item_count: PositiveInt = Field(alias="matchedItemCount")
    score_components: RouteScoreComponents = Field(alias="scoreComponents")
    error_code: RouteErrorCode | None = Field(default=None, alias="errorCode")

    @field_validator("stores", "products")
    @classmethod
    def require_unique_ids(cls, ids: list[PositiveInt], info: object) -> list[PositiveInt]:
        field_name = getattr(info, "field_name", "ids")
        return list(_require_unique(ids, field_name))

    @model_validator(mode="after")
    def validate_candidate_consistency(self) -> Self:
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

        if self.matched_item_count != len(matched_selections):
            raise ValueError("matchedItemCount must match selections")
        if set(self.products) != set(matched_products):
            raise ValueError("matched selections must match products")

        expected_error = (
            RouteErrorCode.PARTIAL_ITEM_MATCH
            if len(matched_selections) != len(self.selections)
            else None
        )
        if self.error_code != expected_error:
            raise ValueError("errorCode must indicate whether item matching is partial")
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
    HEURISTIC = "HEURISTIC"
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
        if (
            self.status == RouteOptimizationStatus.HEURISTIC
            and self.proven_prefix_count != 0
        ):
            raise ValueError("HEURISTIC responses cannot claim proven candidates")
        return self


class HealthResponse(ApiModel):
    status: str = "ok"


class RecipeSourceType(str, Enum):
    AUTO = "auto"
    TEXT = "text"
    URL = "url"


class AssistantRecipeImportRequest(ApiModel):
    source: str
    source_type: RecipeSourceType = Field(
        default=RecipeSourceType.AUTO,
        alias="sourceType",
    )

    @field_validator("source")
    @classmethod
    def validate_source(cls, source: str) -> str:
        normalized = source.strip()
        if not normalized:
            raise ValueError("source must not be blank")
        if len(normalized) > 20_000:
            raise ValueError("source must not exceed 20000 characters")
        return normalized


class AssistantChatMessage(ApiModel):
    role: Literal["user", "assistant"]
    content: str

    @field_validator("content")
    @classmethod
    def validate_content(cls, content: str) -> str:
        normalized = content.strip()
        if not normalized:
            raise ValueError("content must not be blank")
        if len(normalized) > 4_000:
            raise ValueError("content must not exceed 4000 characters")
        return normalized


class AssistantChatRequest(ApiModel):
    message: str
    messages: list[AssistantChatMessage] = Field(default_factory=list, max_length=12)

    @field_validator("message")
    @classmethod
    def validate_message(cls, message: str) -> str:
        normalized = message.strip()
        if not normalized:
            raise ValueError("message must not be blank")
        if len(normalized) > 4_000:
            raise ValueError("message must not exceed 4000 characters")
        return normalized


class AssistantChatResponse(ApiModel):
    message: str

    @field_validator("message")
    @classmethod
    def validate_message(cls, message: str) -> str:
        return _normalize_display_text(message, "message")


class AssistantRecipeIngredient(ApiModel):
    name: str
    quantity: str | None = None
    unit: str | None = None
    note: str | None = None
    tags: list[str]

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "ingredient name")

    @field_validator("quantity", "unit", "note")
    @classmethod
    def normalize_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_display_text(value, "ingredient detail")

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: list[str]) -> list[str]:
        normalized = [_normalize_text(tag, "tag") for tag in tags]
        return list(_require_unique(normalized, "ingredient tags"))


class AssistantRecipeImportResponse(ApiModel):
    title: str | None = None
    ingredients: list[AssistantRecipeIngredient] = Field(min_length=1)
    tags: list[str]
    warnings: list[str] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def validate_title(cls, title: str | None) -> str | None:
        if title is None:
            return None
        return _normalize_display_text(title, "title")

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, tags: list[str]) -> list[str]:
        normalized = [_normalize_text(tag, "tag") for tag in tags]
        return list(_require_unique(normalized, "tags"))

    @field_validator("warnings")
    @classmethod
    def normalize_warnings(cls, warnings: list[str]) -> list[str]:
        return [_normalize_display_text(warning, "warning") for warning in warnings]


class ApiError(ApiModel):
    detail: str
    error_code: str | None = Field(default=None, alias="errorCode")