import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

interface AppHeaderProps {
  onBack?: () => void;
  right?: ReactNode;
  subtitle?: string;
  title: string;
}

export function AppHeader({ onBack, right, subtitle, title }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.leading}>{onBack ? <Pressable accessibilityLabel="Go back" onPress={onBack}><Text style={styles.back}>‹</Text></Pressable> : null}</View>
      <View style={styles.copy}><Text style={styles.title}>{title}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>
      <View style={styles.trailing}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 60, paddingHorizontal: spacing.lg },
  leading: { minWidth: 32 },
  trailing: { alignItems: 'flex-end', minWidth: 32 },
  copy: { flex: 1 },
  title: typography.sectionTitle,
  subtitle: { ...typography.caption, marginTop: 2 },
  back: { color: colors.text, fontSize: 34, lineHeight: 30 },
});