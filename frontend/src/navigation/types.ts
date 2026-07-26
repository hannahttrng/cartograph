import type { EntityId } from '../types/api';
import type { Route } from '../types/models';

export type RootStackParamList = {
  Home: undefined;
  Login: undefined;
  Register: undefined;
  ImportRecipes: undefined;
  NearbyStores: undefined;
  SavedLists: undefined;
  Routes: undefined;
  AiAssistant: undefined;
  Account: undefined;
  NewShoppingList:
    | {
        initialItems?: string[];
        initialTags?: string[];
        listId?: EntityId;
        title?: string;
      }
    | undefined;
  NearbyDeals: undefined;
  RouteResults: {
    items: string[];
    listId: EntityId;
    listName?: string;
  };
  Map: {
    route: Route;
    routeId?: string;
  };
};
