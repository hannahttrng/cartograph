import { StyleSheet, Text, View } from 'react-native';

import type { MapRouteData, MapState } from '../../types/maps';
import { ArcGISMapAdapter } from './ArcGISMapAdapter';
import { RouteMapFallback } from './RouteMapFallback';

interface RouteMapProps {
  mapData: MapRouteData;
  state: MapState;
}

const ARC_GIS_MAP_ENABLED = false;

export function RouteMap({ mapData, state }: RouteMapProps) {
  if (state === 'loading') {
    return (
      <View style={styles.status}>
        <Text style={styles.statusText}>Loading route map...</Text>
      </View>
    );
  }

  if (ARC_GIS_MAP_ENABLED) {
    return <ArcGISMapAdapter mapData={mapData} />;
  }

  return (
    <View>
      {state === 'mapUnavailable' ? (
        <Text accessibilityLiveRegion="assertive" style={styles.unavailableText}>
          Map unavailable. Showing route details instead.
        </Text>
      ) : (
        <Text style={styles.unavailableText}>
          Interactive mapping will be available when ArcGIS is connected.
        </Text>
      )}
      <RouteMapFallback mapData={mapData} />
    </View>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: 'center',
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 180,
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