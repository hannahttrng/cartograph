import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';

interface EmptyStateProps { action?: ReactNode; description: string; title: string; }

export function EmptyState({ action, description, title }: EmptyStateProps) {
  return <View style={styles.container}><Text style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text>{action ? <View style={styles.action}>{action}</View> : null}</View>;
}

const styles = StyleSheet.create({ container: { alignItems: 'center', padding: spacing.xxxl }, title: typography.title, description: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' }, action: { marginTop: spacing.lg } });