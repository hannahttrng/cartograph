import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HomeNavIcon from '../../../assets/Group 91.svg';
import CarterControl from '../../../assets/Group 92.svg';
import StoresNavIcon from '../../../assets/Group 93.svg';
import ListsNavIcon from '../../../assets/Group 94.svg';
import RoutesNavIcon from '../../../assets/routes-nav.svg';
import type { RootStackParamList } from '../../navigation/types';
import { colors } from '../../theme';

type ActiveTab = 'home' | 'lists' | 'stores' | 'routes' | 'carter';

interface AppBottomNavProps {
  active?: ActiveTab;
  navigation: NativeStackNavigationProp<RootStackParamList>;
}

const tabs = [
  { Icon: HomeNavIcon, key: 'home', label: 'Home', route: 'Home' },
  { Icon: ListsNavIcon, key: 'lists', label: 'Lists', route: 'SavedLists' },
  { Icon: StoresNavIcon, key: 'stores', label: 'Stores', route: 'NearbyStores' },
  { Icon: RoutesNavIcon, key: 'routes', label: 'Routes', route: 'Routes' },
] as const satisfies ReadonlyArray<{
  Icon: typeof HomeNavIcon;
  key: ActiveTab;
  label: string;
  route: 'Home' | 'SavedLists' | 'NearbyStores' | 'Routes';
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
      <Pressable
        accessibilityLabel="Carter"
        accessibilityRole="button"
        accessibilityState={{ selected: active === 'carter' }}
        onPress={() => navigation.navigate('AiAssistant')}
        style={[styles.carter, active === 'carter' && styles.carterActive]}
      >
        <CarterControl height={52} preserveAspectRatio="xMidYMid meet" width="100%" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 4, height: 64, justifyContent: 'center', paddingHorizontal: 8 },
  tab: { alignItems: 'center', borderRadius: 8, height: 37, justifyContent: 'center', width: 36 },
  tabActive: { backgroundColor: colors.primary },
  carter: { alignItems: 'center', borderColor: 'transparent', borderRadius: 10, borderWidth: 1, flex: 1, height: 54, justifyContent: 'center', marginLeft: 2, maxWidth: 118, minWidth: 88 },
  carterActive: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
});