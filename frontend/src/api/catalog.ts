import { USE_MOCK_DATA } from '../constants/config';
import type { CatalogTag } from '../types/api';
import { apiClient } from './client';
import { mockApi } from './mock';
import { parseCatalogTags } from './shoppingListParsers';

export async function listCatalogTags(): Promise<readonly CatalogTag[]> {
  if (USE_MOCK_DATA) {
    return parseCatalogTags(mockApi.listCatalogTags());
  }

  const { data } = await apiClient.get<unknown>('/api/v1/tags');
  return parseCatalogTags(data);
}
