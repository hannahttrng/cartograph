import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import {
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
import { AppBottomNav, DesignIcon, DisclosureArrow, GreetingHeader } from '../components/common';
import { MapPreview } from '../components/map/MapPreview';
import { mockLists } from '../mock/mockLists';
import { mockStores } from '../mock/mockStores';
import { mockUser } from '../mock/mockUser';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, shadows } from '../theme';
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

const recentActivity = mockLists.map((list, index) => ({
  detail: index === 0 ? 'Yesterday' : `${index + 1} days ago`,
  name: list.title,
  savings: `$${(19.52 - index * 2.75).toFixed(2)}`,
}));

const mapPreviewRoute: Route = {
  stores: [
    {
      name: mockStores[0].name,
      address: mockStores[0].address,
      latitude: mockStores[0].latitude,
      longitude: mockStores[0].longitude,
    },
  ],
  products: [],
  distance: 3.2,
  time: 12,
  score: 92,
};

export function HomeScreen({ navigation }: Props) {
  const { top } = useSafeAreaInsets();
  const [searchQuery, setSearchQuery] = useState('');
  const displayName = mockUser?.name ?? 'User';

  const submitSearch = () => {
    const item = searchQuery.trim();
    navigation.navigate('NewShoppingList', item ? { initialItems: [item], title: 'New List' } : undefined);
  };

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: 198 + top }]}>
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
            <View style={styles.greeting}><GreetingHeader displayName={displayName} /></View>
            <View style={styles.searchBar}>
              <DesignIcon name="search" size={18} />
              <TextInput
                accessibilityLabel="Search ingredients or recipes"
                onChangeText={setSearchQuery}
                onSubmitEditing={submitSearch}
                placeholder="Search ingredients, recipes, etc."
                placeholderTextColor="#77847D"
                returnKeyType="search"
                style={styles.searchInput}
                value={searchQuery}
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
        <View style={styles.mapPreview}>
          <MapPreview
          onPress={() =>
            navigation.navigate('Map', {
              route: mapPreviewRoute,
            })
          }
          stores={mockStores}
          userLocation={mockUser.location}
          />
        </View>

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
              <DisclosureArrow direction="right" style={styles.chevron} />
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
  greeting: { marginTop: 7 },
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
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  quickAction: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 112,
    paddingHorizontal: 8,
    paddingVertical: 10,
    ...shadows.card,
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
    marginHorizontal: 27,
    marginTop: 10,
  },
  chevron: {
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