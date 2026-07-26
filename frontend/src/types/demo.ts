export type ListIconName = 'bbq' | 'costco' | 'favorites' | 'grocery' | 'household' | 'mealPrep';

export interface UserLocation {
  latitude: number;
  longitude: number;
  label: string;
}

export interface DemoUser {
  id: string;
  name: string;
  location: UserLocation;
}

export interface Deal {
  id: string;
  summary: string;
  itemCount: number;
}

export interface DemoStore {
  id: string;
  name: string;
  address: string;
  distance: number;
  estimatedSavings: number;
  latitude: number;
  longitude: number;
  logoName: 'albertsons' | 'costco' | 'food-4-less' | 'gerrards' | 'sprouts' | 'stater-bros' | 'target' | 'trader-joes' | 'walmart';
  deals: Deal[];
}

export interface DemoShoppingListItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface DemoShoppingList {
  id: string;
  title: string;
  iconName: ListIconName;
  items: DemoShoppingListItem[];
  updatedAt: string;
}

export interface DemoRouteSummary {
  id: string;
  title: string;
  storeCount: number;
  distanceMiles: number;
  estimatedMinutes: number;
  estimatedSavings: number;
  storeNames: string[];
}