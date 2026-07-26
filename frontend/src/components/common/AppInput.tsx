import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

interface AppInputProps extends TextInputProps {
  label?: string;
}

export function AppInput({ label, style, ...inputProps }: AppInputProps) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.caption, color: colors.text, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, borderWidth: 1, color: colors.text, fontSize: 15, minHeight: 46, paddingHorizontal: spacing.md },
});