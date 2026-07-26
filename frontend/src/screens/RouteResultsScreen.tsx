import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackIcon from '../../assets/svg icons/keyboard_arrow_up.svg';
import { getRoutes, toApiError } from '../api';
import { AppBottomNav, DesignIcon, FilterTabs, StatusBanner } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import type { GetRoutesRequest } from '../types/api';
import type { Product, Route } from '../types/models';
import { styles } from './RouteResultsScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteResults'>;

type RouteMode = 'overall' | 'cheapest' | 'fastest';

const routeModes = [
  { label: 'Best Overall', value: 'overall' },
  { label: 'Cheapest', value: 'cheapest' },
  { label: 'Fastest', value: 'fastest' },
] as const;

const formatCost = (route: Route): string => {
  const cost = route.products.reduce((total, product) => total + product.price, 0);
  return cost > 0 ? `$${cost.toFixed(2)}` : 'Price pending';
};

const formatScore = (score: number): string => `${Math.round(score)} score`;

const productsByStore = (products: Product[]) => {
  const grouped = new Map<string, Product[]>();

  products.forEach((product) => {
    const storeProducts = grouped.get(product.store.name) ?? [];
    storeProducts.push(product);
    grouped.set(product.store.name, storeProducts);
  });

  return [...grouped.entries()];
};

export function RouteResultsScreen({ navigation, route }: Props) {
  const { items, listId } = route.params;
  const [routes, setRoutes] = useState<Route[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeMode, setRouteMode] = useState<RouteMode>('overall');
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await getRoutes({ items, listId });
      setRoutes(response);
      setSelectedRouteIndex(0);
    } catch (error: unknown) {
      setRoutes([]);
      setErrorMessage(toApiError(error).message);
    } finally {
      setIsLoading(false);
    }
  }, [items, listId]);

  useEffect(() => {
    void loadRoutes();
  }, [loadRoutes]);

  const displayedRoutes = useMemo(() => {
    const routeCost = (candidate: Route) => candidate.products.reduce((total, product) => total + product.price, 0);
    return [...routes].sort((first, second) => {
      if (routeMode === 'cheapest') return routeCost(first) - routeCost(second);
      if (routeMode === 'fastest') return first.time - second.time;
      return first.score - second.score;
    });
  }, [routeMode, routes]);

  const selectedRoute = displayedRoutes[selectedRouteIndex];

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.screenHeader}>
        <Pressable
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')}
          style={styles.backButton}
        >
          <BackIcon height={24} width={24} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" style={styles.title}>Route Results</Text>
          <Text numberOfLines={1} style={styles.headerSubtitle}>Compare the best trips for your list.</Text>
        </View>
        <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}>
          <DesignIcon name="person" size={23} />
        </Pressable>
      </View>
      {isLoading ? (
        <View style={styles.centeredState}>
          <ActivityIndicator size="large" color="#243B53" />
          <Text accessibilityLiveRegion="polite" style={styles.stateText}>
            Finding the best routes for your list...
          </Text>
        </View>
      ) : errorMessage ? (
        <View style={styles.centeredState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>
            Routes unavailable
          </Text>
          <Text accessibilityLiveRegion="assertive" style={styles.stateText}>
            {errorMessage}
          </Text>
          <Pressable accessibilityRole="button" onPress={loadRoutes} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      ) : routes.length === 0 ? (
        <View style={styles.centeredState}>
          <Text accessibilityRole="header" style={styles.stateTitle}>
            No routes found
          </Text>
          <Text style={styles.stateText}>
            Try adjusting your shopping list and search again.
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.content}
          data={displayedRoutes}
          keyExtractor={(_, index) => `route-${index}`}
          ListFooterComponent={
            selectedRoute ? (
              <View style={styles.detailsSection}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  Selected Route Details
                </Text>
                <Text style={styles.detailHeading}>Store order</Text>
                {selectedRoute.stores.map((store, index) => (
                  <View key={`${store.name}-${store.address}`} style={styles.storeRow}>
                    <Text style={styles.storeNumber}>{index + 1}</Text>
                    <View style={styles.storeText}>
                      <Text style={styles.storeName}>{store.name}</Text>
                      <Text style={styles.storeAddress}>{store.address}</Text>
                    </View>
                  </View>
                ))}

                <Text style={styles.detailHeading}>Items</Text>
                {selectedRoute.products.length > 0 ? (
                  productsByStore(selectedRoute.products).map(([storeName, products]) => (
                    <View key={storeName} style={styles.productGroup}>
                      <Text style={styles.productStore}>{storeName}</Text>
                      {products.map((product) => (
                        <View key={`${product.store.name}-${product.name}`} style={styles.productRow}>
                          <Text style={styles.productName}>{product.name}</Text>
                          <Text style={styles.productPrice}>
                            ${product.price.toFixed(2)} / {product.unit}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))
                ) : (
                  items.map((item: string) => (
                    <Text key={item} style={styles.requestedItem}>
                      {item}
                    </Text>
                  ))
                )}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    navigation.navigate('Map', {
                      route: selectedRoute,
                      routeId: listId ? `${listId}-route-${selectedRouteIndex + 1}` : `route-${selectedRouteIndex + 1}`,
                    })
                  }
                  style={styles.mapButton}
                >
                  <Text style={styles.mapButtonText}>View Route Map</Text>
                </Pressable>
              </View>
            ) : null
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.subtitle}>
                Ranked for {items.length} {items.length === 1 ? 'item' : 'items'} on your list.
              </Text>
              <View style={styles.routeModes}>
                <FilterTabs<RouteMode>
                  onChange={(mode) => {
                    setRouteMode(mode);
                    setSelectedRouteIndex(0);
                  }}
                  options={routeModes}
                  value={routeMode}
                />
              </View>
              <StatusBanner message="Routes Loaded" tone="success" />
            </View>
          }
          renderItem={({ item, index }) => {
            const isSelected = index === selectedRouteIndex;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                onPress={() => setSelectedRouteIndex(index)}
                style={({ pressed }) => [
                  styles.routeCard,
                  isSelected && styles.routeCardSelected,
                  pressed && styles.routeCardPressed,
                ]}
              >
                <View style={styles.routeCardHeader}>
                  <Text style={styles.routeLabel}>
                    {index === 0
                      ? routeModes.find((mode) => mode.value === routeMode)?.label
                      : `Option ${index + 1}`}
                  </Text>
                  <Text style={styles.score}>{formatScore(item.score)}</Text>
                </View>
                <View style={styles.metrics}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{item.distance.toFixed(1)} mi</Text>
                    <Text style={styles.metricLabel}>Distance</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{Math.round(item.time)} min</Text>
                    <Text style={styles.metricLabel}>Travel time</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{formatCost(item)}</Text>
                    <Text style={styles.metricLabel}>Est. cost</Text>
                  </View>
                </View>
                <Text numberOfLines={1} style={styles.routeStores}>
                  {item.stores.map((store) => store.name).join('  →  ')}
                </Text>
              </Pressable>
            );
          }}
        />
      )}
      <AppBottomNav active="lists" navigation={navigation} />
    </SafeAreaView>
  );
}
