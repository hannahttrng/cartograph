import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { RoutePreviewScreen } from '../../../frontend/src/screens/RoutePreviewScreen';
import { RoutesScreen } from '../../../frontend/src/screens/RoutesScreen';

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

const navigation = { navigate: jest.fn() };

beforeEach(() => {
  jest.resetAllMocks();
});

test('preserves fixture order, expands a route, and opens its stable map ID', async () => {
  await render(
    <RoutesScreen
      {...({ navigation } as unknown as ComponentProps<typeof RoutesScreen>)}
    />,
  );

  expect(screen.getByText('Route Preview')).toBeOnTheScreen();
  const routeOne = screen.getByLabelText(/Route 1, rank 1 of 3/);
  expect(routeOne.props.accessibilityState).toEqual({ expanded: false });

  await fireEvent.press(routeOne);
  expect(screen.getByLabelText(/Route 1, rank 1 of 3/).props.accessibilityState).toEqual({ expanded: true });
  expect(screen.getByText('Store order')).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Open Route 1 map'));
  expect(navigation.navigate).toHaveBeenCalledWith('Map', expect.objectContaining({
    routeId: 'optimizer-route-1',
  }));
});

test('sorts fixture copies for Fastest without calling the live route endpoint', async () => {
  await render(
    <RoutePreviewScreen
      {...({
        navigation,
        route: {
          key: 'route-preview',
          name: 'RouteResults',
          params: { items: ['milk'], listId: 7, listName: 'Weekend' },
        },
      } as unknown as ComponentProps<typeof RoutePreviewScreen>)}
    />,
  );

  expect(screen.getByText('Weekend has 1 item.')).toBeOnTheScreen();
  expect(screen.getByText(/not calculated from this list yet/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Fastest'));

  expect(screen.getByLabelText(/Fastest, rank 1 of 3/)).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Open Fastest map'));
  expect(navigation.navigate).toHaveBeenCalledWith('Map', expect.objectContaining({
    routeId: 'optimizer-route-1',
  }));
});
