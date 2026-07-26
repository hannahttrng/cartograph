import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fontFamily, radius } from '../../theme';
import type { DemoStore, UserLocation } from '../../types/demo';

interface MapPreviewProps {
  onPress: () => void;
  stores: DemoStore[];
  userLocation: UserLocation;
}

const markerPositions = [
  { left: '29%', top: '30%' },
  { left: '57%', top: '46%' },
  { left: '71%', top: '24%' },
] as const;

export function MapPreview({ onPress, stores, userLocation }: MapPreviewProps) {
  // TODO(ERIC): Replace with actual user location source and backend-provided nearby store coordinates.
  return (
    <Pressable accessibilityLabel={`Open map near ${userLocation.label}`} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.map, pressed && styles.pressed]}>
      <Image resizeMode="cover" source={require('../../../assets/images/redlands-map.png')} style={StyleSheet.absoluteFill} />
      {stores.slice(0, 3).map((store, index) => <View key={store.id} style={[styles.storeMarker, markerPositions[index]]}><Text style={styles.storeMarkerLabel}>{index + 1}</Text></View>)}
      <View style={styles.userMarker}><View style={styles.userMarkerCenter} /></View>
      <View style={styles.locationLabel}><Text numberOfLines={1} style={styles.locationText}>{userLocation.label} · {stores.length} stores nearby</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  map: { aspectRatio: 392 / 251, borderRadius: 18, overflow: 'hidden' },
  pressed: { opacity: 0.75 },
  storeMarker: { alignItems: 'center', backgroundColor: colors.primary, borderColor: colors.surface, borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', position: 'absolute', width: 28 },
  storeMarkerLabel: { color: colors.textInverse, fontFamily: fontFamily.bold, fontSize: 11 },
  userMarker: { alignItems: 'center', backgroundColor: 'rgba(28,159,232,0.25)', borderRadius: 18, height: 36, justifyContent: 'center', left: '45%', position: 'absolute', top: '55%', width: 36 },
  userMarkerCenter: { backgroundColor: colors.mapWater, borderColor: colors.surface, borderRadius: 7, borderWidth: 2, height: 14, width: 14 },
  locationLabel: { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: radius.pill, bottom: 10, left: 10, maxWidth: '80%', paddingHorizontal: 10, paddingVertical: 5, position: 'absolute' },
  locationText: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 10 },
});