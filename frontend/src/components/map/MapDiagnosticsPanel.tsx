import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '../../theme';
import type { ArcGISMapDiagnostic } from '../../types/maps';

interface MapDiagnosticsPanelProps {
  diagnostics: readonly ArcGISMapDiagnostic[];
  firstFailure: ArcGISMapDiagnostic | null;
}

const factValue = (value: string | number | boolean | null): string => {
  if (value === null) return 'null';
  return String(value);
};

export function MapDiagnosticsPanel({
  diagnostics,
  firstFailure,
}: MapDiagnosticsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const latest = diagnostics[diagnostics.length - 1];
  if (!latest) return null;

  const summary = firstFailure
    ? `Failed at ${firstFailure.stage}: ${firstFailure.message}`
    : `${latest.stage}: ${latest.message}`;

  return (
    <>
      <View accessibilityLiveRegion="polite" style={styles.summaryBand}>
        <View style={styles.summaryCopy}>
          <Text style={styles.summaryTitle}>Map diagnostics</Text>
          <Text numberOfLines={1} style={styles.summaryText}>{summary}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsOpen(true)}
          style={({ pressed }) => [styles.openButton, pressed && styles.pressed]}
        >
          <Text style={styles.openButtonText}>View details</Text>
        </Pressable>
      </View>

      <Modal
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
        presentationStyle="pageSheet"
        visible={isOpen}
      >
        <SafeAreaView edges={['top', 'bottom']} style={styles.modal}>
          <View style={styles.modalHeader}>
            <View style={styles.modalTitleCopy}>
              <Text accessibilityRole="header" style={styles.modalTitle}>Map diagnostics</Text>
              <Text style={styles.modalSubtitle}>{diagnostics.length} recent events</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsOpen(false)}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.eventList}>
            {diagnostics.map((diagnostic) => (
              <View key={`${diagnostic.sequence}-${diagnostic.stage}`} style={styles.event}>
                <View style={styles.eventHeader}>
                  <Text style={styles.eventSequence}>#{diagnostic.sequence}</Text>
                  <Text style={styles.eventStage}>{diagnostic.stage}</Text>
                  <Text
                    style={[
                      styles.eventStatus,
                      diagnostic.status === 'failed' && styles.eventStatusFailed,
                      diagnostic.status === 'passed' && styles.eventStatusPassed,
                    ]}
                  >
                    {diagnostic.status}
                  </Text>
                </View>
                <Text style={styles.eventMessage}>{diagnostic.message}</Text>
                {Object.entries(diagnostic.facts).map(([key, value]) => (
                  <View key={key} style={styles.factRow}>
                    <Text style={styles.factKey}>{key}</Text>
                    <Text selectable style={styles.factValue}>{factValue(value)}</Text>
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  summaryBand: {
    alignItems: 'center',
    backgroundColor: '#EEF5F0',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryTitle: { ...typography.bodyStrong, color: colors.text, fontSize: 12 },
  summaryText: { ...typography.caption, color: colors.textMuted, marginTop: 1 },
  openButton: {
    borderColor: colors.primary,
    borderRadius: radius.sm,
    borderWidth: 1,
    marginLeft: spacing.sm,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  openButtonText: { ...typography.caption, color: colors.primary, fontFamily: 'Monda_700Bold' },
  pressed: { opacity: 0.68 },
  modal: { backgroundColor: colors.background, flex: 1 },
  modalHeader: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  modalTitleCopy: { flex: 1 },
  modalTitle: { ...typography.sectionTitle, color: colors.text },
  modalSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  closeButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  closeButtonText: { ...typography.bodyStrong, color: colors.primary },
  eventList: { paddingBottom: spacing.xl },
  event: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  eventHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs },
  eventSequence: { ...typography.caption, color: colors.textMuted, width: 32 },
  eventStage: { ...typography.bodyStrong, color: colors.text, flex: 1 },
  eventStatus: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase' },
  eventStatusFailed: { color: colors.danger },
  eventStatusPassed: { color: colors.primary },
  eventMessage: { ...typography.body, color: colors.text, marginTop: spacing.xxs },
  factRow: { flexDirection: 'row', marginTop: spacing.xxs },
  factKey: { ...typography.caption, color: colors.textMuted, width: '42%' },
  factValue: { ...typography.caption, color: colors.text, flex: 1 },
});