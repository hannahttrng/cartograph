import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { RouteDirectionsPanel } from '../../../../frontend/src/components/map/RouteDirectionsPanel';
import { RouteMapFallback } from '../../../../frontend/src/components/map/RouteMapFallback';
import type { MapRouteData, MapRouteResult } from '../../../../frontend/src/types/maps';

const result: MapRouteResult = {
  directions: [
    {
      distanceMiles: 0.75,
      sequence: 1,
      text: 'Turn right on Orange Street',
      timeMinutes: 2.5,
    },
    {
      distanceMiles: 1.25,
      sequence: 2,
      text: 'Arrive at Trader Joes',
      timeMinutes: 4,
    },
  ],
  totalDistanceMiles: 4.2,
  totalTimeMinutes: 11,
};

const mapData: MapRouteData = {
  estimatedDistanceMiles: 4.25,
  estimatedTimeMinutes: 11,
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
    {
      address: '552 Orange St, Redlands, CA 92374',
      name: 'Trader Joes',
      sequence: 2,
    },
  ],
};

function DirectionsHarness() {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<number | null>(null);
  return (
    <RouteDirectionsPanel
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      onSelectDirection={setSelectedSequence}
      result={result}
      selectedSequence={selectedSequence}
    />
  );
}

test('renders ordered directions and exposes an accessible collapse control', async () => {
  await render(<DirectionsHarness />);

  expect(screen.getByText('Route ready - 4.2 miles, 11 minutes')).toBeOnTheScreen();
  expect(screen.queryByText('Turn right on Orange Street')).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Expand directions'));
  expect(screen.getByText('Turn right on Orange Street')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Direction 1: Turn right on Orange Street'));
  expect(screen.getByLabelText('Direction 1: Turn right on Orange Street').props.accessibilityState)
    .toEqual({ selected: true });
  const collapseButton = screen.getByLabelText('Collapse directions');
  expect(collapseButton.props.accessibilityState).toEqual({ expanded: true });

  await fireEvent.press(collapseButton);

  expect(screen.queryByText('Turn right on Orange Street')).not.toBeOnTheScreen();
  expect(screen.getByLabelText('Expand directions').props.accessibilityState).toEqual({
    expanded: false,
  });
});

test('renders the fallback as origin, ordered Stores, then the same origin', async () => {
  await render(<RouteMapFallback mapData={mapData} />);

  expect(screen.getAllByText('Demo location')).toHaveLength(2);
  expect(screen.getByText('Start')).toBeOnTheScreen();
  expect(screen.getByText('Sprouts')).toBeOnTheScreen();
  expect(screen.getByText('Trader Joes')).toBeOnTheScreen();
  expect(screen.getByText('Return')).toBeOnTheScreen();
});