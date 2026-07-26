import { USE_MOCK_DATA } from '../constants/config';
import type {
  EntityId,
  ShoppingListActiveUpdateRequest,
  ShoppingListCreateRequest,
  ShoppingListNameUpdateRequest,
  ShoppingListReplaceRequest,
  ShoppingListResponse,
} from '../types/api';
import { apiClient, encodeEntityId } from './client';
import { mockApi } from './mock';
import { parseShoppingList, parseShoppingLists } from './shoppingListParsers';

const shoppingListPath = (id: EntityId): string =>
  `/api/v1/shopping-lists/${encodeEntityId(id, 'Shopping list ID')}`;

export async function listShoppingLists(): Promise<readonly ShoppingListResponse[]> {
  if (USE_MOCK_DATA) {
    return parseShoppingLists(mockApi.listShoppingLists());
  }

  const { data } = await apiClient.get<unknown>('/api/v1/shopping-lists');
  return parseShoppingLists(data);
}

export async function getShoppingList(
  id: EntityId,
): Promise<ShoppingListResponse> {
  const path = shoppingListPath(id);
  if (USE_MOCK_DATA) {
    return parseShoppingList(mockApi.getShoppingList(id));
  }

  const { data } = await apiClient.get<unknown>(path);
  return parseShoppingList(data);
}

export async function createShoppingList(
  request: ShoppingListCreateRequest,
): Promise<ShoppingListResponse> {
  if (USE_MOCK_DATA) {
    return parseShoppingList(mockApi.createShoppingList(request));
  }

  const { data } = await apiClient.post<unknown>('/api/v1/shopping-lists', request);
  return parseShoppingList(data);
}

export async function replaceShoppingList(
  id: EntityId,
  request: ShoppingListReplaceRequest,
): Promise<ShoppingListResponse> {
  const path = shoppingListPath(id);
  if (USE_MOCK_DATA) {
    return parseShoppingList(mockApi.replaceShoppingList(id, request));
  }

  const { data } = await apiClient.put<unknown>(path, request);
  return parseShoppingList(data);
}

export async function updateShoppingListName(
  id: EntityId,
  request: ShoppingListNameUpdateRequest,
): Promise<ShoppingListResponse> {
  const path = `${shoppingListPath(id)}/name`;
  if (USE_MOCK_DATA) {
    return parseShoppingList(mockApi.updateShoppingListName(id, request));
  }

  const { data } = await apiClient.patch<unknown>(path, request);
  return parseShoppingList(data);
}

export async function updateShoppingListActive(
  id: EntityId,
  request: ShoppingListActiveUpdateRequest,
): Promise<ShoppingListResponse> {
  const path = `${shoppingListPath(id)}/active`;
  if (USE_MOCK_DATA) {
    return parseShoppingList(mockApi.updateShoppingListActive(id, request));
  }

  const { data } = await apiClient.patch<unknown>(path, request);
  return parseShoppingList(data);
}

export async function deleteShoppingList(id: EntityId): Promise<void> {
  const path = shoppingListPath(id);
  if (USE_MOCK_DATA) {
    mockApi.deleteShoppingList(id);
    return;
  }

  await apiClient.delete(path);
}
