import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListsControl from '../../assets/Group 94.svg';
import AvatarBackground from '../../assets/svg icons/cartograph-4/Ellipse 23.svg';
import AvatarImage from '../../assets/svg icons/cartograph-4/image 12.svg';
import DollarBadge from '../../assets/svg icons/cartograph-14/Vector.svg';
import DollarSign from '../../assets/svg icons/cartograph-14/Vector-1.svg';
import ClockBadge from '../../assets/svg icons/cartograph-15/Vector.svg';
import ClockHands from '../../assets/svg icons/cartograph-15/Vector-1.svg';
import TraderJoesLogo from '../../assets/svg icons/image 3.svg';
import BackIcon from '../../assets/svg icons/keyboard_arrow_up.svg';
import PencilIcon from '../../assets/svg icons/account-pencil.svg';
import { AppBottomNav, DesignIcon, type DesignIconName } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { AuthService } from '../services/auth';
import { colors, radius, spacing, typography } from '../theme';
import { loadAccountPreferences, saveAccountPreferences } from '../utils/accountPreferencesStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;
type SettingsSection = 'personal' | 'notifications' | 'preferences';

const dietaryOptions = ['keto', 'gluten free', 'halal', 'vegan', 'no carb', 'vegetarian', 'dairy free', 'kosher', 'nut free', 'low sodium'];
const storeOptions = [
  { id: 'walmart', logo: 'walmart', name: 'Walmart', color: '#0071CE' },
  { id: 'trader-joes', logo: 'traderJoes', name: 'Trader Joe’s', color: '#C41230' },
  { id: 'sprouts', logo: 'wordmark', name: 'Sprouts', color: '#568B2D' },
  { id: 'stater-bros', logo: 'wordmark', name: 'Stater Bros.', color: '#D71920' },
  { id: 'redlands-ranch', logo: 'wordmark', name: 'Redlands Ranch', color: '#276A3A' },
  { id: 'target', logo: 'target', name: 'Target Grocery', color: '#CC0000' },
  { id: 'albertsons', logo: 'wordmark', name: 'Albertsons', color: '#0076BE' },
  { id: 'gerrards', logo: 'wordmark', name: 'Gerrards', color: '#1C5B3A' },
  { id: 'food-4-less', logo: 'wordmark', name: 'Food 4 Less', color: '#D71920' },
] as const;
const settingsIcons: DesignIconName[] = ['person', 'notifications', 'favorite'];
const settingsSections: { id: SettingsSection; label: string }[] = [
  { id: 'personal', label: 'Personal Information' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences', label: 'Preferences' },
];
const storeLogoSources = {
  albertsons: require('../../assets/images/store-logos/albertsons.png'),
  'food-4-less': require('../../assets/images/store-logos/food-4-less.png'),
  gerrards: require('../../assets/images/store-logos/gerrards.png'),
  sprouts: require('../../assets/images/store-logos/sprouts.png'),
  'stater-bros': require('../../assets/images/store-logos/stater-bros.png'),
  target: require('../../assets/images/store-logos/target.png'),
  walmart: require('../../assets/images/store-logos/walmart.png'),
} as const;

export function AccountScreen({ navigation }: Props) {
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SettingsSection | null>('preferences');
  const [displayName, setDisplayName] = useState('Carter CartCart');
  const [pronouns, setPronouns] = useState('he/him');
  const [location, setLocation] = useState('Redlands, CA');
  const [dealAlerts, setDealAlerts] = useState(true);
  const [routeUpdates, setRouteUpdates] = useState(true);
  const [listReminders, setListReminders] = useState(false);
  const [dietary, setDietary] = useState<string[]>(['keto', 'gluten free']);
  const [stores, setStores] = useState<string[]>(['walmart', 'trader-joes']);
  const [householdSize, setHouseholdSize] = useState(6);

  useEffect(() => {
    let active = true;
    void loadAccountPreferences().then((saved) => {
      if (!active) return;
      if (saved) {
        setDealAlerts(saved.dealAlerts);
        setDietary(saved.dietary);
        setDisplayName(saved.displayName);
        setHouseholdSize(saved.householdSize);
        setListReminders(saved.listReminders);
        setLocation(saved.location);
        setPronouns(saved.pronouns);
        setRouteUpdates(saved.routeUpdates);
        setStores(saved.stores);
      }
      setPreferencesLoaded(true);
    }).catch(() => setPreferencesLoaded(true));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void saveAccountPreferences({ dealAlerts, dietary, displayName, householdSize, listReminders, location, pronouns, routeUpdates, stores }).catch(() => undefined);
  }, [dealAlerts, dietary, displayName, householdSize, listReminders, location, preferencesLoaded, pronouns, routeUpdates, stores]);

  const toggle = (value: string, selected: string[], setSelected: (values: string[]) => void) => {
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  const signOut = async () => {
    try {
      await AuthService.logout();
    } finally {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.avatar}>
            <AvatarBackground height={96} width={106} />
            <AvatarImage height={72} style={styles.avatarImage} width={72} />
          </View>
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}><Text accessibilityRole="header" numberOfLines={1} style={styles.name}>{displayName}</Text><PencilIcon height={20} width={20} /></View>
            <View style={styles.profileTags}><Text style={styles.profileTag}>{pronouns}</Text><Text style={styles.profileTag}>{location}</Text></View>
          </View>
        </View>

        <View style={styles.impactCard}>
          <Text style={styles.impactTitle}>Your Impact</Text>
          <View style={styles.impactMetrics}>
            <View style={styles.metric}><ImpactIcon type="dollar" /><View><Text style={styles.metricLabel}>Total Saved</Text><Text style={styles.metricValue}>$100.53</Text></View></View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}><ImpactIcon type="time" /><View><Text style={styles.metricLabel}>Time Saved</Text><Text style={styles.metricValue}>29.4 min</Text></View></View>
          </View>
        </View>

        <View style={styles.settingsCard}>
          {settingsSections.map((section, index) => (
            <View key={section.id}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: expandedSection === section.id }} onPress={() => setExpandedSection((current) => current === section.id ? null : section.id)} style={[styles.settingsRow, (index < settingsSections.length - 1 || expandedSection === section.id) && styles.rowBorder]}>
              <View style={styles.settingsIcon}><DesignIcon name={settingsIcons[index]} size={20} /></View>
                <Text style={styles.settingsText}>{section.label}</Text>
                <SectionArrow expanded={expandedSection === section.id} />
              </Pressable>
              {expandedSection === section.id && section.id === 'personal' ? (
                <View style={styles.sectionContent}>
                  <ProfileField label="Display name" onChangeText={setDisplayName} value={displayName} />
                  <ProfileField label="Pronouns" onChangeText={setPronouns} value={pronouns} />
                  <ProfileField label="Home location" onChangeText={setLocation} value={location} />
                </View>
              ) : null}
              {expandedSection === section.id && section.id === 'notifications' ? (
                <View style={styles.sectionContent}>
                  <NotificationToggle label="Nearby deal alerts" onValueChange={setDealAlerts} value={dealAlerts} />
                  <NotificationToggle label="Route updates" onValueChange={setRouteUpdates} value={routeUpdates} />
                  <NotificationToggle label="Shopping list reminders" onValueChange={setListReminders} value={listReminders} />
                </View>
              ) : null}
              {expandedSection === section.id && section.id === 'preferences' ? (
                <View style={styles.preferencesContent}>
                  <View style={styles.preferenceSection}>
                    <Text style={styles.preferenceTitle}>Dietary Preferences</Text>
                    <View style={styles.chipRow}>{dietaryOptions.map((option) => <Chip key={option} label={option} onPress={() => toggle(option, dietary, setDietary)} selected={dietary.includes(option)} />)}</View>
                  </View>
                  <View style={styles.preferenceSection}>
                    <Text style={styles.preferenceTitle}>Store Preferences</Text>
                    <View style={styles.storeGrid}>{storeOptions.map((store) => <StoreChip key={store.id} onPress={() => toggle(store.id, stores, setStores)} selected={stores.includes(store.id)} store={store} />)}</View>
                  </View>
                  <View style={styles.householdRow}>
                    <Text style={styles.preferenceTitle}>Household Size</Text>
                    <View style={styles.stepper}>
                      <Pressable accessibilityLabel="Decrease household size" disabled={householdSize === 1} onPress={() => setHouseholdSize((current) => Math.max(1, current - 1))} style={styles.stepperButton}><Text style={styles.stepperLabel}>−</Text></Pressable>
                      <Text style={styles.householdValue}>{householdSize}</Text>
                      <Pressable accessibilityLabel="Increase household size" disabled={householdSize === 20} onPress={() => setHouseholdSize((current) => Math.min(20, current + 1))} style={styles.stepperButton}><Text style={styles.stepperLabel}>+</Text></Pressable>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <Pressable accessibilityRole="button" style={styles.feedbackCard}>
          <ListsControl height={37} width={40} />
          <Text style={styles.feedbackText}>Feedback Survey</Text>
          <BackIcon height={20} style={styles.rightArrow} width={20} />
        </Pressable>
        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
      <AppBottomNav active="home" navigation={navigation} />
    </SafeAreaView>
  );
}

function SectionArrow({ expanded }: { expanded: boolean }) {
  return <BackIcon height={20} style={expanded ? styles.arrowUp : styles.arrowDown} width={20} />;
}

function ImpactIcon({ type }: { type: 'dollar' | 'time' }) {
  return (
    <View style={styles.impactIcon}>
      {type === 'dollar' ? <><DollarBadge height={44} width={44} /><DollarSign height={29} style={styles.impactGlyph} width={16} /></> : <><ClockBadge height={44} width={44} /><ClockHands height={20} style={styles.impactGlyph} width={16} /></>}
    </View>
  );
}

function ProfileField({ label, onChangeText, value }: { label: string; onChangeText: (value: string) => void; value: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{label}</Text><TextInput accessibilityLabel={label} onChangeText={onChangeText} style={styles.fieldInput} value={value} /></View>;
}

function NotificationToggle({ label, onValueChange, value }: { label: string; onValueChange: (value: boolean) => void; value: boolean }) {
  return <View style={styles.toggleRow}><Text style={styles.toggleLabel}>{label}</Text><Switch ios_backgroundColor={colors.border} onValueChange={onValueChange} thumbColor={colors.surface} trackColor={{ false: colors.border, true: colors.primary }} value={value} /></View>;
}

function StoreChip({ onPress, selected, store }: { onPress: () => void; selected: boolean; store: (typeof storeOptions)[number] }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.storeChip, selected && styles.storeChipSelected]}>
      <StoreBrand store={store} />
    </Pressable>
  );
}

function StoreBrand({ store }: { store: (typeof storeOptions)[number] }) {
  if (store.logo === 'traderJoes') return <View style={styles.brandLockup}><TraderJoesLogo height={34} width={42} /><Text style={[styles.brandName, { color: store.color }]}>Trader Joe’s</Text></View>;
  const logoSource = storeLogoSources[store.id as keyof typeof storeLogoSources];
  if (logoSource) return <View style={styles.brandLockup}><Image resizeMode="contain" source={logoSource} style={styles.storeLogoImage} /><Text style={[styles.brandName, { color: store.color }]}>{store.name}</Text></View>;
  return <Text adjustsFontSizeToFit minimumFontScale={0.75} numberOfLines={1} style={[styles.wordmark, { color: store.color }]}>{store.name}</Text>;
}

function Chip({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  profile: { alignItems: 'center', flexDirection: 'row', marginBottom: 38, marginTop: spacing.sm },
  avatar: { alignItems: 'center', height: 106, justifyContent: 'center', width: 106 },
  avatarImage: { position: 'absolute' },
  profileCopy: { flex: 1, marginLeft: spacing.lg, minWidth: 0 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  name: { ...typography.title, flexShrink: 1, fontSize: 24, lineHeight: 32 },
  profileTags: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  profileTag: { backgroundColor: '#CFF7D2', borderRadius: radius.pill, color: '#0B6B3A', fontFamily: 'Monda_700Bold', fontSize: 13, overflow: 'hidden', paddingHorizontal: spacing.md, paddingVertical: spacing.xxs },
  impactCard: { backgroundColor: '#FFFFFF', borderColor: '#D3D3D3', borderRadius: 22, borderWidth: 1, marginBottom: spacing.lg, paddingHorizontal: 28, paddingVertical: 24, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.22, shadowRadius: 2 },
  impactTitle: { color: '#111111', fontFamily: 'Monda_700Bold', fontSize: 17, lineHeight: 23 },
  impactMetrics: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 28 },
  metric: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  metricValue: { color: '#08772E', fontFamily: 'Monda_700Bold', fontSize: 20, lineHeight: 27 },
  metricLabel: { color: '#414141', fontFamily: 'Monda_400Regular', fontSize: 11, lineHeight: 16 },
  metricDivider: { backgroundColor: '#E4E4E4', height: 49, marginHorizontal: 14, width: 1 },
  impactIcon: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  impactGlyph: { position: 'absolute' },
  settingsCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg, paddingBottom: spacing.sm },
  settingsRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.md },
  rowBorder: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  settingsIcon: { alignItems: 'center', width: 28 },
  settingsText: { ...typography.body, flex: 1, marginLeft: spacing.xs },
  arrowDown: { transform: [{ rotate: '-90deg' }] },
  arrowUp: { transform: [{ rotate: '90deg' }] },
  rightArrow: { transform: [{ rotate: '180deg' }] },
  sectionContent: { gap: spacing.sm, paddingHorizontal: 44, paddingVertical: spacing.md },
  preferencesContent: { paddingBottom: spacing.sm },
  preferenceSection: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  preferenceTitle: { ...typography.body, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, justifyContent: 'center', minHeight: 34, paddingHorizontal: spacing.md, paddingVertical: spacing.xxs },
  chipSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipText: typography.caption,
  chipTextSelected: { color: colors.primary },
  storeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  storeChip: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: spacing.xs, width: '48%' },
  storeChipSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  brandLockup: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center' },
  brandName: { fontFamily: 'Monda_700Bold', fontSize: 10 },
  storeLogoImage: { height: 30, width: 34 },
  wordmark: { fontFamily: 'Monda_700Bold', fontSize: 13, textAlign: 'center', width: '100%' },
  householdRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepper: { alignItems: 'center', flexDirection: 'row' },
  stepperButton: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  stepperLabel: { color: colors.primary, fontSize: 20, lineHeight: 23 },
  householdValue: { ...typography.bodyStrong, color: colors.primary, minWidth: 34, textAlign: 'center' },
  field: { gap: spacing.xxs },
  fieldLabel: { ...typography.caption, color: colors.textMuted },
  fieldInput: { ...typography.body, backgroundColor: colors.background, borderColor: colors.border, borderRadius: radius.sm, borderWidth: 1, minHeight: 42, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  toggleRow: { alignItems: 'center', flexDirection: 'row', minHeight: 44 },
  toggleLabel: { ...typography.body, flex: 1 },
  feedbackCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 66, paddingHorizontal: spacing.md, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 2 },
  feedbackText: { ...typography.bodyStrong, flex: 1, marginLeft: spacing.sm },
  signOutButton: { alignItems: 'center', borderColor: colors.danger, borderRadius: radius.md, borderWidth: 1, justifyContent: 'center', marginTop: spacing.lg, minHeight: 48 },
  signOutText: { ...typography.bodyStrong, color: colors.danger },
});
