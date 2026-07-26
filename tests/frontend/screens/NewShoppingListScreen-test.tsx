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
import { formatTagLabel } from '../../../frontend/src/utils/tags';

jest.mock('../../../frontend/src/api', () => {
  const actual = jest.requireActual('../../../frontend/src/api');
  return {
    ...actual,
    createShoppingList: jest.fn(),
    deleteShoppingList: jest.fn(),
    getShoppingList: jest.fn(),
    listCatalogTags: jest.fn(),
    listShoppingLists: jest.fn(),
    listTagModifiers: jest.fn(),
    replaceShoppingList: jest.fn(),
    startRouteCalculation: jest.fn(),
    updateShoppingListActive: jest.fn(),
    updateShoppingListName: jest.fn(),
  };
});

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

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
    { tag: 'milk', modifiers: ['organic'], unit: 'gallon', quantity: 2 },
    { tag: 'ground beef', modifiers: ['grass fed'], unit: 'lbs', quantity: 1.5 },
  ],
  active: false,
};

const createdList: ShoppingListResponse = {
  id: 9,
  name: 'Weekly staples',
  items: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1 }],
  active: true,
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
  await fireEvent.press(screen.getByLabelText(`Add ${formatTagLabel(tag)}`));
};

beforeEach(() => {
  jest.resetAllMocks();
  mockedApi.listCatalogTags.mockResolvedValue(catalog);
  mockedApi.listShoppingLists.mockResolvedValue([createdList]);
  mockedApi.listTagModifiers.mockImplementation(async (tag) => ({
    milk: ['brand: horizon', 'in season', 'on sale', 'organic'],
    'ground beef': ['grass fed', 'on sale', 'organic'],
    bread: ["brand: dave's killer bread", 'gluten free', 'on sale', 'organic'],
  })[tag] ?? []);
  mockedApi.getShoppingList.mockResolvedValue(serverList);
  mockedApi.createShoppingList.mockResolvedValue(createdList);
  mockedApi.replaceShoppingList.mockResolvedValue(serverList);
  mockedApi.startRouteCalculation.mockResolvedValue({
    generation: 1,
    status: 'RUNNING',
    activeListCount: 1,
    itemCount: 2,
    resultCount: 0,
    optimizerStatus: null,
    startedAt: 1,
    completedAt: null,
    elapsedSeconds: null,
    timeoutSeconds: null,
    errorCode: null,
    detail: null,
  });
  mockedApi.updateShoppingListName.mockResolvedValue(serverList);
  mockedApi.updateShoppingListActive.mockImplementation(async (id, request) => ({
    ...serverList,
    id,
    active: request.active,
  }));
  mockedApi.deleteShoppingList.mockResolvedValue(undefined);
});

