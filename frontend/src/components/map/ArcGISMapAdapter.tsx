import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { WebViewMessageEvent } from 'react-native-webview';
import { WebView } from 'react-native-webview';

import {
  ARCGIS_PORTAL_URL,
  ARCGIS_WEB_MAP_ITEM_ID,
} from '../../constants/config';
import type { MapRouteData } from '../../types/maps';

interface ArcGISMapAdapterProps {
  mapData: MapRouteData;
  onError: () => void;
}

const createEmbeddedMapHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, arcgis-embedded-map { height: 100%; width: 100%; margin: 0; }
      body { overflow: hidden; background: #f4f7f4; }
    </style>
    <script>
      const notify = (type) => window.ReactNativeWebView?.postMessage(JSON.stringify({ type }));
      window.addEventListener('error', () => notify('error'));
      const loadTimeout = window.setTimeout(() => notify('timeout'), 20000);
    </script>
    <script
      type="module"
      src="https://js.arcgis.com/5.1/embeddable-components/"
      onerror="notify('error')"
    ></script>
  </head>
  <body>
    <arcgis-embedded-map
      id="cartograph-map"
      item-id="${ARCGIS_WEB_MAP_ITEM_ID}"
      theme="light"
      time-zone-label-enabled
      center="-117.1816653218417,34.057149627528155"
      scale="36111.909643"
      portal-url="${ARCGIS_PORTAL_URL}"
    ></arcgis-embedded-map>
    <script type="module">
      customElements.whenDefined('arcgis-embedded-map').then(() => {
        window.clearTimeout(loadTimeout);
        notify('ready');
      });
    </script>
  </body>
</html>`;

export function ArcGISMapAdapter({ mapData, onError }: ArcGISMapAdapterProps) {
  const [isLoading, setIsLoading] = useState(true);
  const html = useMemo(createEmbeddedMapHtml, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (!message || typeof message !== 'object' || !('type' in message)) {
        return;
      }

      if (message.type === 'ready') {
        setIsLoading(false);
      } else if (message.type === 'error' || message.type === 'timeout') {
        onError();
      }
    } catch {
      onError();
    }
  };

  return (
    <View
      accessibilityLabel={`Interactive ArcGIS map with ${mapData.stores.length} route stores`}
      style={styles.container}
    >
      <WebView
        javaScriptEnabled
        onError={onError}
        onHttpError={onError}
        onMessage={handleMessage}
        originWhitelist={['https://*']}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        source={{ html, baseUrl: ARCGIS_PORTAL_URL }}
        style={styles.map}
      />
      {isLoading ? (
        <View pointerEvents="none" style={styles.loadingOverlay}>
          <ActivityIndicator color="#243B53" />
          <Text style={styles.loadingText}>Loading interactive map...</Text>
        </View>
      ) : null}
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
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    backgroundColor: '#F4F7F4',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#52606D',
    fontSize: 14,
    marginTop: 10,
  },
});