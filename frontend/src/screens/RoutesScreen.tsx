import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav, StatusBanner } from '../components/common';
import { RouteCard } from '../components/route/RouteCard';
import { routeOptimizerFixture } from '../data/routeOptimizerFixture';
import type { RootStackParamList } from '../navigation/types';
import { styles } from './RoutesScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Routes'>;

export function RoutesScreen({ navigation }: Props) {
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={routeOptimizerFixture}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Route Preview</Text>
            <Text style={styles.subtitle}>
              Explore ranked sample routes while live location routing is being connected.
            </Text>
            <View style={styles.banner}>
              <StatusBanner message="Deterministic milk and bread preview" tone="loading" />
            </View>
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
      <AppBottomNav active="routes" navigation={navigation} />
    </SafeAreaView>
  );
}
