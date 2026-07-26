import { StyleSheet } from 'react-native';

import { colors, radius, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#F7F9F6',
    flex: 1,
  },
  summaryBand: {
    backgroundColor: '#FFFFFF',
    borderBottomColor: '#DCE3DC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  title: {
    color: '#17231A',
    fontSize: 21,
    fontWeight: '700',
  },
  subtitle: {
    color: '#667168',
    fontSize: 14,
    marginTop: 3,
  },
  mapSurface: {
    flex: 1,
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
    color: '#173F24',
    fontSize: 15,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.72,
  },
});