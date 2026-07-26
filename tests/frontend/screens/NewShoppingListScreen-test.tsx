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
import { NewShoppingListScreen } from '../../../frontend/src/screens/NewShoppingListScreen';
import type {
  CatalogTag,
  ShoppingListResponse,
} from '../../../frontend/src/types/api';
import * as metadataStorage from '../../../frontend/src/utils/savedListsStorage';

jest.mock('../../../frontend/src/api', () => {
  const actual = jest.requireActual('../../../frontend/src/api');
  return {
    ...actual,
    createShoppingList: jest.fn(),
    deleteShoppingList: jest.fn(),
    getShoppingList: jest.fn(),
    listCatalogTags: jest.fn(),
    replaceShoppingList: jest.fn(),
    updateShoppingListName: jest.fn(),
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

const catalog: readonly CatalogTag[] = [
  { tag: 'bread', defaultUnit: 'loaf', defaultQuantity: 1, products: [] },
  { tag: 'ground beef', defaultUnit: 'lbs', defaultQuantity: 1.5, products: [] },
  { tag: 'milk', defaultUnit: 'gallon', defaultQuantity: 1, products: [] },
];

const serverList: ShoppingListResponse = {
  id: 7,
  name: 'Weekend',
  items: [
    { tag: 'milk', modifiers: ['organic'], unit: 'gallon', quantity: 2 },
    { tag: 'ground beef', modifiers: ['grass fed'], unit: 'lbs', quantity: 1.5 },
  ],
  active: false,
  routes: [],
  status: 'PENDING',
};

const createdList: ShoppingListResponse = {
  id: 9,
  name: 'Weekly staples',
  items: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1 }],
  active: true,
  routes: [],
  status: 'PENDING',
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

const renderScreen = (
  params?: ComponentProps<typeof NewShoppingListScreen>['route']['params'],
) =>
  render(
    <NewShoppingListScreen
      {...({
        navigation,
        route: { key: 'new-list', name: 'NewShoppingList', params },
      } as unknown as ComponentProps<typeof NewShoppingListScreen>)}
    />,
  );

const addCatalogItem = async (tag: string) => {
  await fireEvent.changeText(screen.getByLabelText('Item name'), tag);
  await fireEvent.press(screen.getByLabelText(`Add ${tag}`));
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedApi.listCatalogTags.mockResolvedValue(catalog);
  mockedApi.getShoppingList.mockResolvedValue(serverList);
  mockedApi.createShoppingList.mockResolvedValue(createdList);
  mockedApi.replaceShoppingList.mockResolvedValue(serverList);
  mockedApi.updateShoppingListName.mockResolvedValue(serverList);
  mockedApi.deleteShoppingList.mockResolvedValue(undefined);
  mockedMetadata.loadShoppingListMetadata.mockResolvedValue({
    version: 1,
    collections: [],
    lists: {},
  });
  mockedMetadata.saveShoppingListMetadata.mockResolvedValue(undefined);
});

describe('<NewShoppingListScreen />', () => {
  test('loads the catalog, resolves exact prefills, and exposes unmatched imports', async () => {
    await renderScreen({ initialItems: ['Milk', 'Tomatoes'], initialTags: ['bread'], title: 'Recipe' });

    expect(await screen.findByText('milk')).toBeOnTheScreen();
    expect(screen.getByText('bread')).toBeOnTheScreen();
    expect(screen.getByText('Tomatoes')).toBeOnTheScreen();
    expect(screen.getByText('Review imported items')).toBeOnTheScreen();
  });

  test('accepts only catalog tags and rejects unknown or duplicate items', async () => {
    await renderScreen();
    await screen.findByText('Add an item to begin your list.');

    await fireEvent.changeText(screen.getByLabelText('Item name'), 'unknown');
    await fireEvent.press(screen.getByLabelText('Add item'));
    expect(screen.getByText('"unknown" is not in the grocery catalog.')).toBeOnTheScreen();

    await addCatalogItem('milk');
    await fireEvent.changeText(screen.getByLabelText('Item name'), 'milk');
    await fireEvent.press(screen.getByLabelText('Add item'));
    expect(screen.getByText('milk is already on this list.')).toBeOnTheScreen();
  });

  test('creates a structured list and returns to the server list landing page', async () => {
    await renderScreen();
    await screen.findByText('Add an item to begin your list.');
    await fireEvent.changeText(screen.getByLabelText('Shopping list name'), '  Weekly staples  ');
    await addCatalogItem('milk');
    await fireEvent.press(screen.getByLabelText('Save shopping list for later'));

    await waitFor(() => {
      expect(mockedApi.createShoppingList).toHaveBeenCalledWith({
        active: true,
        items: [{ tag: 'milk', modifiers: [] }],
        name: 'Weekly staples',
      });
    });
    expect(mockedMetadata.saveShoppingListMetadata).toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('SavedLists');
  });

  test('saves before opening fixture route results with the numeric server ID', async () => {
    await renderScreen();
    await screen.findByText('Add an item to begin your list.');
    await fireEvent.changeText(screen.getByLabelText('Shopping list name'), 'Weekly staples');
    await addCatalogItem('milk');
    await fireEvent.press(screen.getByLabelText('Find best route'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('RouteResults', {
        items: ['milk'],
        listId: 9,
        listName: 'Weekly staples',
      });
    });
  });

  test('uses PATCH for a name-only edit', async () => {
    const renamed = { ...serverList, name: 'Weekend essentials' };
    mockedApi.updateShoppingListName.mockResolvedValue(renamed);
    await renderScreen({ listId: 7 });
    expect(await screen.findByDisplayValue('Weekend')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Shopping list name'), 'Weekend essentials');
    await fireEvent.press(screen.getByLabelText('Save shopping list for later'));
    await waitFor(() => {
      expect(mockedApi.updateShoppingListName).toHaveBeenCalledWith(7, {
        name: 'Weekend essentials',
      });
    });
    expect(mockedApi.replaceShoppingList).not.toHaveBeenCalled();
  });

  test('uses PUT for item changes without losing resolved metadata', async () => {
    mockedApi.replaceShoppingList.mockResolvedValue({
      ...serverList,
      items: [...serverList.items, { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1 }],
    });
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');
    await addCatalogItem('bread');
    await fireEvent.press(screen.getByLabelText('Save shopping list for later'));

    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        active: false,
        items: [
          { tag: 'milk', modifiers: ['organic'], unit: 'gallon', quantity: 2 },
          { tag: 'ground beef', modifiers: ['grass fed'], unit: 'lbs', quantity: 1.5 },
          { tag: 'bread', modifiers: [] },
        ],
        name: 'Weekend',
      });
    });
  });

  test('confirms deletion and navigates back to server lists', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');
    await fireEvent.press(screen.getByLabelText('Delete shopping list'));

    const buttons = alert.mock.calls[0]?.[2] ?? [];
    await act(async () => {
      buttons[1]?.onPress?.();
    });

    await waitFor(() => expect(mockedApi.deleteShoppingList).toHaveBeenCalledWith(7));
    expect(navigation.navigate).toHaveBeenCalledWith('SavedLists');
  });

  test('prevents duplicate submissions while creation is pending', async () => {
    const request = deferred<ShoppingListResponse>();
    mockedApi.createShoppingList.mockReturnValue(request.promise);
    await renderScreen();
    await screen.findByText('Add an item to begin your list.');
    await fireEvent.changeText(screen.getByLabelText('Shopping list name'), 'Weekly staples');
    await addCatalogItem('milk');

    const routeButton = screen.getByLabelText('Find best route');
    await fireEvent.press(routeButton);
    await fireEvent.press(routeButton);
    expect(mockedApi.createShoppingList).toHaveBeenCalledTimes(1);
  expect(routeButton).toBeDisabled();

    await act(async () => request.resolve(createdList));
  });
});
