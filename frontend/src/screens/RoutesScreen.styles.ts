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
  loadingRoute: {
    height: 36,
    position: 'relative',
    width: 104,
  },
  loadingLine: {
    backgroundColor: colors.primaryMuted,
    height: 4,
    left: 6,
    position: 'absolute',
    right: 6,
    top: 16,
  },
  loadingStop: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderRadius: 7,
    borderWidth: 2,
    height: 14,
    position: 'absolute',
    top: 11,
    width: 14,
  },
  loadingCart: {
    backgroundColor: colors.primary,
    borderColor: colors.surface,
    borderRadius: 6,
    borderWidth: 2,
    height: 12,
    left: 1,
    position: 'absolute',
    top: 12,
    width: 12,
  },
  separator: {
    height: spacing.sm,
  },
});