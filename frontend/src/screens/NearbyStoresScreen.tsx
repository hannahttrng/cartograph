import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackIcon from '../../assets/svg icons/keyboard_arrow_up.svg';
import CostcoLogo from '../../assets/svg icons/image 5.svg';
import WalmartSpark from '../../assets/svg icons/cartograph-8/Group.svg';
import { AppBottomNav, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyStores'>;

const stores = [
  { logo: 'walmart', name: 'Walmart Supercenter' },
  { logo: 'costco', name: 'Costco' },
  { logo: 'traderJoes', name: 'Trader Joe’s' },
] as const;

function StoreLogo({ logo }: { logo: (typeof stores)[number]['logo'] }) {
  if (logo === 'walmart') {
    return <View style={styles.walmartLogo}><WalmartSpark height={29} width={31} /></View>;
  }
  if (logo === 'costco') {
    return <CostcoLogo height={36} width={54} />;
  }
  return <Image resizeMode="contain" source={require('../../assets/svg icons/image 3.png')} style={styles.traderJoesLogo} />;
}

export function NearbyStoresScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" hitSlop={12} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton}>
          <BackIcon height={25} width={25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Map</Text>
        <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}>
          <DesignIcon name="person" size={23} />
        </Pressable>
      </View>

      <View style={styles.map}>
        <Image resizeMode="cover" source={require('../../assets/images/nearby-stores-map.png')} style={styles.mapImage} />
        <View pointerEvents="none" style={styles.mapTint} />
      </View>

      <View style={styles.sheetHandle} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Nearby Stores</Text>
        <View style={styles.storeList}>
          {stores.map((store) => (
            <Pressable accessibilityRole="button" key={store.name} onPress={() => navigation.navigate('NearbyDeals')} style={({ pressed }) => [styles.storeRow, pressed && styles.pressed]}>
              <View style={styles.logoSlot}><StoreLogo logo={store.logo} /></View>
              <View style={styles.storeCopy}>
                <Text numberOfLines={1} style={styles.storeName}>{store.name}</Text>
                <Text numberOfLines={1} style={styles.storeDetail}>2.3 mi away  •  Low prices on 54 items</Text>
              </View>
              <Text style={styles.savings}>$15 savings</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <AppBottomNav active="stores" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', height: 64, paddingHorizontal: 16 },
  backButton: { alignItems: 'center', height: 40, justifyContent: 'center', transform: [{ rotate: '-90deg' }], width: 40 },
  title: { color: '#030303', flex: 1, fontFamily: 'Monda_700Bold', fontSize: 20, marginLeft: 2 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: '#FFFFFF', borderRadius: 22, borderWidth: 2, height: 40, justifyContent: 'center', width: 44 },
  map: { aspectRatio: 435 / 417, backgroundColor: '#EEF1ED', overflow: 'hidden', width: '100%' },
  mapImage: { height: '105%', width: '100%' },
  mapTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(228,210,210,0.12)' },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#D9D9D9', borderRadius: 20, height: 6, marginTop: 9, width: 77 },
  content: { paddingBottom: 8, paddingHorizontal: 16 },
  sectionTitle: { color: '#030303', fontFamily: 'Monda_700Bold', fontSize: 16, marginBottom: 2, marginTop: 7 },
  storeList: { gap: 0 },
  storeRow: { alignItems: 'center', flexDirection: 'row', minHeight: 72 },
  logoSlot: { alignItems: 'center', height: 52, justifyContent: 'center', width: 48 },
  walmartLogo: { alignItems: 'center', backgroundColor: '#1267E8', borderRadius: 20, height: 39, justifyContent: 'center', width: 39 },
  traderJoesLogo: { height: 42, width: 57 },
  storeCopy: { flex: 1, marginLeft: 2, minWidth: 0 },
  storeName: { color: '#000000', fontFamily: 'Monda_700Bold', fontSize: 14 },
  storeDetail: { color: '#3A3A3A', fontFamily: 'Monda_700Bold', fontSize: 10, marginTop: -2 },
  savings: { color: '#0B6B24', fontFamily: 'Monda_700Bold', fontSize: 12, marginLeft: 8 },
  pressed: { opacity: 0.72 },
});