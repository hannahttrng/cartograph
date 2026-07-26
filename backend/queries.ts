export type EntityId = number;

export interface Tag {
  tag: string;
  defaultUnit: string;
  defaultQuantity: number;
  products: EntityId[];
}

export interface Price {
  date: number;
  price: number;
  quantity: number;
  sale: boolean;
  unitPrice: number;
}

export interface Product {
  id: EntityId;
  name: string;
  modifiers: string[];
  store: EntityId;
  currentPrice: Price | null;
  priceHistory: Price[];
  unit: string;
}

export interface StoreCreate {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Store extends StoreCreate {
  id: EntityId;
  products: EntityId[];
}

export interface ShoppingListItemInput {
  tag: string;
  modifiers?: string[];
  unit?: string | null;
  quantity?: number | null;
}

export interface ShoppingListItem {
  tag: string;
  modifiers: string[];
  unit: string;
  quantity: number;
}

export interface ShoppingListCreate {
  name?: string | null;
  items: ShoppingListItemInput[];
  active?: boolean;
}

export interface ShoppingListReplace {
  name: string;
  items: ShoppingListItemInput[];
  active?: boolean;
}

export interface ShoppingListNameUpdate {
  name: string;
}

export interface ShoppingListActiveUpdate {
  active: boolean;
}

export interface ShoppingList {
  id: EntityId;
  name: string;
  items: ShoppingListItem[];
  active: boolean;
}

export interface RouteCreate {
  items: ShoppingListItem[];
}

export interface RouteItemSelection extends ShoppingListItem {
  product: EntityId | null;
}

export type RouteErrorCode = "PARTIAL_ITEM_MATCH";

export interface RouteMetrics {
  distance: number;
  time: number;
  score: number;
}

export interface Route extends RouteMetrics {
  id: EntityId;
  stores: EntityId[];
  products: EntityId[];
  selections: RouteItemSelection[];
  errorCode?: RouteErrorCode | null;
}

export interface RouteScoreComponents {
  productPrice: number;
  distanceCost: number;
  timeCost: number;
  storeCost: number;
  modifierPenalty: number;
}

export interface RouteStoreSummary extends StoreCreate {
  id: EntityId;
}

export interface RouteProductSummary {
  id: EntityId;
  name: string;
  store: EntityId;
  unit: string;
  modifiers: string[];
  selectionPrice: number;
}

export interface RouteCandidateResult extends RouteMetrics {
  id: EntityId;
  stores: RouteStoreSummary[];
  products: RouteProductSummary[];
  selections: RouteItemSelection[];
  productPrice: number;
  matchedItemCount: number;
  scoreComponents: RouteScoreComponents;
  errorCode: RouteErrorCode | null;
}

export interface RouteCandidatesResponse {
  generation: number;
  candidates: RouteCandidateResult[];
}

// Product assignments stay flat within candidates. Final selection keeps one
// candidate per Store set and reserves generated cheapest/shortest witnesses.
export interface RouteCandidate extends RouteMetrics {
  stores: EntityId[];
  products: EntityId[];
  selections: RouteItemSelection[];
  productPrice: number;
  matchedItemCount: number;
  scoreComponents: RouteScoreComponents;
  errorCode?: RouteErrorCode | null;
}

export type RouteOptimizationStatus =
  | "OPTIMAL"
  | "HEURISTIC"
  | "FEASIBLE_TIMEOUT";

export type RouteOptimizationErrorCode =
  | "NO_ELIGIBLE_PRODUCTS"
  | "MATRIX_UNAVAILABLE"
  | "UNIT_CONVERSION_FAILED"
  | "OPTIMIZATION_FAILED";

export interface RouteOptimizationResponse {
  candidates: RouteCandidate[];
  status: RouteOptimizationStatus;
  requestedLimit: number;
  provenPrefixCount: number;
  elapsedSeconds: number;
  timeoutSeconds: number;
}

export type RouteCalculationStatus =
  | "IDLE"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED";

export interface RouteCalculationResponse {
  generation: number;
  status: RouteCalculationStatus;
  activeListCount: number;
  itemCount: number;
  resultCount: number;
  optimizerStatus: RouteOptimizationStatus | null;
  startedAt: number | null;
  completedAt: number | null;
  elapsedSeconds: number | null;
  timeoutSeconds: number | null;
  errorCode: RouteOptimizationErrorCode | null;
  detail: string | null;
}

export interface HealthResponse {
  status: "ok";
}

export interface ApiErrorResponse {
  detail: string;
  errorCode?: string | null;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ApiClient {
  getHealth(options?: RequestOptions): Promise<HealthResponse>;
  listTags(options?: RequestOptions): Promise<Tag[]>;
  listTagModifiers(
    tagId: string,
    options?: RequestOptions,
  ): Promise<string[]>;
  listShoppingLists(options?: RequestOptions): Promise<ShoppingList[]>;
  getShoppingList(
    shoppingListId: EntityId,
    options?: RequestOptions,
  ): Promise<ShoppingList>;
  createShoppingList(
    input: ShoppingListCreate,
    options?: RequestOptions,
  ): Promise<ShoppingList>;
  replaceShoppingList(
    shoppingListId: EntityId,
    input: ShoppingListReplace,
    options?: RequestOptions,
  ): Promise<ShoppingList>;
  updateShoppingListName(
    shoppingListId: EntityId,
    input: ShoppingListNameUpdate,
    options?: RequestOptions,
  ): Promise<ShoppingList>;
  updateShoppingListActive(
    shoppingListId: EntityId,
    input: ShoppingListActiveUpdate,
    options?: RequestOptions,
  ): Promise<ShoppingList>;
  getRouteCalculation(options?: RequestOptions): Promise<RouteCalculationResponse>;
  startRouteCalculation(options?: RequestOptions): Promise<RouteCalculationResponse>;
  getRouteCandidates(options?: RequestOptions): Promise<RouteCandidatesResponse>;
  deleteShoppingList(
    shoppingListId: EntityId,
    options?: RequestOptions,
  ): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class ApiClientError extends Error {
  readonly status: number;
  readonly errorCode?: string;

  constructor(message: string, status = 0, errorCode?: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiClientError("The API returned invalid JSON", response.status);
  }
}

function parseApiError(payload: unknown, status: number): ApiClientError {
  if (isObject(payload) && typeof payload.detail === "string") {
    const errorCode =
      typeof payload.errorCode === "string" ? payload.errorCode : undefined;
    return new ApiClientError(payload.detail, status, errorCode);
  }
  return new ApiClientError(`API request failed with status ${status}`, status);
}

function parseHealth(payload: unknown): HealthResponse {
  if (!isObject(payload) || payload.status !== "ok") {
    throw new ApiClientError("The API returned an invalid health response");
  }
  return { status: "ok" };
}

function parseEntityId(value: unknown, fieldName: string): EntityId {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return value as EntityId;
}

function parseFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return value;
}

function parseBoundedFiniteNumber(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
): number {
  const parsed = parseFiniteNumber(value, fieldName);
  if (parsed < minimum || parsed > maximum) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return parsed;
}

function isNormalizedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Boolean(value) &&
    value === value.trim() &&
    value === value.toLowerCase()
  );
}

