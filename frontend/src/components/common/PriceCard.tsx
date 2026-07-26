import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';

interface PriceCardProps {
  label: string;
  price: number;
  unit?: string;
}

export function PriceCard({ label, price, unit }: PriceCardProps) {
  return <View style={styles.card}><Text style={styles.label}>{label}</Text><Text style={styles.price}>${price.toFixed(2)}</Text>{unit ? <Text style={styles.unit}>{unit}</Text> : null}</View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surfaceSubtle, borderRadius: radius.md, padding: spacing.sm },
  label: typography.caption,
  price: { ...typography.title, color: colors.primary, marginTop: spacing.xxs },
  unit: { ...typography.caption, marginTop: 2 },
});