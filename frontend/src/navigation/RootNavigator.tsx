import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { MapScreen } from '../screens/MapScreen';
import { NearbyDealsScreen } from '../screens/NearbyDealsScreen';
import { NewShoppingListScreen } from '../screens/NewShoppingListScreen';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="MainTabs">
      <Stack.Screen
        component={MainTabNavigator}
        name="MainTabs"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={NewShoppingListScreen}
        name="NewShoppingList"
        options={{ title: 'New List' }}
      />
      <Stack.Screen
        component={NearbyDealsScreen}
        name="NearbyDeals"
        options={{ title: 'Nearby Deals' }}
      />
      <Stack.Screen component={MapScreen} name="Map" options={{ title: 'Route Map' }} />
    </Stack.Navigator>
  );
}
