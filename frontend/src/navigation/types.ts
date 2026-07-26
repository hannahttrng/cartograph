import type { EntityId } from '../types/api';

interface MapRouteInput {
  readonly stores: ReadonlyArray<{
    readonly name: string;
    readonly address: string;
    readonly latitude?: number | null;
    readonly longitude?: number | null;
  }>;
  readonly distance: number;
  readonly time: number;
}

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
        initialSearch?: string;
        initialTags?: string[];
        listId?: EntityId;
        title?: string;
      }
    | undefined;
  NearbyDeals: undefined;
  Map: {
    route: MapRouteInput;
    routeId?: string;
  };
};
