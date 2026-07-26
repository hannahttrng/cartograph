import { render } from '@testing-library/react-native';

import { ArcGISMapAdapter } from '../../../../frontend/src/components/map/ArcGISMapAdapter';
import type { MapRouteData } from '../../../../frontend/src/types/maps';

let mockWebViewProps: any;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: (props: any) => {
      mockWebViewProps = props;
      return React.createElement(View, { testID: 'arcgis-webview' });
    },
  };
});

const mapData: MapRouteData = {
  estimatedDistanceMiles: 2.5,
  estimatedTimeMinutes: 7,
  origin: {
    label: 'Demo location',
    latitude: 34.0556,
    longitude: -117.1825,
  },
  routeId: 'route-1',
  stops: [
    {
      address: '560 W Stuart Ave, Redlands, CA 92374',
      name: 'Sprouts',
      sequence: 1,
    },
  ],
};

const renderAdapter = async () => {
  const callbacks = {
    onDiagnostic: jest.fn(),
    onMapError: jest.fn(),
    onMapLoadStart: jest.fn(),
    onMapReady: jest.fn(),
    onRouteError: jest.fn(),
    onRouteSolved: jest.fn(),
    onRouteSolving: jest.fn(),
  };

  await render(<ArcGISMapAdapter mapData={mapData} {...callbacks} />);
  return callbacks;
};

const postMessage = (message: unknown) => {
  mockWebViewProps.onMessage({
    nativeEvent: { data: JSON.stringify(message) },
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockWebViewProps = undefined;
});

test('dispatches map, solving, and solved messages to native callbacks', async () => {
  const callbacks = await renderAdapter();
  const result = {
    directions: [
      {
        distanceMiles: 0.5,
        sequence: 1,
        text: 'Head north',
        timeMinutes: 1.5,
      },
    ],
    totalDistanceMiles: 2.4,
    totalTimeMinutes: 7,
  };

  postMessage({ type: 'mapReady' });
  postMessage({ type: 'routeSolving' });
  postMessage({ type: 'routeSolved', result });

  expect(callbacks.onMapReady).toHaveBeenCalledTimes(1);
  expect(callbacks.onRouteSolving).toHaveBeenCalledTimes(1);
  expect(callbacks.onRouteSolved).toHaveBeenCalledWith(result);
  expect(mockWebViewProps.source.html).toContain('findBestSequence: false');
});

test('keeps route failures distinct from map failures', async () => {
  const callbacks = await renderAdapter();
  const routeError = {
    code: 'GEOCODING',
    message: 'No precise address match.',
    stopName: 'Sprouts',
    stopSequence: 1,
  };

  postMessage({ type: 'routeError', error: routeError });
  postMessage({ type: 'timeout', stage: 'route' });
  postMessage({ type: 'timeout', stage: 'map' });

  expect(callbacks.onRouteError).toHaveBeenNthCalledWith(1, routeError);
  expect(callbacks.onRouteError).toHaveBeenNthCalledWith(2, {
    code: 'TIMEOUT',
    message: 'ArcGIS took too long to calculate this route.',
  });
  expect(callbacks.onMapError).toHaveBeenCalledWith(
    'The ArcGIS map took too long to load.',
  );
});

test('rejects malformed messages and reports native WebView process failures', async () => {
  const callbacks = await renderAdapter();

  mockWebViewProps.onMessage({ nativeEvent: { data: 'not-json' } });
  mockWebViewProps.onRenderProcessGone();

  expect(callbacks.onMapError).toHaveBeenNthCalledWith(
    1,
    'The ArcGIS map returned an invalid response.',
  );
  expect(callbacks.onMapError).toHaveBeenNthCalledWith(
    2,
    'The interactive map process stopped unexpectedly.',
  );
});

test('dispatches parsed diagnostic snapshots without treating them as errors', async () => {
  const callbacks = await renderAdapter();
  const diagnostic = {
    facts: { controlPixels: 240, webgl2: true },
    message: 'Diagnostic control rendered.',
    sequence: 3,
    stage: 'control-rendered',
    status: 'passed',
  };

  postMessage({ type: 'diagnostic', diagnostic });

  expect(callbacks.onDiagnostic).toHaveBeenCalledWith(diagnostic);
  expect(callbacks.onMapError).not.toHaveBeenCalled();
});