import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppBottomNav } from '../../../frontend/src/components/common/AppBottomNav';

const navigation = { navigate: jest.fn() };
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const renderFooter = (active: ComponentProps<typeof AppBottomNav>['active']) =>
  render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <AppBottomNav
        {...({ active, navigation } as unknown as ComponentProps<typeof AppBottomNav>)}
      />
    </SafeAreaProvider>,
  );

beforeEach(() => {
  jest.resetAllMocks();
});

test('renders the incoming primary destinations and navigates to Routes', async () => {
  await renderFooter('routes');

  expect(screen.getByLabelText('Home')).toBeOnTheScreen();
  expect(screen.getByLabelText('Lists')).toBeOnTheScreen();
  expect(screen.getByLabelText('Stores')).toBeOnTheScreen();
  expect(screen.getByLabelText('Routes').props.accessibilityState).toEqual({ selected: true });
  expect(screen.getByLabelText('Carter')).toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Routes'));
  expect(navigation.navigate).toHaveBeenCalledWith('Routes');
});

test('reports Carter as selected on the assistant screen', async () => {
  await renderFooter('carter');

  expect(screen.getByLabelText('Carter').props.accessibilityState).toEqual({ selected: true });
});
