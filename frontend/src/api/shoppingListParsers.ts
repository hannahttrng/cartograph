import type {
  CatalogTag,
  EntityId,
  ShoppingListItem,
  ShoppingListResponse,
  ShoppingListStatus,
} from '../types/api';
import { ApiError } from './client';

const invalidResponse = (message: string): never => {
  throw new ApiError(message, { code: 'INVALID_RESPONSE' });
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNormalizedText = (value: unknown): value is string =>
  typeof value === 'string' &&
  Boolean(value) &&
  value === value.trim() &&
  value === value.toLowerCase();

const parseEntityId = (value: unknown, label: string): EntityId => {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return value as EntityId;
};

const parsePositiveNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return invalidResponse(`The API returned an invalid ${label}.`);
  }
  return value;
};

const parseSortedNormalizedStrings = (
  value: unknown,
  label: string,
): readonly string[] => {
  if (!Array.isArray(value) || !value.every(isNormalizedText)) {
    return invalidResponse(`The API returned invalid ${label}.`);
  }
  if (new Set(value).size !== value.length) {
    return invalidResponse(`The API returned duplicate ${label}.`);
  }
  if (value.some((item, index) => index > 0 && value[index - 1] > item)) {
    return invalidResponse(`The API returned unordered ${label}.`);
  }
  return [...value];
};

const parseUniqueEntityIds = (
  value: unknown,
  label: string,
): readonly EntityId[] => {
  if (!Array.isArray(value)) {
    return invalidResponse(`The API returned invalid ${label}.`);
  }
  const ids = value.map((id) => parseEntityId(id, label));
  if (new Set(ids).size !== ids.length) {
    return invalidResponse(`The API returned duplicate ${label}.`);
  }
  return ids;
};

const parseShoppingListItem = (value: unknown): ShoppingListItem => {
  if (!isObject(value) || !isNormalizedText(value.tag) || !isNormalizedText(value.unit)) {
    return invalidResponse('The API returned invalid ShoppingList items.');
  }
  return {
    tag: value.tag,
    modifiers: parseSortedNormalizedStrings(value.modifiers, 'ShoppingList modifiers'),
    unit: value.unit,
    quantity: parsePositiveNumber(value.quantity, 'ShoppingList item quantity'),
  };
};

const parseStatus = (value: unknown): ShoppingListStatus => {
  if (
    value !== 'PENDING' &&
    value !== 'COMPUTING' &&
    value !== 'READY' &&
    value !== 'FAILED'
  ) {
    return invalidResponse('The API returned an invalid ShoppingList status.');
  }
  return value;
};

export const parseShoppingList = (value: unknown): ShoppingListResponse => {
  if (
    !isObject(value) ||
    typeof value.name !== 'string' ||
    !value.name ||
    value.name !== value.name.trim() ||
    typeof value.active !== 'boolean' ||
    !Array.isArray(value.items)
  ) {
    return invalidResponse('The API returned an invalid ShoppingList response.');
  }

  const items = value.items.map(parseShoppingListItem);
  const itemTags = items.map((item) => item.tag);
  if (new Set(itemTags).size !== itemTags.length) {
    return invalidResponse('The API returned duplicate ShoppingList item tags.');
  }

  const routes = parseUniqueEntityIds(value.routes, 'ShoppingList route IDs');
  const status = parseStatus(value.status);
  if (routes.length > 0 && status !== 'READY') {
    return invalidResponse('The API returned inconsistent ShoppingList routes.');
  }

  return {
    id: parseEntityId(value.id, 'ShoppingList ID'),
    name: value.name,
    items,
    active: value.active,
    routes,
    status,
  };
};

export const parseShoppingLists = (value: unknown): readonly ShoppingListResponse[] => {
  if (!Array.isArray(value)) {
    return invalidResponse('The API returned an invalid ShoppingList collection.');
  }
  const lists = value.map(parseShoppingList);
  const ids = lists.map((list) => list.id);
  if (new Set(ids).size !== ids.length) {
    return invalidResponse('The API returned duplicate ShoppingLists.');
  }
  return lists;
};

const parseCatalogTag = (value: unknown): CatalogTag => {
  if (!isObject(value) || !isNormalizedText(value.tag) || !isNormalizedText(value.defaultUnit)) {
    return invalidResponse('The API returned an invalid Tag response.');
  }
  const products = parseUniqueEntityIds(value.products, 'Tag Product IDs');
  if (products.some((id, index) => index > 0 && products[index - 1] > id)) {
    return invalidResponse('The API returned unordered Tag Product IDs.');
  }
  return {
    tag: value.tag,
    defaultUnit: value.defaultUnit,
    defaultQuantity: parsePositiveNumber(value.defaultQuantity, 'Tag defaultQuantity'),
    products,
  };
};

export const parseCatalogTags = (value: unknown): readonly CatalogTag[] => {
  if (!Array.isArray(value)) {
    return invalidResponse('The API returned an invalid Tag collection.');
  }
  const tags = value.map(parseCatalogTag);
  const tagIds = tags.map((tag) => tag.tag);
  if (new Set(tagIds).size !== tagIds.length) {
    return invalidResponse('The API returned duplicate Tags.');
  }
  if (tagIds.some((tag, index) => index > 0 && tagIds[index - 1] > tag)) {
    return invalidResponse('The API returned unordered Tags.');
  }
  return tags;
};
