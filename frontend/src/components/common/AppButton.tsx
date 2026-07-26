import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

type Variant = 'primary' | 'secondary' | 'text';

interface AppButtonProps {
  accessibilityLabel?: string;
  children: ReactNode;
  disabled?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  variant?: Variant;
}

export function AppButton({ accessibilityLabel, children, disabled = false, onPress, style, variant = 'primary' }: AppButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.base, styles[variant], disabled && styles.disabled, pressed && styles.pressed, style]}
    >
      <Text style={[styles.label, variant !== 'primary' && styles.labelSecondary]}>{children}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', borderRadius: radius.lg, justifyContent: 'center', minHeight: 46, paddingHorizontal: spacing.lg },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderColor: colors.primary, borderWidth: 1 },
  text: { minHeight: 36, paddingHorizontal: spacing.xs },
  label: typography.button,
  labelSecondary: { color: colors.primary },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.78 },
});