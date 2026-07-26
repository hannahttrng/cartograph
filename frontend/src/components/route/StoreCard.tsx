import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../../theme';
import type { Store } from '../../types/models';
import { AppCard } from '../common/AppCard';

export function StoreCard({ distanceLabel, store }: { distanceLabel?: string; store: Store }) {
  return <AppCard style={styles.card}><View style={styles.marker}><Text style={styles.markerLabel}>●</Text></View><View style={styles.copy}><Text style={styles.name}>{store.name}</Text><Text style={styles.address}>{store.address}</Text></View>{distanceLabel ? <Text style={styles.distance}>{distanceLabel}</Text> : null}</AppCard>;
}

const styles = StyleSheet.create({ card: { alignItems: 'center', flexDirection: 'row' }, marker: { alignItems: 'center', backgroundColor: colors.primaryMuted, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 }, markerLabel: { color: colors.primary, fontSize: 18 }, copy: { flex: 1, marginLeft: spacing.sm }, name: typography.bodyStrong, address: { ...typography.caption, marginTop: 2 }, distance: { ...typography.caption, color: colors.primary } });