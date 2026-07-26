import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AccountScreen } from '../screens/AccountScreen';
import { AiAssistantScreen } from '../screens/AiAssistantScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ImportRecipesScreen } from '../screens/ImportRecipesScreen';
import LoginScreen from '../screens/LoginScreen';
import { MapScreen } from '../screens/MapScreen';
import { NearbyDealsScreen } from '../screens/NearbyDealsScreen';
import { NearbyStoresScreen } from '../screens/NearbyStoresScreen';
import { NewShoppingListScreen } from '../screens/NewShoppingListScreen';
import { RoutePreviewScreen } from '../screens/RoutePreviewScreen';
import { RoutesScreen } from '../screens/RoutesScreen';
import { SavedListsScreen } from '../screens/SavedListsScreen';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home">
      <Stack.Screen component={HomeScreen} name="Home" options={{ headerShown: false }} />
      <Stack.Screen component={LoginScreen} name="Login" options={{ headerShown: false }} />
      <Stack.Screen component={ImportRecipesScreen} name="ImportRecipes" options={{ headerShown: false }} />
      <Stack.Screen component={NearbyStoresScreen} name="NearbyStores" options={{ headerShown: false }} />
      <Stack.Screen component={SavedListsScreen} name="SavedLists" options={{ headerShown: false }} />
      <Stack.Screen component={RoutesScreen} name="Routes" options={{ headerShown: false }} />
      <Stack.Screen
        component={NewShoppingListScreen}
        name="NewShoppingList"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={AiAssistantScreen}
        name="AiAssistant"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        component={NearbyDealsScreen}
        name="NearbyDeals"
        options={{ headerShown: false }}
      />
      <Stack.Screen component={AccountScreen} name="Account" options={{ headerShown: false }} />
      <Stack.Screen
        component={MapScreen}
        name="Map"
        options={{
          headerShadowVisible: false,
          headerTintColor: '#1F2933',
          headerTitle: '',
          headerTransparent: true,
        }}
      />
      <Stack.Screen
        component={RoutePreviewScreen}
        name="RouteResults"
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
