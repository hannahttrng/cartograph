import { Pressable, StyleSheet, Text, View } from 'react-native';

import RoutesIcon from '../../../assets/routes-nav.svg';
import ExpandIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';
import { colors, radius, spacing, typography } from '../../theme';
import type { Product, Route } from '../../types/models';

interface RouteCardProps {
  isExpanded: boolean;
  onOpenMap: () => void;
  onToggle: () => void;
  rank: number;
  route: Route;
  routeCount: number;
  title?: string;
}

const purchaseTotal = (route: Route): number =>
  route.products.reduce((total, product) => total + product.price, 0);

const productsAtStore = (route: Route, storeName: string): Product[] =>
  route.products.filter((product) => product.store.name === storeName);

export function RouteCard({
  isExpanded,
  onOpenMap,
  onToggle,
  rank,
  route,
  routeCount,
  title = `Route ${rank}`,
}: RouteCardProps) {
  const storeLabel = route.stores.length === 1 ? 'store' : 'stores';
  const total = purchaseTotal(route);
  const summary = `${title}, rank ${rank} of ${routeCount}, ${route.stores.length} ${storeLabel}, ${route.distance.toFixed(1)} miles, ${Math.round(route.time)} minutes, $${total.toFixed(2)} purchase total`;

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityLabel={summary}
        accessibilityHint={isExpanded ? 'Collapses route details' : 'Expands route details'}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.summaryButton, pressed && styles.pressed]}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>RANK {rank} OF {routeCount}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.expandIcon, !isExpanded && styles.expandIconCollapsed]}
          >
            <ExpandIcon height={22} width={22} />
          </View>
        </View>

        <View style={styles.metricGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{route.stores.length}</Text>
            <Text style={styles.metricLabel}>{storeLabel}</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{route.distance.toFixed(1)}</Text>
            <Text style={styles.metricLabel}>miles</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>{Math.round(route.time)}</Text>
            <Text style={styles.metricLabel}>minutes</Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>${total.toFixed(2)}</Text>
            <Text style={styles.metricLabel}>purchase total</Text>
          </View>
        </View>
      </Pressable>

      {isExpanded ? (
        <View style={styles.details}>
          <Text accessibilityRole="header" style={styles.detailsTitle}>Store order</Text>
          {route.stores.map((store, storeIndex) => (
            <View key={`${store.name}-${store.address}`} style={styles.stop}>
              <Text style={styles.stopNumber}>{storeIndex + 1}</Text>
              <View style={styles.stopContent}>
                <Text style={styles.storeName}>{store.name}</Text>
                <Text style={styles.storeAddress}>{store.address}</Text>
                <View style={styles.productList}>
                  {productsAtStore(route, store.name).map((product) => (
                    <View key={`${product.store.name}-${product.name}`} style={styles.productRow}>
                      <Text style={styles.productName}>{product.name}</Text>
                      <Text style={styles.productPrice}>${product.price.toFixed(2)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        accessibilityLabel={`Open ${title} map`}
        accessibilityRole="button"
        onPress={onOpenMap}
        style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
      >
        <View style={styles.mapIcon}>
          <RoutesIcon height={18} width={19} />
        </View>
        <Text style={styles.mapButtonText}>Open map</Text>
      </Pressable>
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
  summaryButton: {
    padding: spacing.md,
  },
  pressed: {
    backgroundColor: colors.surfaceSubtle,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginTop: 2,
  },
  expandIcon: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  expandIconCollapsed: {
    transform: [{ rotate: '180deg' }],
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: spacing.sm,
    rowGap: spacing.xs,
  },
  metric: {
    backgroundColor: colors.surfaceSubtle,
    borderRadius: radius.sm,
    marginHorizontal: '1%',
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '48%',
  },
  metricValue: {
    color: colors.primaryDark,
    fontFamily: 'Monda_700Bold',
    fontSize: 17,
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
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 28,
  },
  productName: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    fontSize: 13,
    marginRight: 12,
  },
  productPrice: {
    ...typography.bodyStrong,
    color: colors.primary,
    fontSize: 13,
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  mapButtonPressed: {
    opacity: 0.76,
  },
  mapIcon: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    height: 27,
    justifyContent: 'center',
    width: 29,
  },
  mapButtonText: {
    ...typography.bodyStrong,
    color: colors.textInverse,
  },
});
