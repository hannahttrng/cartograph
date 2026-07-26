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

import { listShoppingLists, toApiError, updateShoppingListActive } from '../api';
import { AppBottomNav, DesignIcon, DisclosureArrow, EmptyState, FilterTabs } from '../components/common';
import { ListIcon } from '../components/list/ListIcon';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';
import type { EntityId, ShoppingListResponse } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'SavedLists'>;
type ListFilter = 'all' | 'active' | 'inactive';

const filters = [
  { label: 'All Lists', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
] as const;

export function SavedListsScreen({ navigation }: Props) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [lists, setLists] = useState<readonly ShoppingListResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [busyListIds, setBusyListIds] = useState<ReadonlySet<EntityId>>(new Set());
  const [toggleErrors, setToggleErrors] = useState<Readonly<Record<number, string>>>({});

  const loadData = useCallback(async (isActive: () => boolean = () => true) => {
    setIsLoading(true);
    setRequestError(null);

    try {
      const loadedLists = await listShoppingLists();
      if (!isActive()) {
        return;
      }
      setLists(loadedLists);
      setIsLoading(false);
    } catch (error: unknown) {
      if (isActive()) {
        setRequestError(toApiError(error).message);
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
    if (filter === 'active') {
      return lists.filter((list) => list.active);
    }
    if (filter === 'inactive') {
      return lists.filter((list) => !list.active);
    }
    return lists;
  }, [filter, lists]);

  const toggleActive = useCallback(
    async (list: ShoppingListResponse) => {
      if (busyListIds.has(list.id)) return;
      const nextActive = !list.active;
      setLists((current) => current.map((item) =>
        item.id === list.id ? { ...item, active: nextActive } : item
      ));
      setBusyListIds((current) => new Set(current).add(list.id));
      setToggleErrors((current) => {
        const next = { ...current };
        delete next[list.id];
        return next;
      });
      try {
        const updated = await updateShoppingListActive(list.id, { active: nextActive });
        setLists((current) => current.map((item) => item.id === list.id ? updated : item));
      } catch (error: unknown) {
        setLists((current) => current.map((item) =>
          item.id === list.id ? { ...item, active: list.active } : item
        ));
        setToggleErrors((current) => ({
          ...current,
          [list.id]: toApiError(error).message,
        }));
      } finally {
        setBusyListIds((current) => {
          const next = new Set(current);
          next.delete(list.id);
          return next;
        });
      }
    },
    [busyListIds],
  );

  const emptyDescription =
    filter === 'active'
      ? 'Activate a list to include it in route planning.'
      : filter === 'inactive'
        ? 'Lists you pause will appear here.'
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
        ) : visibleLists.map((list) => (
          <View key={list.id}>
            <View style={styles.listCard}>
              <Pressable
                accessibilityLabel={`Edit ${list.name}`}
                accessibilityRole="button"
                onPress={() => navigation.navigate('NewShoppingList', { listId: list.id })}
                style={({ pressed }) => [styles.listMain, pressed && styles.pressed]}
              >
                <ListIcon iconName="grocery" size={38} />
                <View style={styles.listCopy}>
                  <Text style={styles.listName}>{list.name}</Text>
                  <Text style={styles.listMeta}>{list.items.length} {list.items.length === 1 ? 'item' : 'items'} · {list.active ? 'Included in routes' : 'Saved for later'}</Text>
                </View>
                <DisclosureArrow direction="right" style={styles.arrow} />
              </Pressable>
              <Pressable
                accessibilityLabel={`${list.active ? 'Remove' : 'Include'} ${list.name} ${list.active ? 'from' : 'in'} route planning`}
                accessibilityRole="button"
                accessibilityState={{ busy: busyListIds.has(list.id), disabled: busyListIds.has(list.id), selected: list.active }}
                disabled={busyListIds.has(list.id)}
                onPress={() => void toggleActive(list)}
                style={[styles.routePlanButton, list.active && styles.routePlanButtonSelected]}
              >
                {busyListIds.has(list.id) ? (
                  <ActivityIndicator color={list.active ? colors.textInverse : colors.primary} size="small" />
                ) : (
                  <Text style={[styles.routePlanButtonText, list.active && styles.routePlanButtonTextSelected]}>
                    {list.active ? 'Included' : 'Include'}
                  </Text>
                )}
              </Pressable>
              <View style={styles.actionSpacer} />
            </View>
            {toggleErrors[list.id] ? <Text accessibilityLiveRegion="assertive" style={styles.rowError}>{toggleErrors[list.id]}</Text> : null}
          </View>
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
  listCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 91, overflow: 'hidden' },
  listMain: { alignItems: 'center', flex: 1, flexDirection: 'row', minHeight: 89, padding: spacing.md },
  listCopy: { flex: 1, marginHorizontal: spacing.sm },
  listName: typography.bodyStrong,
  listMeta: { ...typography.caption, marginTop: spacing.xxs },
  actionSpacer: { width: spacing.md },
  routePlanButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: radius.sm, borderWidth: 1, justifyContent: 'center', minHeight: 36, minWidth: 72, paddingHorizontal: spacing.sm },
  routePlanButtonSelected: { backgroundColor: colors.primary },
  routePlanButtonText: { ...typography.caption, color: colors.primary, fontFamily: 'Monda_700Bold' },
  routePlanButtonTextSelected: { color: colors.textInverse },
  arrow: { marginLeft: spacing.xs },
  statePanel: { alignItems: 'center', justifyContent: 'center', minHeight: 220, padding: spacing.lg },
  stateText: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' },
  errorText: { ...typography.body, color: colors.danger, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.md, minHeight: 42, paddingHorizontal: spacing.lg },
  retryText: { ...typography.bodyStrong, color: colors.textInverse },
  rowError: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, paddingHorizontal: spacing.sm },
  pressed: { opacity: 0.72 },
});