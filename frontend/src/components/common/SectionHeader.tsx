import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { spacing, typography } from '../../theme';

export function SectionHeader({ action, title }: { action?: ReactNode; title: string }) {
  return <View style={styles.row}><Text style={styles.title}>{title}</Text>{action}</View>;
}

const styles = StyleSheet.create({ row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm }, title: typography.sectionTitle });