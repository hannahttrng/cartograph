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
import * as metadataStorage from '../../../frontend/src/utils/savedListsStorage';

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
  };
});

jest.mock('../../../frontend/src/utils/savedListsStorage', () => {
  const actual = jest.requireActual('../../../frontend/src/utils/savedListsStorage');
  return {
    ...actual,
    loadShoppingListMetadata: jest.fn(),
    saveShoppingListMetadata: jest.fn(),
  };
});

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

const mockedApi = jest.mocked(shoppingListApi);
const mockedMetadata = jest.mocked(metadataStorage);

const lists: readonly ShoppingListResponse[] = [
  {
    id: 7,
    name: 'Weekend',
    items: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1 }],
    active: true,
    routes: [],
    status: 'PENDING',
  },
  {
    id: 9,
    name: 'Party',
    items: [
      { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1 },
      { tag: 'egg', modifiers: [], unit: 'count', quantity: 6 },
    ],
    active: true,
    routes: [],
    status: 'PENDING',
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
  mockedMetadata.loadShoppingListMetadata.mockResolvedValue({
    version: 1,
    collections: [],
    lists: {
      7: { listId: 7, favorite: true, archived: false, collectionId: null },
      9: { listId: 9, favorite: false, archived: true, collectionId: null },
    },
  });
  mockedMetadata.saveShoppingListMetadata.mockResolvedValue(undefined);
});

describe('<SavedListsScreen />', () => {
  test('loads server lists and opens a numeric backend ID in the builder', async () => {
    await renderScreen();

    expect(await screen.findByText('Weekend')).toBeOnTheScreen();
    expect(screen.queryByText('Party')).not.toBeOnTheScreen();
    expect(screen.getByText('1 item · PENDING')).toBeOnTheScreen();

    await fireEvent.press(screen.getByLabelText('Edit Weekend'));
    expect(navigation.navigate).toHaveBeenCalledWith('NewShoppingList', { listId: 7 });
  });

  test('filters favorites and archived lists from local metadata', async () => {
    await renderScreen();
    await screen.findByText('Weekend');

    await fireEvent.press(screen.getByText('Favorites'));
    expect(screen.getByText('Weekend')).toBeOnTheScreen();
    expect(screen.queryByText('Party')).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Archived'));
    expect(await screen.findByText('Party')).toBeOnTheScreen();
    expect(screen.queryByText('Weekend')).not.toBeOnTheScreen();
  });

  test('persists favorite changes without changing server list data', async () => {
    await renderScreen();
    await screen.findByText('Weekend');

    await fireEvent.press(screen.getByLabelText('Remove Weekend favorite'));
    await waitFor(() => {
      expect(mockedMetadata.saveShoppingListMetadata).toHaveBeenCalledWith({
        version: 1,
        collections: [],
        lists: {
          7: { listId: 7, favorite: false, archived: false, collectionId: null },
          9: { listId: 9, favorite: false, archived: true, collectionId: null },
        },
      });
    });
    expect(mockedApi.listShoppingLists).toHaveBeenCalledTimes(1);
  });

  test('keeps server lists visible when local metadata cannot load', async () => {
    mockedMetadata.loadShoppingListMetadata.mockRejectedValue(new Error('Storage unavailable'));
    await renderScreen();

    expect(await screen.findByText('Weekend')).toBeOnTheScreen();
    expect(screen.getByText('Favorites and organization are unavailable on this device.')).toBeOnTheScreen();
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
