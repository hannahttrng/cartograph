export type EntityId = number;

export interface Tag {
  tag: string;
  defaultUnit: string;
  defaultQuantity: number;
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
  tags: string[];
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

export interface ShoppingListCreate {
  name?: string | null;
  tags: string[];
  active?: boolean;
}

export interface ShoppingListReplace {
  name: string;
  tags: string[];
  active?: boolean;
}

export interface ShoppingListNameUpdate {
  name: string;
}

export type ShoppingListStatus = "PENDING" | "COMPUTING" | "READY" | "FAILED";

export interface ShoppingList extends Omit<ShoppingListReplace, "active"> {
  id: EntityId;
  active: boolean;
  routes: EntityId[];
  status: ShoppingListStatus;
}

export interface RouteCreate {
  tags: string[];
}

export interface RouteTagSelection {
  tag: string;
  product: EntityId | null;
}

export type RouteErrorCode = "PARTIAL_TAG_MATCH";

export interface RouteMetrics {
  distance: number;
  time: number;
  score: number;
}

export interface Route extends RouteMetrics {
  id: EntityId;
  stores: EntityId[];
  products: EntityId[];
  productTags: Record<string, string[]>;
  selections: RouteTagSelection[];
  errorCode?: RouteErrorCode | null;
}

export interface RouteModel extends Omit<Route, "productTags"> {
  productTags: Map<EntityId, string[]>;
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
  productTags: Record<string, string[]>;
  selections: RouteTagSelection[];
  productPrice: number;
  matchedTagCount: number;
  scoreComponents: RouteScoreComponents;
  errorCode?: RouteErrorCode | null;
}

export type RouteOptimizationStatus = "OPTIMAL" | "FEASIBLE_TIMEOUT";

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

export function productTagsFromWire(
  productTags: Record<string, string[]>,
): Map<EntityId, string[]> {
  const result = new Map<EntityId, string[]>();
  for (const [rawProductId, tags] of Object.entries(productTags)) {
    const productId = Number(rawProductId);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new ApiClientError(`Invalid product ID in productTags: ${rawProductId}`);
    }
    result.set(productId, [...tags]);
  }
  return result;
}

export function productTagsToWire(
  productTags: ReadonlyMap<EntityId, readonly string[]>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [productId, tags] of productTags) {
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      throw new ApiClientError(`Invalid product ID in productTags: ${productId}`);
    }
    result[String(productId)] = [...tags];
  }
  return result;
}

export function toRouteModel(route: Route): RouteModel {
  return {
    ...route,
    stores: [...route.stores],
    products: [...route.products],
    selections: route.selections.map((selection) => ({ ...selection })),
    productTags: productTagsFromWire(route.productTags),
  };
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

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError("The API returned invalid ShoppingList tags");
  }
  const tags = value.map((tag) => {
    if (
      typeof tag !== "string" ||
      !tag ||
      tag !== tag.trim() ||
      tag !== tag.toLowerCase()
    ) {
      throw new ApiClientError("The API returned invalid ShoppingList tags");
    }
    return tag;
  });
  if (new Set(tags).size !== tags.length) {
    throw new ApiClientError("The API returned duplicate ShoppingList tags");
  }
  return tags;
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
    tags: parseTags(payload.tags),
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

function parseRouteSelections(value: unknown): RouteTagSelection[] {
  if (!Array.isArray(value)) {
    throw new ApiClientError("The API returned invalid route selections");
  }
  const selections = value.map((selection) => {
    if (
      !isObject(selection) ||
      typeof selection.tag !== "string" ||
      !selection.tag ||
      selection.tag !== selection.tag.trim() ||
      selection.tag !== selection.tag.toLowerCase()
    ) {
      throw new ApiClientError("The API returned invalid route selections");
    }
    return {
      tag: selection.tag,
      product:
        selection.product === null
          ? null
          : parseEntityId(selection.product, "selected Product ID"),
    };
  });
  const tags = selections.map((selection) => selection.tag);
  if (
    new Set(tags).size !== tags.length ||
    tags.some((tag, index) => index > 0 && tags[index - 1] > tag)
  ) {
    throw new ApiClientError("The API returned unordered route selections");
  }
  return selections;
}

function parseRouteProductTags(
  value: unknown,
  products: readonly EntityId[],
): Record<string, string[]> {
  if (!isObject(value)) {
    throw new ApiClientError("The API returned invalid route productTags");
  }
  const parsed: Record<string, string[]> = {};
  for (const [rawProductId, rawTags] of Object.entries(value)) {
    const productId = parseEntityId(Number(rawProductId), "productTags Product ID");
    if (
      !Array.isArray(rawTags) ||
      rawTags.length !== 1 ||
      typeof rawTags[0] !== "string" ||
      !rawTags[0]
    ) {
      throw new ApiClientError("The API returned invalid route productTags");
    }
    parsed[String(productId)] = [rawTags[0]];
  }
  const parsedIds = Object.keys(parsed).map(Number).sort((left, right) => left - right);
  const expectedIds = [...products].sort((left, right) => left - right);
  if (
    parsedIds.length !== expectedIds.length ||
    parsedIds.some((productId, index) => productId !== expectedIds[index])
  ) {
    throw new ApiClientError("The API returned inconsistent route productTags");
  }
  return parsed;
}

function parseRouteCandidate(payload: unknown): RouteCandidate {
  if (!isObject(payload)) {
    throw new ApiClientError("The API returned an invalid Route candidate");
  }
  const stores = parseUniqueEntityIds(payload.stores, "Route Store IDs");
  const products = parseUniqueEntityIds(payload.products, "Route Product IDs");
  const selections = parseRouteSelections(payload.selections);
  const productTags = parseRouteProductTags(payload.productTags, products);
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
  for (const selection of matchedSelections) {
    if (
      selection.product === null ||
      productTags[String(selection.product)]?.[0] !== selection.tag
    ) {
      throw new ApiClientError("The API returned inconsistent Route productTags");
    }
  }
  const expectedError =
    matchedSelections.length === selections.length ? null : "PARTIAL_TAG_MATCH";
  const errorCode: RouteErrorCode | null =
    payload.errorCode === "PARTIAL_TAG_MATCH" ? "PARTIAL_TAG_MATCH" : null;
  if ((payload.errorCode ?? null) !== errorCode || errorCode !== expectedError) {
    throw new ApiClientError("The API returned inconsistent Route errorCode");
  }
  const matchedTagCount =
    typeof payload.matchedTagCount === "number" ? payload.matchedTagCount : NaN;
  if (!Number.isSafeInteger(matchedTagCount) || matchedTagCount <= 0) {
    throw new ApiClientError("The API returned an invalid matchedTagCount");
  }
  if (matchedTagCount !== matchedSelections.length) {
    throw new ApiClientError("The API returned inconsistent matchedTagCount");
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
    productTags,
    selections,
    distance: parseNonNegativeFiniteNumber(payload.distance, "Route distance"),
    time: parseNonNegativeFiniteNumber(payload.time, "Route time"),
    score,
    productPrice,
    matchedTagCount,
    scoreComponents,
    errorCode,
  };
}

function parseRouteOptimizationResponse(payload: unknown): RouteOptimizationResponse {
  if (!isObject(payload) || !Array.isArray(payload.candidates)) {
    throw new ApiClientError("The API returned an invalid optimization response");
  }
  if (payload.status !== "OPTIMAL" && payload.status !== "FEASIBLE_TIMEOUT") {
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
    (payload.status === "OPTIMAL" && provenPrefixCount !== candidates.length)
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