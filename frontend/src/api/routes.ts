import { USE_MOCK_DATA } from '../constants/config';
import type {
  GetRoutesRequest,
  GetRoutesResponse,
} from '../types/api';
import { apiClient } from './client';
import { mockApi } from './mock';

export const getRoutes = async <
  TResponse extends GetRoutesResponse = GetRoutesResponse,
  TRequest extends GetRoutesRequest = GetRoutesRequest,
>(
  request: TRequest,
): Promise<TResponse> => {
  if (USE_MOCK_DATA) {
    return mockApi.getRoutes(request) as TResponse;
  }

  const { data } = await apiClient.post<TResponse>('/route', request);
  return data;
};
