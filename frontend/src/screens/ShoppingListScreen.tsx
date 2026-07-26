import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createList, toApiError } from '../api';
import type { CreateListRequest, ListResponse } from '../types/api';
import type { RootStackParamList } from '../navigation/types';
import type { SavedShoppingList, ShoppingListCollection } from '../types/savedLists';
import {
  loadSavedListLibrary,
  saveSavedListLibrary,
  type SavedListLibrary,
} from '../utils/savedListsStorage';
import { styles } from './ShoppingListScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'ShoppingList'>;

interface ShoppingListRequest extends CreateListRequest {
  readonly items: string[];
}

interface ShoppingListResponse extends ListResponse {
  readonly id?: unknown;
}

const normalizeItem = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

export function ShoppingListScreen({ navigation }: Props) {
  const [input, setInput] = useState('');
  const [items, setItems] = useState<string[]>([]);
  const [listName, setListName] = useState('Untitled list');
  const [collections, setCollections] = useState<ShoppingListCollection[]>([]);
  const [savedLists, setSavedLists] = useState<SavedShoppingList[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedInput = useMemo(() => normalizeItem(input), [input]);
  const canAddItem = normalizedInput.length > 0 && !isSubmitting;
  const canFindRoute = items.length > 0 && !isSubmitting;
  const normalizedListName = useMemo(() => normalizeItem(listName), [listName]);
  const normalizedCollectionName = useMemo(
    () => normalizeItem(newCollectionName),
    [newCollectionName],
  );
  const canSaveList =
    items.length > 0 && Boolean(normalizedListName) && Boolean(selectedCollectionId) && !isSaving;

  useFocusEffect(useCallback(() => {
    const loadLibrary = async () => {
      try {
        const library = await loadSavedListLibrary();
        setCollections(library.collections);
        setSavedLists(library.lists);
        setSelectedCollectionId(library.collections[0]?.id ?? null);
      } catch {
        setSaveError('Saved lists could not be loaded.');
      }
    };

    void loadLibrary();
  }, []));

  const persistLibrary = useCallback(async (library: SavedListLibrary) => {
    setIsSaving(true);
    setSaveError(null);

    try {
      await saveSavedListLibrary(library);
      setCollections(library.collections);
      setSavedLists(library.lists);
    } catch {
      setSaveError('Saved lists could not be updated.');
    } finally {
      setIsSaving(false);
    }
  }, []);

  const addItem = useCallback(() => {
    const item = normalizeItem(input);

    if (!item) {
      setInputError('Enter an item before adding it.');
      return;
    }

    const isDuplicate = items.some(
      (existingItem) => existingItem.toLocaleLowerCase() === item.toLocaleLowerCase(),
    );
    if (isDuplicate) {
      setInputError(`${item} is already on your list.`);
      return;
    }

    setItems((currentItems) => [...currentItems, item]);
    setInput('');
    setInputError(null);
    setSubmitError(null);
  }, [input, items]);

  const removeItem = useCallback((itemToRemove: string) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item !== itemToRemove),
    );
    setInputError(null);
    setSubmitError(null);
  }, []);

  const addCollection = useCallback(async () => {
    if (!normalizedCollectionName || isSaving) {
      return;
    }

    const alreadyExists = collections.some(
      (collection) =>
        collection.name.toLocaleLowerCase() === normalizedCollectionName.toLocaleLowerCase(),
    );
    if (alreadyExists) {
      setSaveError(`${normalizedCollectionName} already exists.`);
      return;
    }

    const collection: ShoppingListCollection = {
      id: `collection-${Date.now()}`,
      name: normalizedCollectionName,
    };
    const library = { collections: [...collections, collection], lists: savedLists };
    await persistLibrary(library);
    setSelectedCollectionId(collection.id);
    setNewCollectionName('');
  }, [collections, isSaving, normalizedCollectionName, persistLibrary, savedLists]);

  const saveCurrentList = useCallback(async () => {
    if (!canSaveList || !selectedCollectionId) {
      return;
    }

    const savedList: SavedShoppingList = {
      id: `list-${Date.now()}`,
      name: normalizedListName,
      items: [...items],
      collectionId: selectedCollectionId,
      updatedAt: new Date().toISOString(),
    };
    await persistLibrary({ collections, lists: [savedList, ...savedLists] });
  }, [canSaveList, collections, items, normalizedListName, persistLibrary, savedLists, selectedCollectionId]);

  const loadSavedList = useCallback((savedList: SavedShoppingList) => {
    setListName(savedList.name);
    setItems([...savedList.items]);
    setSelectedCollectionId(savedList.collectionId);
    setInputError(null);
    setSubmitError(null);
  }, []);

  const findBestRoute = useCallback(async () => {
    if (items.length === 0 || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    Keyboard.dismiss();

    try {
      const createdList = await createList<
        ShoppingListResponse,
        ShoppingListRequest
      >({ items });
      const listId =
        typeof createdList.id === 'string' && createdList.id.trim()
          ? createdList.id
          : undefined;

      navigation.navigate('RouteResults', {
        items: [...items],
        listId,
      });
    } catch (error: unknown) {
      setSubmitError(toApiError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, items, navigation]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.heading}>
          What do you need?
        </Text>
        <Text style={styles.supportingText}>
          Add grocery items, then find the best shopping route.
        </Text>

        <Pressable
          accessibilityLabel="Create a new shopping list"
          accessibilityRole="button"
          onPress={() => navigation.navigate('NewShoppingList')}
          style={({ pressed }) => [styles.newListButton, pressed && styles.buttonDisabled]}
        >
          <Text style={styles.newListButtonText}>New list</Text>
        </Pressable>

        <View style={styles.savePanel}>
          <Text style={styles.sectionTitle}>Saved lists</Text>
          <TextInput
            accessibilityLabel="Shopping list name"
            editable={!isSaving && !isSubmitting}
            onChangeText={setListName}
            placeholder="List name"
            style={styles.listNameInput}
            value={listName}
          />
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
                    styles.collectionButtonText,
                    collection.id === selectedCollectionId && styles.collectionButtonTextSelected,
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
              editable={!isSaving && !isSubmitting}
              onChangeText={setNewCollectionName}
              onSubmitEditing={() => void addCollection()}
              placeholder="New collection"
              returnKeyType="done"
              style={styles.collectionInput}
              value={newCollectionName}
            />
            <Pressable
              accessibilityLabel="Add collection"
              accessibilityRole="button"
              disabled={!normalizedCollectionName || isSaving}
              onPress={() => void addCollection()}
              style={({ pressed }) => [
                styles.secondaryButton,
                (!normalizedCollectionName || isSaving || pressed) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.secondaryButtonText}>Create</Text>
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="Save shopping list"
            accessibilityRole="button"
            disabled={!canSaveList}
            onPress={() => void saveCurrentList()}
            style={({ pressed }) => [
              styles.saveButton,
              (!canSaveList || pressed) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.saveButtonText}>Save to collection</Text>
          </Pressable>
          {saveError ? <Text style={styles.feedbackText}>{saveError}</Text> : null}
          {savedLists.length > 0 ? (
            <View style={styles.savedListRows}>
              {savedLists.map((savedList) => {
                const collection = collections.find(
                  (candidate) => candidate.id === savedList.collectionId,
                );

                return (
                  <Pressable
                    accessibilityLabel={`Load ${savedList.name}`}
                    accessibilityRole="button"
                    key={savedList.id}
                    onPress={() => loadSavedList(savedList)}
                    style={styles.savedListRow}
                  >
                    <View style={styles.savedListCopy}>
                      <Text style={styles.savedListName}>{savedList.name}</Text>
                      <Text style={styles.savedListDetails}>
                        {collection?.name ?? 'Uncategorized'} · {savedList.items.length} items
                      </Text>
                    </View>
                    <Text style={styles.loadText}>Load</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Grocery item"
            editable={!isSubmitting}
            onChangeText={(value) => {
              setInput(value);
              setInputError(null);
            }}
            onSubmitEditing={addItem}
            placeholder="Add an item"
            returnKeyType="done"
            style={styles.input}
            value={input}
          />
          <Pressable
            accessibilityLabel="Add grocery item"
            accessibilityRole="button"
            disabled={!canAddItem}
            onPress={addItem}
            style={({ pressed }) => [
              styles.button,
              styles.addButton,
              (!canAddItem || pressed) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.buttonText}>Add</Text>
          </Pressable>
        </View>

        {inputError ? (
          <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>
            {inputError}
          </Text>
        ) : null}

        <FlatList
          contentContainerStyle={styles.listContent}
          data={items}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => item.toLocaleLowerCase()}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Your list is empty</Text>
              <Text style={styles.emptyText}>
                Add your first grocery item above.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.item}>
              <Text style={styles.itemText}>{item}</Text>
              <Pressable
                accessibilityLabel={`Remove ${item}`}
                accessibilityRole="button"
                disabled={isSubmitting}
                hitSlop={8}
                onPress={() => removeItem(item)}
                style={styles.removeButton}
              >
                <Text style={styles.removeButtonText}>Remove</Text>
              </Pressable>
            </View>
          )}
          style={styles.list}
        />

        {submitError ? (
          <Text accessibilityLiveRegion="assertive" style={styles.feedbackText}>
            {submitError}
          </Text>
        ) : null}

        <Pressable
          accessibilityLabel="Find best route"
          accessibilityRole="button"
          accessibilityState={{ busy: isSubmitting, disabled: !canFindRoute }}
          disabled={!canFindRoute}
          onPress={findBestRoute}
          style={({ pressed }) => [
            styles.button,
            styles.primaryButton,
            (!canFindRoute || pressed) && styles.buttonDisabled,
          ]}
        >
          {isSubmitting ? (
            <View style={styles.loadingContent}>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.buttonText}>Finding Route…</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Find Best Route</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
