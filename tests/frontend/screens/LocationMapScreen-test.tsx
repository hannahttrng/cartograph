import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LocationMapScreen } from '../../../frontend/src/screens/LocationMapScreen';

jest.mock('../../../frontend/src/components/map/MapPreview', () => ({
  MapPreview: ({ fullScreen }: { fullScreen?: boolean }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(Text, null, fullScreen ? 'Full map' : 'Preview map');
  },
}));

const navigation = { goBack: jest.fn() };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

test('renders the location map full screen and closes it', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <LocationMapScreen
        {...({ navigation } as unknown as ComponentProps<typeof LocationMapScreen>)}
      />
    </SafeAreaProvider>,
  );

  expect(screen.getByText('Full map')).toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Close full screen map'));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});