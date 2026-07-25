import type { Route } from '../types/models';

export type RootStackParamList = {
  Home: undefined;
  ShoppingList: undefined;
  NewShoppingList: undefined;
  AiAssistant: undefined;
  Account: undefined;
  Map: {
    route: Route;
    routeId: string;
  };
  RouteResults: {
    items: string[];
    listId?: string;
  };
};
