import { Pressable, StyleSheet, Text, View } from 'react-native';

import MapPinIcon from '../../../assets/svg icons/cartograph-18/Group 70.svg';
import ExpandIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';
import { colors, radius, spacing, typography } from '../../theme';
import type { RouteCandidateResult, RouteProductSummary } from '../../types/api';
import { routeModifierBadges } from '../../utils/modifiers';
import { formatTagLabel } from '../../utils/tags';

interface RouteCardProps {
  isExpanded: boolean;
  onOpenMap: () => void;
  onToggle: () => void;
  rank: number;
  route: RouteCandidateResult;
  routeCount: number;
}

const productsAtStore = (
  route: RouteCandidateResult,
  storeId: number,
): readonly RouteProductSummary[] =>
  route.products.filter((product) => product.store === storeId);

export function RouteCard({
  isExpanded,
  onOpenMap,
  onToggle,
  rank,
  route,
  routeCount,
}: RouteCardProps) {
  const storeLabel = route.stores.length === 1 ? 'store' : 'stores';
  const storeSequence = route.stores.map((store) => store.name).join(' → ');
  const total = route.productPrice;
  const unmatched = route.selections.filter((selection) => selection.product === null);
  const selectionsByProduct = new Map(
    route.selections.flatMap((selection) =>
      selection.product === null ? [] : [[selection.product, selection] as const],
    ),
  );
  const summary = `${storeSequence}, rank ${rank} of ${routeCount}, ${route.stores.length} ${storeLabel}, ${route.distance.toFixed(1)} miles, ${Math.round(route.time)} minutes, $${total.toFixed(2)} purchase total`;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <Pressable
          accessibilityLabel={summary}
          accessibilityHint={isExpanded ? 'Collapses route details' : 'Expands route details'}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          onPress={onToggle}
          style={({ pressed }) => [styles.routeHeading, pressed && styles.pressed]}
        >
          <View style={styles.routeTitleCopy}>
            <Text numberOfLines={1} style={styles.routeRank}>
              #{rank} {rank === 1 ? 'Best overall' : 'Ranked route'} · Cost score {Math.round(route.score)}
            </Text>
            <Text ellipsizeMode="tail" numberOfLines={1} style={styles.routeName}>
              {storeSequence}
            </Text>
          </View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.expandIcon, !isExpanded && styles.expandIconCollapsed]}
          >
            <ExpandIcon height={20} width={20} />
          </View>
        </Pressable>
        <Pressable
          accessibilityLabel={`Open ${storeSequence} map`}
          accessibilityRole="button"
          onPress={onOpenMap}
          style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
        >
          <View style={styles.mapIcon}>
            <MapPinIcon height={17} width={12} />
          </View>
          <Text style={styles.mapButtonText}>View route</Text>
        </Pressable>
      </View>

      <View style={styles.metricRow}>
        <View style={[styles.metric, styles.metricDivider]}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{route.stores.length}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>{storeLabel}</Text>
        </View>
        <View style={[styles.metric, styles.metricDivider]}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{route.distance.toFixed(1)}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>miles</Text>
        </View>
        <View style={[styles.metric, styles.metricDivider]}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>{Math.round(route.time)}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>minutes</Text>
        </View>
        <View style={styles.metric}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.metricValue}>${total.toFixed(2)}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>dollars</Text>
        </View>
      </View>

      {isExpanded ? (
        <View style={styles.details}>
          <Text style={styles.scoreNote}>Backend cost score {route.score.toFixed(2)} · lower is better</Text>
          <View style={styles.scoreBreakdown}>
            <Text style={styles.scoreComponent}>Products ${route.scoreComponents.productPrice.toFixed(2)}</Text>
            <Text style={styles.scoreComponent}>Distance ${route.scoreComponents.distanceCost.toFixed(2)}</Text>
            <Text style={styles.scoreComponent}>Time ${route.scoreComponents.timeCost.toFixed(2)}</Text>
            <Text style={styles.scoreComponent}>Stores ${route.scoreComponents.storeCost.toFixed(2)}</Text>
            <Text style={styles.scoreComponent}>Preferences ${route.scoreComponents.modifierPenalty.toFixed(2)}</Text>
          </View>
          <Text accessibilityRole="header" style={styles.detailsTitle}>Store order</Text>
          {route.stores.map((store, storeIndex) => (
            <View key={store.id} style={styles.stop}>
              <Text style={styles.stopNumber}>{storeIndex + 1}</Text>
              <View style={styles.stopContent}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.storeAddress}>{store.address}</Text>
                <View style={styles.productList}>
                  {productsAtStore(route, store.id).map((product) => (
                    <View
                      accessible
                      accessibilityLabel={(() => {
                        const badges = routeModifierBadges(
                          product.modifiers,
                          selectionsByProduct.get(product.id)?.modifiers ?? [],
                        );
                        return `${product.name}, $${product.selectionPrice.toFixed(2)}${
                          badges.length > 0
                            ? `, modifiers: ${badges.map(formatTagLabel).join(', ')}`
                            : ''
                        }`;
                      })()}
                      key={product.id}
                      style={styles.productRow}
                    >
                      <View style={styles.productCopy}>
                        <Text style={styles.productName}>{product.name}</Text>
                        {(() => {
                          const badges = routeModifierBadges(
                            product.modifiers,
                            selectionsByProduct.get(product.id)?.modifiers ?? [],
                          );
                          return badges.length > 0 ? (
                            <View
                              accessibilityElementsHidden
                              importantForAccessibility="no-hide-descendants"
                              style={styles.modifierRow}
                            >
                              {badges.map((modifier) => (
                                <View key={modifier} style={styles.modifierBadge}>
                                  <Text numberOfLines={1} style={styles.modifierText}>
                                    {formatTagLabel(modifier)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          ) : null;
                        })()}
                      </View>
                      <Text style={styles.productPrice}>${product.selectionPrice.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
          {unmatched.length > 0 ? (
            <View style={styles.unmatched}>
              <Text style={styles.unmatchedTitle}>Not matched</Text>
              <Text style={styles.unmatchedText}>{unmatched.map((item) => formatTagLabel(item.tag)).join(', ')}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  pressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  topRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 58,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  routeHeading: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    flexDirection: 'row',
    minHeight: 40,
    minWidth: 0,
  },
  routeName: {
    ...typography.bodyStrong,
    color: colors.text,
    flex: 1,
    fontSize: 14,
  },
  routeTitleCopy: {
    flex: 1,
    minWidth: 0,
  },
  routeRank: {
    ...typography.caption,
    color: colors.primary,
    fontFamily: 'Monda_700Bold',
    fontSize: 10,
    marginBottom: 1,
  },
  expandIcon: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    marginLeft: spacing.xs,
    width: 28,
  },
  expandIconCollapsed: {
    transform: [{ rotate: '180deg' }],
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  mapButtonPressed: {
    opacity: 0.76,
  },
  mapIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    height: 23,
    justifyContent: 'center',
    width: 23,
  },
  mapButtonText: {
    ...typography.caption,
    color: colors.textInverse,
    fontFamily: 'Monda_700Bold',
    fontSize: 10,
  },
  metricRow: {
    backgroundColor: colors.surfaceSubtle,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 64,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  metricDivider: {
    borderRightColor: colors.border,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  metricValue: {
    color: colors.primaryDark,
    fontFamily: 'Monda_700Bold',
    fontSize: 15,
    maxWidth: '100%',
  },
  metricLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  details: {
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    paddingTop: 14,
  },
  detailsTitle: {
    ...typography.bodyStrong,
    color: colors.text,
    marginTop: spacing.sm,
  },
  scoreNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  scoreBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  scoreComponent: {
    ...typography.caption,
    backgroundColor: colors.backgroundMuted,
    borderRadius: radius.sm,
    color: colors.text,
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
  },
  stop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 14,
  },
  stopNumber: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 15,
    color: colors.primary,
    fontFamily: 'Monda_700Bold',
    fontSize: 13,
    height: 30,
    lineHeight: 30,
    overflow: 'hidden',
    textAlign: 'center',
    width: 30,
  },
  stopContent: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    ...typography.bodyStrong,
    color: colors.text,
  },
  storeAddress: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  productList: {
    marginTop: 8,
  },
  productRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 36,
    paddingVertical: 4,
  },
  productCopy: {
    flex: 1,
    marginRight: spacing.sm,
  },
  productName: {
    ...typography.body,
    color: colors.text,
    fontSize: 13,
  },
  productPrice: {
    ...typography.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  modifierRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  modifierBadge: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.pill,
    maxWidth: 150,
    minHeight: 22,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modifierText: {
    color: colors.primary,
    fontFamily: 'Monda_700Bold',
    fontSize: 9,
    lineHeight: 14,
  },
  unmatched: { backgroundColor: '#FFF4E8', borderRadius: radius.sm, marginTop: spacing.sm, padding: spacing.sm },
  unmatchedTitle: { ...typography.bodyStrong, color: colors.text, fontSize: 12 },
  unmatchedText: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
});
