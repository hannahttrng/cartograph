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
    latitude: Latitude | None = None
    longitude: Longitude | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")

    @field_validator("address")
    @classmethod
    def validate_address(cls, address: str) -> str:
        return _normalize_display_text(address, "address")

    @model_validator(mode="after")
    def validate_coordinates(self) -> Self:
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class Store(StoreCreate):
    id: PositiveInt
    products: list[PositiveInt] = Field(default_factory=list)

    @field_validator("products")
    @classmethod
    def require_unique_products(cls, products: list[PositiveInt]) -> list[PositiveInt]:
        return list(_require_unique(products, "products"))


class _ShoppingListItemBase(ApiModel):
    tag: str
    modifiers: list[str] = Field(default_factory=list)

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


class ShoppingListItemInput(_ShoppingListItemBase):
    unit: str | None = None
    quantity: PositiveFiniteFloat | None = None

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, unit: str | None) -> str | None:
        if unit is None:
            return None
        return _normalize_text(unit, "unit")


class ShoppingListItem(_ShoppingListItemBase):
    unit: str
    quantity: PositiveFiniteFloat

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, unit: str) -> str:
        return _normalize_text(unit, "unit")


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


class ShoppingListActiveUpdate(ApiModel):
    active: bool


class ShoppingList(ShoppingListItems):
    id: PositiveInt
    name: str
    active: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, name: str) -> str:
        return _normalize_display_text(name, "name")


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
    modifier_penalty: NonNegativeFiniteFloat = Field(
        default=0, alias="modifierPenalty"
    )

    def total(self) -> Decimal:
        return sum(
            (
                _quantize_score(component)
                for component in (
                    self.product_price,
                    self.distance_cost,
                    self.time_cost,
                    self.store_cost,
                    self.modifier_penalty,
                )
            ),
            start=Decimal(0),
        ).quantize(_SCORE_QUANTUM, rounding=ROUND_HALF_UP)


class RouteStoreSummary(StoreCreate):
    id: PositiveInt


class RouteProductSummary(ApiModel):
    id: PositiveInt
    name: str
    store: PositiveInt
    unit: str
    modifiers: list[str] = Field(default_factory=list)
    selection_price: NonNegativeFiniteFloat = Field(alias="selectionPrice")

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
        normalized = [
            _normalize_text(modifier, "modifier") for modifier in modifiers
        ]
        return sorted(_require_unique(normalized, "modifiers"))


class RouteCandidateResult(RouteMetrics):
    id: PositiveInt
    stores: list[RouteStoreSummary]
    products: list[RouteProductSummary]
    selections: list[RouteItemSelection]
    product_price: NonNegativeFiniteFloat = Field(alias="productPrice")
    matched_item_count: PositiveInt = Field(alias="matchedItemCount")
    score_components: RouteScoreComponents = Field(alias="scoreComponents")
    error_code: RouteErrorCode | None = Field(default=None, alias="errorCode")

    @model_validator(mode="after")
    def validate_result_consistency(self) -> Self:
        store_ids = [store.id for store in self.stores]
        _require_unique(store_ids, "stores")
        product_ids = [product.id for product in self.products]
        _require_unique(product_ids, "products")
        _require_unique([selection.tag for selection in self.selections], "selection tags")

        matched_product_ids = [
            selection.product
            for selection in self.selections
            if selection.product is not None
        ]
        _require_unique(matched_product_ids, "selected products")
        if set(product_ids) != set(matched_product_ids):
            raise ValueError("matched selections must match products")
        if any(product.store not in store_ids for product in self.products):
            raise ValueError("every product must reference a route store")
        if self.matched_item_count != len(matched_product_ids):
            raise ValueError("matchedItemCount must match selections")

        expected_error = (
            RouteErrorCode.PARTIAL_ITEM_MATCH
            if len(matched_product_ids) != len(self.selections)
            else None
        )
        if self.error_code != expected_error:
            raise ValueError("errorCode must indicate whether item matching is partial")
        if _quantize_score(self.product_price) != _quantize_score(
            sum(product.selection_price for product in self.products)
        ):
            raise ValueError("productPrice must equal product selection prices")
        if _quantize_score(self.product_price) != _quantize_score(
            self.score_components.product_price
        ):
            raise ValueError("productPrice must match scoreComponents.productPrice")
        if _quantize_score(self.score) != self.score_components.total():
            raise ValueError("score must equal the sum of scoreComponents")
        return self


class RouteCandidatesResponse(ApiModel):
    generation: NonNegativeInteger
    candidates: Annotated[list[RouteCandidateResult], Field(max_length=20)]

    @field_validator("candidates")
    @classmethod
    def require_unique_candidate_ids(
        cls, candidates: list[RouteCandidateResult]
    ) -> list[RouteCandidateResult]:
        _require_unique([candidate.id for candidate in candidates], "candidate IDs")
        return candidates


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
    UNIT_CONVERSION_FAILED = "UNIT_CONVERSION_FAILED"
    OPTIMIZATION_FAILED = "OPTIMIZATION_FAILED"


class RouteCalculationStatus(str, Enum):
    IDLE = "IDLE"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class RouteCalculationResponse(ApiModel):
    generation: NonNegativeInteger = 0
    status: RouteCalculationStatus = RouteCalculationStatus.IDLE
    active_list_count: NonNegativeInteger = Field(0, alias="activeListCount")
    item_count: NonNegativeInteger = Field(0, alias="itemCount")
    result_count: NonNegativeInteger = Field(0, alias="resultCount")
    optimizer_status: RouteOptimizationStatus | None = Field(
        default=None, alias="optimizerStatus"
    )
    started_at: NonNegativeFiniteFloat | None = Field(default=None, alias="startedAt")
    completed_at: NonNegativeFiniteFloat | None = Field(
        default=None, alias="completedAt"
    )
    elapsed_seconds: NonNegativeFiniteFloat | None = Field(
        default=None, alias="elapsedSeconds"
    )
    timeout_seconds: PositiveFiniteFloat | None = Field(
        default=None, alias="timeoutSeconds"
    )
    error_code: RouteOptimizationErrorCode | None = Field(
        default=None, alias="errorCode"
    )
    detail: str | None = None

    @model_validator(mode="after")
    def validate_state(self) -> Self:
        if self.status == RouteCalculationStatus.IDLE:
            if self.generation != 0 or any((self.started_at, self.completed_at)):
                raise ValueError("IDLE calculations must be generation zero")
        elif self.generation == 0 or self.started_at is None:
            raise ValueError("non-IDLE calculations require a generation and startedAt")

        if self.status == RouteCalculationStatus.RUNNING:
            if self.completed_at is not None:
                raise ValueError("RUNNING calculations cannot have completedAt")
        elif self.status in (
            RouteCalculationStatus.SUCCEEDED,
            RouteCalculationStatus.FAILED,
        ) and self.completed_at is None:
            raise ValueError("terminal calculations require completedAt")

        if self.status == RouteCalculationStatus.FAILED:
            if self.error_code is None or not self.detail:
                raise ValueError("FAILED calculations require errorCode and detail")
        elif self.error_code is not None or self.detail is not None:
            raise ValueError("only FAILED calculations may contain an error")
        return self


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