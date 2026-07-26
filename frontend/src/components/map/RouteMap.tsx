import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type {
  ArcGISMapDiagnostic,
  ArcGISMapCommand,
  MapRouteData,
  MapRouteError,
  MapRouteResult,
  MapState,
  MapStopSelection,
} from '../../types/maps';
import { ArcGISMapAdapter } from './ArcGISMapAdapter';
import { RouteMapFallback } from './RouteMapFallback';

interface RouteMapProps {
  command?: ArcGISMapCommand;
  mapData: MapRouteData;
  onDiagnostic: (diagnostic: ArcGISMapDiagnostic) => void;
  onMapError: (message: string) => void;
  onMapLoadStart: () => void;
  onMapReady: () => void;
  onRouteError: (error: MapRouteError) => void;
  onRouteSolved: (result: MapRouteResult) => void;
  onRouteSolving: () => void;
  onStopSelected: (stop: MapStopSelection) => void;
  reloadKey: number;
  state: MapState;
}

export function RouteMap({
  command,
  mapData,
  onDiagnostic,
  onMapError,
  onMapLoadStart,
  onMapReady,
  onRouteError,
  onRouteSolved,
  onRouteSolving,
  onStopSelected,
  reloadKey,
  state,
}: RouteMapProps) {
  if (state === 'mapUnavailable') {
    return <RouteMapFallback mapData={mapData} />;
  }

  return (
    <View style={styles.container}>
      <ArcGISMapAdapter
        command={command}
        key={`${mapData.routeId}-${reloadKey}`}
        mapData={mapData}
        onDiagnostic={onDiagnostic}
        onMapError={onMapError}
        onMapLoadStart={onMapLoadStart}
        onMapReady={onMapReady}
        onRouteError={onRouteError}
        onRouteSolved={onRouteSolved}
        onRouteSolving={onRouteSolving}
        onStopSelected={onStopSelected}
      />
      {state === 'loadingMap' || state === 'solvingRoute' ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#173F24" size="large" />
          <Text accessibilityLiveRegion="polite" style={styles.statusText}>
            {state === 'loadingMap' ? 'Loading map...' : 'Calculating directions...'}
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