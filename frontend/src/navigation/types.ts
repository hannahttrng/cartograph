import type { Route } from '../types/models';

export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  ImportRecipes: undefined;
  NearbyStores: undefined;
  SavedLists: undefined;
  ShoppingList: undefined;
  NewShoppingList:
    | {
        initialItems?: string[];
        title?: string;
      }
    | undefined;
  AiAssistant: undefined;
  Account: undefined;
  NearbyDeals: undefined;
  Map: {
    route: Route;
    routeId: string;
  };
  RouteResults: {
    items: string[];
    listId?: string;
  };
};
