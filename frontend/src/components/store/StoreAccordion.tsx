import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ReminderButton } from '../common/ReminderButton';
import { StoreCard } from './StoreCard';
import { colors, fontFamily, spacing } from '../../theme';
import type { DemoStore } from '../../types/demo';

interface StoreAccordionProps {
  onSelect?: (store: DemoStore) => void;
  store: DemoStore;
}

export function StoreAccordion({ onSelect, store }: StoreAccordionProps) {
  const [expanded, setExpanded] = useState(false);
  const [reminderSet, setReminderSet] = useState(false);
  const deal = store.deals[0];

  return (
    <View style={styles.container}>
      <StoreCard expanded={expanded} onPress={() => setExpanded((value) => !value)} store={store} />
      {expanded ? (
        <View style={styles.details}>
          <Text style={styles.address}>{store.address}</Text>
          <View style={styles.metricRow}><Text style={styles.metricLabel}>Estimated savings</Text><Text style={styles.metricValue}>${store.estimatedSavings.toFixed(0)}</Text></View>
          <View style={styles.metricRow}><Text style={styles.metricLabel}>Distance</Text><Text style={styles.metricValue}>{store.distance.toFixed(1)} mi</Text></View>
          <View style={styles.metricRow}><Text style={styles.metricLabel}>Deal items</Text><Text style={styles.metricValue}>{deal?.itemCount ?? 0}</Text></View>
          <Text style={styles.summary}>{deal?.summary ?? 'Deal details are being updated.'}</Text>
          <View style={styles.actions}>
            <ReminderButton active={reminderSet} onPress={() => setReminderSet((value) => !value)} />
            {onSelect ? <Text accessibilityRole="button" onPress={() => onSelect(store)} style={styles.select}>Build a list here</Text> : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.surface, borderRadius: 12 },
  details: { borderColor: colors.border, borderRadius: 12, borderTopWidth: 0, borderWidth: 1, marginTop: -12, paddingBottom: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  address: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 11, marginBottom: spacing.sm },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', minHeight: 24 },
  metricLabel: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 11 },
  metricValue: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 11 },
  summary: { color: colors.text, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: spacing.xs },
  actions: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  select: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 11 },
});