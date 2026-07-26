import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, radius, spacing } from '../../theme';
import { DesignIcon } from './DesignIcon';

export function SearchBar({ style, ...inputProps }: TextInputProps) {
  return (
    <View style={styles.container}>
      <DesignIcon name="search" size={18} />
      <TextInput accessibilityLabel="Search" placeholderTextColor={colors.textMuted} style={[styles.input, style]} {...inputProps} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, flexDirection: 'row', minHeight: 46, paddingHorizontal: spacing.md },
  input: { color: colors.text, flex: 1, fontSize: 15, marginLeft: spacing.sm, minHeight: 46 },
});