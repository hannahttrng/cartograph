import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { HomeScreen } from '../../../frontend/src/screens/HomeScreen';
import { loadAccountPreferences } from '../../../frontend/src/utils/accountPreferencesStorage';

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
  };
});

jest.mock('../../../frontend/src/utils/accountPreferencesStorage', () => ({
  ...jest.requireActual('../../../frontend/src/utils/accountPreferencesStorage'),
  loadAccountPreferences: jest.fn(),
}));

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

jest.mock('../../../frontend/src/components/map/MapPreview', () => ({
  MapPreview: ({ onPress }: { onPress?: () => void }) => {
    const React = require('react');
    const { Pressable } = require('react-native');
    return React.createElement(Pressable, {
      accessibilityLabel: 'Open full screen map',
      accessibilityRole: 'button',
      onPress,
    });
  },
}));

const navigation = { navigate: jest.fn() };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(loadAccountPreferences).mockResolvedValue(null);
});

test('greets the persisted account display name', async () => {
  jest.mocked(loadAccountPreferences).mockResolvedValue({
    dealAlerts: true,
    dietary: [],
    displayName: 'Hannah',
    householdSize: 1,
    listReminders: false,
    location: 'Redlands, CA',
    pronouns: '',
    routeUpdates: true,
    stores: [],
  });

  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <HomeScreen
        {...({ navigation } as unknown as ComponentProps<typeof HomeScreen>)}
      />
    </SafeAreaProvider>,
  );

  expect(await screen.findByText('Hi, Hannah')).toBeOnTheScreen();
});

test('opens the full screen location map from the preview', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <HomeScreen
        {...({ navigation } as unknown as ComponentProps<typeof HomeScreen>)}
      />
    </SafeAreaProvider>,
  );

  await fireEvent.press(screen.getByLabelText('Open full screen map'));
  expect(navigation.navigate).toHaveBeenCalledWith('NearbyStores');
});

test('opens the list builder with the catalog search populated', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <HomeScreen
        {...({ navigation } as unknown as ComponentProps<typeof HomeScreen>)}
      />
    </SafeAreaProvider>,
  );

  await fireEvent.changeText(screen.getByLabelText('Search catalog items'), 'ground beef');
  await fireEvent.press(screen.getByLabelText('Open catalog search'));

  expect(navigation.navigate).toHaveBeenCalledWith('NewShoppingList', {
    initialSearch: 'ground beef',
    title: 'New List',
  });
});