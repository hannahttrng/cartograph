import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

interface FilterTabsProps<T extends string> {
  onChange: (value: T) => void;
  options: ReadonlyArray<{ icon?: ReactNode; label: string; value: T }>;
  value: T;
}

export function FilterTabs<T extends string>({ onChange, options, value }: FilterTabsProps<T>) {
  return (
    <ScrollView contentContainerStyle={styles.row} horizontal showsHorizontalScrollIndicator={false}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable accessibilityRole="button" accessibilityState={{ selected }} key={option.value} onPress={() => onChange(option.value)} style={[styles.tab, selected && styles.tabSelected]}>
            {option.icon}
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm },
  tab: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, justifyContent: 'center', minHeight: 32, paddingHorizontal: spacing.md },
  tabSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: typography.caption,
  labelSelected: { color: colors.textInverse },
});