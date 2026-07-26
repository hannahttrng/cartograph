import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@cartograph/account-preferences';

export interface AccountPreferences {
  dealAlerts: boolean;
  dietary: string[];
  displayName: string;
  householdSize: number;
  listReminders: boolean;
  location: string;
  pronouns: string;
  routeUpdates: boolean;
  stores: string[];
}

export const accountDisplayName = (
  preferences: AccountPreferences | null,
): string => {
  const displayName = preferences?.displayName.trim();
  return !displayName || displayName === 'Carter CartCart' ? 'User' : displayName;
};

export async function loadAccountPreferences(): Promise<AccountPreferences | null> {
  const serializedPreferences = await AsyncStorage.getItem(STORAGE_KEY);
  if (!serializedPreferences) return null;

  try {
    return JSON.parse(serializedPreferences) as AccountPreferences;
  } catch {
    return null;
  }
}

export async function saveAccountPreferences(preferences: AccountPreferences): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
