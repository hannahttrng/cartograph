import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import type { ComponentProps } from 'react';

import { AccountScreen } from '../screens/AccountScreen';
import { AiAssistantScreen } from '../screens/AiAssistantScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { RoutesScreen } from '../screens/RoutesScreen';
import { ShoppingListScreen } from '../screens/ShoppingListScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

type IoniconName = ComponentProps<typeof Ionicons>['name'];

const tabIcons: Record<
  keyof MainTabParamList,
  { active: IoniconName; inactive: IoniconName }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  ShoppingList: { active: 'list', inactive: 'list-outline' },
  Routes: { active: 'map', inactive: 'map-outline' },
  AiAssistant: { active: 'sparkles', inactive: 'sparkles-outline' },
  Account: { active: 'person', inactive: 'person-outline' },
};

const commonScreenOptions: BottomTabNavigationOptions = {
  headerTitleStyle: { color: '#17231A', fontWeight: '700' },
  tabBarActiveTintColor: '#167438',
  tabBarInactiveTintColor: '#667168',
  tabBarLabelStyle: { fontSize: 11, fontWeight: '600', letterSpacing: 0 },
};

const renderTabIcon = (active: IoniconName, inactive: IoniconName) =>
  ({ color, focused, size }: { color: string; focused: boolean; size: number }) => (
    <Ionicons
      color={color}
      name={focused ? active : inactive}
      size={size}
    />
  );

export function MainTabNavigator() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={commonScreenOptions}
    >
      <Tab.Screen
        component={HomeScreen}
        name="Home"
        options={{
          tabBarIcon: renderTabIcon(tabIcons.Home.active, tabIcons.Home.inactive),
          title: 'Home',
        }}
      />
      <Tab.Screen
        component={ShoppingListScreen}
        name="ShoppingList"
        options={{
          tabBarIcon: renderTabIcon(
            tabIcons.ShoppingList.active,
            tabIcons.ShoppingList.inactive,
          ),
          tabBarLabel: 'Lists',
          title: 'Shopping Lists',
        }}
      />
      <Tab.Screen
        component={RoutesScreen}
        name="Routes"
        options={{
          tabBarIcon: renderTabIcon(tabIcons.Routes.active, tabIcons.Routes.inactive),
          title: 'Routes',
        }}
      />
      <Tab.Screen
        component={AiAssistantScreen}
        name="AiAssistant"
        options={{
          tabBarIcon: renderTabIcon(
            tabIcons.AiAssistant.active,
            tabIcons.AiAssistant.inactive,
          ),
          tabBarLabel: 'Carter',
          title: 'Ask Carter',
        }}
      />
      <Tab.Screen
        component={AccountScreen}
        name="Account"
        options={{
          tabBarIcon: renderTabIcon(tabIcons.Account.active, tabIcons.Account.inactive),
          title: 'Account',
        }}
      />
    </Tab.Navigator>
  );
}