import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';

import {
  createShoppingList,
  deleteShoppingList,
  getShoppingList,
  listShoppingLists,
  replaceShoppingList,
  updateShoppingListName,
} from '../../../frontend/src/api/lists';
import { listCatalogTags } from '../../../frontend/src/api/catalog';
import { apiClient, ApiError, toApiError } from '../../../frontend/src/api/client';
import { mockApi } from '../../../frontend/src/api/mock';
import {
  parseCatalogTags,
  parseShoppingList,
} from '../../../frontend/src/api/shoppingListParsers';
import contractFixture from '../../fixtures/shopping-list-contract.json';

const expectedResponse = contractFixture.expectedResponse;

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ShoppingList contract concurrence', () => {
  test('parses the same normalized response asserted by the backend fixture test', () => {
    expect(parseCatalogTags(contractFixture.tags)).toEqual(contractFixture.tags);
    expect(parseShoppingList(expectedResponse)).toEqual(expectedResponse);
  });

  test('sends the exact create request to the implemented versioned path', async () => {
    const post = jest.spyOn(apiClient, 'post').mockResolvedValue({
      data: expectedResponse,
    });

    await expect(createShoppingList(contractFixture.createRequest)).resolves.toEqual(
      expectedResponse,
    );
    expect(post).toHaveBeenCalledWith(
      '/api/v1/shopping-lists',
      contractFixture.createRequest,
    );
  });

  test('uses the implemented collection and item read paths', async () => {
    const get = jest
      .spyOn(apiClient, 'get')
      .mockResolvedValueOnce({ data: [expectedResponse] })
      .mockResolvedValueOnce({ data: expectedResponse });

    await expect(listShoppingLists()).resolves.toEqual([expectedResponse]);
    await expect(getShoppingList(1)).resolves.toEqual(expectedResponse);
    expect(get).toHaveBeenNthCalledWith(1, '/api/v1/shopping-lists');
    expect(get).toHaveBeenNthCalledWith(2, '/api/v1/shopping-lists/1');
  });

  test('loads and parses catalog tags from the implemented versioned path', async () => {
    const get = jest.spyOn(apiClient, 'get').mockResolvedValue({
      data: contractFixture.tags,
    });

    await expect(listCatalogTags()).resolves.toEqual(contractFixture.tags);
    expect(get).toHaveBeenCalledWith('/api/v1/tags');
  });

  test('uses PUT for replacement and PATCH for name-only updates', async () => {
    const putResponse = {
      ...expectedResponse,
      name: 'Restocked',
      active: true,
    };
    const patchResponse = { ...putResponse, name: 'Renamed' };
    const put = jest.spyOn(apiClient, 'put').mockResolvedValue({ data: putResponse });
    const patch = jest.spyOn(apiClient, 'patch').mockResolvedValue({ data: patchResponse });
    const replacement = {
      name: 'Restocked',
      items: expectedResponse.items,
      active: true,
    };

    await expect(replaceShoppingList(1, replacement)).resolves.toEqual(putResponse);
    await expect(
      updateShoppingListName(1, { name: 'Renamed' }),
    ).resolves.toEqual(patchResponse);
    expect(put).toHaveBeenCalledWith('/api/v1/shopping-lists/1', replacement);
    expect(patch).toHaveBeenCalledWith('/api/v1/shopping-lists/1/name', {
      name: 'Renamed',
    });
  });

  test('deletes through the implemented item path', async () => {
    const remove = jest.spyOn(apiClient, 'delete').mockResolvedValue({ data: undefined });

    await expect(deleteShoppingList(1)).resolves.toBeUndefined();
    expect(remove).toHaveBeenCalledWith('/api/v1/shopping-lists/1');
  });

  test('rejects invalid IDs before making a request', async () => {
    const get = jest.spyOn(apiClient, 'get');

    await expect(getShoppingList(0)).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
    expect(get).not.toHaveBeenCalled();
  });

  test.each([
    [{ ...expectedResponse, id: '1' }, 'invalid ShoppingList ID'],
    [{ ...expectedResponse, items: [...expectedResponse.items, expectedResponse.items[0]] }, 'duplicate ShoppingList item tags'],
    [{ ...expectedResponse, routes: [9], status: 'PENDING' }, 'inconsistent ShoppingList routes'],
  ])('rejects malformed or inconsistent responses', (payload, message) => {
    expect(() => parseShoppingList(payload)).toThrow(message);
  });

  test('preserves backend errorCode separately from the Axios transport code', () => {
    const response = {
      data: {
        detail: 'Travel matrix provider is unavailable',
        errorCode: 'MATRIX_UNAVAILABLE',
      },
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config: {} as InternalAxiosRequestConfig,
    };
    const error = new AxiosError(
      'Request failed',
      'ERR_BAD_RESPONSE',
      response.config,
      undefined,
      response,
    );

    expect(axios.isAxiosError(error)).toBe(true);
    expect(toApiError(error)).toMatchObject({
      message: 'Travel matrix provider is unavailable',
      status: 503,
      code: 'ERR_BAD_RESPONSE',
      domainCode: 'MATRIX_UNAVAILABLE',
    });
  });

  test('passes contract-shaped mock data through the production parser', () => {
    const mockResponse = mockApi.createShoppingList({
      name: 'Mock weekly list',
      items: [{ tag: 'milk' }, { tag: 'bread' }],
    });

    expect(parseShoppingList(mockResponse)).toEqual(mockResponse);
    expect(mockResponse.id).toEqual(expect.any(Number));
    expect(mockResponse.items).toEqual([
      { tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1 },
      { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1 },
    ]);
  });

  test('reports parser failures as ApiError values', () => {
    try {
      parseShoppingList(null);
      throw new Error('Expected parser failure');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
});
