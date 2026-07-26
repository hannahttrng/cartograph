import { useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav, FilterTabs, StatusBanner } from '../components/common';
import { RouteCard } from '../components/route/RouteCard';
import {
  routeOptimizerFixture,
  type SeededRoute,
} from '../data/routeOptimizerFixture';
import type { RootStackParamList } from '../navigation/types';
import { styles } from './RoutePreviewScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteResults'>;
type RouteMode = 'overall' | 'cheapest' | 'fastest';

const routeModes = [
  { label: 'Best Overall', value: 'overall' },
  { label: 'Cheapest', value: 'cheapest' },
  { label: 'Fastest', value: 'fastest' },
] as const;

const purchaseTotal = (candidate: SeededRoute): number =>
  candidate.route.products.reduce((total, product) => total + product.price, 0);

const leadingTitle = (mode: RouteMode): string =>
  routeModes.find((candidate) => candidate.value === mode)?.label ?? 'Best Overall';

export function RoutePreviewScreen({ navigation, route }: Props) {
  const { items, listName } = route.params;
  const [routeMode, setRouteMode] = useState<RouteMode>('overall');
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(
    routeOptimizerFixture[0]?.id ?? null,
  );

  const displayedRoutes = useMemo(() => {
    const routes = [...routeOptimizerFixture];
    if (routeMode === 'cheapest') {
      return routes.sort((first, second) => purchaseTotal(first) - purchaseTotal(second));
    }
    if (routeMode === 'fastest') {
      return routes.sort((first, second) => first.route.time - second.route.time);
    }
    return routes;
  }, [routeMode]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={displayedRoutes}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(candidate) => candidate.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Route Preview</Text>
            <Text style={styles.subtitle}>
              {listName ?? 'Your saved list'} has {items.length} {items.length === 1 ? 'item' : 'items'}.
            </Text>
            <Text style={styles.previewNote}>
              These sample routes demonstrate ranking and map views. They are not calculated from this list yet.
            </Text>
            <View style={styles.routeModes}>
              <FilterTabs<RouteMode>
                onChange={(mode) => {
                  setRouteMode(mode);
                  setExpandedRouteId(null);
                }}
                options={routeModes}
                value={routeMode}
              />
            </View>
            <StatusBanner message="Saved list ready; showing deterministic preview routes" tone="loading" />
          </View>
        }
        renderItem={({ item, index }) => (
          <RouteCard
            isExpanded={expandedRouteId === item.id}
            onOpenMap={() => navigation.navigate('Map', { route: item.route, routeId: item.id })}
            onToggle={() =>
              setExpandedRouteId((currentId) => currentId === item.id ? null : item.id)
            }
            rank={index + 1}
            route={item.route}
            routeCount={displayedRoutes.length}
            title={index === 0 ? leadingTitle(routeMode) : `Option ${index + 1}`}
          />
        )}
      />
      <AppBottomNav active="routes" navigation={navigation} />
    </SafeAreaView>
  );
}
