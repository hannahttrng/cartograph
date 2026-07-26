import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ARCGIS_API_KEY } from '../../constants/config';
import { colors, fontFamily, radius } from '../../theme';
import type { DemoStore, UserLocation } from '../../types/demo';

interface MapPreviewProps {
  fullScreen?: boolean;
  onPress?: () => void;
  stores: readonly DemoStore[];
  userLocation: UserLocation;
}

const serializeForInlineScript = (value: unknown): string =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');

export const createLocationPreviewHtml = (
  userLocation: UserLocation,
  stores: readonly DemoStore[],
): string => {
  const config = serializeForInlineScript({
    apiKey: ARCGIS_API_KEY,
    stores: stores.map(({ address, latitude, longitude, name }) => ({
      address,
      latitude,
      longitude,
      name,
    })),
    userLocation,
  });

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
    <style>html,body,arcgis-map{height:100%;margin:0;width:100%}body{background:#e9f6df}</style>
    <script type="module" src="https://js.arcgis.com/5.1/"></script>
    <script type="module" src="https://js.arcgis.com/map-components/5.1/arcgis-map-components.esm.js"></script>
  </head>
  <body>
    <arcgis-map
      basemap="arcgis/navigation"
      center="${userLocation.longitude},${userLocation.latitude}"
      id="map"
      zoom="13"
    ></arcgis-map>
    <script type="module">
      const config = ${config};
      const notify = (message) => window.ReactNativeWebView?.postMessage(message);
      try {
        const [esriConfig, Graphic] = await $arcgis.import([
          "@arcgis/core/config.js",
          "@arcgis/core/Graphic.js"
        ]);
        if (config.apiKey) esriConfig.apiKey = config.apiKey;
        await customElements.whenDefined("arcgis-map");
        const mapElement = document.querySelector("#map");
        await mapElement.viewOnReady();
        const view = mapElement.view;
        config.stores.forEach((store) => view.graphics.add(new Graphic({
          attributes: store,
          geometry: { type: "point", latitude: store.latitude, longitude: store.longitude },
          popupTemplate: { title: "{name}", content: "{address}" },
          symbol: {
            type: "simple-marker",
            color: [20, 124, 54, 0.9],
            outline: { color: [255, 255, 255, 1], width: 1.5 },
            size: 10
          }
        })));
        view.graphics.add(new Graphic({
          geometry: {
            type: "point",
            latitude: config.userLocation.latitude,
            longitude: config.userLocation.longitude
          },
          popupTemplate: { title: config.userLocation.label },
          symbol: {
            type: "simple-marker",
            color: [28, 159, 232, 1],
            outline: { color: [255, 255, 255, 1], width: 3 },
            size: 16
          }
        }));
        view.padding = { top: 56, right: 32, bottom: 56, left: 32 };
        await view.goTo(view.graphics.toArray(), {
          animate: true,
          duration: 600,
          easing: "ease-in-out"
        });
        notify("mapReady");
      } catch (error) {
        console.error(error);
        notify("mapError");
      }
    </script>
  </body>
</html>`;
};

export function MapPreview({ fullScreen = false, onPress, stores, userLocation }: MapPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const html = useMemo(
    () => createLocationPreviewHtml(userLocation, stores),
    [stores, userLocation],
  );

  return (
    <View style={[styles.map, fullScreen && styles.fullScreen]}>
      <WebView
        accessibilityLabel={`Interactive map centered near ${userLocation.label}`}
        javaScriptEnabled
        onMessage={(event) => {
          if (event.nativeEvent.data === 'mapReady') {
            setIsLoading(false);
            setLoadError(false);
          } else if (event.nativeEvent.data === 'mapError') {
            setIsLoading(false);
            setLoadError(true);
          }
        }}
        originWhitelist={['*']}
        setSupportMultipleWindows={false}
        source={{ html }}
        style={styles.webView}
      />
      {isLoading ? (
        <View accessibilityRole="progressbar" style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}
      {loadError ? (
        <View accessibilityLiveRegion="polite" style={styles.loading}>
          <Text style={styles.errorText}>Map preview unavailable</Text>
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.locationLabel}>
        <Text numberOfLines={1} style={styles.locationText}>{userLocation.label} · {stores.length} stores nearby</Text>
      </View>
      {onPress ? (
        <Pressable
          accessibilityLabel="Open full screen map"
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.openMap, pressed && styles.openMapPressed]}
        >
          <Text style={styles.openMapText}>Expand map</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  map: { aspectRatio: 392 / 251, borderRadius: 8, overflow: 'hidden' },
  fullScreen: { aspectRatio: undefined, borderRadius: 0, flex: 1 },
  webView: { backgroundColor: colors.surfaceSubtle, flex: 1 },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: colors.surfaceSubtle, justifyContent: 'center' },
  errorText: { color: colors.textMuted, fontFamily: fontFamily.bold, fontSize: 12 },
  locationLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.pill, bottom: 10, left: 10, maxWidth: '80%', paddingHorizontal: 10, paddingVertical: 5, position: 'absolute' },
  locationText: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 10 },
  openMap: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: radius.sm, justifyContent: 'center', minHeight: 36, paddingHorizontal: 12, position: 'absolute', right: 10, top: 10 },
  openMapPressed: { backgroundColor: '#E3E5E3' },
  openMapText: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 11 },
});