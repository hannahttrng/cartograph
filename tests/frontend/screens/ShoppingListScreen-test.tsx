import type { ComponentProps } from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import * as shoppingListApi from '../../../frontend/src/api';
import { ShoppingListScreen } from '../../../frontend/src/screens/ShoppingListScreen';
import type {
  CatalogTag,
  ShoppingListResponse,
} from '../../../frontend/src/types/api';

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
    createShoppingList: jest.fn(),
    deleteShoppingList: jest.fn(),
    getShoppingList: jest.fn(),
    listCatalogTags: jest.fn(),
    listShoppingLists: jest.fn(),
    replaceShoppingList: jest.fn(),
    updateShoppingListName: jest.fn(),
  };
});

const mockedApi = jest.mocked(shoppingListApi);

const catalog: readonly CatalogTag[] = [
  { tag: 'bread', defaultUnit: 'loaf', defaultQuantity: 1, products: [] },
  { tag: 'ground beef', defaultUnit: 'lbs', defaultQuantity: 1.5, products: [] },
  { tag: 'milk', defaultUnit: 'gallon', defaultQuantity: 1, products: [] },
];

const serverList: ShoppingListResponse = {
  id: 7,
  name: 'Weekend',
  items: [
    {
      tag: 'milk',
      modifiers: ['organic'],
      unit: 'gallon',
      quantity: 2,
    },
    {
      tag: 'ground beef',
      modifiers: ['grass fed'],
      unit: 'lbs',
      quantity: 1.5,
    },
  ],
  active: false,
  routes: [],
  status: 'PENDING',
};

const createdList: ShoppingListResponse = {
  id: 9,
  name: 'Weekly staples',
  items: [
    {
      tag: 'milk',
      modifiers: [],
      unit: 'gallon',
      quantity: 1,
    },
  ],
  active: true,
  routes: [],
  status: 'PENDING',
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const renderScreen = () =>
  render(
    <ShoppingListScreen
      {...({} as ComponentProps<typeof ShoppingListScreen>)}
    />,
  );

const selectServerList = async () => {
  await fireEvent.press(await screen.findByLabelText('Load Weekend'));
  await screen.findByDisplayValue('Weekend');
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedApi.listCatalogTags.mockResolvedValue(catalog);
  mockedApi.listShoppingLists.mockResolvedValue([serverList]);
  mockedApi.getShoppingList.mockResolvedValue(serverList);
  mockedApi.createShoppingList.mockResolvedValue(createdList);
  mockedApi.replaceShoppingList.mockResolvedValue(serverList);
  mockedApi.updateShoppingListName.mockResolvedValue(serverList);
  mockedApi.deleteShoppingList.mockResolvedValue(undefined);
});

