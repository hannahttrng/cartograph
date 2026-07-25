import { StyleSheet, Text, View } from 'react-native';

import type { MapRouteData } from '../../types/maps';

interface ArcGISMapAdapterProps {
  mapData: MapRouteData;
}

export function ArcGISMapAdapter({ mapData }: ArcGISMapAdapterProps) {
  return (
    <View accessibilityLabel="ArcGIS map placeholder" style={styles.container}>
      <Text style={styles.text}>
        ArcGIS map placeholder for {mapData.stores.length} stores.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderStyle: 'dashed',
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 180,
    padding: 20,
  },
  text: {
    color: '#52606D',
    fontSize: 14,
    textAlign: 'center',
  },
});