function isDisplayText(value: unknown): value is string {
  return typeof value === "string" && Boolean(value) && value === value.trim();
}

function parseTagId(value: string): string {
  if (!isNormalizedText(value)) {
    throw new ApiClientError("tagId must be a normalized, nonblank string");
  }
  return value;
}

function parseStoreCreate(payload: unknown): StoreCreate {
  if (
    !isObject(payload) ||
    !isDisplayText(payload.name) ||
    !isDisplayText(payload.address)
  ) {
    throw new ApiClientError("The API returned an invalid Store response");
  }
  const latitude =
    payload.latitude === null
      ? null
      : parseBoundedFiniteNumber(payload.latitude, "Store latitude", -90, 90);
  const longitude =
    payload.longitude === null
      ? null
      : parseBoundedFiniteNumber(
          payload.longitude,
          "Store longitude",
          -180,
          180,
        );
  if ((latitude === null) !== (longitude === null)) {
    throw new ApiClientError("The API returned incomplete Store coordinates");
  }
  return {
    name: payload.name,
    address: payload.address,
    latitude,
    longitude,
  };
}

function parseShoppingListItems(value: unknown): ShoppingListItem[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError("The API returned invalid ShoppingList items");
  }
  const items = value.map((item) => {
    if (
      !isObject(item) ||
      !isNormalizedText(item.tag) ||
      !isNormalizedText(item.unit)
    ) {
      throw new ApiClientError("The API returned invalid ShoppingList items");
    }
    const quantity = parseNonNegativeFiniteNumber(
      item.quantity,
      "ShoppingList item quantity",
    );
    if (quantity <= 0) {
      throw new ApiClientError("The API returned invalid ShoppingList items");
    }
    return {
      tag: item.tag,
      modifiers: parseModifiers(item.modifiers),
      unit: item.unit,
      quantity,
    };
  });
  const tags = items.map((item) => item.tag);
  if (new Set(tags).size !== tags.length) {
    throw new ApiClientError("The API returned duplicate ShoppingList item tags");
  }
  return items;
}

