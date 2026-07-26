import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../../theme';
import type { Route } from '../../types/models';
import { AppCard } from '../common/AppCard';

interface RouteCardProps { onPress?: () => void; route: Route; title?: string; }

export function RouteCard({ onPress, route, title = 'Best Overall' }: RouteCardProps) {
  return <Pressable accessibilityRole="button" disabled={!onPress} onPress={onPress}><AppCard style={styles.card}><View style={styles.header}><Text style={styles.title}>{title}</Text><Text style={styles.score}>{route.score}</Text></View><Text style={styles.detail}>{route.products.length} items · {route.stores.length} stores · {route.distance.toFixed(1)} mi</Text><View style={styles.metrics}><Metric label="Est. time" value={`${route.time} min`} /><Metric label="Est. cost" value={`$${route.products.reduce((total, product) => total + product.price, 0).toFixed(2)}`} /></View></AppCard></Pressable>;
}

function Metric({ label, value }: { label: string; value: string }) { return <View><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({ card: { gap: spacing.sm }, header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, title: typography.bodyStrong, score: { backgroundColor: colors.primaryMuted, borderRadius: radius.pill, color: colors.primary, fontSize: 12, fontWeight: '700', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs }, detail: typography.caption, metrics: { borderTopColor: colors.border, borderTopWidth: 1, flexDirection: 'row', gap: spacing.xxl, paddingTop: spacing.sm }, metricLabel: typography.caption, metricValue: { ...typography.bodyStrong, marginTop: 2 } });