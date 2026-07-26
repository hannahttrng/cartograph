import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { MapScreen } from '../../../frontend/src/screens/MapScreen';
import type { RootStackParamList } from '../../../frontend/src/navigation/types';

let mockRouteMapProps: any;

jest.mock('../../../frontend/src/components/map/RouteMap', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    RouteMap: (props: any) => {
      mockRouteMapProps = props;
      return React.createElement(View, { testID: 'route-map' });
    },
  };
});

const selectedRoute: RootStackParamList['Map']['route'] = {
  distance: 10.2,
  stores: [
    {
      address: '560 W Stuart Ave, Redlands, CA 92374',
      latitude: 34.056,
      longitude: -117.195,
      name: 'Sprouts',
    },
    {
      address: '552 Orange St, Redlands, CA 92374',
      latitude: null,
      longitude: null,
      name: 'Trader Joes',
    },
  ],
  time: 25,
};
const navigation = { goBack: jest.fn() };

const renderScreen = async () => render(
  <MapScreen
    {...({
      navigation,
      route: {
        key: 'map-test',
        name: 'Map',
        params: { route: selectedRoute, routeId: 'route-test' },
      },
    } as unknown as ComponentProps<typeof MapScreen>)}
  />,
);

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteMapProps = undefined;
});

test('preserves ordered coordinate and address-fallback stops, then uses ArcGIS totals', async () => {
  await renderScreen();

  expect(screen.getByText('2 stops - 10.2 mi - 25 min')).toBeOnTheScreen();
  expect(mockRouteMapProps.mapData).toMatchObject({
    origin: {
      latitude: 34.0556,
      longitude: -117.1825,
    },
    stops: [
      {
        address: '560 W Stuart Ave, Redlands, CA 92374',
        coordinate: { latitude: 34.056, longitude: -117.195 },
        name: 'Sprouts',
        sequence: 1,
      },
      {
        address: '552 Orange St, Redlands, CA 92374',
        name: 'Trader Joes',
        sequence: 2,
      },
    ],
  });
  expect(mockRouteMapProps.mapData.stops[1]).not.toHaveProperty('coordinate');

  await act(async () => {
    mockRouteMapProps.onRouteSolved({
      directions: [
        {
          distanceMiles: 1.2,
          sequence: 1,
          text: 'Head north toward Stuart Avenue',
          timeMinutes: 3,
        },
      ],
      totalDistanceMiles: 4.8,
      totalTimeMinutes: 14,
    });
  });

  expect(screen.getByText('2 stops - 4.8 mi - 14 min')).toBeOnTheScreen();
  expect(screen.queryByText('Head north toward Stuart Avenue')).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Expand directions'));
  expect(screen.getByText('Head north toward Stuart Avenue')).toBeOnTheScreen();
  expect(mockRouteMapProps.state).toBe('routeReady');
});

test('closes the route map from the in-screen header', async () => {
  await renderScreen();

  await fireEvent.press(screen.getByLabelText('Close route map'));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

test('keeps the route fitted while directions expand and highlights selected directions', async () => {
  await renderScreen();

  await act(async () => {
    mockRouteMapProps.onRouteSolved({
      directions: [
        {
          distanceMiles: 1.2,
          sequence: 1,
          text: 'Head north toward Stuart Avenue',
          timeMinutes: 3,
        },
      ],
      totalDistanceMiles: 4.8,
      totalTimeMinutes: 14,
    });
  });

  expect(screen.queryByLabelText('Recenter route')).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Expand directions'));
  expect(mockRouteMapProps.command.payload).toEqual({
    type: 'setInteraction',
    enabled: false,
    bottomPadding: 280,
  });

  await fireEvent.press(screen.getByLabelText('Direction 1: Head north toward Stuart Avenue'));
  expect(mockRouteMapProps.command.payload).toEqual({
    type: 'selectDirection',
    sequence: 1,
    bottomPadding: 280,
  });
});

test('surfaces Store selections reported by the map', async () => {
  await renderScreen();

  await act(async () => {
    mockRouteMapProps.onStopSelected({ name: 'Sprouts', sequence: 1 });
  });

  expect(screen.getByText('Stop 1: Sprouts')).toBeOnTheScreen();
});

test('keeps the map available for route errors and resets state on retry', async () => {
  await renderScreen();

  await act(async () => {
    mockRouteMapProps.onRouteError({
      code: 'GEOCODING',
      message: 'No precise address match.',
      stopName: 'Trader Joes',
      stopSequence: 2,
    });
  });

  expect(screen.getByText('Stop 2 (Trader Joes): No precise address match.')).toBeOnTheScreen();
  expect(mockRouteMapProps.state).toBe('routeUnavailable');

  await fireEvent.press(screen.getByText('Retry route'));

  expect(screen.queryByText('No precise address match.')).not.toBeOnTheScreen();
  expect(mockRouteMapProps.state).toBe('loadingMap');
});

test('shows the existing fallback actions only after a full map failure', async () => {
  await renderScreen();

  await act(async () => {
    mockRouteMapProps.onMapError('The Web Map failed to load.');
  });

  expect(screen.getByText(/The Web Map failed to load.*route details are shown below/)).toBeOnTheScreen();
  expect(screen.getByText('Open in browser')).toBeOnTheScreen();
  expect(mockRouteMapProps.state).toBe('mapUnavailable');
});

test('shows bounded map diagnostics independently from the route entry point', async () => {
  await renderScreen();

  await act(async () => {
    for (let sequence = 1; sequence <= 30; sequence += 1) {
      mockRouteMapProps.onDiagnostic({
        facts: { sequence },
        message: sequence === 3 ? 'First render failure.' : `Event ${sequence}`,
        sequence,
        stage: sequence === 3 ? 'control-rendered' : 'map-ready',
        status: sequence === 3 ? 'failed' : 'info',
      });
    }
  });

  expect(screen.getByText('Map diagnostics')).toBeOnTheScreen();
  expect(screen.getByText(/Failed at control-rendered: First render failure/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('View details'));
  expect(screen.getByText('24 recent events')).toBeOnTheScreen();
  expect(screen.getByText('#30')).toBeOnTheScreen();
  expect(screen.queryByText('#1')).not.toBeOnTheScreen();
});