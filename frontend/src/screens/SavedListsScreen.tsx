import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listShoppingLists, toApiError } from '../api';
import { AppBottomNav, DesignIcon, DisclosureArrow, EmptyState, FilterTabs } from '../components/common';
import { ListIcon } from '../components/list/ListIcon';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import type { EntityId, ShoppingListResponse } from '../types/api';
import type { ShoppingListMetadataStore } from '../types/savedLists';
import {
  loadShoppingListMetadata,
  metadataForList,
  pruneShoppingListMetadata,
  saveShoppingListMetadata,
} from '../utils/savedListsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedLists'>;
type ListFilter = 'all' | 'favorites' | 'archived';

const listIconNames = ['grocery', 'mealPrep', 'bbq', 'household', 'costco'] as const;

function iconNameForList(list: Pick<ShoppingListResponse, 'name'>, index: number) {
  const name = list.name.toLocaleLowerCase();
  if (name.includes('costco')) return 'costco';
  if (name.includes('dinner') || name.includes('meal')) return 'mealPrep';
  if (name.includes('bbq') || name.includes('grill')) return 'bbq';
  if (name.includes('house')) return 'household';
  return listIconNames[index % listIconNames.length];
}

const filters = [
  { label: 'All Lists', value: 'all' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Archived', value: 'archived' },
] as const;

const emptyMetadataStore = (): ShoppingListMetadataStore => ({
  collections: [],
  lists: {},
  version: 1,
});

export function SavedListsScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [lists, setLists] = useState<readonly ShoppingListResponse[]>([]);
  const [metadata, setMetadata] = useState<ShoppingListMetadataStore>(emptyMetadataStore);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  const loadData = useCallback(async (isActive: () => boolean = () => true) => {
    setIsLoading(true);
    setRequestError(null);
    setMetadataError(null);

    let loadedLists: readonly ShoppingListResponse[];
    try {
      loadedLists = await listShoppingLists();
      if (!isActive()) {
        return;
      }
      setLists(loadedLists);
    } catch (error: unknown) {
      if (isActive()) {
        setRequestError(toApiError(error).message);
        setIsLoading(false);
      }
      return;
    }

    try {
      const loadedMetadata = await loadShoppingListMetadata();
      if (!isActive()) {
        return;
      }
      const prunedMetadata = pruneShoppingListMetadata(
        loadedMetadata,
        loadedLists.map((list) => list.id),
      );
      setMetadata(prunedMetadata);
      if (JSON.stringify(prunedMetadata) !== JSON.stringify(loadedMetadata)) {
        await saveShoppingListMetadata(prunedMetadata);
      }
    } catch {
      if (isActive()) {
        setMetadataError('Favorites and organization are unavailable on this device.');
      }
    } finally {
      if (isActive()) {
        setIsLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void loadData(() => active);
      return () => {
        active = false;
      };
    }, [loadData]),
  );

  const visibleLists = useMemo(() => {
    if (filter === 'favorites') {
      return lists.filter((list) => {
        const listMetadata = metadataForList(metadata, list.id);
        return listMetadata.favorite && !listMetadata.archived;
      });
    }
    if (filter === 'archived') {
      return lists.filter((list) => metadataForList(metadata, list.id).archived);
    }
    return lists.filter((list) => !metadataForList(metadata, list.id).archived);
  }, [filter, lists, metadata]);

  const toggleFavorite = useCallback(
    async (id: EntityId) => {
      const currentListMetadata = metadataForList(metadata, id);
      const nextMetadata: ShoppingListMetadataStore = {
        ...metadata,
        lists: {
          ...metadata.lists,
          [String(id)]: {
            ...currentListMetadata,
            favorite: !currentListMetadata.favorite,
          },
        },
      };
      setMetadata(nextMetadata);
      setMetadataError(null);
      try {
        await saveShoppingListMetadata(nextMetadata);
      } catch {
        setMetadata(metadata);
        setMetadataError('The favorite could not be saved on this device.');
      }
    },
    [metadata],
  );

  const emptyDescription =
    filter === 'archived'
      ? 'Lists archived on this device will appear here.'
      : filter === 'favorites'
        ? 'Use the star on a list to keep it here.'
        : 'Create a list to start planning a shopping trip.';

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <View><Text accessibilityRole="header" style={styles.title}>Lists</Text><Text style={styles.subtitle}>Your saved shopping plans.</Text></View>
        <Pressable accessibilityLabel="Create new list" accessibilityRole="button" onPress={() => navigation.navigate('NewShoppingList')} style={styles.addButton}><DesignIcon name="plus" size={18} /></Pressable>
      </View>
      <View style={styles.filters}><FilterTabs<ListFilter> onChange={setFilter} options={filters} value={filter} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        {requestError ? (
          <View style={styles.statePanel}>
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>{requestError}</Text>
            <Pressable accessibilityRole="button" onPress={() => void loadData()} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : isLoading ? (
          <View style={styles.statePanel}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text accessibilityLiveRegion="polite" style={styles.stateText}>Loading your lists...</Text>
          </View>
        ) : visibleLists.length === 0 ? (
          <EmptyState description={emptyDescription} title={filter === 'all' ? 'No shopping lists' : `No ${filter} lists`} />
        ) : visibleLists.map((list, index) => (
          <View key={list.id} style={styles.listCard}>
            <Pressable
              accessibilityLabel={`Edit ${list.name}`}
              accessibilityRole="button"
              onPress={() => navigation.navigate('NewShoppingList', { listId: list.id })}
              style={({ pressed }) => [styles.listMain, pressed && styles.pressed]}
            >
              <ListIcon iconName={iconNameForList(list, index)} size={38} />
              <View style={styles.listCopy}>
                <Text style={styles.listName}>{list.name}</Text>
                <Text style={styles.listMeta}>{list.items.length} {list.items.length === 1 ? 'item' : 'items'} · {list.status}</Text>
              </View>
              <DisclosureArrow direction="right" style={styles.arrow} />
            </Pressable>
            <Pressable
              accessibilityLabel={`${metadataForList(metadata, list.id).favorite ? 'Remove' : 'Add'} ${list.name} favorite`}
              accessibilityRole="button"
              accessibilityState={{ checked: metadataForList(metadata, list.id).favorite }}
              hitSlop={10}
              onPress={() => void toggleFavorite(list.id)}
              style={styles.favoriteButton}
            >
              <DesignIcon name={metadataForList(metadata, list.id).favorite ? 'starFilled' : 'star'} size={24} />
            </Pressable>
          </View>
        ))}
        {metadataError ? <Text accessibilityLiveRegion="polite" style={styles.metadataError}>{metadataError}</Text> : null}
      </ScrollView>
      <AppBottomNav active="lists" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  title: { ...typography.title, fontSize: 22 },
  subtitle: { ...typography.caption, marginTop: 2 },
  addButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, height: 36, justifyContent: 'center', width: 36 },
  addLabel: { color: colors.textInverse, fontSize: 26, lineHeight: 28 },
  filters: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  content: { gap: spacing.sm, paddingBottom: spacing.xl, paddingHorizontal: spacing.lg },
  listCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 91, overflow: 'hidden' },
  listMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 89, padding: spacing.md },
  listCopy: { flex: 1, marginHorizontal: spacing.sm },
  listName: typography.bodyStrong,
  listMeta: { ...typography.caption, marginTop: spacing.xxs },
  star: { color: colors.borderStrong, fontSize: 22 },
  starActive: { color: colors.warning },
  favoriteButton: { alignItems: 'center', height: 52, justifyContent: 'center', marginRight: spacing.md, width: 42 },
  arrow: { marginLeft: spacing.xs },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 220, padding: spacing.lg },
  stateText: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.md, minHeight: 42, paddingHorizontal: spacing.lg },
  retryText: { ...typography.bodyStrong, color: colors.textInverse },
  metadataError: { ...typography.caption, color: colors.danger, marginTop: spacing.sm, textAlign: 'center' },
  pressed: { opacity: 0.72 },
});