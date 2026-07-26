import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.background,
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.title,
    color: colors.text,
    fontSize: 24,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.xxs,
  },
  filters: {
    marginTop: spacing.md,
  },
  banner: {
    marginTop: spacing.md,
  },
  recalculateButton: {
    marginTop: spacing.sm,
  },
  statePanel: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 220,
    padding: spacing.lg,
  },
  stateText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  separator: {
    height: spacing.sm,
  },
});