import type { EntityId } from './api';

export interface ShoppingListCollection {
  id: string;
  name: string;
}

export interface ShoppingListMetadata {
  archived: boolean;
  collectionId: string | null;
  favorite: boolean;
  listId: EntityId;
}

export interface ShoppingListMetadataStore {
  collections: ShoppingListCollection[];
  lists: Record<string, ShoppingListMetadata>;
  version: 1;
}