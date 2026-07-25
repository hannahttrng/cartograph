import type {
  CreateListRequest,
  GetMapResponse,
  GetRoutesRequest,
  GetRoutesResponse,
  ListResponse,
  UpdateListRequest,
} from '../types/api';
import type { Route } from '../types/models';
import type { MapRouteData } from '../types/maps';
import { ApiError } from './client';

const lists = new Map<string, ListResponse>();
let nextListId = 1;

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
  createList(request: CreateListRequest): ListResponse {
    const id = `mock-list-${nextListId++}`;
    const list: ListResponse = { ...request, id };
    lists.set(id, list);
    return { ...list };
  },

  getList(id: string): ListResponse {
    const list = lists.get(id);
    if (!list) {
      throw new ApiError(`Shopping list "${id}" was not found.`, {
        status: 404,
        code: 'MOCK_NOT_FOUND',
      });
    }

    return { ...list };
  },

  updateList(id: string, request: UpdateListRequest): ListResponse {
    const current = this.getList(id);
    const updated: ListResponse = { ...current, ...request, id };
    lists.set(id, updated);
    return { ...updated };
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
