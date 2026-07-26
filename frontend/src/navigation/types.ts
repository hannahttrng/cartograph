import type {
  BottomTabNavigationProp,
  BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import type { Route } from '../types/models';

export type MainTabParamList = {
  Home: undefined;
  ShoppingList: undefined;
  Routes: undefined;
  AiAssistant: undefined;
  Account: undefined;
};

export type RootStackParamList = {
  MainTabs:
    | {
        screen?: keyof MainTabParamList;
        params?: MainTabParamList[keyof MainTabParamList];
      }
    | undefined;
  NewShoppingList:
    | {
        initialItems?: string[];
        title?: string;
      }
    | undefined;
  NearbyDeals: undefined;
  Map: {
    route: Route;
    routeId: string;
  };
};

export type MainTabScreenProps<Screen extends keyof MainTabParamList> =
  Omit<BottomTabScreenProps<MainTabParamList, Screen>, 'navigation'> & {
    navigation: BottomTabNavigationProp<MainTabParamList, Screen> &
      NativeStackNavigationProp<RootStackParamList>;
  };
