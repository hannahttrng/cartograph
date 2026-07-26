import { StyleSheet } from 'react-native';

import { colors, spacing, typography } from '../theme';

export const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: spacing.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  header: { marginBottom: spacing.lg },
  title: { ...typography.title, color: colors.text, fontSize: 24 },
  subtitle: { ...typography.bodyStrong, color: colors.text, marginTop: spacing.xxs },
  previewNote: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  routeModes: { marginBottom: spacing.md, marginTop: spacing.md },
  separator: { height: spacing.sm },
});
