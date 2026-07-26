import type { ComponentProps } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import * as shoppingListApi from '../../../frontend/src/api';
import { SavedListsScreen } from '../../../frontend/src/screens/SavedListsScreen';
import type { ShoppingListResponse } from '../../../frontend/src/types/api';

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
  };
});

jest.mock('../../../frontend/src/api', () => {
  const actual = jest.requireActual('../../../frontend/src/api');
  return {
    ...actual,
    listShoppingLists: jest.fn(),
    updateShoppingListActive: jest.fn(),
  };
});

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

const mockedApi = jest.mocked(shoppingListApi);

const lists: readonly ShoppingListResponse[] = [
  {
    id: 7,
    name: 'Weekend',
    items: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1 }],
    active: true,
  },
  {
    id: 9,
    name: 'Party',
    items: [
      { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1 },
      { tag: 'egg', modifiers: [], unit: 'count', quantity: 12 },
    ],
    active: false,
  },
];

const navigation = { navigate: jest.fn() };

const renderScreen = () =>
  render(
    <SavedListsScreen
      {...({ navigation } as unknown as ComponentProps<typeof SavedListsScreen>)}
    />,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockedApi.listShoppingLists.mockResolvedValue(lists);
  mockedApi.updateShoppingListActive.mockImplementation(async (id, request) => ({
    ...lists.find((list) => list.id === id)!,
    active: request.active,
  }));
});

describe('<SavedListsScreen />', () => {
  test('loads server lists and opens a numeric backend ID in the builder', async () => {
    await renderScreen();

    expect(await screen.findByText('Weekend')).toBeOnTheScreen();
    expect(screen.getByText('Party')).toBeOnTheScreen();
    expect(screen.getByText('1 item · Active')).toBeOnTheScreen();
    expect(screen.getByText('2 items · Inactive')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Edit Weekend'));
    expect(navigation.navigate).toHaveBeenCalledWith('NewShoppingList', { listId: 7 });
  });

  test('filters active and inactive lists from server state', async () => {
    await renderScreen();
    await screen.findByText('Weekend');

    await fireEvent.press(screen.getByText('Active'));
    expect(screen.getByText('Weekend')).toBeOnTheScreen();
    expect(screen.queryByText('Party')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Inactive'));
    expect(await screen.findByText('Party')).toBeOnTheScreen();
    expect(screen.queryByText('Weekend')).not.toBeOnTheScreen();
  });

  test('optimistically toggles active and merges the server response', async () => {
    await renderScreen();
    await screen.findByText('Weekend');

    await fireEvent.press(screen.getByLabelText('Weekend active'));
    await waitFor(() => {
      expect(mockedApi.updateShoppingListActive).toHaveBeenCalledWith(7, {
        active: false,
      });
    });
    expect(screen.getByLabelText('Weekend active').props.accessibilityState.checked).toBe(false);
  });

  test('rolls back a failed active update and renders a row error', async () => {
    mockedApi.updateShoppingListActive.mockRejectedValueOnce(new Error('Update failed'));
    await renderScreen();
    await screen.findByText('Weekend');

    await fireEvent.press(screen.getByLabelText('Weekend active'));
    expect(await screen.findByText('Update failed')).toBeOnTheScreen();
    expect(screen.getByLabelText('Weekend active').props.accessibilityState.checked).toBe(true);
  });

  test('shows a retry action when the backend list request fails', async () => {
    mockedApi.listShoppingLists
      .mockRejectedValueOnce(new Error('Backend unavailable'))
      .mockResolvedValueOnce(lists);
    await renderScreen();

    expect(await screen.findByText('Backend unavailable')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Weekend')).toBeOnTheScreen();
    expect(mockedApi.listShoppingLists).toHaveBeenCalledTimes(2);
  });
});
