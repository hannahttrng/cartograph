import { useCallback, useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getRoutes, toApiError } from '../api';
import type { RootStackParamList } from '../navigation/types';
import type { GetRoutesRequest } from '../types/api';
import type { Product, Route } from '../types/models';
import { styles } from './RouteResultsScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'RouteResults'>;

interface RouteRequest extends GetRoutesRequest {
  items: string[];
  listId?: string;
}

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
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await getRoutes<Route[], RouteRequest>({ items, listId });
      const rankedRoutes = [...response].sort((firstRoute, secondRoute) => secondRoute.score - firstRoute.score);

      setRoutes(rankedRoutes);
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

  const selectedRoute = routes[selectedRouteIndex];

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
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
          data={routes}
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
                  items.map((item) => (
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
              <Text accessibilityRole="header" style={styles.title}>
                Your Best Routes
              </Text>
              <Text style={styles.subtitle}>
                Ranked for {items.length} {items.length === 1 ? 'item' : 'items'} on your list.
              </Text>
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
                  <Text style={styles.routeLabel}>Option {index + 1}</Text>
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
    </SafeAreaView>
  );
}
