import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MapRouteData, MapState } from '../../types/maps';
import { ArcGISMapAdapter } from './ArcGISMapAdapter';
import { RouteMapFallback } from './RouteMapFallback';

interface RouteMapProps {
  mapData: MapRouteData;
  state: MapState;
}

export function RouteMap({ mapData, state }: RouteMapProps) {
  const [mapFailed, setMapFailed] = useState(false);

  useEffect(() => {
    setMapFailed(false);
  }, [mapData.routeId]);

  if (state === 'loading') {
    return (
      <View style={styles.status}>
        <Text style={styles.statusText}>Loading route map...</Text>
      </View>
    );
  }

  if (!mapFailed) {
    return <ArcGISMapAdapter mapData={mapData} onError={() => setMapFailed(true)} />;
  }

  return (
    <View style={styles.fallback}>
      <Text accessibilityLiveRegion="assertive" style={styles.unavailableText}>
        Map unavailable. Showing route details instead.
      </Text>
      <RouteMapFallback mapData={mapData} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    padding: 20,
  },
  status: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  statusText: {
    color: '#52606D',
    fontSize: 15,
  },
  unavailableText: {
    color: '#52606D',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
});