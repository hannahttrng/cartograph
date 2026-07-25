import { USE_MOCK_DATA } from '../constants/config';
import type {
  CreateListRequest,
  ListResponse,
  UpdateListRequest,
} from '../types/api';
import { apiClient, encodePathId } from './client';
import { mockApi } from './mock';

export const createList = async <
  TResponse extends ListResponse = ListResponse,
  TRequest extends CreateListRequest = CreateListRequest,
>(
  request: TRequest,
): Promise<TResponse> => {
  if (USE_MOCK_DATA) {
    return mockApi.createList(request) as TResponse;
  }

  const { data } = await apiClient.post<TResponse>('/list', request);
  return data;
};

export const getList = async <
  TResponse extends ListResponse = ListResponse,
>(
  id: string,
): Promise<TResponse> => {
  const encodedId = encodePathId(id, 'List ID');

  if (USE_MOCK_DATA) {
    return mockApi.getList(id.trim()) as TResponse;
  }

  const { data } = await apiClient.get<TResponse>(`/list/${encodedId}`);
  return data;
};

export const updateList = async <
  TResponse extends ListResponse = ListResponse,
  TRequest extends UpdateListRequest = UpdateListRequest,
>(
  id: string,
  request: TRequest,
): Promise<TResponse> => {
  const encodedId = encodePathId(id, 'List ID');

  if (USE_MOCK_DATA) {
    return mockApi.updateList(id.trim(), request) as TResponse;
  }

  const { data } = await apiClient.patch<TResponse>(
    `/list/${encodedId}`,
    request,
  );
  return data;
};
