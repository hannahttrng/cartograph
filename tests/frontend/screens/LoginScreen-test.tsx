import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import LoginScreen from '../../../frontend/src/screens/LoginScreen';
import { AuthService } from '../../../frontend/src/services/auth';
import {
  loadAccountPreferences,
  saveAccountPreferences,
} from '../../../frontend/src/utils/accountPreferencesStorage';

jest.mock('../../../frontend/src/services/auth', () => ({
  AuthService: { register: jest.fn() },
}));

jest.mock('../../../frontend/src/utils/accountPreferencesStorage', () => ({
  loadAccountPreferences: jest.fn(),
  saveAccountPreferences: jest.fn(),
}));

const navigation = { navigate: jest.fn(), reset: jest.fn() };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetAllMocks();
  jest.mocked(AuthService.register).mockResolvedValue({
    id: 'demo-hannah',
    email: 'hannah@example.com',
    name: 'Hannah',
  });
  jest.mocked(loadAccountPreferences).mockResolvedValue(null);
  jest.mocked(saveAccountPreferences).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

test('accepts demo text and enters after a short simulated delay', async () => {
  await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <LoginScreen
        {...({ navigation } as unknown as ComponentProps<typeof LoginScreen>)}
      />
    </SafeAreaProvider>,
  );

  await fireEvent.changeText(screen.getByLabelText('Name'), 'Hannah');
  await fireEvent.changeText(screen.getByLabelText('Email'), 'hannah@example.com');
  await fireEvent.press(screen.getByLabelText('Sign in'));

  expect(screen.getByLabelText('Sign in').props.accessibilityState.busy).toBe(true);
  expect(navigation.reset).not.toHaveBeenCalled();

  await act(async () => {
    jest.advanceTimersByTime(700);
    await Promise.resolve();
  });

  expect(AuthService.register).toHaveBeenCalledWith({
    email: 'hannah@example.com',
    name: 'Hannah',
    password: 'demo',
  });
  expect(saveAccountPreferences).toHaveBeenCalledWith(expect.objectContaining({
    displayName: 'Hannah',
  }));
  expect(navigation.reset).toHaveBeenCalledWith({
    index: 0,
    routes: [{ name: 'Home' }],
  });
});