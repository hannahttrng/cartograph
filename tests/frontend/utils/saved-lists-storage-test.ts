import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  loadShoppingListMetadata,
  metadataForList,
  pruneShoppingListMetadata,
  saveShoppingListMetadata,
} from '../../../frontend/src/utils/savedListsStorage';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockedStorage = jest.mocked(AsyncStorage);

beforeEach(() => {
  jest.resetAllMocks();
  mockedStorage.removeItem.mockResolvedValue();
  mockedStorage.setItem.mockResolvedValue();
});

test('loads validated metadata and discards the legacy list store', async () => {
  mockedStorage.getItem.mockResolvedValue(JSON.stringify({
    version: 1,
    collections: [{ id: 'weekly', name: ' Weekly ' }],
    lists: {
      7: { listId: 7, favorite: true, archived: false, collectionId: 'weekly' },
      invalid: { listId: 'local-list', favorite: true },
    },
  }));

  await expect(loadShoppingListMetadata()).resolves.toEqual({
    version: 1,
    collections: [{ id: 'weekly', name: 'Weekly' }],
    lists: {
      7: { listId: 7, favorite: true, archived: false, collectionId: 'weekly' },
    },
  });
  expect(mockedStorage.removeItem).toHaveBeenCalledWith(
    '@cartograph/saved-shopping-lists',
  );
});

test('returns an empty store for malformed serialized data', async () => {
  mockedStorage.getItem.mockResolvedValue('{bad json');

  await expect(loadShoppingListMetadata()).resolves.toEqual({
    version: 1,
    collections: [],
    lists: {},
  });
});

test('normalizes metadata before saving and provides list defaults', async () => {
  await saveShoppingListMetadata({
    version: 1,
    collections: [{ id: 'weekly', name: ' Weekly ' }],
    lists: {
      7: { listId: 7, favorite: true, archived: false, collectionId: 'missing' },
    },
  });

  expect(mockedStorage.setItem).toHaveBeenCalledTimes(1);
  const [storageKey, serializedStore] = mockedStorage.setItem.mock.calls[0] ?? [];
  expect(storageKey).toBe('@cartograph/shopping-list-metadata-v1');
  expect(JSON.parse(serializedStore ?? '')).toEqual({
    version: 1,
    collections: [{ id: 'weekly', name: 'Weekly' }],
    lists: {
      7: { listId: 7, favorite: true, archived: false, collectionId: null },
    },
  });
  expect(metadataForList({ version: 1, collections: [], lists: {} }, 9)).toEqual({
    listId: 9,
    favorite: false,
    archived: false,
    collectionId: null,
  });
});

test('prunes metadata whose backend lists no longer exist', () => {
  expect(pruneShoppingListMetadata({
    version: 1,
    collections: [],
    lists: {
      2: { listId: 2, favorite: true, archived: false, collectionId: null },
      3: { listId: 3, favorite: false, archived: true, collectionId: null },
    },
  }, [3])).toEqual({
    version: 1,
    collections: [],
    lists: {
      3: { listId: 3, favorite: false, archived: true, collectionId: null },
    },
  });
});