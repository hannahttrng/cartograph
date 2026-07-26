import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ExpandIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';
import { colors, radius, spacing, typography } from '../../theme';
import type { MapRouteResult } from '../../types/maps';

interface RouteDirectionsPanelProps {
  isExpanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectDirection: (sequence: number) => void;
  result: MapRouteResult;
  selectedSequence: number | null;
}

export function RouteDirectionsPanel({
  isExpanded,
  onExpandedChange,
  onSelectDirection,
  result,
  selectedSequence,
}: RouteDirectionsPanelProps) {
  const totalSummary = `${result.totalDistanceMiles.toFixed(1)} miles, ${Math.round(result.totalTimeMinutes)} minutes`;

  return (
    <View style={styles.panel}>
      <Pressable
        accessibilityLabel={isExpanded ? 'Collapse directions' : 'Expand directions'}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={() => onExpandedChange(!isExpanded)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}
      >
        <View style={styles.headerText}>
          <Text accessibilityRole="header" style={styles.title}>Directions</Text>
          <Text accessibilityLiveRegion="polite" style={styles.summary}>
            Route ready - {totalSummary}
          </Text>
        </View>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.expandIcon, !isExpanded && styles.expandIconCollapsed]}
        >
          <ExpandIcon height={22} width={22} />
        </View>
      </Pressable>

      {isExpanded ? (
        <ScrollView
          contentContainerStyle={styles.directionList}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={styles.directionScroll}
        >
          {result.directions.map((direction) => (
            <Pressable
              accessibilityLabel={`Direction ${direction.sequence}: ${direction.text}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedSequence === direction.sequence }}
              key={`${direction.sequence}-${direction.text}`}
              onPress={() => onSelectDirection(direction.sequence)}
              style={({ pressed }) => [
                styles.directionRow,
                selectedSequence === direction.sequence && styles.directionRowSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.directionNumber}>{direction.sequence}</Text>
              <View style={styles.directionContent}>
                <Text style={styles.directionText}>{direction.text}</Text>
                <Text style={styles.directionMetric}>
                  {direction.distanceMiles.toFixed(2)} mi - {direction.timeMinutes.toFixed(1)} min
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexShrink: 1,
    maxHeight: 260,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  pressed: {
    backgroundColor: colors.backgroundMuted,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...typography.sectionTitle,
    color: colors.text,
  },
  summary: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  expandIcon: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  expandIconCollapsed: {
    transform: [{ rotate: '180deg' }],
  },
  directionScroll: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: 196,
  },
  directionList: {
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  directionRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingTop: spacing.sm,
  },
  directionRowSelected: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  directionNumber: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.pill,
    color: colors.primary,
    fontFamily: 'Monda_700Bold',
    fontSize: 12,
    height: 28,
    lineHeight: 28,
    overflow: 'hidden',
    textAlign: 'center',
    width: 28,
  },
  directionContent: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  directionText: {
    ...typography.body,
    color: colors.text,
  },
  directionMetric: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
});