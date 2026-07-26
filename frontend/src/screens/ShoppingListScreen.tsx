import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  createShoppingList,
  deleteShoppingList,
  getShoppingList,
  listCatalogTags,
  listShoppingLists,
  replaceShoppingList,
  toApiError,
  updateShoppingListName,
} from '../api';
import type { MainTabScreenProps } from '../navigation/types';
import type {
  CatalogTag,
  EntityId,
  ShoppingListItemInput,
  ShoppingListResponse,
} from '../types/api';
import { styles } from './ShoppingListScreen.styles';

type Props = MainTabScreenProps<'ShoppingList'>;

const NEW_LIST_NAME = 'Untitled list';

const normalizeTag = (value: string): string => value.trim().toLowerCase();

const cloneItems = (
  items: readonly ShoppingListItemInput[],
): ShoppingListItemInput[] =>
  items.map((item) => ({
    ...item,
    modifiers: [...(item.modifiers ?? [])],
  }));

const itemsMatch = (
  draftItems: readonly ShoppingListItemInput[],
  serverItems: readonly ShoppingListItemInput[],
): boolean =>
  JSON.stringify(draftItems) === JSON.stringify(serverItems);

const upsertList = (
  lists: readonly ShoppingListResponse[],
  updatedList: ShoppingListResponse,
): ShoppingListResponse[] =>
  [...lists.filter((list) => list.id !== updatedList.id), updatedList].sort(
    (first, second) => first.id - second.id,
  );

const itemDetails = (
  item: ShoppingListItemInput,
  catalog: readonly CatalogTag[],
): string => {
  const tag = catalog.find((candidate) => candidate.tag === item.tag);
  const quantity = item.quantity ?? tag?.defaultQuantity;
  const unit = item.unit ?? tag?.defaultUnit;
  if (quantity === undefined || unit === undefined) {
    return 'Defaults applied when saved';
  }
  return `${quantity} ${unit}${item.unit == null ? ' default' : ''}`;
};

