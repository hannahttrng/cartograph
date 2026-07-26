import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { MapRouteData, MapState } from '../../types/maps';
import { ArcGISMapAdapter } from './ArcGISMapAdapter';
import { RouteMapFallback } from './RouteMapFallback';

interface RouteMapProps {
  mapData: MapRouteData;
  onError: () => void;
  onLoad: () => void;
  onLoadStart: () => void;
  reloadKey: number;
  state: MapState;
}

export function RouteMap({
  mapData,
  onError,
  onLoad,
  onLoadStart,
  reloadKey,
  state,
}: RouteMapProps) {
  if (state === 'mapUnavailable') {
    return <RouteMapFallback mapData={mapData} />;
  }

  return (
    <View style={styles.container}>
      <ArcGISMapAdapter
        key={`${mapData.routeId}-${reloadKey}`}
        mapData={mapData}
        onError={onError}
        onLoad={onLoad}
        onLoadStart={onLoadStart}
      />
      {state === 'loading' ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#173F24" size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            Loading map...
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 320,
  },
  loadingOverlay: {
    alignItems: 'center',
    backgroundColor: '#E9EEE8',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  statusText: {
    color: '#344A3A',
    fontSize: 15,
    marginTop: 12,
  },
});