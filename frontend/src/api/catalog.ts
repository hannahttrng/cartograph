import { USE_MOCK_DATA } from '../constants/config';
import type { CatalogTag } from '../types/api';
import { apiClient } from './client';
import { mockApi } from './mock';
import { parseCatalogTags, parseTagModifiers } from './shoppingListParsers';

export async function listCatalogTags(): Promise<readonly CatalogTag[]> {
  if (USE_MOCK_DATA) {
    return parseCatalogTags(mockApi.listCatalogTags());
  }

  const { data } = await apiClient.get<unknown>('/api/v1/tags');
  return parseCatalogTags(data);
}

export async function listTagModifiers(tag: string): Promise<readonly string[]> {
  const normalizedTag = tag.trim().toLowerCase();
  if (!normalizedTag || normalizedTag !== tag) {
    throw new TypeError('tag must be a normalized, nonblank string');
  }

  if (USE_MOCK_DATA) {
    return parseTagModifiers(mockApi.listTagModifiers(normalizedTag));
  }

  const { data } = await apiClient.get<unknown>(
    `/api/v1/tags/${encodeURIComponent(normalizedTag)}/modifiers`,
  );
  return parseTagModifiers(data);
}
