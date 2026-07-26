import { useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteCard } from '../components/route/RouteCard';
import { routeOptimizerFixture } from '../data/routeOptimizerFixture';
import type { MainTabScreenProps } from '../navigation/types';
import { styles } from './RoutesScreen.styles';

type Props = MainTabScreenProps<'Routes'>;

export function RoutesScreen({ navigation }: Props) {
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={routeOptimizerFixture}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Ranked routes</Text>
            <Text style={styles.subtitle}>
              Milk and bread routes from a deterministic optimizer run.
            </Text>
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
            routeCount={routeOptimizerFixture.length}
          />
        )}
      />
    </SafeAreaView>
  );
}
