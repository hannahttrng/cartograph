import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RouteMap } from '../components/map/RouteMap';
import { MapDiagnosticsPanel } from '../components/map/MapDiagnosticsPanel';
import { RouteDirectionsPanel } from '../components/map/RouteDirectionsPanel';
import {
  ARCGIS_WEB_MAP_BROWSER_URL,
  DEMO_ROUTE_ORIGIN,
} from '../constants/config';
import type { RootStackParamList } from '../navigation/types';
import type {
  ArcGISMapDiagnostic,
  ArcGISMapCommand,
  MapRouteData,
  MapRouteError,
  MapRouteResult,
  MapState,
  MapStopSelection,
} from '../types/maps';
import { styles } from './MapScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'Map'>;
type MapStoreInput = RootStackParamList['Map']['route']['stores'][number];
const MAX_MAP_DIAGNOSTICS = 24;

export function MapScreen({ navigation, route }: Props) {
  const { route: selectedRoute, routeId } = route.params;
  const mapData = useMemo<MapRouteData>(
    () => ({
      routeId: routeId ?? 'local-preview',
      origin: { ...DEMO_ROUTE_ORIGIN },
      stops: selectedRoute.stores.map((
        { address, latitude, longitude, name }: MapStoreInput,
        index: number,
      ) => ({
        address,
        ...(latitude != null && longitude != null
          ? { coordinate: { latitude, longitude } }
          : {}),
        name,
        sequence: index + 1,
      })),
      estimatedDistanceMiles: selectedRoute.distance,
      estimatedTimeMinutes: selectedRoute.time,
    }),
    [routeId, selectedRoute],
  );
  const [mapState, setMapState] = useState<MapState>('loadingMap');
  const [mapErrorMessage, setMapErrorMessage] = useState<string | null>(null);
  const [routeError, setRouteError] = useState<MapRouteError | null>(null);
  const [routeResult, setRouteResult] = useState<MapRouteResult | null>(null);
  const [mapDiagnostics, setMapDiagnostics] = useState<readonly ArcGISMapDiagnostic[]>([]);
  const [firstDiagnosticFailure, setFirstDiagnosticFailure] =
    useState<ArcGISMapDiagnostic | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mapCommand, setMapCommand] = useState<ArcGISMapCommand>();
  const [isDirectionsExpanded, setIsDirectionsExpanded] = useState(false);
  const [selectedDirection, setSelectedDirection] = useState<number | null>(null);
  const [selectedStop, setSelectedStop] = useState<MapStopSelection | null>(null);

  useEffect(() => {
    setMapState('loadingMap');
    setMapErrorMessage(null);
    setRouteError(null);
    setRouteResult(null);
    setMapDiagnostics([]);
    setFirstDiagnosticFailure(null);
    setMapCommand(undefined);
    setIsDirectionsExpanded(false);
    setSelectedDirection(null);
    setSelectedStop(null);
  }, [mapData]);

  const sendMapCommand = useCallback((payload: ArcGISMapCommand['payload']) => {
    setMapCommand((current) => ({ id: (current?.id ?? 0) + 1, payload }));
  }, []);

  const setDirectionsExpanded = useCallback((expanded: boolean) => {
    setIsDirectionsExpanded(expanded);
    sendMapCommand({
      type: 'setInteraction',
      enabled: !expanded,
      bottomPadding: expanded ? 280 : 48,
    });
  }, [sendMapCommand]);

  const retryMap = useCallback(() => {
    setMapState('loadingMap');
    setMapErrorMessage(null);
    setRouteError(null);
    setRouteResult(null);
    setMapDiagnostics([]);
    setFirstDiagnosticFailure(null);
    setReloadKey((currentKey) => currentKey + 1);
  }, []);

  const openInBrowser = useCallback(async () => {
    try {
      await Linking.openURL(ARCGIS_WEB_MAP_BROWSER_URL);
    } catch {
      setMapErrorMessage('The ArcGIS Web Map could not be opened in a browser.');
      setMapState('mapUnavailable');
    }
  }, []);

  const distance = routeResult?.totalDistanceMiles ?? mapData.estimatedDistanceMiles;
  const time = routeResult?.totalTimeMinutes ?? mapData.estimatedTimeMinutes;
  const summary = `${mapData.stops.length} ${mapData.stops.length === 1 ? 'stop' : 'stops'} - ${distance.toFixed(1)} mi - ${Math.round(time)} min`;
  const routeErrorMessage = routeError
    ? [
        routeError.stopSequence === undefined
          ? null
          : `Stop ${routeError.stopSequence}${routeError.stopName ? ` (${routeError.stopName})` : ''}`,
        routeError.message,
      ].filter(Boolean).join(': ')
    : null;
  const routeMap = (
    <RouteMap
      command={mapCommand}
      mapData={mapData}
      onDiagnostic={(diagnostic) => {
        setMapDiagnostics((current) =>
          [...current, diagnostic].slice(-MAX_MAP_DIAGNOSTICS)
        );
        if (diagnostic.status === 'failed') {
          setFirstDiagnosticFailure((current) => current ?? diagnostic);
        }
      }}
      onMapError={(message) => {
        setMapErrorMessage(message);
        setMapState('mapUnavailable');
      }}
      onMapLoadStart={() => {
        setMapErrorMessage(null);
        setRouteError(null);
        setRouteResult(null);
        setMapDiagnostics([]);
        setFirstDiagnosticFailure(null);
        setMapState('loadingMap');
      }}
      onMapReady={() => setMapState('solvingRoute')}
      onRouteError={(error) => {
        setRouteError(error);
        setRouteResult(null);
        setMapState('routeUnavailable');
      }}
      onRouteSolved={(result) => {
        setRouteError(null);
        setRouteResult(result);
        setMapState('routeReady');
      }}
      onRouteSolving={() => setMapState('solvingRoute')}
      onStopSelected={(stop) => {
        setSelectedStop(stop);
        setSelectedDirection(null);
      }}
      reloadKey={reloadKey}
      state={mapState}
    />
  );

  if (mapState === 'mapUnavailable') {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
        <ScrollView contentContainerStyle={styles.fallbackContent}>
          <View style={styles.summaryBand}>
            <Text accessibilityRole="header" style={styles.title}>Route map</Text>
            <Text style={styles.subtitle}>{summary}</Text>
          </View>
          <Text accessibilityLiveRegion="assertive" style={styles.errorText}>
            {mapErrorMessage ?? 'The interactive map is unavailable.'} Your route details are shown below.
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
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <View style={styles.summaryBand}>
        <Pressable
          accessibilityLabel="Close route map"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeButtonText}>Close</Text>
        </Pressable>
        <View style={styles.summaryCopy}>
          <Text accessibilityRole="header" style={styles.title}>Route map</Text>
          <Text style={styles.subtitle}>{summary}</Text>
        </View>
      </View>
      <View style={styles.mapSurface}>{routeMap}</View>
      {selectedStop ? (
        <Text accessibilityLiveRegion="polite" style={styles.selectionStatus}>
          Stop {selectedStop.sequence}: {selectedStop.name}
        </Text>
      ) : null}
      <MapDiagnosticsPanel
        diagnostics={mapDiagnostics}
        firstFailure={firstDiagnosticFailure}
      />
      {routeErrorMessage ? (
        <View style={styles.routeErrorBand}>
          <Text accessibilityLiveRegion="assertive" style={styles.routeErrorText}>
            {routeErrorMessage}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={retryMap}
            style={({ pressed }) => [styles.routeRetryButton, pressed && styles.pressed]}
          >
            <Text style={styles.routeRetryText}>Retry route</Text>
          </Pressable>
        </View>
      ) : null}
      {routeResult ? (
        <RouteDirectionsPanel
          isExpanded={isDirectionsExpanded}
          key={`${mapData.routeId}-${reloadKey}`}
          onExpandedChange={setDirectionsExpanded}
          onSelectDirection={(sequence) => {
            setSelectedDirection(sequence);
            setSelectedStop(null);
            sendMapCommand({
              type: 'selectDirection',
              sequence,
              bottomPadding: isDirectionsExpanded ? 280 : 48,
            });
          }}
          result={routeResult}
          selectedSequence={selectedDirection}
        />
      ) : null}
    </SafeAreaView>
  );
}