export function ShoppingListScreen(_props: Props) {
  const [catalog, setCatalog] = useState<readonly CatalogTag[]>([]);
  const [shoppingLists, setShoppingLists] = useState<readonly ShoppingListResponse[]>([]);
  const [selectedListId, setSelectedListId] = useState<EntityId | null>(null);
  const [baseline, setBaseline] = useState<ShoppingListResponse | null>(null);
  const [listName, setListName] = useState(NEW_LIST_NAME);
  const [items, setItems] = useState<ShoppingListItemInput[]>([]);
  const [itemInput, setItemInput] = useState('');
  const [itemError, setItemError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const loadRequest = useRef(0);
  const selectionRequest = useRef(0);
  const mutationLocked = useRef(false);

  const normalizedItemInput = useMemo(() => normalizeTag(itemInput), [itemInput]);
  const normalizedListName = listName.trim();
  const matchingTags = useMemo(
    () =>
      normalizedItemInput
        ? catalog
            .filter((tag) => tag.tag.includes(normalizedItemInput))
            .slice(0, 6)
        : [],
    [catalog, normalizedItemInput],
  );
  const hasChanges = baseline
    ? normalizedListName !== baseline.name || !itemsMatch(items, baseline.items)
    : true;
  const canSave =
    Boolean(normalizedListName) &&
    items.length > 0 &&
    hasChanges &&
    !isMutating &&
    !isLoadingList;
  const canAddItem = Boolean(normalizedItemInput) && !isMutating && !isLoadingList;

  const applyServerList = useCallback((shoppingList: ShoppingListResponse) => {
    setSelectedListId(shoppingList.id);
    setBaseline(shoppingList);
    setListName(shoppingList.name);
    setItems(cloneItems(shoppingList.items));
    setItemInput('');
    setItemError(null);
  }, []);

  const resetDraft = useCallback(() => {
    selectionRequest.current += 1;
    setSelectedListId(null);
    setBaseline(null);
    setListName(NEW_LIST_NAME);
    setItems([]);
    setItemInput('');
    setItemError(null);
    setRequestError(null);
    setStatusMessage(null);
  }, []);

  const loadData = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setIsLoading(true);
    setRequestError(null);

    try {
      const [loadedCatalog, loadedLists] = await Promise.all([
        listCatalogTags(),
        listShoppingLists(),
      ]);
      if (requestId !== loadRequest.current) {
        return;
      }
      setCatalog(loadedCatalog);
      setShoppingLists(loadedLists);
    } catch (error: unknown) {
      if (requestId === loadRequest.current) {
        setRequestError(toApiError(error).message);
      }
    } finally {
      if (requestId === loadRequest.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      return () => {
        loadRequest.current += 1;
        selectionRequest.current += 1;
      };
    }, [loadData]),
  );

  const loadList = useCallback(
    async (id: EntityId) => {
      if (isMutating) {
        return;
      }
      const requestId = ++selectionRequest.current;
      setIsLoadingList(true);
      setRequestError(null);
      setStatusMessage(null);

      try {
        const loadedList = await getShoppingList(id);
        if (requestId === selectionRequest.current) {
          applyServerList(loadedList);
        }
      } catch (error: unknown) {
        if (requestId === selectionRequest.current) {
          setRequestError(toApiError(error).message);
        }
      } finally {
        if (requestId === selectionRequest.current) {
          setIsLoadingList(false);
        }
      }
    },
    [applyServerList, isMutating],
  );

  const addItem = useCallback(
    (value = itemInput) => {
      const tagId = normalizeTag(value);
      if (!tagId) {
        setItemError('Enter an item before adding it.');
        return;
      }
      const catalogTag = catalog.find((tag) => tag.tag === tagId);
      if (!catalogTag) {
        setItemError(`“${value.trim()}” is not in the current grocery catalog.`);
        return;
      }
      if (items.some((item) => item.tag === catalogTag.tag)) {
        setItemError(`${catalogTag.tag} is already on your list.`);
        return;
      }

      setItems((currentItems) => [
        ...currentItems,
        { tag: catalogTag.tag, modifiers: [] },
      ]);
      setItemInput('');
      setItemError(null);
      setRequestError(null);
      setStatusMessage(null);
      Keyboard.dismiss();
    },
    [catalog, itemInput, items],
  );

  const removeItem = useCallback((tag: string) => {
    setItems((currentItems) => currentItems.filter((item) => item.tag !== tag));
    setItemError(null);
    setStatusMessage(null);
  }, []);

  const saveList = useCallback(async () => {
    if (!canSave || mutationLocked.current) {
      return;
    }
    mutationLocked.current = true;
    setIsMutating(true);
    setRequestError(null);
    setStatusMessage(null);

    try {
      let savedList: ShoppingListResponse;
      if (!baseline || selectedListId === null) {
        savedList = await createShoppingList({
          name: normalizedListName,
          items: cloneItems(items),
          active: true,
        });
      } else if (!itemsMatch(items, baseline.items)) {
        savedList = await replaceShoppingList(selectedListId, {
          name: normalizedListName,
          items: cloneItems(items),
          active: baseline.active,
        });
      } else {
        savedList = await updateShoppingListName(selectedListId, {
          name: normalizedListName,
        });
      }

      applyServerList(savedList);
      setShoppingLists((currentLists) => upsertList(currentLists, savedList));
      setStatusMessage(
        baseline ? 'Shopping list changes saved.' : 'Shopping list created.',
      );
    } catch (error: unknown) {
      setRequestError(toApiError(error).message);
    } finally {
      mutationLocked.current = false;
      setIsMutating(false);
    }
  }, [applyServerList, baseline, canSave, items, normalizedListName, selectedListId]);

  const deleteSelectedList = useCallback(
    async (id: EntityId) => {
      if (mutationLocked.current) {
        return;
      }
      mutationLocked.current = true;
      setIsMutating(true);
      setRequestError(null);
      setStatusMessage(null);

      try {
        await deleteShoppingList(id);
        const remainingLists = await listShoppingLists();
        setShoppingLists(remainingLists);
        resetDraft();
        setStatusMessage('Shopping list deleted.');
      } catch (error: unknown) {
        setRequestError(toApiError(error).message);
      } finally {
        mutationLocked.current = false;
        setIsMutating(false);
      }
    },
    [resetDraft],
  );

  const confirmDelete = useCallback(() => {
    if (selectedListId === null || isMutating) {
      return;
    }
    Alert.alert(
      'Delete shopping list?',
      'This removes the list from Cartograph and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteSelectedList(selectedListId),
        },
      ],
    );
  }, [deleteSelectedList, isMutating, selectedListId]);

  if (isLoading && catalog.length === 0 && shoppingLists.length === 0) {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <View style={styles.centeredState}>
          <ActivityIndicator color="#245C36" size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.stateText}>
            Loading shopping lists…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.heading}>
              Shopping lists
            </Text>
            <Text style={styles.supportingText}>
              Lists here are saved to Cartograph.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Create a new shopping list draft"
            accessibilityRole="button"
            disabled={isMutating}
            onPress={resetDraft}
            style={({ pressed }) => [
              styles.newButton,
              (pressed || isMutating) && styles.buttonDisabled,
            ]}
          >
            <Text style={styles.newButtonText}>New list</Text>
          </Pressable>
        </View>

        {requestError ? (
          <View style={styles.errorBanner}>
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              {requestError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void loadData()}
              style={styles.retryButton}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {statusMessage ? (
          <Text accessibilityLiveRegion="polite" style={styles.successText}>
            {statusMessage}
          </Text>
        ) : null}

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            Saved on Cartograph
          </Text>
          {shoppingLists.length === 0 ? (
            <Text style={styles.emptyListsText}>No server lists yet.</Text>
          ) : (
            <View style={styles.savedListRows}>
              {shoppingLists.map((shoppingList) => {
                const isSelected = selectedListId === shoppingList.id;
                return (
                  <Pressable
                    accessibilityLabel={`Load ${shoppingList.name}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    disabled={isMutating}
                    key={shoppingList.id}
                    onPress={() => void loadList(shoppingList.id)}
                    style={({ pressed }) => [
                      styles.savedListRow,
                      isSelected && styles.savedListRowSelected,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.savedListCopy}>
                      <Text style={styles.savedListName}>{shoppingList.name}</Text>
                      <Text style={styles.savedListDetails}>
                        {shoppingList.items.length} {shoppingList.items.length === 1 ? 'item' : 'items'} · {shoppingList.status}
                      </Text>
                    </View>
                    <Text style={styles.loadText}>{isSelected ? 'Selected' : 'Load'}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          {isLoadingList ? (
            <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
              Loading selected list…
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>
            {baseline ? 'Edit list' : 'Create list'}
          </Text>
          <TextInput
            accessibilityLabel="Shopping list name"
            editable={!isMutating && !isLoadingList}
            onChangeText={(value) => {
              setListName(value);
              setStatusMessage(null);
            }}
            placeholder="List name"
            style={styles.listNameInput}
            value={listName}
          />

          <View style={styles.itemInputRow}>
            <TextInput
              accessibilityLabel="Grocery catalog item"
              autoCapitalize="none"
              editable={!isMutating && !isLoadingList}
              onChangeText={(value) => {
                setItemInput(value);
                setItemError(null);
              }}
              onSubmitEditing={() => addItem()}
              placeholder="Search catalog tags"
              returnKeyType="done"
              style={styles.itemInput}
              value={itemInput}
            />
            <Pressable
              accessibilityLabel="Add grocery item"
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAddItem }}
              disabled={!canAddItem}
              onPress={() => addItem()}
              style={({ pressed }) => [
                styles.addButton,
                (!canAddItem || pressed) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>

          {matchingTags.length > 0 ? (
            <View accessibilityLabel="Catalog suggestions" style={styles.suggestions}>
              {matchingTags.map((tag) => (
                <Pressable
                  accessibilityLabel={`Add ${tag.tag}`}
                  accessibilityRole="button"
                  disabled={isMutating || isLoadingList}
                  key={tag.tag}
                  onPress={() => addItem(tag.tag)}
                  style={({ pressed }) => [
                    styles.suggestion,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Text style={styles.suggestionText}>{tag.tag}</Text>
                  <Text style={styles.suggestionDefault}>
                    {tag.defaultQuantity} {tag.defaultUnit}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {itemError ? (
            <Text accessibilityLiveRegion="polite" style={styles.itemErrorText}>
              {itemError}
            </Text>
          ) : null}

          <View style={styles.itemRows}>
            {items.length === 0 ? (
              <View style={styles.emptyItems}>
                <Text style={styles.emptyTitle}>Your list is empty</Text>
                <Text style={styles.emptyText}>Add a catalog item to begin.</Text>
              </View>
            ) : (
              items.map((item) => (
                <View key={item.tag} style={styles.itemRow}>
                  <View style={styles.itemCopy}>
                    <Text style={styles.itemName}>{item.tag}</Text>
                    <Text style={styles.itemDetails}>{itemDetails(item, catalog)}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={`Remove ${item.tag}`}
                    accessibilityRole="button"
                    disabled={isMutating || isLoadingList}
                    hitSlop={8}
                    onPress={() => removeItem(item.tag)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>

          <View style={styles.actionRow}>
            {selectedListId !== null ? (
              <Pressable
                accessibilityLabel="Delete shopping list"
                accessibilityRole="button"
                accessibilityState={{ busy: isMutating, disabled: isMutating }}
                disabled={isMutating}
                onPress={confirmDelete}
                style={({ pressed }) => [
                  styles.deleteButton,
                  (pressed || isMutating) && styles.buttonDisabled,
                ]}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityLabel={baseline ? 'Save shopping list changes' : 'Create shopping list'}
              accessibilityRole="button"
              accessibilityState={{ busy: isMutating, disabled: !canSave }}
              disabled={!canSave}
              onPress={() => void saveList()}
              style={({ pressed }) => [
                styles.saveButton,
                (!canSave || pressed) && styles.buttonDisabled,
              ]}
            >
              {isMutating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>
                  {baseline ? 'Save changes' : 'Create list'}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
