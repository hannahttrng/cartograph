import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav, DesignIcon, DisclosureArrow, EmptyState, FilterTabs } from '../components/common';
import { ListIcon } from '../components/list/ListIcon';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import type { SavedShoppingList } from '../types/savedLists';
import { loadSavedListLibrary } from '../utils/savedListsStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedLists'>;
type ListFilter = 'all' | 'favorites' | 'archived';

const listIconNames = ['grocery', 'mealPrep', 'bbq', 'household', 'costco'] as const;

function iconNameForList(list: SavedShoppingList, index: number) {
  const name = list.name.toLocaleLowerCase();
  if (name.includes('costco')) return 'costco';
  if (name.includes('dinner') || name.includes('meal')) return 'mealPrep';
  if (name.includes('bbq') || name.includes('grill')) return 'bbq';
  if (name.includes('house')) return 'household';
  return listIconNames[index % listIconNames.length];
}

const demoLists: SavedShoppingList[] = [
  { id: 'demo-weekly', name: 'Weekly Groceries', items: ['Apples', 'Bread', 'Milk', 'Eggs'], collectionId: 'demo', updatedAt: new Date().toISOString() },
  { id: 'demo-night', name: 'Night Shop', items: ['Pasta', 'Tomatoes', 'Parmesan'], collectionId: 'demo', updatedAt: new Date(Date.now() - 172800000).toISOString() },
  { id: 'demo-dinner', name: 'Dinner Ingredients', items: ['Chicken', 'Rice', 'Broccoli'], collectionId: 'demo', updatedAt: new Date(Date.now() - 604800000).toISOString() },
];

const filters = [
  { label: 'All Lists', value: 'all' },
  { label: 'Favorites', value: 'favorites' },
  { label: 'Archived', value: 'archived' },
] as const;

export function SavedListsScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [lists, setLists] = useState<SavedShoppingList[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set(['demo-weekly']));

  useFocusEffect(useCallback(() => {
    const loadLists = async () => {
      const library = await loadSavedListLibrary();
      setLists(library.lists.length > 0 ? library.lists : demoLists);
    };
    void loadLists();
  }, []));

  const visibleLists = useMemo(() => {
    if (filter === 'favorites') return lists.filter((list) => favoriteIds.has(list.id));
    if (filter === 'archived') return [];
    return lists;
  }, [favoriteIds, filter, lists]);

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <View><Text accessibilityRole="header" style={styles.title}>Lists</Text><Text style={styles.subtitle}>Your saved shopping plans.</Text></View>
        <Pressable accessibilityLabel="Create new list" accessibilityRole="button" onPress={() => navigation.navigate('NewShoppingList')} style={styles.addButton}><DesignIcon name="plus" size={18} /></Pressable>
      </View>
      <View style={styles.filters}><FilterTabs<ListFilter> onChange={setFilter} options={filters} value={filter} /></View>
      <ScrollView contentContainerStyle={styles.content}>
        {visibleLists.length === 0 ? (
          <EmptyState description={filter === 'archived' ? 'Archived lists will appear here.' : 'Tap the star on a list to save it here.'} title={filter === 'archived' ? 'No archived lists' : 'No favorite lists'} />
        ) : visibleLists.map((list, index) => (
          <Pressable accessibilityRole="button" key={list.id} onPress={() => navigation.navigate('RouteResults', { items: list.items, listId: list.id })} style={({ pressed }) => [styles.listCard, pressed && styles.pressed]}>
            <ListIcon iconName={iconNameForList(list, index)} size={38} />
            <View style={styles.listCopy}><Text style={styles.listName}>{list.name}</Text><Text style={styles.listMeta}>{list.items.length} items · Last updated {new Date(list.updatedAt).toLocaleDateString()}</Text></View>
            <Pressable accessibilityLabel={`${favoriteIds.has(list.id) ? 'Remove' : 'Add'} ${list.name} favorite`} hitSlop={10} onPress={(event) => { event.stopPropagation(); toggleFavorite(list.id); }}><DesignIcon name={favoriteIds.has(list.id) ? 'starFilled' : 'star'} size={24} /></Pressable>
            <DisclosureArrow direction="right" style={styles.arrow} />
          </Pressable>
        ))}
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
  listCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 91, padding: spacing.md },
  listCopy: { flex: 1, marginHorizontal: spacing.sm },
  listName: typography.bodyStrong,
  listMeta: { ...typography.caption, marginTop: spacing.xxs },
  star: { color: colors.borderStrong, fontSize: 22 },
  starActive: { color: colors.warning },
  arrow: { marginLeft: spacing.sm },
  pressed: { opacity: 0.72 },
});