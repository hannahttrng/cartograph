import { useCallback, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '../components/map/RouteMap';
import { ARCGIS_WEB_MAP_BROWSER_URL } from '../constants/config';
import type { RootStackParamList } from '../navigation/types';
import type { MapRouteData, MapState } from '../types/maps';
import type { Store } from '../types/models';
import { styles } from './MapScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;

export function MapScreen({ route }: Props) {
  const { route: selectedRoute, routeId } = route.params;
  const mapData = useMemo<MapRouteData>(
    () => ({
      routeId,
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
  const [mapState, setMapState] = useState<MapState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  const retryMap = useCallback(() => {
    setMapState('loading');
    setReloadKey((currentKey) => currentKey + 1);
  }, []);

  const openInBrowser = useCallback(async () => {
    try {
      await Linking.openURL(ARCGIS_WEB_MAP_BROWSER_URL);
    } catch {
      setMapState('mapUnavailable');
    }
  }, []);

  const summary = `${selectedRoute.stores.length} ${selectedRoute.stores.length === 1 ? 'stop' : 'stops'} - ${selectedRoute.distance.toFixed(1)} mi - ${Math.round(selectedRoute.time)} min`;
  const routeMap = (
    <RouteMap
      mapData={mapData}
      onError={() => setMapState('mapUnavailable')}
      onLoad={() => setMapState('routeSelected')}
      onLoadStart={() => setMapState('loading')}
      reloadKey={reloadKey}
      state={mapState}
    />
  );

  if (mapState === 'mapUnavailable') {
    return (
      <SafeAreaView edges={['bottom']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.fallbackContent}>
          <View style={styles.summaryBand}>
            <Text accessibilityRole="header" style={styles.title}>Route map</Text>
            <Text style={styles.subtitle}>{summary}</Text>
          </View>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            The interactive map is unavailable. Your route details are shown below.
          </Text>
          {routeMap}
          <View style={styles.actionRow}>
            <Pressable
              accessibilityRole="button"
              onPress={retryMap}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Retry</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Open ArcGIS map in browser"
              accessibilityRole="button"
              onPress={() => void openInBrowser()}
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
            >
              <Text style={styles.secondaryButtonText}>Open in browser</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.summaryBand}>
        <Text accessibilityRole="header" style={styles.title}>Route map</Text>
        <Text style={styles.subtitle}>{summary}</Text>
      </View>
      <View style={styles.mapSurface}>{routeMap}</View>
    </SafeAreaView>
  );
}