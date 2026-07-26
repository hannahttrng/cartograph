import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Product, Route } from '../../types/models';

interface RouteCardProps {
  isExpanded: boolean;
  onOpenMap: () => void;
  onToggle: () => void;
  rank: number;
  route: Route;
  routeCount: number;
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
}: RouteCardProps) {
  const storeLabel = route.stores.length === 1 ? 'store' : 'stores';
  const total = purchaseTotal(route);
  const summary = `Route ${rank} of ${routeCount}, ${route.stores.length} ${storeLabel}, ${route.distance.toFixed(1)} miles, ${Math.round(route.time)} minutes, $${total.toFixed(2)} purchase total`;

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
            <Text style={styles.title}>Route {rank}</Text>
          </View>
          <Ionicons
            accessibilityElementsHidden
            color="#245C36"
            importantForAccessibility="no-hide-descendants"
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={22}
          />
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
        accessibilityLabel={`Open route ${rank} map`}
        accessibilityRole="button"
        onPress={onOpenMap}
        style={({ pressed }) => [styles.mapButton, pressed && styles.mapButtonPressed]}
      >
        <Ionicons color="#FFFFFF" name="navigate-outline" size={20} />
        <Text style={styles.mapButtonText}>Open map</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE3DC',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  summaryButton: {
    padding: 16,
  },
  pressed: {
    backgroundColor: '#F3F7F2',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#668170',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0,
  },
  title: {
    color: '#17231A',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 3,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginTop: 12,
    rowGap: 8,
  },
  metric: {
    backgroundColor: '#F3F7F2',
    borderRadius: 6,
    marginHorizontal: '1%',
    minHeight: 66,
    paddingHorizontal: 10,
    paddingVertical: 10,
    width: '48%',
  },
  metricValue: {
    color: '#173F24',
    fontSize: 17,
    fontWeight: '700',
  },
  metricLabel: {
    color: '#667168',
    fontSize: 12,
    marginTop: 2,
  },
  details: {
    borderTopColor: '#DCE3DC',
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
    paddingTop: 14,
  },
  detailsTitle: {
    color: '#294E34',
    fontSize: 15,
    fontWeight: '700',
  },
  stop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 14,
  },
  stopNumber: {
    backgroundColor: '#DFF0DD',
    borderRadius: 15,
    color: '#167438',
    fontSize: 13,
    fontWeight: '700',
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
    color: '#17231A',
    fontSize: 16,
    fontWeight: '700',
  },
  storeAddress: {
    color: '#667168',
    fontSize: 13,
    lineHeight: 18,
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
    color: '#344A3A',
    flex: 1,
    fontSize: 14,
    marginRight: 12,
  },
  productPrice: {
    color: '#245C36',
    fontSize: 14,
    fontWeight: '700',
  },
  mapButton: {
    alignItems: 'center',
    backgroundColor: '#173F24',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
  },
  mapButtonPressed: {
    backgroundColor: '#0F2F19',
  },
  mapButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});