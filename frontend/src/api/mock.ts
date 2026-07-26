import type {
  CatalogTag,
  EntityId,
  GetMapResponse,
  GetRoutesRequest,
  GetRoutesResponse,
  ShoppingListCreateRequest,
  ShoppingListItem,
  ShoppingListItemInput,
  ShoppingListNameUpdateRequest,
  ShoppingListReplaceRequest,
  ShoppingListResponse,
} from '../types/api';
import type { Route } from '../types/models';
import type { MapRouteData } from '../types/maps';
import { ApiError } from './client';

const lists = new Map<EntityId, ShoppingListResponse>();
let nextListId = 1;

const catalogTags: readonly CatalogTag[] = [
  { tag: 'bread', defaultUnit: 'loaf', defaultQuantity: 1, products: [] },
  { tag: 'egg', defaultUnit: 'count', defaultQuantity: 6, products: [] },
  { tag: 'ground beef', defaultUnit: 'lbs', defaultQuantity: 1, products: [] },
  { tag: 'milk', defaultUnit: 'gallon', defaultQuantity: 1, products: [] },
];

const normalizeText = (value: string): string => value.trim().toLowerCase();

const resolveItems = (
  inputs: readonly ShoppingListItemInput[],
): readonly ShoppingListItem[] => {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const tag = normalizeText(input.tag);
    const catalogTag = catalogTags.find((candidate) => candidate.tag === tag);
    if (!catalogTag) {
      throw new ApiError(`unknown shopping list tags: ${tag}`, { status: 422 });
    }
    if (seen.has(tag)) {
      throw new ApiError('item tags must not contain duplicates', { status: 422 });
    }
    seen.add(tag);
    return {
      tag,
      modifiers: [...(input.modifiers ?? [])].map(normalizeText).sort(),
      unit: input.unit == null ? catalogTag.defaultUnit : normalizeText(input.unit),
      quantity: input.quantity ?? catalogTag.defaultQuantity,
    };
  });
};

const requireList = (id: EntityId): ShoppingListResponse => {
  const list = lists.get(id);
  if (!list) {
    throw new ApiError('Shopping list not found', { status: 404 });
  }
  return list;
};

const mockRoutes: Route[] = [
  {
    stores: [
      {
        name: 'Cartograph Market',
        address: '100 Main Street',
        latitude: 34.056,
        longitude: -117.195,
      },
      {
        name: 'Fresh Fields',
        address: '220 Citrus Avenue',
        latitude: 34.0612,
        longitude: -117.1884,
      },
      {
        name: 'Value Pantry',
        address: '475 University Parkway',
        latitude: 34.0489,
        longitude: -117.1817,
      },
    ],
    products: [],
    distance: 3.2,
    time: 12,
    score: 92,
  },
];

const cloneRoutes = (): GetRoutesResponse =>
  mockRoutes.map((route) => ({
    ...route,
    stores: route.stores.map((store) => ({ ...store })),
    products: route.products.map((product) => ({
      ...product,
      store: { ...product.store },
    })),
  }));

export const mockApi = {
  listCatalogTags(): readonly CatalogTag[] {
    return catalogTags.map((tag) => ({ ...tag, products: [...tag.products] }));
  },

  listShoppingLists(): readonly ShoppingListResponse[] {
    return [...lists.values()].map((list) => ({
      ...list,
      items: list.items.map((item) => ({ ...item, modifiers: [...item.modifiers] })),
      routes: [...list.routes],
    }));
  },

  createShoppingList(request: ShoppingListCreateRequest): ShoppingListResponse {
    const id = nextListId++;
    const list: ShoppingListResponse = {
      id,
      name: request.name?.trim() || `New List ${id}`,
      items: resolveItems(request.items),
      active: request.active ?? true,
      routes: [],
      status: 'PENDING',
    };
    lists.set(id, list);
    return { ...list };
  },

  getShoppingList(id: EntityId): ShoppingListResponse {
    const list = requireList(id);
    return { ...list };
  },

  replaceShoppingList(
    id: EntityId,
    request: ShoppingListReplaceRequest,
  ): ShoppingListResponse {
    const current = requireList(id);
    const updated: ShoppingListResponse = {
      ...current,
      name: request.name.trim(),
      items: resolveItems(request.items),
      active: request.active ?? true,
      routes: [],
      status: 'PENDING',
    };
    lists.set(id, updated);
    return { ...updated };
  },

  updateShoppingListName(
    id: EntityId,
    request: ShoppingListNameUpdateRequest,
  ): ShoppingListResponse {
    const updated = { ...requireList(id), name: request.name.trim() };
    lists.set(id, updated);
    return { ...updated };
  },

  deleteShoppingList(id: EntityId): void {
    if (!lists.delete(id)) {
      throw new ApiError('Shopping list not found', { status: 404 });
    }
  },

  getRoutes(_request: GetRoutesRequest): GetRoutesResponse {
    return cloneRoutes();
  },

  getMap(routeId: string): MapRouteData {
    const route = cloneRoutes()[0];

    return {
      routeId,
      stores: route?.stores ?? [],
      distance: route?.distance ?? 0,
      time: route?.time ?? 0,
      polyline: {
        points: route?.stores.map(({ latitude, longitude }) => ({ latitude, longitude })) ?? [],
      },
    };
  },
};