describe('<ShoppingListScreen />', () => {
  test('renders loading, server-list, and explicitly deferred controls', async () => {
    const catalogRequest = deferred<readonly CatalogTag[]>();
    const listsRequest = deferred<readonly ShoppingListResponse[]>();
    mockedApi.listCatalogTags.mockReturnValue(catalogRequest.promise);
    mockedApi.listShoppingLists.mockReturnValue(listsRequest.promise);

    await renderScreen();

    expect(screen.getByText('Loading shopping lists…')).toBeOnTheScreen();

    catalogRequest.resolve(catalog);
    listsRequest.resolve([serverList]);

    expect(await screen.findByLabelText('Load Weekend')).toBeOnTheScreen();
    expect(screen.queryByText('Save to collection')).not.toBeOnTheScreen();
    expect(screen.queryByText('Find Best Route')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('New collection name')).not.toBeOnTheScreen();
  });

  test('shows a load error and retries both server resources', async () => {
    mockedApi.listShoppingLists
      .mockRejectedValueOnce(new Error('Backend unavailable'))
      .mockResolvedValueOnce([serverList]);

    await renderScreen();

    expect(await screen.findByText('Backend unavailable')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByLabelText('Load Weekend')).toBeOnTheScreen();
    expect(mockedApi.listCatalogTags).toHaveBeenCalledTimes(2);
    expect(mockedApi.listShoppingLists).toHaveBeenCalledTimes(2);
  });

  test('uses catalog suggestions and rejects unknown or duplicate tags', async () => {
    mockedApi.listShoppingLists.mockResolvedValue([]);
    await renderScreen();
    await screen.findByText('No server lists yet.');

    const itemInput = screen.getByLabelText('Grocery catalog item');
    await fireEvent.changeText(itemInput, 'mil');
    await fireEvent.press(screen.getByLabelText('Add milk'));

    expect(screen.getByText('milk')).toBeOnTheScreen();
    expect(screen.getByText('1 gallon default')).toBeOnTheScreen();

    await fireEvent.changeText(itemInput, 'unknown item');
    await fireEvent.press(screen.getByLabelText('Add grocery item'));
    expect(
      screen.getByText('“unknown item” is not in the current grocery catalog.'),
    ).toBeOnTheScreen();

    await fireEvent.changeText(itemInput, 'milk');
    await fireEvent.press(screen.getByLabelText('Add grocery item'));
    expect(screen.getByText('milk is already on your list.')).toBeOnTheScreen();
  });

  test('creates a structured backend list from the text fields', async () => {
    mockedApi.listShoppingLists.mockResolvedValue([]);
    await renderScreen();
    await screen.findByText('No server lists yet.');

    await fireEvent.changeText(
      screen.getByLabelText('Shopping list name'),
      '  Weekly staples  ',
    );
    await fireEvent.changeText(screen.getByLabelText('Grocery catalog item'), 'milk');
    await fireEvent.press(screen.getByLabelText('Add milk'));
    await fireEvent.press(screen.getByLabelText('Create shopping list'));

    await waitFor(() => {
      expect(mockedApi.createShoppingList).toHaveBeenCalledWith({
        name: 'Weekly staples',
        items: [{ tag: 'milk', modifiers: [] }],
        active: true,
      });
    });
    expect(await screen.findByText('Shopping list created.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Weekly staples')).toBeOnTheScreen();
  });

  test('loads the selected record by ID and preserves its resolved item details', async () => {
    await renderScreen();
    await selectServerList();

    expect(mockedApi.getShoppingList).toHaveBeenCalledWith(7);
    expect(screen.getByText('2 gallon')).toBeOnTheScreen();
    expect(screen.getByText('1.5 lbs')).toBeOnTheScreen();
    expect(screen.getByLabelText('Delete shopping list')).toBeOnTheScreen();
  });

  test('uses PATCH when only the list name changes', async () => {
    const renamed = { ...serverList, name: 'Weekend essentials' };
    mockedApi.updateShoppingListName.mockResolvedValue(renamed);
    await renderScreen();
    await selectServerList();

    await fireEvent.changeText(
      screen.getByLabelText('Shopping list name'),
      ' Weekend essentials ',
    );
    await fireEvent.press(screen.getByLabelText('Save shopping list changes'));

    await waitFor(() => {
      expect(mockedApi.updateShoppingListName).toHaveBeenCalledWith(7, {
        name: 'Weekend essentials',
      });
    });
    expect(mockedApi.replaceShoppingList).not.toHaveBeenCalled();
    expect(mockedApi.createShoppingList).not.toHaveBeenCalled();
  });

  test('uses PUT for item changes without losing active state or item metadata', async () => {
    const replaced: ShoppingListResponse = {
      ...serverList,
      items: [
        ...serverList.items,
        { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1 },
      ],
    };
    mockedApi.replaceShoppingList.mockResolvedValue(replaced);
    await renderScreen();
    await selectServerList();

    await fireEvent.changeText(screen.getByLabelText('Grocery catalog item'), 'bread');
    await fireEvent.press(screen.getByLabelText('Add bread'));
    await fireEvent.press(screen.getByLabelText('Save shopping list changes'));

    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        name: 'Weekend',
        items: [
          {
            tag: 'milk',
            modifiers: ['organic'],
            unit: 'gallon',
            quantity: 2,
          },
          {
            tag: 'ground beef',
            modifiers: ['grass fed'],
            unit: 'lbs',
            quantity: 1.5,
          },
          { tag: 'bread', modifiers: [] },
        ],
        active: false,
      });
    });
    expect(mockedApi.updateShoppingListName).not.toHaveBeenCalled();
  });

  test('keeps removal local until the user saves the replacement', async () => {
    mockedApi.replaceShoppingList.mockResolvedValue({
      ...serverList,
      items: [serverList.items[0]],
    });
    await renderScreen();
    await selectServerList();

    await fireEvent.press(screen.getByLabelText('Remove ground beef'));
    expect(screen.queryByText('ground beef')).not.toBeOnTheScreen();
    expect(mockedApi.replaceShoppingList).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Save shopping list changes'));
    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        name: 'Weekend',
        items: [
          {
            tag: 'milk',
            modifiers: ['organic'],
            unit: 'gallon',
            quantity: 2,
          },
        ],
        active: false,
      });
    });
  });

  test('confirms deletion, refreshes server lists, and resets the draft', async () => {
    mockedApi.listShoppingLists
      .mockResolvedValueOnce([serverList])
      .mockResolvedValueOnce([]);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen();
    await selectServerList();

    await fireEvent.press(screen.getByLabelText('Delete shopping list'));
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => {
      buttons[1]?.onPress?.();
    });

    await waitFor(() => {
      expect(mockedApi.deleteShoppingList).toHaveBeenCalledWith(7);
    });
    expect(mockedApi.listShoppingLists).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Shopping list deleted.')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Untitled list')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Delete shopping list')).not.toBeOnTheScreen();
  });

  test('retains the draft and exposes the API failure for retrying edits', async () => {
    mockedApi.listShoppingLists.mockResolvedValue([]);
    mockedApi.createShoppingList.mockRejectedValue(new Error('Create failed'));
    await renderScreen();
    await screen.findByText('No server lists yet.');

    await fireEvent.changeText(
      screen.getByLabelText('Shopping list name'),
      'Recovery list',
    );
    await fireEvent.changeText(screen.getByLabelText('Grocery catalog item'), 'milk');
    await fireEvent.press(screen.getByLabelText('Add milk'));
    await fireEvent.press(screen.getByLabelText('Create shopping list'));

    expect(await screen.findByText('Create failed')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('Recovery list')).toBeOnTheScreen();
    expect(screen.getByText('milk')).toBeOnTheScreen();
    expect(screen.getByLabelText('Create shopping list')).toBeEnabled();
  });

  test('prevents duplicate submissions while a mutation is pending', async () => {
    mockedApi.listShoppingLists.mockResolvedValue([]);
    const createRequest = deferred<ShoppingListResponse>();
    mockedApi.createShoppingList.mockReturnValue(createRequest.promise);
    await renderScreen();
    await screen.findByText('No server lists yet.');

    await fireEvent.changeText(
      screen.getByLabelText('Shopping list name'),
      'Weekly staples',
    );
    await fireEvent.changeText(screen.getByLabelText('Grocery catalog item'), 'milk');
    await fireEvent.press(screen.getByLabelText('Add milk'));
    const createButton = screen.getByLabelText('Create shopping list');

    await fireEvent.press(createButton);
    await fireEvent.press(createButton);

    expect(mockedApi.createShoppingList).toHaveBeenCalledTimes(1);
    expect(createButton).toBeDisabled();

    await act(async () => {
      createRequest.resolve(createdList);
    });
    expect(await screen.findByText('Shopping list created.')).toBeOnTheScreen();
  });
});
