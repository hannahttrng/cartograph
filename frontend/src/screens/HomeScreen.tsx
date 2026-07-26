import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import NearbyDealsIcon from '../../assets/svg icons/Group 13.svg';
import ImportRecipeIcon from '../../assets/svg icons/Group 14.svg';
import BuildListIcon from '../../assets/svg icons/Group 15.svg';
import HeaderBackground from '../../assets/svg icons/Rectangle 1.svg';
import CarterLogo from '../../assets/svg icons/carter_home.svg';
import { AppBottomNav, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import type { Route } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const quickActions: Array<{
  Icon: typeof NearbyDealsIcon;
  screen: 'NearbyDeals' | 'ImportRecipes' | 'NewShoppingList';
  title: string;
}> = [
  {
    Icon: NearbyDealsIcon,
    title: 'Nearby Deals',
    screen: 'NearbyDeals',
  },
  {
    Icon: ImportRecipeIcon,
    title: 'Import Recipe',
    screen: 'ImportRecipes',
  },
  {
    Icon: BuildListIcon,
    title: 'Build a List',
    screen: 'NewShoppingList',
  },
];

const recentActivity = [
  { name: 'Weekly Groceries', detail: 'Yesterday', savings: '$19.52' },
  { name: 'Trader Joes Run', detail: '2 days ago', savings: '$20.53' },
  { name: 'Weekly Groceries', detail: 'Yesterday', savings: '$19.52' },
];

const mapPreviewRoute: Route = {
  stores: [
    {
      name: 'Redlands Grocery Stop',
      address: 'Downtown Redlands, CA',
      latitude: 34.0571,
      longitude: -117.1817,
    },
  ],
  products: [],
  distance: 3.2,
  time: 12,
  score: 92,
};

export function HomeScreen({ navigation }: Props) {
  const { top } = useSafeAreaInsets();

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: 161 + top }]}>
          <HeaderBackground height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} width="100%" />
          <View style={[styles.heroContent, { paddingTop: 28 + top }]}>
            <View style={styles.heroTopRow}>
              <View style={styles.brandRow}>
                <CarterLogo height={40} width={40} />
                <View style={styles.brandCopy}>
                <Text accessibilityRole="header" adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.title}>
                  <Text style={styles.titleAccent}>cart</Text>ograph
                </Text>
                <Text style={styles.tagline}>chart your cart.</Text>
                </View>
              </View>
              <Pressable
                accessibilityLabel="Open profile"
                accessibilityRole="button"
                onPress={() => navigation.navigate('Account')}
                style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
              >
                <DesignIcon name="person" size={23} />
              </Pressable>
            </View>
            <View style={styles.searchBar}>
              <DesignIcon name="search" size={18} />
              <TextInput
                accessibilityLabel="Search ingredients or recipes"
                editable={false}
                placeholder="Search ingredients, recipes, etc."
                placeholderTextColor="#77847D"
                style={styles.searchInput}
              />
            </View>
          </View>
        </View>

        <View style={styles.quickActionRow}>
          {quickActions.map(({ Icon, ...action }) => (
            <Pressable
              accessibilityRole="button"
              key={action.screen}
              onPress={() => navigation.navigate(action.screen)}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
            >
              <View style={styles.actionIconShell}><Icon height={58} width={58} /></View>
              <Text style={styles.quickActionTitle}>{action.title}</Text>
            </Pressable>
          ))}
        </View>

        <View style={[styles.sectionHeader, styles.mapHeader]}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Map Preview</Text>
        </View>
        <Pressable
          accessibilityLabel="Open Redlands map full screen"
          accessibilityRole="button"
          onPress={() =>
            navigation.navigate('Map', {
              route: mapPreviewRoute,
              routeId: 'home-map-preview',
            })
          }
          style={({ pressed }) => [styles.mapPreview, pressed && styles.pressed]}
        >
          <Image resizeMode="cover" source={require('../../assets/images/redlands-map.png')} style={styles.mapImage} />
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable accessibilityRole="button" onPress={() => navigation.navigate('SavedLists')}>
            <Text style={styles.hideAll}>Show All</Text>
          </Pressable>
        </View>
        <View style={styles.activityList}>
          {recentActivity.map((activity, index) => (
            <View key={`${activity.name}-${index}`} style={styles.activityRow}>
              <View style={styles.bagIcon}><DesignIcon name="shoppingBag" size={28} /></View>
              <View style={styles.activityCopy}>
                <Text style={styles.activityName}>{activity.name}</Text>
                <Text style={styles.activityDetail}>{activity.detail} · Saved {activity.savings}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          ))}
        </View>
      </ScrollView>
      <AppBottomNav active="home" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    paddingBottom: 8,
  },
  hero: {
    overflow: 'hidden',
    width: '100%',
  },
  heroContent: { paddingHorizontal: 27 },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  brandRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 5, minWidth: 0 },
  brandCopy: { flexShrink: 1, minWidth: 0 },
  title: {
    color: '#F5FFF1',
    fontFamily: 'Monda_700Bold',
    fontSize: 36,
    lineHeight: 45,
  },
  titleAccent: { color: '#96F9A3' },
  tagline: {
    color: '#FFFFFF',
    fontFamily: 'Monda_400Regular',
    fontSize: 11,
    marginTop: -9,
    textAlign: 'right',
  },
  profileButton: {
    alignItems: 'center',
    backgroundColor: '#E8F5BC',
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2,
    height: 40,
    justifyContent: 'center',
    width: 44,
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DED8',
    borderRadius: 28,
    borderWidth: 1,
    bottom: -17,
    flexDirection: 'row',
    gap: 10,
    height: 49,
    paddingHorizontal: 22,
  },
  searchInput: {
    color: '#1D2B20',
    flex: 1,
    fontFamily: 'Monda_400Regular',
    fontSize: 14,
    height: '100%',
  },
  quickActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 51,
    paddingTop: 56,
  },
  quickAction: {
    alignItems: 'center',
    flex: 1,
    maxWidth: 94,
    minHeight: 102,
    paddingHorizontal: 2,
  },
  actionIconShell: {
    alignItems: 'center',
    height: 61,
    justifyContent: 'center',
    width: 59,
  },
  quickActionTitle: {
    color: '#17231A',
    fontFamily: 'Monda_700Bold',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 32,
  },
  sectionTitle: {
    color: '#17231A',
    fontFamily: 'Monda_700Bold',
    fontSize: 16,
  },
  mapHeader: { marginTop: 8 },
  mapPreview: {
    aspectRatio: 392 / 251,
    borderRadius: 18,
    marginHorizontal: 27,
    marginTop: 10,
    overflow: 'hidden',
  },
  mapImage: { height: '100%', width: '100%' },
  chevron: {
    color: '#7D8980',
    fontSize: 26,
    lineHeight: 28,
    marginLeft: 12,
  },
  hideAll: {
    color: '#167438',
    fontSize: 14,
    fontFamily: 'Monda_700Bold',
  },
  activityList: {
    marginHorizontal: 31,
    marginTop: 5,
  },
  activityRow: {
    alignItems: 'center',
    borderBottomColor: '#E5E9E5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 44,
  },
  bagIcon: {
    alignItems: 'center',
    height: 34,
    justifyContent: 'center',
    marginRight: 15,
    width: 34,
  },
  activityCopy: { flex: 1 },
  activityName: {
    color: '#1D2820',
    fontFamily: 'Monda_700Bold',
    fontSize: 14,
  },
  activityDetail: {
    color: '#647067',
    fontFamily: 'Monda_700Bold',
    fontSize: 12,
  },
  pressed: { opacity: 0.72 },
});