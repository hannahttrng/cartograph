import { StyleSheet, Text, View } from 'react-native';

import { DesignIcon } from '../common/DesignIcon';
import { colors, fontFamily, radius } from '../../theme';
import type { ListIconName } from '../../types/demo';

const labels: Record<ListIconName, string> = {
  bbq: 'BBQ',
  costco: 'C',
  favorites: '★',
  grocery: '',
  household: 'H',
  mealPrep: 'MP',
};

export function ListIcon({ iconName, size = 40 }: { iconName: ListIconName; size?: number }) {
  return (
    <View style={[styles.shell, { height: size, width: size }]}>
      {iconName === 'grocery' ? <DesignIcon name="shoppingBag" size={Math.round(size * 0.62)} /> : <Text adjustsFontSizeToFit numberOfLines={1} style={styles.label}>{labels[iconName]}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { alignItems: 'center', backgroundColor: colors.primaryMuted, borderRadius: radius.md, justifyContent: 'center' },
  label: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 12, paddingHorizontal: 3 },
});