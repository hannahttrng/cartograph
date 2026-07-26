import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DisclosureArrow } from '../common/DisclosureArrow';
import { colors, fontFamily, radius, spacing } from '../../theme';
import type { DemoRouteSummary } from '../../types/demo';

export function RouteSummaryAccordion({ route }: { route: DemoRouteSummary }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded((value) => !value)} style={styles.header}>
        <View style={styles.copy}><Text style={styles.title}>{route.title}</Text><Text style={styles.meta}>{route.storeCount} stores · {route.distanceMiles.toFixed(1)} mi · Save ${route.estimatedSavings}</Text></View>
        <DisclosureArrow direction={expanded ? 'up' : 'down'} />
      </Pressable>
      {expanded ? <View style={styles.details}><Text style={styles.detailText}>{route.storeNames.join(' → ')}</Text><Text style={styles.detailText}>Estimated drive: {route.estimatedMinutes} min</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1 },
  header: { alignItems: 'center', flexDirection: 'row', minHeight: 68, padding: spacing.md },
  copy: { flex: 1 },
  title: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 },
  meta: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 11, marginTop: 2 },
  details: { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, padding: spacing.md },
  detailText: { color: colors.text, fontFamily: fontFamily.regular, fontSize: 12 },
});