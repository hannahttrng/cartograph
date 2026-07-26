import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

type StatusTone = 'loading' | 'success' | 'error';

export function StatusBanner({ message, tone }: { message: string; tone: StatusTone }) {
  return <View style={[styles.banner, styles[tone]]}><Text style={styles.info}>i</Text><Text style={styles.message}>{message}</Text></View>;
}

const styles = StyleSheet.create({
  banner: { alignItems: 'center', borderRadius: radius.md, flexDirection: 'row', minHeight: 36, paddingHorizontal: spacing.md },
  loading: { backgroundColor: '#EEF3EF' },
  success: { backgroundColor: colors.primaryMuted },
  error: { backgroundColor: '#FCE8E5' },
  info: { color: colors.primary, fontSize: 14, fontWeight: '700', marginRight: spacing.sm },
  message: { ...typography.caption, color: colors.text },
});