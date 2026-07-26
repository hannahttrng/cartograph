import { USE_MOCK_DATA } from '../constants/config';
import type {
  GetRoutesRequest,
  GetRoutesResponse,
  RouteCandidateWire,
  RouteHydrationCatalog,
  RouteOptimizationResponseWire,
} from '../types/api';
import type { Route } from '../types/models';
import { ApiError, apiClient, encodeEntityId } from './client';
import { mockApi } from './mock';

const getCatalogEntity = <T>(
  entities: Readonly<Record<number, T>>,
  id: number,
  label: string,
): T => {
  const entity = entities[id];
  if (!entity) {
    throw new ApiError(`Route ${label} ${id} is missing from the frontend catalog.`, {
      code: 'ROUTE_CATALOG_MISSING',
    });
  }
  return entity;
};

const hydrateCandidate = (
  candidate: RouteCandidateWire,
  catalog: RouteHydrationCatalog,
): Route => ({
  stores: candidate.stores.map((id) => getCatalogEntity(catalog.stores, id, 'store')),
  products: candidate.products.map((id) => getCatalogEntity(catalog.products, id, 'product')),
  distance: candidate.distance,
  time: candidate.time,
  score: candidate.score,
});

export const getRoutes = async (request: GetRoutesRequest): Promise<GetRoutesResponse> => {
  if (USE_MOCK_DATA) {
    return mockApi.getRoutes(request);
  }

  if (!request.listId || request.latitude === undefined || request.longitude === undefined) {
    throw new ApiError('A saved list and current location are required to optimize routes.', {
      code: 'ROUTE_CONTEXT_REQUIRED',
    });
  }
  if (!request.catalog) {
    throw new ApiError('The product and store catalog must be loaded before displaying routes.', {
      code: 'ROUTE_CATALOG_REQUIRED',
    });
  }

  const listId = encodeEntityId(request.listId, 'Shopping list ID');
  const { data } = await apiClient.post<RouteOptimizationResponseWire>(
    `/api/v1/shopping-lists/${listId}/route-candidates`,
    {
      latitude: request.latitude,
      longitude: request.longitude,
      ...(request.limit === undefined ? {} : { limit: request.limit }),
    },
  );

  return data.candidates.map((candidate) => hydrateCandidate(candidate, request.catalog!));
};
