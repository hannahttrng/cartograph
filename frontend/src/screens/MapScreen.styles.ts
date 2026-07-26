import { StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F9F6',
    flex: 1,
  },
  summaryBand: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#DCE3DC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: 18,
    paddingVertical: spacing.sm,
  },
  summaryCopy: {
    flex: 1,
  },
  closeButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  closeButtonText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  title: {
    ...typography.title,
    color: '#17231A',
    fontSize: 21,
  },
  subtitle: {
    ...typography.caption,
    color: '#667168',
    fontSize: 14,
    marginTop: 3,
  },
  mapSurface: {
    flex: 1,
  },
  selectionStatus: {
    ...typography.caption,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  routeErrorBand: {
    alignItems: 'center',
    backgroundColor: '#FFF4F1',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  routeErrorText: {
    ...typography.body,
    color: colors.danger,
    flex: 1,
  },
  routeRetryButton: {
    alignItems: 'center',
    borderColor: colors.primary,
    borderRadius: radius.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: spacing.sm,
  },
  routeRetryText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  fallbackContent: {
    paddingBottom: 28,
  },
  errorText: {
    ...typography.body,
    color: '#9A3412',
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 18,
    marginVertical: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 18,
    marginTop: 16,
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#173F24',
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  secondaryButtonText: {
    ...typography.bodyStrong,
    color: '#173F24',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.72,
  },
});