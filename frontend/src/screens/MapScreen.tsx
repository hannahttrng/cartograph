import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMap, toApiError } from '../api';
import { RouteMap } from '../components/map/RouteMap';
import type { RootStackParamList } from '../navigation/types';
import type { MapRouteData, MapState } from '../types/maps';
import { styles } from './MapScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export function MapScreen({ route }: Props) {
  const { route: selectedRoute, routeId } = route.params;
  const fallbackMapData = useMemo<MapRouteData>(
    () => ({
      routeId,
      stores: selectedRoute.stores,
      distance: selectedRoute.distance,
      time: selectedRoute.time,
      polyline: {
        points: selectedRoute.stores.map(({ latitude, longitude }) => ({ latitude, longitude })),
      },
    }),
    [routeId, selectedRoute],
  );
  const [mapData, setMapData] = useState<MapRouteData>(fallbackMapData);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMap = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await getMap(routeId);
      setMapData({
        ...response,
        stores: response.stores.length > 0 ? response.stores : fallbackMapData.stores,
      });
    } catch (error: unknown) {
      setMapData(fallbackMapData);
      setErrorMessage(toApiError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [fallbackMapData, routeId]);

  useEffect(() => {
    void loadMap();
  }, [loadMap]);

  const mapState: MapState = isLoading
    ? 'loading'
    : errorMessage
      ? 'mapUnavailable'
      : 'routeSelected';

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Route Overview
        </Text>
        <Text style={styles.subtitle}>
          Your selected shopping route is listed below.
        </Text>

        {isLoading ? (
          <View style={styles.status}>
            <ActivityIndicator color="#243B53" />
            <Text accessibilityLiveRegion="polite" style={styles.statusText}>
              Loading route data...
            </Text>
          </View>
        ) : null}

        <RouteMap mapData={mapData} state={mapState} />

        {errorMessage ? (
          <View style={styles.errorState}>
            <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
              {errorMessage}
            </Text>
            <Pressable accessibilityRole="button" onPress={loadMap} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>Try Again</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}