function parseShoppingList(payload: unknown): ShoppingList {
  if (
    !isObject(payload) ||
    typeof payload.name !== "string" ||
    !payload.name.trim() ||
    payload.name !== payload.name.trim()
  ) {
    throw new ApiClientError("The API returned an invalid ShoppingList response");
  }
  if (typeof payload.active !== "boolean") {
    throw new ApiClientError("The API returned an invalid ShoppingList active flag");
  }
  return {
    id: parseEntityId(payload.id, "ShoppingList ID"),
    name: payload.name,
    items: parseShoppingListItems(payload.items),
    active: payload.active,
  };
}

function parseShoppingLists(payload: unknown): ShoppingList[] {
  if (!Array.isArray(payload)) {
    throw new ApiClientError("The API returned an invalid ShoppingList collection");
  }
  return payload.map(parseShoppingList);
}

function parseNonNegativeFiniteNumber(value: unknown, fieldName: string): number {
  const parsed = parseFiniteNumber(value, fieldName);
  if (parsed < 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: unknown, fieldName: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return value as number;
}

function parsePositiveInteger(value: unknown, fieldName: string): number {
  const parsed = parseNonNegativeInteger(value, fieldName);
  if (parsed === 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return parsed;
}

function parseUniqueEntityIds(value: unknown, fieldName: string): EntityId[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError(`The API returned invalid ${fieldName}`);
  }
  const ids = value.map((id) => parseEntityId(id, fieldName));
  if (new Set(ids).size !== ids.length) {
    throw new ApiClientError(`The API returned duplicate ${fieldName}`);
  }
  return ids;
}

function parseCatalogTag(payload: unknown): Tag {
  if (
    !isObject(payload) ||
    !isNormalizedText(payload.tag) ||
    !isNormalizedText(payload.defaultUnit)
  ) {
    throw new ApiClientError("The API returned an invalid Tag response");
  }
  const defaultQuantity = parseNonNegativeFiniteNumber(
    payload.defaultQuantity,
    "Tag defaultQuantity",
  );
  if (defaultQuantity <= 0) {
    throw new ApiClientError("The API returned an invalid Tag defaultQuantity");
  }
  const products = parseUniqueEntityIds(payload.products, "Tag Product IDs");
  if (
    products.some(
      (productId, index) => index > 0 && products[index - 1] > productId,
    )
  ) {
    throw new ApiClientError("The API returned unordered Tag Product IDs");
  }
  return {
    tag: payload.tag,
    defaultUnit: payload.defaultUnit,
    defaultQuantity,
    products,
  };
}

function parseCatalogTags(payload: unknown): Tag[] {
  if (!Array.isArray(payload)) {
    throw new ApiClientError("The API returned an invalid Tag collection");
  }
  const tags = payload.map(parseCatalogTag);
  const tagIds = tags.map((tag) => tag.tag);
  if (new Set(tagIds).size !== tagIds.length) {
    throw new ApiClientError("The API returned duplicate Tags");
  }
  if (tagIds.some((tagId, index) => index > 0 && tagIds[index - 1] > tagId)) {
    throw new ApiClientError("The API returned unordered Tags");
  }
  return tags;
}

function parseModifiers(payload: unknown): string[] {
  if (!Array.isArray(payload) || !payload.every(isNormalizedText)) {
    throw new ApiClientError("The API returned an invalid modifier collection");
  }
  const modifiers = [...payload];
  if (new Set(modifiers).size !== modifiers.length) {
    throw new ApiClientError("The API returned duplicate modifiers");
  }
  if (
    modifiers.some(
      (modifier, index) => index > 0 && modifiers[index - 1] > modifier,
    )
  ) {
    throw new ApiClientError("The API returned unordered modifiers");
  }
  return modifiers;
}

function parseRouteSelections(value: unknown): RouteItemSelection[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError("The API returned invalid route selections");
  }
  const selections = value.map((selection) => {
    if (
      !isObject(selection) ||
      !isNormalizedText(selection.tag) ||
      !isNormalizedText(selection.unit)
    ) {
      throw new ApiClientError("The API returned invalid route selections");
    }
    const quantity = parseNonNegativeFiniteNumber(
      selection.quantity,
      "route selection quantity",
    );
    if (quantity <= 0) {
      throw new ApiClientError("The API returned invalid route selections");
    }
    return {
      tag: selection.tag,
      modifiers: parseModifiers(selection.modifiers),
      unit: selection.unit,
      quantity,
      product:
        selection.product === null
          ? null
          : parseEntityId(selection.product, "selected Product ID"),
    };
  });
  const tags = selections.map((selection) => selection.tag);
  if (new Set(tags).size !== tags.length) {
    throw new ApiClientError("The API returned duplicate route selection tags");
  }
  return selections;
}

