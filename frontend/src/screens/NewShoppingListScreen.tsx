import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import type {
  SavedShoppingList,
  SavedShoppingListItem,
  ShoppingListCollection,
} from '../types/savedLists';
import {
  loadSavedListLibrary,
  saveSavedListLibrary,
  type SavedListLibrary,
} from '../utils/savedListsStorage';
import { styles } from './NewShoppingListScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'NewShoppingList'>;

const normalizeValue = (value: string): string => value.trim().replace(/\s+/g, ' ');

export function NewShoppingListScreen({ navigation, route }: Props) {
  const initialItems: string[] = route.params?.initialItems ?? [];
  const [listName, setListName] = useState(route.params?.title ?? 'Untitled list');
  const [itemName, setItemName] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [items, setItems] = useState<SavedShoppingListItem[]>(() =>
    initialItems.map((name) => ({ name, unitPrice: 0 })),
  );
  const [collections, setCollections] = useState<ShoppingListCollection[]>([]);
  const [savedLists, setSavedLists] = useState<SavedShoppingList[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedListName = useMemo(() => normalizeValue(listName), [listName]);
  const normalizedItemName = useMemo(() => normalizeValue(itemName), [itemName]);
  const parsedPrice = useMemo(() => Number(unitPrice), [unitPrice]);
  const normalizedCollectionName = useMemo(
    () => normalizeValue(newCollectionName),
    [newCollectionName],
  );
  const canAddItem = Boolean(normalizedItemName) && Number.isFinite(parsedPrice) && parsedPrice > 0;
  const canSave =
    Boolean(normalizedListName) && items.length > 0 && Boolean(selectedCollectionId) && !isSaving;

  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const library = await loadSavedListLibrary();
        setCollections(library.collections);
        setSavedLists(library.lists);
        setSelectedCollectionId(library.collections[0]?.id ?? null);
      } catch {
        setError('Saved lists could not be loaded.');
      }
    };

    void loadLibrary();
  }, []);

  const persistLibrary = useCallback(async (library: SavedListLibrary): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      await saveSavedListLibrary(library);
      setCollections(library.collections);
      setSavedLists(library.lists);
      return true;
    } catch {
      setError('Saved lists could not be updated.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const addItem = useCallback(() => {
    if (!canAddItem) {
      setError('Enter an item name and a unit price greater than zero.');
      return;
    }

    const alreadyExists = items.some(
      (item) => item.name.toLocaleLowerCase() === normalizedItemName.toLocaleLowerCase(),
    );
    if (alreadyExists) {
      setError(`${normalizedItemName} is already on this list.`);
      return;
    }

    setItems((currentItems) => [
      ...currentItems,
      { name: normalizedItemName, unitPrice: parsedPrice },
    ]);
    setItemName('');
    setUnitPrice('');
    setError(null);
  }, [canAddItem, items, normalizedItemName, parsedPrice]);

  const addCollection = useCallback(async () => {
    if (!normalizedCollectionName || isSaving) {
      return;
    }

    const alreadyExists = collections.some(
      (collection) =>
        collection.name.toLocaleLowerCase() === normalizedCollectionName.toLocaleLowerCase(),
    );
    if (alreadyExists) {
      setError(`${normalizedCollectionName} already exists.`);
      return;
    }

    const collection: ShoppingListCollection = {
      id: `collection-${Date.now()}`,
      name: normalizedCollectionName,
    };
    const wasSaved = await persistLibrary({
      collections: [...collections, collection],
      lists: savedLists,
    });
    if (wasSaved) {
      setSelectedCollectionId(collection.id);
      setNewCollectionName('');
    }
  }, [collections, isSaving, normalizedCollectionName, persistLibrary, savedLists]);

  const saveList = useCallback(async () => {
    if (!canSave || !selectedCollectionId) {
      setError('Add at least one item and select a collection before saving.');
      return;
    }

    Keyboard.dismiss();
    const savedList: SavedShoppingList = {
      id: `list-${Date.now()}`,
      name: normalizedListName,
      items: items.map((item) => item.name),
      pricedItems: items,
      collectionId: selectedCollectionId,
      updatedAt: new Date().toISOString(),
    };
    const wasSaved = await persistLibrary({
      collections,
      lists: [savedList, ...savedLists],
    });
    if (wasSaved) {
      navigation.goBack();
    }
  }, [canSave, collections, items, navigation, normalizedListName, persistLibrary, savedLists, selectedCollectionId]);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={styles.heading}>
          New shopping list
        </Text>
        <Text style={styles.supportingText}>
          Add the items you need and their unit prices for quick reference.
        </Text>

        <Text style={styles.label}>List name</Text>
        <TextInput
          accessibilityLabel="List name"
          onChangeText={setListName}
          placeholder="List name"
          style={styles.input}
          value={listName}
        />

        <Text style={styles.label}>Add item</Text>
        <View style={styles.itemInputRow}>
          <TextInput
            accessibilityLabel="Item name"
            onChangeText={setItemName}
            placeholder="Item"
            style={[styles.input, styles.itemNameInput]}
            value={itemName}
          />
          <TextInput
            accessibilityLabel="Unit price"
            keyboardType="decimal-pad"
            onChangeText={setUnitPrice}
            placeholder="$0.00"
            style={[styles.input, styles.priceInput]}
            value={unitPrice}
          />
        </View>
        <Pressable
          accessibilityLabel="Add item with unit price"
          accessibilityRole="button"
          onPress={addItem}
          style={({ pressed }) => [
            styles.button,
            styles.addButton,
            (!canAddItem || pressed) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>Add item</Text>
        </Pressable>

        {items.length > 0 ? (
          <View style={styles.itemList}>
            {items.map((item) => (
              <View key={item.name.toLocaleLowerCase()} style={styles.itemRow}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemPrice}>
                  {item.unitPrice > 0 ? `$${item.unitPrice.toFixed(2)}` : 'Price pending'}
                </Text>
                <Pressable
                  accessibilityLabel={`Remove ${item.name}`}
                  accessibilityRole="button"
                  onPress={() =>
                    setItems((currentItems) =>
                      currentItems.filter((currentItem) => currentItem.name !== item.name),
                    )
                  }
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <Text style={styles.label}>Collection</Text>
        <View style={styles.collectionRow}>
          {collections.map((collection) => (
            <Pressable
              accessibilityRole="button"
              key={collection.id}
              onPress={() => setSelectedCollectionId(collection.id)}
              style={[
                styles.collectionButton,
                collection.id === selectedCollectionId && styles.collectionButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.collectionText,
                  collection.id === selectedCollectionId && styles.collectionTextSelected,
                ]}
              >
                {collection.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.collectionInputRow}>
          <TextInput
            accessibilityLabel="New collection name"
            onChangeText={setNewCollectionName}
            onSubmitEditing={() => void addCollection()}
            placeholder="New collection"
            style={[styles.input, styles.collectionInput]}
            value={newCollectionName}
          />
          <Pressable
            accessibilityLabel="Create collection"
            accessibilityRole="button"
            disabled={!normalizedCollectionName || isSaving}
            onPress={() => void addCollection()}
            style={({ pressed }) => [
              styles.button,
              styles.createButton,
              (!normalizedCollectionName || isSaving || pressed) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.createButtonText}>Create</Text>
          </Pressable>
        </View>

        {error ? <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{error}</Text> : null}

        <Pressable
          accessibilityLabel="Save shopping list"
          accessibilityRole="button"
          disabled={!canSave}
          onPress={() => void saveList()}
          style={({ pressed }) => [
            styles.button,
            styles.saveButton,
            (!canSave || pressed) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.buttonText}>{isSaving ? 'Saving…' : 'Save list'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}