describe('<NewShoppingListScreen />', () => {
  test('prefills the catalog search without adding an unresolved item', async () => {
    await renderScreen({ initialSearch: 'ground', title: 'New List' });

    expect(await screen.findByDisplayValue('ground')).toBeOnTheScreen();
    expect(screen.getByText('Ground Beef')).toBeOnTheScreen();
    expect(screen.queryByText('Review imported items')).not.toBeOnTheScreen();
  });

  test('loads the catalog, resolves exact prefills, and exposes unmatched imports', async () => {
    await renderScreen({ initialItems: ['Milk', 'Tomatoes'], initialTags: ['bread', 'ground beef'], title: 'Recipe' });

    expect(await screen.findByText('Milk')).toBeOnTheScreen();
    expect(screen.getByText('Bread')).toBeOnTheScreen();
    expect(screen.getByText('Ground Beef')).toBeOnTheScreen();
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
    expect(screen.getByText('Milk is already on this list.')).toBeOnTheScreen();
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
    expect(navigation.navigate).toHaveBeenCalledWith('SavedLists');
  });

  test('saves a new list and starts its final isolated route generation', async () => {
    await renderScreen();
    await screen.findByText('Add an item to begin your list.');
    await fireEvent.changeText(screen.getByLabelText('Shopping list name'), 'Weekly staples');
    await addCatalogItem('milk');
    await fireEvent.press(screen.getByLabelText('Route this list'));

    await waitFor(() => {
      expect(navigation.navigate).toHaveBeenCalledWith('Routes');
    });
    expect(mockedApi.startRouteCalculation).toHaveBeenCalledTimes(1);
  });

  test('activates an inactive saved list before starting its isolated route generation', async () => {
    mockedApi.replaceShoppingList.mockResolvedValueOnce({ ...serverList, active: true });
    mockedApi.listShoppingLists.mockResolvedValueOnce([{ ...serverList, active: true }]);
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');

    await fireEvent.press(screen.getByLabelText('Route this list'));

    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        active: true,
        items: serverList.items,
        name: 'Weekend',
      });
    });
    expect(mockedApi.startRouteCalculation).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Routes');
  });

  test('explicitly reruns routes for an unchanged active list', async () => {
    mockedApi.getShoppingList.mockResolvedValueOnce({ ...serverList, active: true });
    mockedApi.listShoppingLists.mockResolvedValueOnce([{ ...serverList, active: true }]);
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');

    await fireEvent.press(screen.getByLabelText('Route this list'));

    await waitFor(() => expect(mockedApi.startRouteCalculation).toHaveBeenCalledTimes(1));
    expect(mockedApi.replaceShoppingList).not.toHaveBeenCalled();
    expect(navigation.navigate).toHaveBeenCalledWith('Routes');
  });

  test('saves other included lists for later before routing only this list', async () => {
    const selectedList = { ...serverList, active: true };
    const otherList = { ...createdList, id: 11, active: true };
    mockedApi.getShoppingList.mockResolvedValueOnce(selectedList);
    mockedApi.listShoppingLists.mockResolvedValueOnce([selectedList, otherList]);

    await renderScreen({ listId: selectedList.id });
    await screen.findByDisplayValue('Weekend');
    await fireEvent.press(screen.getByLabelText('Route this list'));

    await waitFor(() => {
      expect(mockedApi.updateShoppingListActive).toHaveBeenCalledWith(11, {
        active: false,
      });
    });
    expect(mockedApi.startRouteCalculation).toHaveBeenCalledTimes(1);
    expect(navigation.navigate).toHaveBeenCalledWith('Routes');
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

  test('loads, selects, and saves Product modifiers through the item PUT path', async () => {
    const activeList = { ...serverList, active: true };
    mockedApi.getShoppingList.mockResolvedValueOnce(activeList);
    mockedApi.replaceShoppingList.mockResolvedValueOnce({
      ...activeList,
      items: [
        { tag: 'milk', modifiers: ['on sale', 'organic'], unit: 'gallon', quantity: 2 },
        activeList.items[1],
      ],
    });
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');

    await fireEvent.press(screen.getByLabelText('Modifiers for Milk: Organic'));
    await waitFor(() => expect(mockedApi.listTagModifiers).toHaveBeenCalledWith('milk'));
    await fireEvent.press(screen.getByLabelText('On Sale modifier for Milk'));
    await fireEvent.press(screen.getByLabelText('Save shopping list for later'));

    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        active: true,
        items: [
          { tag: 'milk', modifiers: ['on sale', 'organic'], unit: 'gallon', quantity: 2 },
          { tag: 'ground beef', modifiers: ['grass fed'], unit: 'lbs', quantity: 1.5 },
        ],
        name: 'Weekend',
      });
    });
    expect(mockedApi.startRouteCalculation).not.toHaveBeenCalled();
  });

  test('saves Active changes through PUT', async () => {
    mockedApi.replaceShoppingList.mockResolvedValueOnce({ ...serverList, active: true });
    await renderScreen({ listId: 7 });
    await screen.findByDisplayValue('Weekend');

    expect(screen.getByLabelText('Include list in route planning').props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByLabelText('Include list in route planning'));
    await fireEvent.press(screen.getByLabelText('Save shopping list for later'));

    await waitFor(() => {
      expect(mockedApi.replaceShoppingList).toHaveBeenCalledWith(7, {
        active: true,
        items: serverList.items,
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

    const routeButton = screen.getByLabelText('Route this list');
    await fireEvent.press(routeButton);
    await fireEvent.press(routeButton);
    expect(mockedApi.createShoppingList).toHaveBeenCalledTimes(1);
  expect(routeButton).toBeDisabled();

    await act(async () => request.resolve(createdList));
  });
});