function parseRouteStoreSummary(payload: unknown): RouteStoreSummary {
  if (!isObject(payload)) {
    throw new ApiClientError("The API returned an invalid Route Store");
  }
  return {
    id: parseEntityId(payload.id, "Route Store ID"),
    ...parseStoreCreate(payload),
  };
}

function parseRouteProductSummary(payload: unknown): RouteProductSummary {
  if (
    !isObject(payload) ||
    !isDisplayText(payload.name) ||
    !isNormalizedText(payload.unit)
  ) {
    throw new ApiClientError("The API returned an invalid Route Product");
  }
  return {
    id: parseEntityId(payload.id, "Route Product ID"),
    name: payload.name,
    store: parseEntityId(payload.store, "Route Product Store ID"),
    unit: payload.unit,
    modifiers: parseModifiers(payload.modifiers),
    selectionPrice: parseNonNegativeFiniteNumber(
      payload.selectionPrice,
      "Route Product selectionPrice",
    ),
  };
}

function parseRouteErrorCode(value: unknown): RouteErrorCode | null {
  if (value === null || value === "PARTIAL_ITEM_MATCH") {
    return value;
  }
  throw new ApiClientError("The API returned an invalid Route errorCode");
}

function parseRouteScoreComponents(payload: unknown): RouteScoreComponents {
  if (!isObject(payload)) {
    throw new ApiClientError("The API returned invalid scoreComponents");
  }
  return {
    productPrice: parseNonNegativeFiniteNumber(
      payload.productPrice,
      "product price component",
    ),
    distanceCost: parseNonNegativeFiniteNumber(
      payload.distanceCost,
      "distance cost component",
    ),
    timeCost: parseNonNegativeFiniteNumber(
      payload.timeCost,
      "time cost component",
    ),
    storeCost: parseNonNegativeFiniteNumber(
      payload.storeCost,
      "store cost component",
    ),
    modifierPenalty: parseNonNegativeFiniteNumber(
      payload.modifierPenalty,
      "modifier penalty component",
    ),
  };
}

function quantizedScoreUnits(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 1_000_000);
}

