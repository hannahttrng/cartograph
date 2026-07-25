import { USE_MOCK_DATA } from '../constants/config';
import type { MapRouteData } from '../types/maps';
import { apiClient, encodePathId } from './client';
import { mockApi } from './mock';

export const getMap = async (routeId: string): Promise<MapRouteData> => {
  const encodedRouteId = encodePathId(routeId, 'Route ID');

  if (USE_MOCK_DATA) {
    return mockApi.getMap(routeId.trim());
  }

  const { data } = await apiClient.get<MapRouteData>(
    `/map/${encodedRouteId}`,
  );
  return data;
};
