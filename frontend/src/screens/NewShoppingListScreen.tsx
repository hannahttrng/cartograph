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
import {
  createShoppingList,
  deleteShoppingList,
  getShoppingList,
  listCatalogTags,
  listShoppingLists,
  listTagModifiers,
  replaceShoppingList,
  startRouteCalculation,
  toApiError,
  updateShoppingListActive,
  updateShoppingListName,
} from '../api';
import { AppBottomNav, BackButton, DesignIcon } from '../components/common';
import { ModifierSelector } from '../components/list/ModifierSelector';
import type { RootStackParamList } from '../navigation/types';
import type {
  CatalogTag,
  ShoppingListItemInput,
  ShoppingListResponse,
} from '../types/api';
import { formatTagLabel } from '../utils/tags';
import { styles } from './NewShoppingListScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'NewShoppingList'>;

const NEW_LIST_NAME = 'Untitled list';

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

interface PersistDraftResult {
  savedList: ShoppingListResponse;
  routeCalculationTriggered: boolean;
}

interface ModifierOptionsState {
  error: string | null;
  isLoading: boolean;
  options: readonly string[];
}

export function NewShoppingListScreen({ navigation, route }: Props) {
  const listId = route.params?.listId;
  const [catalog, setCatalog] = useState<readonly CatalogTag[]>([]);
  const [baseline, setBaseline] = useState<ShoppingListResponse | null>(null);
  const [listName, setListName] = useState(route.params?.title ?? NEW_LIST_NAME);
  const [itemName, setItemName] = useState(route.params?.initialSearch ?? '');
  const [items, setItems] = useState<ShoppingListItemInput[]>([]);
  const [expandedItemTag, setExpandedItemTag] = useState<string | null>(null);
  const [modifierOptionsByTag, setModifierOptionsByTag] = useState<
    Readonly<Record<string, ModifierOptionsState>>
  >({});
  const [unresolvedItems, setUnresolvedItems] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [itemError, setItemError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const mutationLocked = useRef(false);
  const isMounted = useRef(true);

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
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      setIsLoading(true);
      setRequestError(null);

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
          setIsActive(loadedList.active);
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

  const loadModifierOptions = useCallback(async (tag: string) => {
    setModifierOptionsByTag((current) => ({
      ...current,
      [tag]: {
        error: null,
        isLoading: true,
        options: current[tag]?.options ?? [],
      },
    }));
    try {
      const options = await listTagModifiers(tag);
      if (isMounted.current) {
        setModifierOptionsByTag((current) => ({
          ...current,
          [tag]: { error: null, isLoading: false, options },
        }));
      }
    } catch (error: unknown) {
      if (isMounted.current) {
        setModifierOptionsByTag((current) => ({
          ...current,
          [tag]: {
            error: toApiError(error).message,
            isLoading: false,
            options: current[tag]?.options ?? [],
          },
        }));
      }
    }
  }, []);

  const toggleModifierSelector = useCallback((tag: string) => {
    setExpandedItemTag((current) => current === tag ? null : tag);
    if (!modifierOptionsByTag[tag]) {
      void loadModifierOptions(tag);
    }
  }, [loadModifierOptions, modifierOptionsByTag]);

  const toggleItemModifier = useCallback((tag: string, modifier: string) => {
    setItems((currentItems) => currentItems.map((item) => {
      if (item.tag !== tag) return item;
      const nextModifiers = new Set(item.modifiers ?? []);
      if (nextModifiers.has(modifier)) {
        nextModifiers.delete(modifier);
      } else {
        nextModifiers.add(modifier);
      }
      return { ...item, modifiers: [...nextModifiers].sort() };
    }));
  }, []);

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
        setItemError(`${formatTagLabel(catalogTag.tag)} is already on this list.`);
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

  const persistDraft = useCallback(async (
    options: { forceActive?: boolean } = {},
  ): Promise<PersistDraftResult | null> => {
    if (!canPersist || mutationLocked.current) {
      return null;
    }

    mutationLocked.current = true;
    setIsMutating(true);
    setRequestError(null);
    Keyboard.dismiss();

    try {
      let savedList: ShoppingListResponse;
      let routeCalculationTriggered: boolean;
      const desiredActive = options.forceActive ? true : isActive;
      if (!baseline) {
        savedList = await createShoppingList({
          active: desiredActive,
          items: cloneItems(items),
          name: normalizedListName,
        });
        routeCalculationTriggered = desiredActive;
      } else {
        const itemsChanged = !itemsMatch(items, baseline.items);
        const activeChanged = desiredActive !== baseline.active;
        routeCalculationTriggered = activeChanged || (itemsChanged && desiredActive);
        if (itemsChanged || activeChanged) {
        savedList = await replaceShoppingList(baseline.id, {
          active: desiredActive,
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
      }

      setBaseline(savedList);
      setListName(savedList.name);
      setItems(cloneItems(savedList.items));
      setIsActive(savedList.active);
      return { savedList, routeCalculationTriggered };
    } catch (error: unknown) {
      setRequestError(toApiError(error).message);
      return null;
    } finally {
      mutationLocked.current = false;
      setIsMutating(false);
    }
  }, [baseline, canPersist, isActive, items, normalizedListName]);

  const saveForLater = useCallback(async () => {
    const result = await persistDraft();
    if (result) {
      navigation.navigate('SavedLists');
    }
  }, [navigation, persistDraft]);

  const findBestRoute = useCallback(async () => {
    const result = await persistDraft({ forceActive: true });
    if (!result) return;
    mutationLocked.current = true;
    setIsMutating(true);
    try {
      const savedLists = await listShoppingLists();
      const otherIncludedLists = savedLists.filter(
        (list) => list.id !== result.savedList.id && list.active,
      );
      for (const list of otherIncludedLists) {
        await updateShoppingListActive(list.id, { active: false });
      }
      await startRouteCalculation();
      navigation.navigate('Routes');
    } catch (error: unknown) {
      setRequestError(toApiError(error).message);
    } finally {
      mutationLocked.current = false;
      setIsMutating(false);
    }
  }, [navigation, persistDraft]);

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
  }, [baseline, isMutating, navigation]);

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
          <BackButton onPress={() => navigation.goBack()} />
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
                accessibilityLabel={`Add ${formatTagLabel(tag.tag)}`}
                accessibilityRole="button"
                key={tag.tag}
                onPress={() => addItem(tag.tag)}
                style={({ pressed }) => [styles.suggestion, pressed && styles.buttonDisabled]}
              >
                <Text style={styles.suggestionName}>{formatTagLabel(tag.tag)}</Text>
                <Text style={styles.suggestionDetails}>{tag.defaultQuantity} {tag.defaultUnit}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {itemError ? <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{itemError}</Text> : null}

        <View style={styles.designListCard}>
          <View style={styles.listHeader}><Text style={styles.listTitle}>My List ({items.length})</Text><Pressable onPress={() => { setItems([]); setExpandedItemTag(null); }}><Text style={styles.clearAll}>Clear All</Text></Pressable></View>
          {items.length > 0 ? (
          <View>
            {items.map((item) => {
              const modifierState = modifierOptionsByTag[item.tag];
              const itemLabel = formatTagLabel(item.tag);
              return (
              <View key={item.tag}>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>{itemLabel}</Text>
                  <Text style={styles.itemPrice}>{itemDetails(item, catalog)}</Text>
                  <Pressable
                    accessibilityLabel={`Remove ${itemLabel}`}
                    accessibilityRole="button"
                    onPress={() => {
                      setItems((currentItems) =>
                        currentItems.filter((currentItem) => currentItem.tag !== item.tag),
                      );
                      setExpandedItemTag((current) => current === item.tag ? null : current);
                    }}
                  >
                    <Text style={styles.editText}>Remove</Text>
                  </Pressable>
                </View>
                <ModifierSelector
                  disabled={isMutating}
                  error={modifierState?.error ?? null}
                  isExpanded={expandedItemTag === item.tag}
                  isLoading={modifierState?.isLoading ?? false}
                  itemTag={item.tag}
                  onRetry={() => void loadModifierOptions(item.tag)}
                  onToggle={() => toggleModifierSelector(item.tag)}
                  onToggleModifier={(modifier) => toggleItemModifier(item.tag, modifier)}
                  options={modifierState?.options ?? []}
                  selected={item.modifiers ?? []}
                />
              </View>
              );
            })}
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

        <View style={styles.activeCard}>
          <View style={styles.activeCopy}>
            <Text style={styles.activeTitle}>Route planning</Text>
            <Text style={styles.activeDescription}>{isActive ? 'This list is included when routes are ranked.' : 'This list is saved, but not included in route rankings.'}</Text>
          </View>
          <Pressable
            accessibilityLabel={isActive ? 'Remove list from route planning' : 'Include list in route planning'}
            accessibilityRole="button"
            accessibilityState={{ disabled: isMutating, selected: isActive }}
            disabled={isMutating}
            onPress={() => setIsActive((current) => !current)}
            style={[styles.routePlanButton, isActive && styles.routePlanButtonSelected]}
          >
            <Text style={[styles.routePlanButtonText, isActive && styles.routePlanButtonTextSelected]}>
              {isActive ? 'Included' : 'Include'}
            </Text>
          </Pressable>
        </View>

        {requestError ? <Text accessibilityLiveRegion="assertive" style={styles.feedbackText}>{requestError}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable accessibilityLabel="Save shopping list for later" accessibilityRole="button" accessibilityState={{ busy: isMutating, disabled: !canPersist }} disabled={!canPersist} onPress={() => void saveForLater()} style={({ pressed }) => [styles.button, styles.saveLaterButton, (!canPersist || pressed) && styles.buttonDisabled]}>
            <Text style={styles.saveLaterText}>{isMutating ? 'Saving...' : 'Save for Later'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Route this list" accessibilityRole="button" accessibilityState={{ busy: isMutating, disabled: !canPersist }} disabled={!canPersist} onPress={() => void findBestRoute()} style={({ pressed }) => [styles.button, styles.routeButton, (!canPersist || pressed) && styles.buttonDisabled]}>
            {isMutating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Route This List</Text>}
          </Pressable>
        </View>
        <Text style={styles.routeScopeNote}>
          Route This List saves any other included lists for later, then ranks routes for this list only.
        </Text>
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