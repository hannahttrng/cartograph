import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';

import {
  ARCGIS_API_KEY,
  ARCGIS_GEOCODING_SERVICE_URL,
  ARCGIS_MAP_DIAGNOSTICS,
  ARCGIS_MAP_HOST,
  ARCGIS_MAP_SOURCE,
  ARCGIS_PORTAL_URL,
  ARCGIS_ROUTE_SERVICE_URL,
  ARCGIS_WEB_MAP_ITEM_ID,
} from '../../constants/config';
import type {
  ArcGISMapDiagnostic,
  ArcGISMapCommand,
  MapRouteData,
  MapRouteError,
  MapRouteResult,
  MapStopSelection,
} from '../../types/maps';
import {
  createArcGISMapCommandScript,
  createArcGISMapHtml,
  parseArcGISMapMessage,
} from './arcgisMapBridge';

interface ArcGISMapAdapterProps {
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
}

export function ArcGISMapAdapter({
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
}: ArcGISMapAdapterProps) {
  const webViewRef = useRef<WebView>(null);
  const html = useMemo(
    () => createArcGISMapHtml({
      apiKey: ARCGIS_API_KEY,
      diagnosticsEnabled: ARCGIS_MAP_DIAGNOSTICS,
      geocodingServiceUrl: ARCGIS_GEOCODING_SERVICE_URL,
      mapHost: ARCGIS_MAP_HOST,
      mapData,
      mapSource: ARCGIS_MAP_SOURCE,
      portalUrl: ARCGIS_PORTAL_URL,
      routeServiceUrl: ARCGIS_ROUTE_SERVICE_URL,
      webMapItemId: ARCGIS_WEB_MAP_ITEM_ID,
    }),
    [mapData],
  );

  useEffect(() => {
    if (command) {
      webViewRef.current?.injectJavaScript(
        createArcGISMapCommandScript(command.payload),
      );
    }
  }, [command]);

  const handleMessage = (event: WebViewMessageEvent) => {
    const message = parseArcGISMapMessage(event.nativeEvent.data);
    if (!message) {
      onMapError('The ArcGIS map returned an invalid response.');
      return;
    }

    switch (message.type) {
      case 'mapReady':
        onMapReady();
        break;
      case 'routeSolving':
        onRouteSolving();
        break;
      case 'routeSolved':
        onRouteSolved(message.result);
        break;
      case 'stopSelected':
        onStopSelected(message.stop);
        break;
      case 'routeError':
        onRouteError(message.error);
        break;
      case 'diagnostic':
        onDiagnostic(message.diagnostic);
        break;
      case 'mapError':
        onMapError(message.message);
        break;
      case 'timeout':
        if (message.stage === 'map') {
          onMapError('The ArcGIS map took too long to load.');
        } else {
          onRouteError({
            code: 'TIMEOUT',
            message: 'ArcGIS took too long to calculate this route.',
          });
        }
        break;
    }
  };

  const handleMapProcessError = () => {
    onMapError('The interactive map process stopped unexpectedly.');
  };

  return (
    <View
      accessibilityLabel={`Interactive ArcGIS map with ${mapData.stops.length} route stores`}
      style={styles.container}
    >
      <WebView
        javaScriptEnabled
        onContentProcessDidTerminate={handleMapProcessError}
        onError={handleMapProcessError}
        onHttpError={handleMapProcessError}
        onLoadStart={onMapLoadStart}
        onMessage={handleMessage}
        onRenderProcessGone={handleMapProcessError}
        originWhitelist={['https://*']}
        ref={webViewRef}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: ARCGIS_PORTAL_URL }}
        style={styles.map}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    backgroundColor: '#F4F7F4',
    flex: 1,
  },
});