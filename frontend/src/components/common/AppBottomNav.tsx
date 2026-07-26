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
  active: ActiveTab;
  navigation: {
    navigate: (route: 'Home' | 'SavedLists' | 'NearbyStores' | 'Routes' | 'AiAssistant') => void;
  };
}

const tabs = [
  { Icon: HomeNavIcon, key: 'home', label: 'Home', route: 'Home', width: 39 },
  { Icon: ListsNavIcon, key: 'lists', label: 'Lists', route: 'SavedLists', width: 40 },
  { Icon: StoresNavIcon, key: 'stores', label: 'Stores', route: 'NearbyStores', width: 40 },
  { Icon: RoutesNavIcon, key: 'routes', label: 'Routes', route: 'Routes', width: 37 },
] as const satisfies ReadonlyArray<{
  Icon: typeof HomeNavIcon;
  key: ActiveTab;
  label: string;
  route: 'Home' | 'SavedLists' | 'NearbyStores' | 'Routes';
  width: number;
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
            style={({ pressed }) => [
              styles.tab,
              isActive && styles.tabActive,
              pressed && styles.tabPressed,
            ]}
          >
            <tab.Icon color={isActive ? colors.textInverse : colors.text} height={37} width={tab.width} />
          </Pressable>
        );
      })}
      <Pressable
        accessibilityLabel="Carter"
        accessibilityRole="button"
        accessibilityState={{ selected: active === 'carter' }}
        onPress={() => navigation.navigate('AiAssistant')}
        style={({ pressed }) => [
          styles.carter,
          active === 'carter' && styles.carterActive,
          pressed && styles.carterPressed,
        ]}
      >
        <CarterControl height={52} preserveAspectRatio="xMidYMid meet" width="100%" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { alignItems: 'center', backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 4, height: 64, justifyContent: 'center', paddingHorizontal: 8 },
  tab: { alignItems: 'center', borderRadius: 8, height: 41, justifyContent: 'center', width: 40 },
  tabActive: { backgroundColor: colors.primary },
  tabPressed: { backgroundColor: '#E3E5E3' },
  carter: { alignItems: 'center', borderRadius: 10, flex: 1, height: 54, justifyContent: 'center', marginLeft: 2, maxWidth: 118, minWidth: 76 },
  carterActive: { backgroundColor: 'rgba(20, 124, 54, 0.16)' },
  carterPressed: { backgroundColor: '#E3E5E3' },
});