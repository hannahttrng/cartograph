import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SavedShoppingList, ShoppingListCollection } from '../types/savedLists';

const STORAGE_KEY = '@cartograph/saved-shopping-lists';

export interface SavedListLibrary {
  collections: ShoppingListCollection[];
  lists: SavedShoppingList[];
}

const emptyLibrary = (): SavedListLibrary => ({ collections: [], lists: [] });

export async function loadSavedListLibrary(): Promise<SavedListLibrary> {
  const serializedLibrary = await AsyncStorage.getItem(STORAGE_KEY);
  if (!serializedLibrary) {
    return emptyLibrary();
  }

  const library: unknown = JSON.parse(serializedLibrary);
  if (
    !library ||
    typeof library !== 'object' ||
    !Array.isArray((library as SavedListLibrary).collections) ||
    !Array.isArray((library as SavedListLibrary).lists)
  ) {
    return emptyLibrary();
  }

  return library as SavedListLibrary;
}

export async function saveSavedListLibrary(library: SavedListLibrary): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}