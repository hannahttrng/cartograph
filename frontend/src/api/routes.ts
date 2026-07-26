import { USE_MOCK_DATA } from '../constants/config';
import type {
  RouteCalculationResponse,
  RouteCandidatesResponse,
} from '../types/api';
import { apiClient } from './client';
import { mockApi } from './mock';
import { parseRouteCalculation, parseRouteCandidates } from './routeParsers';

export async function getRouteCalculation(): Promise<RouteCalculationResponse> {
  if (USE_MOCK_DATA) {
    return parseRouteCalculation(mockApi.getRouteCalculation());
  }

  const { data } = await apiClient.get<unknown>('/api/v1/route-calculation');
  return parseRouteCalculation(data);
}

export async function startRouteCalculation(): Promise<RouteCalculationResponse> {
  if (USE_MOCK_DATA) {
    return parseRouteCalculation(mockApi.startRouteCalculation());
  }

  const { data } = await apiClient.post<unknown>('/api/v1/route-calculation');
  return parseRouteCalculation(data);
}

export async function getRouteCandidates(): Promise<RouteCandidatesResponse> {
  if (USE_MOCK_DATA) {
    return parseRouteCandidates(mockApi.getRouteCandidates());
  }

  const { data } = await apiClient.get<unknown>('/api/v1/route-candidates');
  return parseRouteCandidates(data);
}
