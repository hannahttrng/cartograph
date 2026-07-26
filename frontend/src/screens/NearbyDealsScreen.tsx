import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import BackIcon from '../../assets/svg icons/keyboard_arrow_up.svg';
import CostcoLogo from '../../assets/svg icons/image 5.svg';
import WalmartSpark from '../../assets/svg icons/cartograph-8/Group.svg';
import { AppBottomNav, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyDeals'>;

const stores = [
  { id: 'walmart-1', logo: 'walmart', name: 'Walmart Supercenter' },
  { id: 'costco-1', logo: 'costco', name: 'Costco' },
  { id: 'trader-joes-1', logo: 'traderJoes', name: 'Trader Joe’s' },
  { id: 'walmart-2', logo: 'walmart', name: 'Walmart Supercenter' },
  { id: 'costco-2', logo: 'costco', name: 'Costco' },
  { id: 'trader-joes-2', logo: 'traderJoes', name: 'Trader Joe’s' },
  { id: 'trader-joes-3', logo: 'traderJoes', name: 'Trader Joe’s' },
] as const;

function StoreLogo({ logo }: { logo: (typeof stores)[number]['logo'] }) {
  if (logo === 'walmart') {
    return <View style={styles.walmartLogo}><WalmartSpark height={29} width={31} /></View>;
  }
  if (logo === 'costco') {
    return <CostcoLogo height={47} width={70} />;
  }
  return <Image resizeMode="contain" source={require('../../assets/svg icons/image 3.png')} style={styles.traderJoesLogo} />;
}

export function NearbyDealsScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Go back" hitSlop={12} onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton}>
          <BackIcon height={25} width={25} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>Nearby Deals</Text>
          <Text numberOfLines={2} style={styles.subtitle}>Top stores near you with the best savings.</Text>
        </View>
        <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}>
          <DesignIcon name="person" size={23} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.list}>
          {stores.map((store) => (
            <Pressable accessibilityRole="button" key={store.id} onPress={() => navigation.navigate('NewShoppingList')} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
              <View style={styles.logoSlot}><StoreLogo logo={store.logo} /></View>
              <View style={styles.copy}>
                <Text numberOfLines={1} style={styles.store}>{store.name}</Text>
                <Text numberOfLines={1} style={styles.detail}>2.3 mi away  •  Low prices on 54 items</Text>
              </View>
              <View style={styles.trailing}>
                <View style={styles.savingsBadge}><Text style={styles.savingsText}>Save $15</Text></View>
                <BackIcon height={23} style={styles.chevron} width={23} />
              </View>
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
  header: { alignItems: 'flex-start', flexDirection: 'row', minHeight: 132, paddingHorizontal: 8, paddingTop: 24 },
  backButton: { alignItems: 'center', height: 40, justifyContent: 'center', marginTop: 43, transform: [{ rotate: '-90deg' }], width: 40 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { color: '#000000', fontFamily: 'Monda_700Bold', fontSize: 20, marginTop: 4 },
  subtitle: { color: '#3A3A3A', fontFamily: 'Monda_400Regular', fontSize: 14, lineHeight: 20, marginTop: 5, maxWidth: 293 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: '#FFFFFF', borderRadius: 22, borderWidth: 2, height: 40, justifyContent: 'center', width: 44 },
  content: { paddingBottom: 12, paddingHorizontal: 8 },
  list: { gap: 12 },
  card: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#D9D9D9', borderRadius: 10, borderWidth: 1, flexDirection: 'row', height: 91, paddingHorizontal: 8 },
  logoSlot: { alignItems: 'center', height: 58, justifyContent: 'center', width: 52 },
  walmartLogo: { alignItems: 'center', backgroundColor: '#1267E8', borderRadius: 25, height: 49, justifyContent: 'center', width: 49 },
  traderJoesLogo: { height: 49, width: 67 },
  copy: { flex: 1, marginLeft: 6, minWidth: 0 },
  store: { color: '#000000', fontFamily: 'Monda_700Bold', fontSize: 14 },
  detail: { color: '#3A3A3A', fontFamily: 'Monda_700Bold', fontSize: 10, marginTop: 2 },
  trailing: { alignItems: 'center', flexDirection: 'row', marginLeft: 5 },
  savingsBadge: { alignItems: 'center', backgroundColor: '#CFF7D2', borderRadius: 10, height: 24, justifyContent: 'center', width: 73 },
  savingsText: { color: '#0B6B24', fontFamily: 'Monda_700Bold', fontSize: 11 },
  chevron: { marginLeft: 2, transform: [{ rotate: '90deg' }] },
  pressed: { opacity: 0.72 },
});
