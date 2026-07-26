import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
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

import BuildListMascot from '../../assets/svg icons/Group 15.svg';
import BackIcon from '../../assets/svg icons/keyboard_arrow_up.svg';
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingList,
  listCatalogTags,
  replaceShoppingList,
  toApiError,
  updateShoppingListName,
} from '../api';
import { AppBottomNav, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import type {
  CatalogTag,
  ShoppingListItemInput,
  ShoppingListResponse,
} from '../types/api';
import type { ShoppingListMetadataStore } from '../types/savedLists';
import {
  loadShoppingListMetadata,
  metadataForList,
  saveShoppingListMetadata,
} from '../utils/savedListsStorage';
import { styles } from './NewShoppingListScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'NewShoppingList'>;

const NEW_LIST_NAME = 'Untitled list';

const emptyMetadataStore = (): ShoppingListMetadataStore => ({
  collections: [],
  lists: {},
  version: 1,
});

const normalizeValue = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

const normalizeTag = (value: string): string =>
  normalizeValue(value).toLowerCase();

const cloneItems = (
  items: readonly ShoppingListItemInput[],
): ShoppingListItemInput[] =>
  items.map((item) => ({
    ...item,
    modifiers: [...(item.modifiers ?? [])],
  }));

const itemsMatch = (
  first: readonly ShoppingListItemInput[],
  second: readonly ShoppingListItemInput[],
): boolean => JSON.stringify(first) === JSON.stringify(second);

const itemDetails = (
  item: ShoppingListItemInput,
  catalog: readonly CatalogTag[],
): string => {
  const catalogTag = catalog.find((candidate) => candidate.tag === item.tag);
  const quantity = item.quantity ?? catalogTag?.defaultQuantity;
  const unit = item.unit ?? catalogTag?.defaultUnit;
  return quantity === undefined || unit === undefined
    ? 'Defaults applied when saved'
    : `${quantity} ${unit}`;
};

export function NewShoppingListScreen({ navigation, route }: Props) {
  const listId = route.params?.listId;
  const [catalog, setCatalog] = useState<readonly CatalogTag[]>([]);
  const [baseline, setBaseline] = useState<ShoppingListResponse | null>(null);
  const [listName, setListName] = useState(route.params?.title ?? NEW_LIST_NAME);
  const [itemName, setItemName] = useState('');
  const [items, setItems] = useState<ShoppingListItemInput[]>([]);
  const [unresolvedItems, setUnresolvedItems] = useState<string[]>([]);
  const [metadata, setMetadata] = useState<ShoppingListMetadataStore>(emptyMetadataStore);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [isArchived, setIsArchived] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const mutationLocked = useRef(false);

  const normalizedListName = useMemo(() => normalizeValue(listName), [listName]);
  const normalizedItemName = useMemo(() => normalizeTag(itemName), [itemName]);
  const matchingTags = useMemo(
    () =>
      normalizedItemName
        ? catalog
            .filter(
              (tag) =>
                tag.tag.includes(normalizedItemName) &&
                !items.some((item) => item.tag === tag.tag),
            )
            .slice(0, 6)
        : [],
    [catalog, items, normalizedItemName],
  );
  const canAddItem = Boolean(normalizedItemName) && !isLoading && !isMutating;
  const canPersist =
    Boolean(normalizedListName) && items.length > 0 && !isLoading && !isMutating;

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setRequestError(null);
      setMetadataError(null);

      try {
        const [loadedCatalog, loadedList] = await Promise.all([
          listCatalogTags(),
          listId === undefined ? Promise.resolve(null) : getShoppingList(listId),
        ]);
        if (!active) {
          return;
        }

        setCatalog(loadedCatalog);
        if (loadedList) {
          setBaseline(loadedList);
          setListName(loadedList.name);
          setItems(cloneItems(loadedList.items));
        } else {
          const catalogTags = new Set(loadedCatalog.map((tag) => tag.tag));
          const initialCandidates = [
            ...(route.params?.initialTags ?? []),
            ...(route.params?.initialItems ?? []),
          ];
          const matchedTags = [...new Set(initialCandidates.map(normalizeTag))]
            .filter((tag) => catalogTags.has(tag));
          setItems(matchedTags.map((tag) => ({ tag, modifiers: [] })));
          setUnresolvedItems(
            (route.params?.initialItems ?? []).filter(
              (item: string) => !catalogTags.has(normalizeTag(item)),
            ),
          );
        }
      } catch (error: unknown) {
        if (active) {
          setRequestError(toApiError(error).message);
        }
      }

      try {
        const loadedMetadata = await loadShoppingListMetadata();
        if (active) {
          setMetadata(loadedMetadata);
          if (listId !== undefined) {
            const listMetadata = metadataForList(loadedMetadata, listId);
            setSelectedCollectionId(listMetadata.collectionId);
            setIsArchived(listMetadata.archived);
          }
        }
      } catch {
        if (active) {
          setMetadataError('List organization is unavailable on this device.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadData();
    return () => {
      active = false;
    };
  }, [listId, route.params?.initialItems, route.params?.initialTags]);

  const addItem = useCallback(
    (value = itemName) => {
      const tagId = normalizeTag(value);
      if (!tagId) {
        setItemError('Enter an item name.');
        return;
      }
      const catalogTag = catalog.find((tag) => tag.tag === tagId);
      if (!catalogTag) {
        setItemError(`"${normalizeValue(value)}" is not in the grocery catalog.`);
        return;
      }
      if (items.some((item) => item.tag === catalogTag.tag)) {
        setItemError(`${catalogTag.tag} is already on this list.`);
        return;
      }

      setItems((currentItems) => [
        ...currentItems,
        { tag: catalogTag.tag, modifiers: [] },
      ]);
      setUnresolvedItems((currentItems) =>
        currentItems.filter((item) => normalizeTag(item) !== tagId),
      );
      setItemName('');
      setItemError(null);
      setRequestError(null);
      Keyboard.dismiss();
    },
    [catalog, itemName, items],
  );

  const persistMetadataForList = useCallback(
    async (savedList: ShoppingListResponse) => {
      const nextMetadata: ShoppingListMetadataStore = {
        ...metadata,
        lists: {
          ...metadata.lists,
          [String(savedList.id)]: {
            archived: isArchived,
            collectionId: selectedCollectionId,
            favorite: metadataForList(metadata, savedList.id).favorite,
            listId: savedList.id,
          },
        },
      };
      try {
        await saveShoppingListMetadata(nextMetadata);
        setMetadata(nextMetadata);
        setMetadataError(null);
      } catch {
        setMetadataError('The list was saved, but local organization could not be updated.');
      }
    },
    [isArchived, metadata, selectedCollectionId],
  );

  const persistDraft = useCallback(async (): Promise<ShoppingListResponse | null> => {
    if (!canPersist || mutationLocked.current) {
      return null;
    }

    mutationLocked.current = true;
    setIsMutating(true);
    setRequestError(null);
    Keyboard.dismiss();

    try {
      let savedList: ShoppingListResponse;
      if (!baseline) {
        savedList = await createShoppingList({
          active: true,
          items: cloneItems(items),
          name: normalizedListName,
        });
      } else if (!itemsMatch(items, baseline.items)) {
        savedList = await replaceShoppingList(baseline.id, {
          active: baseline.active,
          items: cloneItems(items),
          name: normalizedListName,
        });
      } else if (normalizedListName !== baseline.name) {
        savedList = await updateShoppingListName(baseline.id, {
          name: normalizedListName,
        });
      } else {
        savedList = baseline;
      }

      setBaseline(savedList);
      setListName(savedList.name);
      setItems(cloneItems(savedList.items));
      await persistMetadataForList(savedList);
      return savedList;
    } catch (error: unknown) {
      setRequestError(toApiError(error).message);
      return null;
    } finally {
      mutationLocked.current = false;
      setIsMutating(false);
    }
  }, [baseline, canPersist, items, normalizedListName, persistMetadataForList]);

  const saveForLater = useCallback(async () => {
    const savedList = await persistDraft();
    if (savedList) {
      navigation.navigate('SavedLists');
    }
  }, [navigation, persistDraft]);

  const findBestRoute = useCallback(async () => {
    const savedList = await persistDraft();
    if (savedList) {
      navigation.navigate('RouteResults', {
        items: savedList.items.map((item) => item.tag),
        listId: savedList.id,
        listName: savedList.name,
      });
    }
  }, [navigation, persistDraft]);

  const addCollection = useCallback(async () => {
    const name = normalizeValue(newCollectionName);
    if (!name) {
      return;
    }
    if (
      metadata.collections.some(
        (collection) => collection.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      setMetadataError(`${name} already exists.`);
      return;
    }

    const collection = { id: `collection-${Date.now()}`, name };
    const nextMetadata = {
      ...metadata,
      collections: [...metadata.collections, collection],
    };
    try {
      await saveShoppingListMetadata(nextMetadata);
      setMetadata(nextMetadata);
      setSelectedCollectionId(collection.id);
      setNewCollectionName('');
      setMetadataError(null);
    } catch {
      setMetadataError('The collection could not be saved on this device.');
    }
  }, [metadata, newCollectionName]);

  const confirmDelete = useCallback(() => {
    if (!baseline || isMutating) {
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
          onPress: () => {
            void (async () => {
              if (mutationLocked.current) {
                return;
              }
              mutationLocked.current = true;
              setIsMutating(true);
              setRequestError(null);
              try {
                await deleteShoppingList(baseline.id);
                const nextLists = { ...metadata.lists };
                delete nextLists[String(baseline.id)];
                try {
                  await saveShoppingListMetadata({ ...metadata, lists: nextLists });
                } catch {
                  // The server deletion remains authoritative.
                }
                navigation.navigate('SavedLists');
              } catch (error: unknown) {
                setRequestError(toApiError(error).message);
              } finally {
                mutationLocked.current = false;
                setIsMutating(false);
              }
            })();
          },
        },
      ],
    );
  }, [baseline, isMutating, metadata, navigation]);

  if (isLoading) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <View style={styles.centeredState}>
          <ActivityIndicator color="#258043" size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.loadingText}>
            Loading the grocery catalog...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.designHeader}>
          <Pressable accessibilityLabel="Go back" onPress={() => navigation.goBack()} style={styles.backButton}><BackIcon height={25} width={25} /></Pressable>
          <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.designHeading}>{baseline ? 'Edit List' : 'Build a List'}</Text><Text style={styles.designSupporting}>Catalog-backed items save directly to Cartograph.</Text></View>
          <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}><DesignIcon name="person" size={23} /></Pressable>
        </View>

        <TextInput
          accessibilityLabel="Shopping list name"
          editable={!isMutating}
          onChangeText={setListName}
          placeholder="List name"
          style={styles.listNameInput}
          value={listName}
        />

        <View style={styles.searchInputRow}>
          <DesignIcon name="search" size={20} />
          <TextInput
            accessibilityLabel="Item name"
            onChangeText={setItemName}
            editable={!isMutating}
            onSubmitEditing={() => addItem()}
            placeholder="Search catalog items"
            placeholderTextColor="#8A8789"
            style={styles.designInput}
            value={itemName}
          />
          <Pressable accessibilityLabel="Add item" disabled={!canAddItem} onPress={() => addItem()}><Text style={styles.plus}>+</Text></Pressable>
        </View>

        {matchingTags.length > 0 ? (
          <View accessibilityLabel="Catalog suggestions" style={styles.suggestions}>
            {matchingTags.map((tag) => (
              <Pressable
                accessibilityLabel={`Add ${tag.tag}`}
                accessibilityRole="button"
                key={tag.tag}
                onPress={() => addItem(tag.tag)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.buttonDisabled]}
              >
                <Text style={styles.suggestionName}>{tag.tag}</Text>
                <Text style={styles.suggestionDetails}>{tag.defaultQuantity} {tag.defaultUnit}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {itemError ? <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{itemError}</Text> : null}

        <View style={styles.designListCard}>
          <View style={styles.listHeader}><Text style={styles.listTitle}>My List ({items.length})</Text><Pressable onPress={() => setItems([])}><Text style={styles.clearAll}>Clear All</Text></Pressable></View>
          {items.length > 0 ? (
          <View>
            {items.map((item) => (
              <View key={item.tag} style={styles.itemRow}>
                <Text style={styles.checkbox}>✓</Text>
                <Text style={styles.itemName}>{item.tag}</Text>
                <Text style={styles.itemPrice}>{itemDetails(item, catalog)}</Text>
                <Pressable
                  accessibilityLabel={`Remove ${item.tag}`}
                  accessibilityRole="button"
                  onPress={() =>
                    setItems((currentItems) =>
                      currentItems.filter((currentItem) => currentItem.tag !== item.tag),
                    )
                  }
                >
                  <Text style={styles.editText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
          ) : <Text style={styles.emptyList}>Add an item to begin your list.</Text>}
        </View>

        {unresolvedItems.length > 0 ? (
          <View style={styles.unresolvedCard}>
            <Text style={styles.unresolvedTitle}>Review imported items</Text>
            <Text style={styles.unresolvedText}>These names do not exactly match the current catalog.</Text>
            {unresolvedItems.map((item) => (
              <View key={item} style={styles.unresolvedRow}>
                <Pressable
                  accessibilityLabel={`Review ${item}`}
                  accessibilityRole="button"
                  onPress={() => setItemName(item)}
                  style={styles.unresolvedNameButton}
                >
                  <Text style={styles.unresolvedName}>{item}</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Dismiss ${item}`}
                  accessibilityRole="button"
                  onPress={() => setUnresolvedItems((current) => current.filter((value) => value !== item))}
                >
                  <Text style={styles.editText}>Dismiss</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.tipCard}><BuildListMascot height={64} width={64} /><Text style={styles.tipText}><Text style={styles.tipStrong}>Choose catalog matches.</Text>{'\n'}Units and quantities use catalog defaults unless they came from a saved list.</Text></View>

        <View style={styles.organizeCard}>
          <Text style={styles.organizeTitle}>Organize on this device</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.collectionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCollectionId === null }}
                onPress={() => setSelectedCollectionId(null)}
                style={[styles.collectionChip, selectedCollectionId === null && styles.collectionChipSelected]}
              >
                <Text style={[styles.collectionChipText, selectedCollectionId === null && styles.collectionChipTextSelected]}>Unfiled</Text>
              </Pressable>
              {metadata.collections.map((collection) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedCollectionId === collection.id }}
                  key={collection.id}
                  onPress={() => setSelectedCollectionId(collection.id)}
                  style={[styles.collectionChip, selectedCollectionId === collection.id && styles.collectionChipSelected]}
                >
                  <Text style={[styles.collectionChipText, selectedCollectionId === collection.id && styles.collectionChipTextSelected]}>{collection.name}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={styles.collectionInputRow}>
            <TextInput
              accessibilityLabel="New collection name"
              onChangeText={setNewCollectionName}
              onSubmitEditing={() => void addCollection()}
              placeholder="New collection"
              style={styles.collectionInput}
              value={newCollectionName}
            />
            <Pressable accessibilityLabel="Add collection" accessibilityRole="button" disabled={!normalizeValue(newCollectionName)} onPress={() => void addCollection()} style={({ pressed }) => [styles.collectionAddButton, (!normalizeValue(newCollectionName) || pressed) && styles.buttonDisabled]}>
              <Text style={styles.collectionAddText}>Add</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: isArchived }} onPress={() => setIsArchived((current) => !current)} style={styles.archiveRow}>
            <Text style={styles.checkbox}>{isArchived ? '✓' : ''}</Text>
            <Text style={styles.archiveText}>Archive this list</Text>
          </Pressable>
        </View>

        {requestError ? <Text accessibilityLiveRegion="assertive" style={styles.feedbackText}>{requestError}</Text> : null}
        {metadataError ? <Text accessibilityLiveRegion="polite" style={styles.metadataFeedback}>{metadataError}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable accessibilityLabel="Save shopping list for later" accessibilityRole="button" accessibilityState={{ busy: isMutating, disabled: !canPersist }} disabled={!canPersist} onPress={() => void saveForLater()} style={({ pressed }) => [styles.button, styles.saveLaterButton, (!canPersist || pressed) && styles.buttonDisabled]}>
            <Text style={styles.saveLaterText}>{isMutating ? 'Saving...' : 'Save for Later'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Find best route" accessibilityRole="button" accessibilityState={{ busy: isMutating, disabled: !canPersist }} disabled={!canPersist} onPress={() => void findBestRoute()} style={({ pressed }) => [styles.button, styles.routeButton, (!canPersist || pressed) && styles.buttonDisabled]}>
            {isMutating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Find Best Route</Text>}
          </Pressable>
        </View>
        {baseline ? (
          <Pressable accessibilityLabel="Delete shopping list" accessibilityRole="button" disabled={isMutating} onPress={confirmDelete} style={({ pressed }) => [styles.deleteButton, (pressed || isMutating) && styles.buttonDisabled]}>
            <Text style={styles.deleteButtonText}>Delete list</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      <AppBottomNav active="lists" navigation={navigation} />
    </SafeAreaView>
  );
}