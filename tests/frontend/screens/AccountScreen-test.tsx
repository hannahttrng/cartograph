import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AccountScreen } from '../../../frontend/src/screens/AccountScreen';

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

jest.mock('../../../frontend/src/utils/accountPreferencesStorage', () => ({
  loadAccountPreferences: jest.fn().mockResolvedValue(null),
  saveAccountPreferences: jest.fn().mockResolvedValue(undefined),
}));

const navigation = { reset: jest.fn() };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

test('opens the ArcGIS feedback survey', async () => {
  const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);

  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AccountScreen
        {...({ navigation } as unknown as ComponentProps<typeof AccountScreen>)}
      />
    </SafeAreaProvider>,
  );

  await fireEvent.press(screen.getByLabelText('Open feedback survey'));
  expect(openUrl).toHaveBeenCalledWith('https://arcg.is/0LS0yW1');
});

test('opens Personal Information and focuses display name from the pencil', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AccountScreen
        {...({ navigation } as unknown as ComponentProps<typeof AccountScreen>)}
      />
    </SafeAreaProvider>,
  );

  expect(screen.queryByLabelText('Display name')).not.toBeOnTheScreen();
  await fireEvent.press(screen.getByLabelText('Edit display name'));
  const displayName = await screen.findByLabelText('Display name');
  await fireEvent.changeText(displayName, 'Hannah');
  expect(screen.getByRole('header', { name: 'Hannah' })).toBeOnTheScreen();
});