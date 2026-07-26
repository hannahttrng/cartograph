import { StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

export function SavingsBadge({ amount }: { amount: string }) {
  return <Text style={styles.badge}>Save {amount}</Text>;
}

const styles = StyleSheet.create({
  badge: { ...typography.caption, backgroundColor: colors.primaryMuted, borderRadius: radius.pill, color: colors.savings, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
});