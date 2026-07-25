import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';
import type { Route } from '../types/models';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const quickActions: Array<{
  accent: string;
  screen: 'NearbyDeals' | 'AiAssistant' | 'NewShoppingList';
  subtitle: string;
  title: string;
}> = [
  {
    accent: '#E4F5DD',
    title: 'Nearby Deals',
    subtitle: 'Save on favorites',
    screen: 'NearbyDeals',
  },
  {
    accent: '#E3F1EC',
    title: 'Import Recipe',
    subtitle: 'Paste text or a link',
    screen: 'AiAssistant',
  },
  {
    accent: '#F8EEDC',
    title: 'Build a List',
    subtitle: 'Plan your next trip',
    screen: 'NewShoppingList',
  },
];

const recentActivity = [
  { name: 'Weekly Groceries', detail: 'Yesterday', savings: '$19.52' },
  { name: 'Trader Joes Run', detail: '2 days ago', savings: '$20.53' },
  { name: 'Dinner Ingredients', detail: 'Last week', savings: '$12.84' },
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
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.eyebrow}>GOOD AFTERNOON</Text>
              <Text accessibilityRole="header" style={styles.title}>
                cartograph
              </Text>
              <Text style={styles.tagline}>chart your cart.</Text>
            </View>
            <Pressable
              accessibilityLabel="Open profile"
              accessibilityRole="button"
              onPress={() => navigation.navigate('Account')}
              style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}
            >
              <Text style={styles.profileInitial}>C</Text>
            </Pressable>
          </View>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>Search</Text>
            <TextInput
              accessibilityLabel="Search ingredients or recipes"
              editable={false}
              placeholder="Search ingredients, recipes, etc."
              placeholderTextColor="#77847D"
              style={styles.searchInput}
            />
          </View>
        </View>

        <View style={styles.quickActionRow}>
          {quickActions.map((action) => (
            <Pressable
              accessibilityRole="button"
              key={action.screen}
              onPress={() => navigation.navigate(action.screen)}
              style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
            >
              <View style={[styles.actionSymbol, { backgroundColor: action.accent }]}>
                <View style={styles.actionSymbolDot} />
              </View>
              <Text style={styles.quickActionTitle}>{action.title}</Text>
              <Text style={styles.quickActionSubtitle}>{action.subtitle}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Map Preview</Text>
          <Text style={styles.locationLabel}>REDLANDS, CA</Text>
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
          <View style={[styles.road, styles.roadOne]} />
          <View style={[styles.road, styles.roadTwo]} />
          <View style={[styles.road, styles.roadThree]} />
          <Text style={styles.mapPlaceLabel}>DOWNTOWN{`\n`}REDLANDS</Text>
          <View style={[styles.mapPin, styles.pinOne]}><View style={styles.pinCenter} /></View>
          <View style={[styles.mapPin, styles.pinTwo]}><View style={styles.pinCenter} /></View>
          <View style={styles.routeSummary}>
            <View style={styles.routeIndicator}><View style={styles.routeIndicatorDot} /></View>
            <View style={styles.routeSummaryCopy}>
              <Text style={styles.routeSummaryTitle}>Best Route</Text>
              <Text style={styles.routeSummaryDetail}>$17.84 savings</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </View>
        </Pressable>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Recent Activity</Text>
          <Pressable accessibilityRole="button" onPress={() => {}}>
            <Text style={styles.hideAll}>Hide All</Text>
          </Pressable>
        </View>
        <View style={styles.activityList}>
          {recentActivity.map((activity) => (
            <View key={activity.name} style={styles.activityRow}>
              <View style={styles.bagIcon}><View style={styles.bagHandle} /></View>
              <View style={styles.activityCopy}>
                <Text style={styles.activityName}>{activity.name}</Text>
                <Text style={styles.activityDetail}>{activity.detail} · Saved {activity.savings}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          ))}
        </View>

        <View style={styles.bottomBar}>
          <Pressable accessibilityLabel="Shopping lists" accessibilityRole="button" onPress={() => navigation.navigate('ShoppingList')} style={styles.bottomItem}>
            <Text style={styles.bottomItemText}>Lists</Text>
          </Pressable>
          <View style={[styles.bottomItem, styles.bottomItemActive]}><Text style={styles.bottomItemTextActive}>Home</Text></View>
          <Pressable accessibilityLabel="Set location" accessibilityRole="button" onPress={() => navigation.navigate('ShoppingList')} style={styles.bottomItem}>
            <Text style={styles.bottomItemText}>Location</Text>
          </Pressable>
          <Pressable accessibilityLabel="Ask Carter" accessibilityRole="button" onPress={() => navigation.navigate('AiAssistant')} style={styles.carterButton}>
            <Text style={styles.carterButtonText}>Ask Carter</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    paddingBottom: 24,
  },
  hero: {
    backgroundColor: '#0A3D1D',
    minHeight: 202,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  heroTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  eyebrow: {
    color: '#B7D7B5',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  title: {
    color: '#F5FFF1',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: 0,
    marginTop: 7,
  },
  tagline: {
    color: '#D1EAD2',
    fontSize: 14,
    marginTop: 2,
  },
  profileButton: {
    alignItems: 'center',
    backgroundColor: '#E4F1B7',
    borderColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 2,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  profileInitial: {
    color: '#174C29',
    fontSize: 21,
    fontWeight: '700',
  },
  searchBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D9DED8',
    borderRadius: 28,
    borderWidth: 1,
    bottom: -25,
    flexDirection: 'row',
    height: 54,
    paddingHorizontal: 18,
  },
  searchIcon: {
    color: '#285A38',
    fontSize: 12,
    fontWeight: '700',
    marginRight: 10,
  },
  searchInput: {
    color: '#1D2B20',
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 48,
  },
  quickAction: {
    alignItems: 'center',
    borderColor: '#DCE3DC',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    minHeight: 152,
    paddingHorizontal: 8,
    paddingTop: 18,
  },
  actionSymbol: {
    alignItems: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  actionSymbolDot: {
    backgroundColor: '#167438',
    borderRadius: 10,
    height: 20,
    width: 20,
  },
  quickActionTitle: {
    color: '#17231A',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  quickActionSubtitle: {
    color: '#68746B',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: '#17231A',
    fontSize: 21,
    fontWeight: '700',
  },
  locationLabel: {
    color: '#668170',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  mapPreview: {
    backgroundColor: '#E9EEE8',
    borderColor: '#D5DED4',
    borderRadius: 8,
    borderWidth: 1,
    height: 184,
    marginHorizontal: 20,
    marginTop: 14,
    overflow: 'hidden',
  },
  road: {
    backgroundColor: '#BAC6D7',
    height: 18,
    opacity: 0.95,
    position: 'absolute',
  },
  roadOne: {
    left: -50,
    top: 86,
    transform: [{ rotate: '-16deg' }],
    width: 250,
  },
  roadTwo: {
    right: -72,
    top: 52,
    transform: [{ rotate: '24deg' }],
    width: 250,
  },
  roadThree: {
    left: 92,
    top: -48,
    transform: [{ rotate: '90deg' }],
    width: 240,
  },
  mapPlaceLabel: {
    color: '#667068',
    fontSize: 16,
    fontWeight: '700',
    left: 24,
    lineHeight: 20,
    position: 'absolute',
    top: 82,
  },
  mapPin: {
    alignItems: 'center',
    backgroundColor: '#D94C3A',
    borderColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    justifyContent: 'center',
    position: 'absolute',
    width: 26,
  },
  pinOne: { left: 120, top: 46 },
  pinTwo: { left: 170, top: 108 },
  pinCenter: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  routeSummary: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    bottom: 13,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    position: 'absolute',
    right: 12,
  },
  routeIndicator: {
    alignItems: 'center',
    backgroundColor: '#E1F4DE',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  routeIndicatorDot: {
    backgroundColor: '#16803B',
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  routeSummaryCopy: { marginLeft: 8 },
  routeSummaryTitle: {
    color: '#1E2921',
    fontSize: 14,
    fontWeight: '700',
  },
  routeSummaryDetail: {
    color: '#167438',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  chevron: {
    color: '#7D8980',
    fontSize: 26,
    lineHeight: 28,
    marginLeft: 12,
  },
  hideAll: {
    color: '#167438',
    fontSize: 14,
    fontWeight: '700',
  },
  activityList: {
    marginHorizontal: 20,
    marginTop: 9,
  },
  activityRow: {
    alignItems: 'center',
    borderBottomColor: '#E5E9E5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
  },
  bagIcon: {
    borderColor: '#386144',
    borderRadius: 2,
    borderWidth: 1.5,
    height: 25,
    marginLeft: 3,
    marginRight: 15,
    marginTop: 5,
    width: 21,
  },
  bagHandle: {
    borderColor: '#386144',
    borderRadius: 6,
    borderWidth: 1.5,
    height: 9,
    left: 4,
    position: 'absolute',
    top: -7,
    width: 10,
  },
  activityCopy: { flex: 1 },
  activityName: {
    color: '#1D2820',
    fontSize: 16,
    fontWeight: '700',
  },
  activityDetail: {
    color: '#647067',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  bottomBar: {
    alignItems: 'center',
    borderColor: '#DCE3DC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
    marginHorizontal: 14,
    marginTop: 22,
    padding: 8,
  },
  bottomItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 7,
  },
  bottomItemActive: {
    backgroundColor: '#DFF0DD',
    borderRadius: 6,
  },
  bottomItemText: {
    color: '#526057',
    fontSize: 11,
    fontWeight: '700',
  },
  bottomItemTextActive: {
    color: '#167438',
    fontSize: 11,
    fontWeight: '700',
  },
  carterButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#1B2A1E',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: 11,
    justifyContent: 'center',
  },
  carterButtonText: {
    color: '#1B2A1E',
    fontSize: 13,
    fontWeight: '700',
  },
  pressed: { opacity: 0.72 },
});