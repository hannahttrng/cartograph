import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Animated, FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  getRouteCalculation,
  getRouteCandidates,
  startRouteCalculation,
  toApiError,
} from '../api';
import { AppBottomNav, AppButton, EmptyState, FilterTabs, StatusBanner } from '../components/common';
import { RouteCard } from '../components/route/RouteCard';
import type { RootStackParamList } from '../navigation/types';
import type {
  EntityId,
  RouteCalculationResponse,
  RouteCandidateResult,
} from '../types/api';
import { colors } from '../theme';
import { styles } from './RoutesScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Routes'>;
type RouteSort = 'best' | 'cheaper' | 'closer';
const POLL_INTERVAL_MS = 1_000;
const routeSortOptions = [
  { label: 'Best Overall', value: 'best' },
  { label: 'Cheaper', value: 'cheaper' },
  { label: 'Closer', value: 'closer' },
] as const;

function RouteLoadingState({ label }: { label: string }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          duration: 1100,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          duration: 0,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [progress]);

  return (
    <View accessibilityRole="progressbar" style={styles.statePanel}>
      <View style={styles.loadingRoute}>
        <View style={styles.loadingLine} />
        {[0, 1, 2].map((stop) => <View key={stop} style={[styles.loadingStop, { left: stop * 46 }]} />)}
        <Animated.View
          style={[
            styles.loadingCart,
            { transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 92] }) }] },
          ]}
        />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.stateText}>{label}</Text>
    </View>
  );
}

export function RoutesScreen({ navigation }: Props) {
  const [sort, setSort] = useState<RouteSort>('best');
  const [expandedRouteId, setExpandedRouteId] = useState<EntityId | null>(null);
  const [calculation, setCalculation] = useState<RouteCalculationResponse | null>(null);
  const [candidates, setCandidates] = useState<readonly RouteCandidateResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let timer: ReturnType<typeof setTimeout> | null = null;
      setIsLoading(true);
      setRequestError(null);

      const schedulePoll = () => {
        timer = setTimeout(() => void loadData(), POLL_INTERVAL_MS);
      };

      const loadData = async () => {
        try {
          const status = await getRouteCalculation();
          if (!active) return;
          setCalculation(status);
          setRequestError(null);

          if (status.status === 'RUNNING') {
            setCandidates([]);
            setIsLoading(false);
            schedulePoll();
            return;
          }

          if (status.status === 'SUCCEEDED') {
            const response = await getRouteCandidates();
            if (!active) return;
            if (response.generation !== status.generation) {
              setCandidates([]);
              setIsLoading(true);
              schedulePoll();
              return;
            }
            setCandidates(response.candidates);
            setExpandedRouteId((current) =>
              current !== null && response.candidates.some((route) => route.id === current)
                ? current
                : null
            );
          } else {
            setCandidates([]);
          }
          setIsLoading(false);
        } catch (error: unknown) {
          if (active) {
            setRequestError(toApiError(error).message);
            setIsLoading(false);
          }
        }
      };

      void loadData();
      return () => {
        active = false;
        if (timer !== null) clearTimeout(timer);
      };
    }, [refreshKey]),
  );

  const recalculate = useCallback(async () => {
    if (isStarting) return;
    setIsStarting(true);
    setRequestError(null);
    try {
      const started = await startRouteCalculation();
      setCalculation(started);
      setCandidates([]);
      setRefreshKey((current) => current + 1);
    } catch (error: unknown) {
      setRequestError(toApiError(error).message);
    } finally {
      setIsStarting(false);
    }
  }, [isStarting]);

  const retryLoad = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const serverRanks = useMemo(
    () => new Map(candidates.map((candidate, index) => [candidate.id, index + 1])),
    [candidates],
  );
  const sortedCandidates = useMemo(() => {
    if (sort === 'best') return candidates;
    return [...candidates].sort((first, second) => {
      const difference = sort === 'cheaper'
        ? first.productPrice - second.productPrice
        : first.distance - second.distance;
      return difference || (serverRanks.get(first.id) ?? 1) - (serverRanks.get(second.id) ?? 1);
    });
  }, [candidates, serverRanks, sort]);

  let emptyContent;
  if (requestError) {
    emptyContent = (
      <EmptyState
        action={<AppButton onPress={retryLoad}>Retry</AppButton>}
        description={requestError}
        title="Routes unavailable"
      />
    );
  } else if (isLoading) {
    emptyContent = <RouteLoadingState label="Loading route results..." />;
  } else if (calculation?.status === 'RUNNING') {
    emptyContent = <RouteLoadingState label="Calculating your best routes..." />;
  } else if (calculation?.status === 'FAILED') {
    emptyContent = (
      <EmptyState
        action={<AppButton disabled={isStarting} onPress={() => void recalculate()}>Try again</AppButton>}
        description={calculation.detail ?? 'Route calculation failed.'}
        title="Calculation failed"
      />
    );
  } else if (!calculation || calculation.status === 'IDLE') {
    emptyContent = (
      <EmptyState
        action={<AppButton disabled={isStarting} onPress={() => void recalculate()}>Calculate routes</AppButton>}
        description="Run a calculation for your active shopping lists."
        title="No routes yet"
      />
    );
  } else if (calculation.activeListCount === 0) {
    emptyContent = (
      <EmptyState
        action={<AppButton onPress={() => navigation.navigate('SavedLists')}>Open Lists</AppButton>}
        description="Activate a shopping list to include it in route planning."
        title="No active lists"
      />
    );
  } else {
    emptyContent = (
      <EmptyState
        action={<AppButton disabled={isStarting} onPress={() => void recalculate()}>Recalculate</AppButton>}
        description="No eligible route could be built for the current active items."
        title="No route candidates"
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.content}
        data={sortedCandidates}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={emptyContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>Routes</Text>
            <Text style={styles.subtitle}>
              Ranked plans for your active shopping lists.
            </Text>
            <View style={styles.filters}>
              <FilterTabs<RouteSort>
                onChange={setSort}
                options={routeSortOptions}
                value={sort}
              />
            </View>
            {calculation?.status === 'RUNNING' ? (
              <View style={styles.banner}><StatusBanner message="Route calculation in progress" tone="loading" /></View>
            ) : calculation?.status === 'SUCCEEDED' && candidates.length > 0 ? (
              <View style={styles.banner}><StatusBanner message={`${candidates.length} ranked ${candidates.length === 1 ? 'route' : 'routes'} ready`} tone="success" /></View>
            ) : null}
            {calculation?.status === 'SUCCEEDED' && calculation.activeListCount > 0 && candidates.length > 0 ? (
              <AppButton disabled={isStarting} onPress={() => void recalculate()} style={styles.recalculateButton} variant="secondary">Recalculate</AppButton>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <RouteCard
            isExpanded={expandedRouteId === item.id}
            onOpenMap={() => navigation.navigate('Map', {
              route: item,
              routeId: String(item.id),
            })}
            onToggle={() =>
              setExpandedRouteId((currentId) => currentId === item.id ? null : item.id)
            }
            rank={serverRanks.get(item.id) ?? 1}
            route={item}
            routeCount={sortedCandidates.length}
          />
        )}
      />
      <AppBottomNav active="routes" navigation={navigation} />
    </SafeAreaView>
  );
}
