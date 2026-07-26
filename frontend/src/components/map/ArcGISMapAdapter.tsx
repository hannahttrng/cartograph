import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { ARCGIS_TEST_WEB_MAP_URL } from '../../constants/maps';

interface ArcGISMapAdapterProps {
  onError: () => void;
  onLoad: () => void;
  onLoadStart: () => void;
}

const WEBGL_FAILURE_MESSAGE = 'ARCGIS_WEBGL_UNAVAILABLE';
const detectWebGlFailure = `
  (() => {
    const reportFailure = () => {
      const pageText = document.body?.innerText ?? '';
      if (
        pageText.includes('Unable to display map') ||
        pageText.includes('WebGL2 support is required')
      ) {
        window.ReactNativeWebView.postMessage('${WEBGL_FAILURE_MESSAGE}');
      }
    };

    reportFailure();
    window.setTimeout(reportFailure, 3000);
    window.setTimeout(reportFailure, 8000);
  })();
  true;
`;

export function ArcGISMapAdapter({
  onError,
  onLoad,
  onLoadStart,
}: ArcGISMapAdapterProps) {
  return (
    <WebView
      accessibilityLabel="Interactive ArcGIS route map"
      androidLayerType="hardware"
      injectedJavaScript={detectWebGlFailure}
      javaScriptEnabled
      onContentProcessDidTerminate={onError}
      onError={onError}
      onHttpError={onError}
      onLoad={onLoad}
      onLoadStart={onLoadStart}
      onMessage={({ nativeEvent }) => {
        if (nativeEvent.data === WEBGL_FAILURE_MESSAGE) {
          onError();
        }
      }}
      onRenderProcessGone={onError}
      originWhitelist={['https://*']}
      setSupportMultipleWindows={false}
      source={{ uri: ARCGIS_TEST_WEB_MAP_URL }}
      startInLoadingState={false}
      style={styles.map}
    />
  );
}

const styles = StyleSheet.create({
  map: {
    backgroundColor: '#E9EEE8',
    flex: 1,
  },
});