import { StyleSheet, Text, View } from 'react-native';

import type { MapRouteData } from '../../types/maps';

interface RouteMapFallbackProps {
  mapData: MapRouteData;
}

export function RouteMapFallback({ mapData }: RouteMapFallbackProps) {
  const stops = [
    { key: 'origin-start', label: 'Start', name: mapData.origin.label },
    ...mapData.stops.map((stop) => ({
      key: `store-${stop.sequence}-${stop.name}`,
      label: String(stop.sequence),
      name: stop.name,
      address: stop.address,
    })),
    { key: 'origin-return', label: 'Return', name: mapData.origin.label },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{mapData.estimatedDistanceMiles.toFixed(1)} mi</Text>
          <Text style={styles.metricLabel}>Distance</Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricValue}>{Math.round(mapData.estimatedTimeMinutes)} min</Text>
          <Text style={styles.metricLabel}>Travel time</Text>
        </View>
      </View>
      <Text style={styles.title}>Route sequence</Text>
      {stops.map((stop) => (
        <View key={stop.key} style={styles.storeRow}>
          <Text style={styles.storeNumber}>{stop.label}</Text>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{stop.name}</Text>
            {'address' in stop ? (
              <Text style={styles.storeAddress}>{stop.address}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderWidth: 1,
    padding: 16,
  },
  metrics: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  metric: {
    flex: 1,
  },
  metricValue: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '600',
  },
  metricLabel: {
    color: '#7B8794',
    fontSize: 12,
    marginTop: 3,
  },
  title: {
    color: '#334E68',
    fontSize: 16,
    fontWeight: '600',
  },
  storeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginTop: 16,
  },
  storeNumber: {
    backgroundColor: '#E6F6F4',
    borderRadius: 14,
    color: '#0F766E',
    fontSize: 11,
    fontWeight: '600',
    height: 28,
    lineHeight: 28,
    overflow: 'hidden',
    textAlign: 'center',
    width: 48,
  },
  storeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  storeName: {
    color: '#1F2933',
    fontSize: 16,
    fontWeight: '500',
  },
  storeAddress: {
    color: '#52606D',
    fontSize: 14,
    marginTop: 2,
  },
});