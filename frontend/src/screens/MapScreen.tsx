import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getMap, toApiError } from '../api';
import { RouteMap } from '../components/map/RouteMap';
import type { RootStackParamList } from '../navigation/types';
import type { MapRouteData, MapState } from '../types/maps';
import type { Store } from '../types/models';
import { styles } from './MapScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export function MapScreen({ route }: Props) {
  const { bottom } = useSafeAreaInsets();
  const { route: selectedRoute, routeId } = route.params;
  const fallbackMapData = useMemo<MapRouteData>(
    () => ({
      routeId: routeId ?? 'local-preview',
      stores: selectedRoute.stores,
      distance: selectedRoute.distance,
      time: selectedRoute.time,
      polyline: {
        points: selectedRoute.stores.map(({ latitude, longitude }: Store) => ({
          latitude,
          longitude,
        })),
      },
    }),
    [routeId, selectedRoute],
  );
  const [mapData, setMapData] = useState<MapRouteData>(fallbackMapData);
  const [isLoading, setIsLoading] = useState(Boolean(routeId));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadMap = useCallback(async () => {
    if (!routeId) {
      setMapData(fallbackMapData);
      setErrorMessage(null);
      setIsLoading(false);
      return;
    }

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
    <View style={styles.screen}>
      <RouteMap mapData={mapData} state={mapState} />

      {isLoading ? (
        <View pointerEvents="none" style={styles.status}>
          <ActivityIndicator color="#243B53" />
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            Loading route data...
          </Text>
        </View>
      ) : null}

      {errorMessage ? (
        <View style={[styles.errorState, { bottom: bottom + 16 }]}>
          <Text accessibilityLiveRegion="assertive" numberOfLines={2} style={styles.errorText}>
            {errorMessage}
          </Text>
          <Pressable accessibilityRole="button" onPress={loadMap} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}