import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EntityId } from '../types/api';
import type {
  ShoppingListCollection,
  ShoppingListMetadata,
  ShoppingListMetadataStore,
} from '../types/savedLists';

const LEGACY_STORAGE_KEY = '@cartograph/saved-shopping-lists';
const METADATA_STORAGE_KEY = '@cartograph/shopping-list-metadata-v1';

const emptyStore = (): ShoppingListMetadataStore => ({
  collections: [],
  lists: {},
  version: 1,
});

const isPositiveEntityId = (value: unknown): value is EntityId =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const parseCollection = (value: unknown): ShoppingListCollection | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ShoppingListCollection>;
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  return id && name ? { id, name } : null;
};

const parseMetadata = (value: unknown): ShoppingListMetadata | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<ShoppingListMetadata>;
  if (
    !isPositiveEntityId(candidate.listId) ||
    typeof candidate.archived !== 'boolean' ||
    typeof candidate.favorite !== 'boolean' ||
    (candidate.collectionId !== null && typeof candidate.collectionId !== 'string')
  ) {
    return null;
  }
  return {
    archived: candidate.archived,
    collectionId: candidate.collectionId?.trim() || null,
    favorite: candidate.favorite,
    listId: candidate.listId,
  };
};

const parseStore = (value: unknown): ShoppingListMetadataStore => {
  if (!value || typeof value !== 'object') {
    return emptyStore();
  }
  const candidate = value as Partial<ShoppingListMetadataStore>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.collections) ||
    !candidate.lists ||
    typeof candidate.lists !== 'object'
  ) {
    return emptyStore();
  }

  const collections = candidate.collections
    .map(parseCollection)
    .filter((collection): collection is ShoppingListCollection => collection !== null);
  const collectionIds = new Set(collections.map((collection) => collection.id));
  const lists = Object.values(candidate.lists).reduce<Record<string, ShoppingListMetadata>>(
    (parsed, metadataValue) => {
      const metadata = parseMetadata(metadataValue);
      if (metadata) {
        parsed[String(metadata.listId)] = {
          ...metadata,
          collectionId:
            metadata.collectionId && collectionIds.has(metadata.collectionId)
              ? metadata.collectionId
              : null,
        };
      }
      return parsed;
    },
    {},
  );
  return { collections, lists, version: 1 };
};

export async function loadShoppingListMetadata(): Promise<ShoppingListMetadataStore> {
  await AsyncStorage.removeItem(LEGACY_STORAGE_KEY);
  const serializedStore = await AsyncStorage.getItem(METADATA_STORAGE_KEY);
  if (!serializedStore) {
    return emptyStore();
  }
  try {
    return parseStore(JSON.parse(serializedStore));
  } catch {
    return emptyStore();
  }
}

export async function saveShoppingListMetadata(
  store: ShoppingListMetadataStore,
): Promise<void> {
  const parsedStore = parseStore(store);
  await AsyncStorage.setItem(METADATA_STORAGE_KEY, JSON.stringify(parsedStore));
}

export const metadataForList = (
  store: ShoppingListMetadataStore,
  listId: EntityId,
): ShoppingListMetadata =>
  store.lists[String(listId)] ?? {
    archived: false,
    collectionId: null,
    favorite: false,
    listId,
  };

export const pruneShoppingListMetadata = (
  store: ShoppingListMetadataStore,
  listIds: readonly EntityId[],
): ShoppingListMetadataStore => {
  const retainedIds = new Set(listIds);
  const lists = Object.values(store.lists).reduce<Record<string, ShoppingListMetadata>>(
    (retained, metadata) => {
      if (retainedIds.has(metadata.listId)) {
        retained[String(metadata.listId)] = metadata;
      }
      return retained;
    },
    {},
  );
  return { ...store, lists };
}