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
  showCarter?: boolean;
}

const tabs = [
  { Icon: HomeNavIcon, key: 'home', label: 'Home', route: 'Home', width: 39 },
  { Icon: ListsNavIcon, key: 'lists', label: 'Lists', route: 'SavedLists', width: 40 },
  { Icon: StoresNavIcon, key: 'stores', label: 'Stores', route: 'NearbyStores', width: 40 },
] as const satisfies ReadonlyArray<{
  Icon: typeof HomeNavIcon;
  key: ActiveTab;
  label: string;
  route: 'Home' | 'SavedLists' | 'NearbyStores';
  width: number;
}>;

export function AppBottomNav({ active, navigation, showCarter = true }: AppBottomNavProps) {
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
            <tab.Icon height={37} width={tab.width} />
          </Pressable>
        );
      })}
      {showCarter ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('AiAssistant')} style={styles.carter}>
          <CarterControl height={48} width={105} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, height: 64, justifyContent: 'center', paddingHorizontal: 16 },
  tab: { alignItems: 'center', borderRadius: 10, height: 41, justifyContent: 'center', width: 42 },
  tabActive: { backgroundColor: colors.primary },
  carter: { alignItems: 'center', height: 48, justifyContent: 'center', width: 105 },
});