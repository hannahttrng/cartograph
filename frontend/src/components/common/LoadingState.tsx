import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return <View accessibilityRole="progressbar" style={styles.container}><ActivityIndicator color={colors.primary} /><Text style={styles.label}>{label}</Text></View>;
}

const styles = StyleSheet.create({ container: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl }, label: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm } });