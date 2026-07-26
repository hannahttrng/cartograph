import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav, BackButton, DesignIcon } from '../components/common';
import { StoreCard } from '../components/store';
import { mockStores } from '../mock/mockStores';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyStores'>;

export function NearbyStoresScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} />
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
          {mockStores.map((store) => <StoreCard key={store.id} onPress={() => navigation.navigate('NearbyDeals')} store={store} />)}
        </View>
      </ScrollView>
      <AppBottomNav active="stores" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', height: 64, paddingHorizontal: 16 },
  title: { color: '#030303', flex: 1, fontFamily: 'Monda_700Bold', fontSize: 20, marginLeft: 2 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: '#FFFFFF', borderRadius: 22, borderWidth: 2, height: 40, justifyContent: 'center', width: 44 },
  map: { aspectRatio: 435 / 417, backgroundColor: '#EEF1ED', overflow: 'hidden', width: '100%' },
  mapImage: { height: '105%', width: '100%' },
  mapTint: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(228,210,210,0.12)' },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#D9D9D9', borderRadius: 20, height: 6, marginTop: 9, width: 77 },
  content: { paddingBottom: 8, paddingHorizontal: 16 },
  sectionTitle: { color: '#030303', fontFamily: 'Monda_700Bold', fontSize: 16, marginBottom: 2, marginTop: 7 },
  storeList: { gap: 8 },
});