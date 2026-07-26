import type { NavigationProp } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeNavIcon from '../../../assets/Group 91.svg';
import CarterControl from '../../../assets/Group 92.svg';
import StoresNavIcon from '../../../assets/Group 93.svg';
import ListsNavIcon from '../../../assets/Group 94.svg';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme';

type ActiveTab = 'home' | 'lists' | 'stores';

interface AppBottomNavProps {
  active: ActiveTab;
  navigation: NavigationProp<RootStackParamList>;
}

const tabs = [
  { Icon: HomeNavIcon, key: 'home', label: 'Home', route: 'Home' },
  { Icon: ListsNavIcon, key: 'lists', label: 'Lists', route: 'SavedLists' },
  { Icon: StoresNavIcon, key: 'stores', label: 'Stores', route: 'NearbyStores' },
] as const satisfies ReadonlyArray<{
  Icon: typeof HomeNavIcon;
  key: ActiveTab;
  label: string;
  route: 'Home' | 'SavedLists' | 'NearbyStores';
}>;

export function AppBottomNav({ active, navigation }: AppBottomNavProps) {
  const { bottom } = useSafeAreaInsets();

  return (
    <View style={[styles.bar, { height: 64 + bottom, paddingBottom: bottom }]}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable
            accessibilityLabel={tab.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            key={tab.key}
            onPress={() => navigation.navigate(tab.route)}
            style={[styles.tab, isActive && styles.tabActive]}
          >
            <tab.Icon height={tab.key === 'stores' ? 26 : tab.key === 'lists' ? 22 : 24} width={tab.key === 'stores' ? 20 : 25} />
          </Pressable>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => navigation.navigate('AiAssistant')} style={styles.carter}>
        <CarterControl height={58} width={127} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: colors.surface, flexDirection: 'row', gap: 9, height: 64, justifyContent: 'center', paddingHorizontal: 16 },
  tab: { alignItems: 'center', borderRadius: 10, height: 37, justifyContent: 'center', width: 40 },
  tabActive: { backgroundColor: colors.primary },
  carter: { alignItems: 'center', height: 58, justifyContent: 'center', marginLeft: 8, width: 127 },
});