function parseRouteCandidateResult(payload: unknown): RouteCandidateResult {
  if (
    !isObject(payload) ||
    !Array.isArray(payload.stores) ||
    !Array.isArray(payload.products)
  ) {
    throw new ApiClientError("The API returned an invalid Route candidate");
  }
  const stores = payload.stores.map(parseRouteStoreSummary);
  const storeIds = stores.map((store) => store.id);
  if (new Set(storeIds).size !== storeIds.length) {
    throw new ApiClientError("The API returned duplicate Route Stores");
  }
  const products = payload.products.map(parseRouteProductSummary);
  const productIds = products.map((product) => product.id);
  if (new Set(productIds).size !== productIds.length) {
    throw new ApiClientError("The API returned duplicate Route Products");
  }
  const selections = parseRouteSelections(payload.selections);
  const matchedProductIds = selections
    .filter((selection) => selection.product !== null)
    .map((selection) => selection.product);
  if (
    new Set(matchedProductIds).size !== matchedProductIds.length ||
    matchedProductIds.length !== productIds.length ||
    productIds.some((productId) => !matchedProductIds.includes(productId))
  ) {
    throw new ApiClientError("The API returned inconsistent Route selections");
  }
  if (products.some((product) => !storeIds.includes(product.store))) {
    throw new ApiClientError("The API returned a Product outside the Route Stores");
  }
  const matchedItemCount = parsePositiveInteger(
    payload.matchedItemCount,
    "matchedItemCount",
  );
  if (matchedItemCount !== matchedProductIds.length) {
    throw new ApiClientError("The API returned inconsistent matchedItemCount");
  }
  const expectedError: RouteErrorCode | null =
    matchedProductIds.length === selections.length
      ? null
      : "PARTIAL_ITEM_MATCH";
  const errorCode = parseRouteErrorCode(payload.errorCode);
  if (errorCode !== expectedError) {
    throw new ApiClientError("The API returned inconsistent Route errorCode");
  }
  const scoreComponents = parseRouteScoreComponents(payload.scoreComponents);
  const productPrice = parseNonNegativeFiniteNumber(
    payload.productPrice,
    "Route productPrice",
  );
  const selectionPriceTotal = products.reduce(
    (total, product) => total + product.selectionPrice,
    0,
  );
  const score = parseFiniteNumber(payload.score, "Route score");
  const componentTotal = Object.values(scoreComponents).reduce(
    (total, component) => total + quantizedScoreUnits(component),
    0,
  );
  if (
    quantizedScoreUnits(productPrice) !==
      quantizedScoreUnits(selectionPriceTotal) ||
    quantizedScoreUnits(productPrice) !==
      quantizedScoreUnits(scoreComponents.productPrice) ||
    quantizedScoreUnits(score) !== componentTotal
  ) {
    throw new ApiClientError("The API returned inconsistent Route score components");
  }
  return {
    id: parseEntityId(payload.id, "Route candidate ID"),
    stores,
    products,
    selections,
    distance: parseNonNegativeFiniteNumber(payload.distance, "Route distance"),
    time: parseNonNegativeFiniteNumber(payload.time, "Route time"),
    score,
    productPrice,
    matchedItemCount,
    scoreComponents,
    errorCode,
  };
}

function parseRouteCandidatesResponse(payload: unknown): RouteCandidatesResponse {
  if (!isObject(payload) || !Array.isArray(payload.candidates)) {
    throw new ApiClientError("The API returned an invalid Route candidates response");
  }
  const generation = parseNonNegativeInteger(
    payload.generation,
    "Route candidate generation",
  );
  const candidates = payload.candidates.map(parseRouteCandidateResult);
  if (candidates.length > 20) {
    throw new ApiClientError("The API returned an invalid candidate count");
  }
  const candidateIds = candidates.map((candidate) => candidate.id);
  if (new Set(candidateIds).size !== candidateIds.length) {
    throw new ApiClientError("The API returned duplicate Route candidate IDs");
  }
  return { generation, candidates };
}

function parseRouteOptimizationStatus(
  value: unknown,
): RouteOptimizationStatus | null {
  if (value === null) {
    return null;
  }
  if (
    value !== "OPTIMAL" &&
    value !== "HEURISTIC" &&
    value !== "FEASIBLE_TIMEOUT"
  ) {
    throw new ApiClientError("The API returned an invalid optimization status");
  }
  return value;
}

