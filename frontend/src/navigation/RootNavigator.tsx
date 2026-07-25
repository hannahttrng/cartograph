import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AccountScreen } from '../screens/AccountScreen';
import { AiAssistantScreen } from '../screens/AiAssistantScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { MapScreen } from '../screens/MapScreen';
import { NearbyDealsScreen } from '../screens/NearbyDealsScreen';
import { NewShoppingListScreen } from '../screens/NewShoppingListScreen';
import { RouteResultsScreen } from '../screens/RouteResultsScreen';
import { ShoppingListScreen } from '../screens/ShoppingListScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen component={HomeScreen} name="Home" options={{ title: 'Cartograph' }} />
      <Stack.Screen
        component={ShoppingListScreen}
        name="ShoppingList"
        options={{ title: 'Shopping List' }}
      />
      <Stack.Screen
        component={NewShoppingListScreen}
        name="NewShoppingList"
        options={{ title: 'New List' }}
      />
      <Stack.Screen
        component={AiAssistantScreen}
        name="AiAssistant"
        options={{ title: 'Recipe Import' }}
      />
      <Stack.Screen
        component={NearbyDealsScreen}
        name="NearbyDeals"
        options={{ title: 'Nearby Deals' }}
      />
      <Stack.Screen component={AccountScreen} name="Account" options={{ title: 'Account' }} />
      <Stack.Screen component={MapScreen} name="Map" options={{ title: 'Route Map' }} />
      <Stack.Screen
        component={RouteResultsScreen}
        name="RouteResults"
        options={{ title: 'Best Routes' }}
      />
    </Stack.Navigator>
  );
}
