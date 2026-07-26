import type {
  EntityId,
  RouteCalculationResponse,
  RouteCalculationStatus,
  RouteCandidateResult,
  RouteCandidatesResponse,
  RouteErrorCode,
  RouteItemSelection,
  RouteOptimizationErrorCode,
  RouteOptimizationStatus,
  RouteProductSummary,
  RouteScoreComponents,
  RouteStoreSummary,
} from '../types/api';
import { ApiError } from './client';

const invalidResponse = (message: string): never => {
  throw new ApiError(message, { code: 'INVALID_RESPONSE' });
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isDisplayText = (value: unknown): value is string =>
  typeof value === 'string' && Boolean(value) && value === value.trim();

const isNormalizedText = (value: unknown): value is string =>
  isDisplayText(value) && value === value.toLowerCase();

const parseFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return value;
};

const parseNonNegativeNumber = (value: unknown, label: string): number => {
  const parsed = parseFiniteNumber(value, label);
  if (parsed < 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return parsed;
};

const parsePositiveNumber = (value: unknown, label: string): number => {
  const parsed = parseNonNegativeNumber(value, label);
  if (parsed === 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return parsed;
};

const parseNonNegativeInteger = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return value as number;
};

const parseEntityId = (value: unknown, label: string): EntityId => {
  const parsed = parseNonNegativeInteger(value, label);
  if (parsed === 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return parsed;
};

const parseModifiers = (value: unknown): readonly string[] => {
  if (!Array.isArray(value) || !value.every(isNormalizedText)) {
    return invalidResponse('The API returned invalid route modifiers.');
  }
  if (new Set(value).size !== value.length) {
    return invalidResponse('The API returned duplicate route modifiers.');
  }
  if (value.some((modifier, index) => index > 0 && value[index - 1] > modifier)) {
    return invalidResponse('The API returned unordered route modifiers.');
  }
  return [...value];
};

const parseSelections = (value: unknown): readonly RouteItemSelection[] => {
  if (!Array.isArray(value)) {
    return invalidResponse('The API returned invalid route selections.');
  }
  const selections = value.map((selection): RouteItemSelection => {
    if (
      !isObject(selection) ||
      !isNormalizedText(selection.tag) ||
      !isNormalizedText(selection.unit)
    ) {
      return invalidResponse('The API returned invalid route selections.');
    }
    return {
      tag: selection.tag,
      modifiers: parseModifiers(selection.modifiers),
      unit: selection.unit,
      quantity: parsePositiveNumber(selection.quantity, 'route selection quantity'),
      product:
        selection.product === null
          ? null
          : parseEntityId(selection.product, 'selected Product ID'),
    };
  });
  const tags = selections.map((selection) => selection.tag);
  if (new Set(tags).size !== tags.length) {
    return invalidResponse('The API returned duplicate route selection tags.');
  }
  return selections;
};

const parseStore = (value: unknown): RouteStoreSummary => {
  if (!isObject(value) || !isDisplayText(value.name) || !isDisplayText(value.address)) {
    return invalidResponse('The API returned an invalid Route Store.');
  }
  const latitude = value.latitude === null
    ? null
    : parseFiniteNumber(value.latitude, 'Route Store latitude');
  const longitude = value.longitude === null
    ? null
    : parseFiniteNumber(value.longitude, 'Route Store longitude');
  if (
    (latitude === null) !== (longitude === null) ||
    (latitude !== null && (latitude < -90 || latitude > 90)) ||
    (longitude !== null && (longitude < -180 || longitude > 180))
  ) {
    return invalidResponse('The API returned invalid Route Store coordinates.');
  }
  return {
    id: parseEntityId(value.id, 'Route Store ID'),
    name: value.name,
    address: value.address,
    latitude,
    longitude,
  };
};

const parseProduct = (value: unknown): RouteProductSummary => {
  if (!isObject(value) || !isDisplayText(value.name) || !isNormalizedText(value.unit)) {
    return invalidResponse('The API returned an invalid Route Product.');
  }
  return {
    id: parseEntityId(value.id, 'Route Product ID'),
    name: value.name,
    store: parseEntityId(value.store, 'Route Product Store ID'),
    unit: value.unit,
    modifiers: parseModifiers(value.modifiers),
    selectionPrice: parseNonNegativeNumber(
      value.selectionPrice,
      'Route Product selectionPrice',
    ),
  };
};

const parseScoreComponents = (value: unknown): RouteScoreComponents => {
  if (!isObject(value)) {
    return invalidResponse('The API returned invalid scoreComponents.');
  }
  return {
    productPrice: parseNonNegativeNumber(value.productPrice, 'product price component'),
    distanceCost: parseNonNegativeNumber(value.distanceCost, 'distance cost component'),
    timeCost: parseNonNegativeNumber(value.timeCost, 'time cost component'),
    storeCost: parseNonNegativeNumber(value.storeCost, 'store cost component'),
    modifierPenalty: parseNonNegativeNumber(
      value.modifierPenalty,
      'modifier penalty component',
    ),
  };
};

const parseRouteErrorCode = (value: unknown): RouteErrorCode | null => {
  if (value === null || value === 'PARTIAL_ITEM_MATCH') {
    return value;
  }
  return invalidResponse('The API returned an invalid Route errorCode.');
};

const quantizedScoreUnits = (value: number): number =>
  Math.sign(value) * Math.round(Math.abs(value) * 1_000_000);

const parseCandidate = (value: unknown): RouteCandidateResult => {
  if (!isObject(value) || !Array.isArray(value.stores) || !Array.isArray(value.products)) {
    return invalidResponse('The API returned an invalid Route candidate.');
  }
  const stores = value.stores.map(parseStore);
  const storeIds = stores.map((store) => store.id);
  if (new Set(storeIds).size !== storeIds.length) {
    return invalidResponse('The API returned duplicate Route Stores.');
  }
  const products = value.products.map(parseProduct);
  const productIds = products.map((product) => product.id);
  if (new Set(productIds).size !== productIds.length) {
    return invalidResponse('The API returned duplicate Route Products.');
  }
  const selections = parseSelections(value.selections);
  const matchedProductIds = selections.flatMap((selection) =>
    selection.product === null ? [] : [selection.product],
  );
  if (
    new Set(matchedProductIds).size !== matchedProductIds.length ||
    matchedProductIds.length !== productIds.length ||
    productIds.some((productId) => !matchedProductIds.includes(productId))
  ) {
    return invalidResponse('The API returned inconsistent Route selections.');
  }
  if (products.some((product) => !storeIds.includes(product.store))) {
    return invalidResponse('The API returned a Product outside the Route Stores.');
  }

  const matchedItemCount = parseEntityId(value.matchedItemCount, 'matchedItemCount');
  if (matchedItemCount !== matchedProductIds.length) {
    return invalidResponse('The API returned inconsistent matchedItemCount.');
  }
  const expectedError: RouteErrorCode | null =
    matchedProductIds.length === selections.length ? null : 'PARTIAL_ITEM_MATCH';
  const errorCode = parseRouteErrorCode(value.errorCode);
  if (errorCode !== expectedError) {
    return invalidResponse('The API returned inconsistent Route errorCode.');
  }

  const scoreComponents = parseScoreComponents(value.scoreComponents);
  const productPrice = parseNonNegativeNumber(value.productPrice, 'Route productPrice');
  const productTotal = products.reduce(
    (total, product) => total + product.selectionPrice,
    0,
  );
  const score = parseNonNegativeNumber(value.score, 'Route score');
  const componentTotal = Object.values(scoreComponents).reduce(
    (total, component) => total + quantizedScoreUnits(component),
    0,
  );
  if (
    quantizedScoreUnits(productPrice) !== quantizedScoreUnits(productTotal) ||
    quantizedScoreUnits(productPrice) !== quantizedScoreUnits(scoreComponents.productPrice) ||
    quantizedScoreUnits(score) !== componentTotal
  ) {
    return invalidResponse('The API returned inconsistent Route score components.');
  }

  return {
    id: parseEntityId(value.id, 'Route candidate ID'),
    stores,
    products,
    selections,
    distance: parseNonNegativeNumber(value.distance, 'Route distance'),
    time: parseNonNegativeNumber(value.time, 'Route time'),
    score,
    productPrice,
    matchedItemCount,
    scoreComponents,
    errorCode,
  };
};

export const parseRouteCandidates = (value: unknown): RouteCandidatesResponse => {
  if (!isObject(value) || !Array.isArray(value.candidates)) {
    return invalidResponse('The API returned an invalid Route candidates response.');
  }
  const candidates = value.candidates.map(parseCandidate);
  if (candidates.length > 20) {
    return invalidResponse('The API returned an invalid Route candidate count.');
  }
  const ids = candidates.map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length) {
    return invalidResponse('The API returned duplicate Route candidate IDs.');
  }
  return {
    generation: parseNonNegativeInteger(value.generation, 'Route candidate generation'),
    candidates,
  };
};

const parseCalculationStatus = (value: unknown): RouteCalculationStatus => {
  if (value === 'IDLE' || value === 'RUNNING' || value === 'SUCCEEDED' || value === 'FAILED') {
    return value;
  }
  return invalidResponse('The API returned an invalid calculation status.');
};

const parseOptimizerStatus = (value: unknown): RouteOptimizationStatus | null => {
  if (value === null) return null;
  if (value === 'OPTIMAL' || value === 'HEURISTIC' || value === 'FEASIBLE_TIMEOUT') {
    return value;
  }
  return invalidResponse('The API returned an invalid optimizer status.');
};

const parseOptimizationError = (value: unknown): RouteOptimizationErrorCode | null => {
  if (value === null) return null;
  if (
    value === 'NO_ELIGIBLE_PRODUCTS' ||
    value === 'MATRIX_UNAVAILABLE' ||
    value === 'UNIT_CONVERSION_FAILED' ||
    value === 'OPTIMIZATION_FAILED'
  ) {
    return value;
  }
  return invalidResponse('The API returned an invalid calculation errorCode.');
};

const parseNullableNonNegative = (value: unknown, label: string): number | null =>
  value === null ? null : parseNonNegativeNumber(value, label);

const parseNullablePositive = (value: unknown, label: string): number | null =>
  value === null ? null : parsePositiveNumber(value, label);

export const parseRouteCalculation = (value: unknown): RouteCalculationResponse => {
  if (!isObject(value)) {
    return invalidResponse('The API returned an invalid calculation response.');
  }
  const generation = parseNonNegativeInteger(value.generation, 'calculation generation');
  const status = parseCalculationStatus(value.status);
  const startedAt = parseNullableNonNegative(value.startedAt, 'calculation startedAt');
  const completedAt = parseNullableNonNegative(value.completedAt, 'calculation completedAt');
  const errorCode = parseOptimizationError(value.errorCode);
  const detail = value.detail === null
    ? null
    : typeof value.detail === 'string' && Boolean(value.detail)
      ? value.detail
      : undefined;
  if (detail === undefined) {
    return invalidResponse('The API returned an invalid calculation detail.');
  }
  if (
    (status === 'IDLE' && (generation !== 0 || startedAt !== null || completedAt !== null)) ||
    (status !== 'IDLE' && (generation === 0 || startedAt === null)) ||
    (status === 'RUNNING' && completedAt !== null) ||
    ((status === 'SUCCEEDED' || status === 'FAILED') && completedAt === null)
  ) {
    return invalidResponse('The API returned inconsistent calculation metadata.');
  }
  if (
    (status === 'FAILED' && (errorCode === null || detail === null)) ||
    (status !== 'FAILED' && (errorCode !== null || detail !== null))
  ) {
    return invalidResponse('The API returned inconsistent calculation error data.');
  }
  return {
    generation,
    status,
    activeListCount: parseNonNegativeInteger(value.activeListCount, 'activeListCount'),
    itemCount: parseNonNegativeInteger(value.itemCount, 'itemCount'),
    resultCount: parseNonNegativeInteger(value.resultCount, 'resultCount'),
    optimizerStatus: parseOptimizerStatus(value.optimizerStatus),
    startedAt,
    completedAt,
    elapsedSeconds: parseNullableNonNegative(value.elapsedSeconds, 'elapsedSeconds'),
    timeoutSeconds: parseNullablePositive(value.timeoutSeconds, 'timeoutSeconds'),
    errorCode,
    detail,
  };
};