function parseRouteCalculationStatus(value: unknown): RouteCalculationStatus {
  if (
    value !== "IDLE" &&
    value !== "RUNNING" &&
    value !== "SUCCEEDED" &&
    value !== "FAILED"
  ) {
    throw new ApiClientError("The API returned an invalid calculation status");
  }
  return value;
}

function parseRouteOptimizationErrorCode(
  value: unknown,
): RouteOptimizationErrorCode | null {
  if (value === null) {
    return null;
  }
  if (
    value !== "NO_ELIGIBLE_PRODUCTS" &&
    value !== "MATRIX_UNAVAILABLE" &&
    value !== "UNIT_CONVERSION_FAILED" &&
    value !== "OPTIMIZATION_FAILED"
  ) {
    throw new ApiClientError("The API returned an invalid optimization errorCode");
  }
  return value;
}

function parseNullableNonNegativeFiniteNumber(
  value: unknown,
  fieldName: string,
): number | null {
  return value === null ? null : parseNonNegativeFiniteNumber(value, fieldName);
}

function parseNullablePositiveFiniteNumber(
  value: unknown,
  fieldName: string,
): number | null {
  if (value === null) {
    return null;
  }
  const parsed = parseNonNegativeFiniteNumber(value, fieldName);
  if (parsed === 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return parsed;
}

function parseRouteCalculationResponse(
  payload: unknown,
): RouteCalculationResponse {
  if (!isObject(payload)) {
    throw new ApiClientError("The API returned an invalid calculation response");
  }
  const generation = parseNonNegativeInteger(
    payload.generation,
    "calculation generation",
  );
  const status = parseRouteCalculationStatus(payload.status);
  const activeListCount = parseNonNegativeInteger(
    payload.activeListCount,
    "calculation activeListCount",
  );
  const itemCount = parseNonNegativeInteger(
    payload.itemCount,
    "calculation itemCount",
  );
  const resultCount = parseNonNegativeInteger(
    payload.resultCount,
    "calculation resultCount",
  );
  const optimizerStatus = parseRouteOptimizationStatus(payload.optimizerStatus);
  const startedAt = parseNullableNonNegativeFiniteNumber(
    payload.startedAt,
    "calculation startedAt",
  );
  const completedAt = parseNullableNonNegativeFiniteNumber(
    payload.completedAt,
    "calculation completedAt",
  );
  const elapsedSeconds = parseNullableNonNegativeFiniteNumber(
    payload.elapsedSeconds,
    "calculation elapsedSeconds",
  );
  const timeoutSeconds = parseNullablePositiveFiniteNumber(
    payload.timeoutSeconds,
    "calculation timeoutSeconds",
  );
  const errorCode = parseRouteOptimizationErrorCode(payload.errorCode);
  const detail =
    payload.detail === null
      ? null
      : typeof payload.detail === "string"
        ? payload.detail
        : undefined;
  if (detail === undefined) {
    throw new ApiClientError("The API returned an invalid calculation detail");
  }
  if (
    (status === "IDLE" &&
      (generation !== 0 || startedAt !== null || completedAt !== null)) ||
    (status !== "IDLE" && (generation === 0 || startedAt === null)) ||
    (status === "RUNNING" && completedAt !== null) ||
    ((status === "SUCCEEDED" || status === "FAILED") && completedAt === null)
  ) {
    throw new ApiClientError("The API returned inconsistent calculation metadata");
  }
  if (
    (status === "FAILED" && (errorCode === null || !detail)) ||
    (status !== "FAILED" && (errorCode !== null || detail !== null))
  ) {
    throw new ApiClientError("The API returned inconsistent calculation error data");
  }
  return {
    generation,
    status,
    activeListCount,
    itemCount,
    resultCount,
    optimizerStatus,
    startedAt,
    completedAt,
    elapsedSeconds,
    timeoutSeconds,
    errorCode,
    detail,
  };
}

interface ApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  options?: RequestOptions;
}

