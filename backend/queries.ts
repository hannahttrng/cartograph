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

export interface Store {
  id: EntityId;
  name: string;
  address: string;
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

export type ShoppingListStatus = "PENDING" | "COMPUTING" | "READY" | "FAILED";

export interface ShoppingList {
  id: EntityId;
  name: string;
  items: ShoppingListItem[];
  active: boolean;
  routes: EntityId[];
  status: ShoppingListStatus;
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

export interface RouteOptimizationRequest {
  latitude: number;
  longitude: number;
  limit?: number;
}

export interface RouteScoreComponents {
  productPrice: number;
  distanceCost: number;
  timeCost: number;
  storeCost: number;
}

// Product-assignment variants stay as separate candidates. A nested variants
// change must also update backend types/optimizer/controller, tests, and UI.
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

export interface RouteOptimizationResponse {
  candidates: RouteCandidate[];
  status: RouteOptimizationStatus;
  requestedLimit: number;
  provenPrefixCount: number;
  elapsedSeconds: number;
  timeoutSeconds: number;
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
  optimizeShoppingListRoutes(
    shoppingListId: EntityId,
    input: RouteOptimizationRequest,
    options?: RequestOptions,
  ): Promise<RouteOptimizationResponse>;
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

function isNormalizedText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Boolean(value) &&
    value === value.trim() &&
    value === value.toLowerCase()
  );
}

function parseTagId(value: string): string {
  if (!isNormalizedText(value)) {
    throw new ApiClientError("tagId must be a normalized, nonblank string");
  }
  return value;
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

function parseRouteIds(value: unknown): EntityId[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError("The API returned invalid ShoppingList routes");
  }
  const routes = value.map((routeId) => parseEntityId(routeId, "Route ID"));
  if (new Set(routes).size !== routes.length) {
    throw new ApiClientError("The API returned duplicate ShoppingList routes");
  }
  return routes;
}

function parseShoppingListStatus(value: unknown): ShoppingListStatus {
  if (
    value !== "PENDING" &&
    value !== "COMPUTING" &&
    value !== "READY" &&
    value !== "FAILED"
  ) {
    throw new ApiClientError("The API returned an invalid ShoppingList status");
  }
  return value;
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
  const routes = parseRouteIds(payload.routes);
  const status = parseShoppingListStatus(payload.status);
  if (typeof payload.active !== "boolean") {
    throw new ApiClientError("The API returned an invalid ShoppingList active flag");
  }
  if (routes.length > 0 && status !== "READY") {
    throw new ApiClientError("The API returned inconsistent ShoppingList routes");
  }
  return {
    id: parseEntityId(payload.id, "ShoppingList ID"),
    name: payload.name,
    items: parseShoppingListItems(payload.items),
    active: payload.active,
    routes,
    status,
  };
}

function parseShoppingLists(payload: unknown): ShoppingList[] {
  if (!Array.isArray(payload)) {
    throw new ApiClientError("The API returned an invalid ShoppingList collection");
  }
  return payload.map(parseShoppingList);
}

function parseNonNegativeFiniteNumber(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ApiClientError(`The API returned an invalid ${fieldName}`);
  }
  return value;
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

function parseRouteCandidate(payload: unknown): RouteCandidate {
  if (!isObject(payload)) {
    throw new ApiClientError("The API returned an invalid Route candidate");
  }
  const stores = parseUniqueEntityIds(payload.stores, "Route Store IDs");
  const products = parseUniqueEntityIds(payload.products, "Route Product IDs");
  const selections = parseRouteSelections(payload.selections);
  const matchedSelections = selections.filter(
    (selection) => selection.product !== null,
  );
  const matchedProducts = matchedSelections.map((selection) => selection.product);
  if (
    matchedProducts.length !== products.length ||
    new Set(matchedProducts).size !== matchedProducts.length ||
    products.some((productId) => !matchedProducts.includes(productId))
  ) {
    throw new ApiClientError("The API returned inconsistent Route selections");
  }
  const expectedError =
    matchedSelections.length === selections.length ? null : "PARTIAL_ITEM_MATCH";
  const errorCode: RouteErrorCode | null =
    payload.errorCode === "PARTIAL_ITEM_MATCH" ? "PARTIAL_ITEM_MATCH" : null;
  if ((payload.errorCode ?? null) !== errorCode || errorCode !== expectedError) {
    throw new ApiClientError("The API returned inconsistent Route errorCode");
  }
  const matchedItemCount =
    typeof payload.matchedItemCount === "number" ? payload.matchedItemCount : NaN;
  if (!Number.isSafeInteger(matchedItemCount) || matchedItemCount <= 0) {
    throw new ApiClientError("The API returned an invalid matchedItemCount");
  }
  if (matchedItemCount !== matchedSelections.length) {
    throw new ApiClientError("The API returned inconsistent matchedItemCount");
  }
  if (!isObject(payload.scoreComponents)) {
    throw new ApiClientError("The API returned invalid scoreComponents");
  }
  const scoreComponents: RouteScoreComponents = {
    productPrice: parseNonNegativeFiniteNumber(
      payload.scoreComponents.productPrice,
      "product price component",
    ),
    distanceCost: parseNonNegativeFiniteNumber(
      payload.scoreComponents.distanceCost,
      "distance cost component",
    ),
    timeCost: parseNonNegativeFiniteNumber(
      payload.scoreComponents.timeCost,
      "time cost component",
    ),
    storeCost: parseNonNegativeFiniteNumber(
      payload.scoreComponents.storeCost,
      "store cost component",
    ),
  };
  const productPrice = parseNonNegativeFiniteNumber(
    payload.productPrice,
    "Route productPrice",
  );
  const score = parseNonNegativeFiniteNumber(payload.score, "Route score");
  const componentTotal = Object.values(scoreComponents).reduce(
    (total, component) => total + component,
    0,
  );
  if (
    Math.abs(productPrice - scoreComponents.productPrice) > 0.000001 ||
    Math.abs(score - componentTotal) > 0.000001
  ) {
    throw new ApiClientError("The API returned inconsistent Route score components");
  }
  return {
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

function parseRouteOptimizationResponse(payload: unknown): RouteOptimizationResponse {
  if (!isObject(payload) || !Array.isArray(payload.candidates)) {
    throw new ApiClientError("The API returned an invalid optimization response");
  }
  if (
    payload.status !== "OPTIMAL" &&
    payload.status !== "HEURISTIC" &&
    payload.status !== "FEASIBLE_TIMEOUT"
  ) {
    throw new ApiClientError("The API returned an invalid optimization status");
  }
  const candidates = payload.candidates.map(parseRouteCandidate);
  if (candidates.length < 1 || candidates.length > 20) {
    throw new ApiClientError("The API returned an invalid candidate count");
  }
  const requestedLimit =
    typeof payload.requestedLimit === "number" ? payload.requestedLimit : NaN;
  if (
    !Number.isSafeInteger(requestedLimit) ||
    requestedLimit < 1 ||
    requestedLimit > 20 ||
    candidates.length > requestedLimit
  ) {
    throw new ApiClientError("The API returned an invalid requestedLimit");
  }
  const provenPrefixCount =
    typeof payload.provenPrefixCount === "number"
      ? payload.provenPrefixCount
      : NaN;
  if (
    !Number.isSafeInteger(provenPrefixCount) ||
    provenPrefixCount < 0 ||
    provenPrefixCount > candidates.length ||
    (payload.status === "OPTIMAL" && provenPrefixCount !== candidates.length) ||
    (payload.status === "HEURISTIC" && provenPrefixCount !== 0)
  ) {
    throw new ApiClientError("The API returned invalid proof metadata");
  }
  const timeoutSeconds = parseNonNegativeFiniteNumber(
    payload.timeoutSeconds,
    "optimization timeout",
  );
  if (timeoutSeconds <= 0) {
    throw new ApiClientError("The API returned an invalid optimization timeout");
  }
  return {
    candidates,
    status: payload.status,
    requestedLimit,
    provenPrefixCount,
    elapsedSeconds: parseNonNegativeFiniteNumber(
      payload.elapsedSeconds,
      "optimization elapsed time",
    ),
    timeoutSeconds,
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

    async optimizeShoppingListRoutes(
      shoppingListId: EntityId,
      input: RouteOptimizationRequest,
      options?: RequestOptions,
    ): Promise<RouteOptimizationResponse> {
      const id = parseEntityId(shoppingListId, "ShoppingList ID");
      return parseRouteOptimizationResponse(
        await request(`/api/v1/shopping-lists/${id}/route-candidates`, {
          method: "POST",
          body: input,
          options,
        }),
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