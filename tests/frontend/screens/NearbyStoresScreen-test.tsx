import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NearbyStoresScreen } from '../../../frontend/src/screens/NearbyStoresScreen';

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

jest.mock('../../../frontend/src/components/map/MapPreview', () => ({
  MapPreview: ({ fullScreen }: { fullScreen?: boolean }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, fullScreen ? 'Live full map' : 'Preview map');
  },
}));

const navigation = {
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  navigate: jest.fn(),
};
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

test('uses the live ArcGIS map on the designated Stores map page', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <NearbyStoresScreen
        {...({ navigation } as unknown as ComponentProps<typeof NearbyStoresScreen>)}
      />
    </SafeAreaProvider>,
  );

  expect(screen.getByText('Live full map')).toBeOnTheScreen();
});