export function createApiClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): ApiClient {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, "");
  if (!normalizedBaseUrl) {
    throw new ApiClientError("baseUrl must not be blank");
  }

  async function request(
    path: string,
    requestConfig: ApiRequest = {},
  ): Promise<unknown> {
    const options = requestConfig.options ?? {};
    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new ApiClientError("timeoutMs must be a positive finite number");
    }

    const abortRequest = (): void => controller.abort();
    if (options.signal?.aborted) {
      controller.abort();
    } else {
      options.signal?.addEventListener("abort", abortRequest, { once: true });
    }

    const timeout = setTimeout(abortRequest, timeoutMs);
    try {
      const hasBody = requestConfig.body !== undefined;
      const response = await fetchImpl(`${normalizedBaseUrl}${path}`, {
        method: requestConfig.method ?? "GET",
        headers: {
          Accept: "application/json",
          ...(hasBody ? { "Content-Type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(requestConfig.body) : undefined,
        signal: controller.signal,
      });
      const payload = await readJson(response);
      if (!response.ok) {
        throw parseApiError(payload, response.status);
      }
      return payload;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abortRequest);
    }
  }

  return {
    async getHealth(options?: RequestOptions): Promise<HealthResponse> {
      return parseHealth(await request("/api/v1/health", { options }));
    },

    async listTags(options?: RequestOptions): Promise<Tag[]> {
      return parseCatalogTags(await request("/api/v1/tags", { options }));
    },

    async listTagModifiers(
      tagId: string,
      options?: RequestOptions,
    ): Promise<string[]> {
      const id = parseTagId(tagId);
      return parseModifiers(
        await request(`/api/v1/tags/${encodeURIComponent(id)}/modifiers`, {
          options,
        }),
      );
    },

    async listShoppingLists(options?: RequestOptions): Promise<ShoppingList[]> {
      return parseShoppingLists(
        await request("/api/v1/shopping-lists", { options }),
      );
    },

    async getShoppingList(
      shoppingListId: EntityId,
      options?: RequestOptions,
    ): Promise<ShoppingList> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      return parseShoppingList(
        await request(`/api/v1/shopping-lists/${id}`, { options }),
      );
    },

    async createShoppingList(
      input: ShoppingListCreate,
      options?: RequestOptions,
    ): Promise<ShoppingList> {
      return parseShoppingList(
        await request("/api/v1/shopping-lists", {
          method: "POST",
          body: input,
          options,
        }),
      );
    },

    async replaceShoppingList(
      shoppingListId: EntityId,
      input: ShoppingListReplace,
      options?: RequestOptions,
    ): Promise<ShoppingList> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      return parseShoppingList(
        await request(`/api/v1/shopping-lists/${id}`, {
          method: "PUT",
          body: input,
          options,
        }),
      );
    },

    async updateShoppingListName(
      shoppingListId: EntityId,
      input: ShoppingListNameUpdate,
      options?: RequestOptions,
    ): Promise<ShoppingList> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      return parseShoppingList(
        await request(`/api/v1/shopping-lists/${id}/name`, {
          method: "PATCH",
          body: input,
          options,
        }),
      );
    },

    async updateShoppingListActive(
      shoppingListId: EntityId,
      input: ShoppingListActiveUpdate,
      options?: RequestOptions,
    ): Promise<ShoppingList> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      return parseShoppingList(
        await request(`/api/v1/shopping-lists/${id}/active`, {
          method: "PATCH",
          body: input,
          options,
        }),
      );
    },

    async getRouteCalculation(
      options?: RequestOptions,
    ): Promise<RouteCalculationResponse> {
      return parseRouteCalculationResponse(
        await request("/api/v1/route-calculation", { options }),
      );
    },

    async startRouteCalculation(
      options?: RequestOptions,
    ): Promise<RouteCalculationResponse> {
      return parseRouteCalculationResponse(
        await request("/api/v1/route-calculation", {
          method: "POST",
          options,
        }),
      );
    },

    async getRouteCandidates(
      options?: RequestOptions,
    ): Promise<RouteCandidatesResponse> {
      return parseRouteCandidatesResponse(
        await request("/api/v1/route-candidates", { options }),
      );
    },

    async deleteShoppingList(
      shoppingListId: EntityId,
      options?: RequestOptions,
    ): Promise<void> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      await request(`/api/v1/shopping-lists/${id}`, {
        method: "DELETE",
        options,
      });
    },
  };
}