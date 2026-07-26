import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ListsControl from '../../assets/Group 94.svg';
import { AppBottomNav, DesignIcon, type DesignIconName } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Account'>;

const dietaryOptions = ['keto', 'gluten free', 'halal', 'vegan', 'no carb'];
const storeOptions = ['walmart', 'trader joes', 'publix'];
const settingsIcons: DesignIconName[] = ['person', 'notifications', 'favorite'];

export function AccountScreen({ navigation }: Props) {
  const [dietary, setDietary] = useState<string[]>(['keto', 'gluten free']);
  const [stores, setStores] = useState<string[]>(['walmart', 'trader joes']);
  const [householdSize, setHouseholdSize] = useState(6);

  const toggle = (value: string, selected: string[], setSelected: (values: string[]) => void) => {
    setSelected(selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profile}>
          <View style={styles.avatar}><DesignIcon name="person" size={44} /></View>
          <View style={styles.profileCopy}>
            <Text accessibilityRole="header" style={styles.name}>Carter CartCart  ✎</Text>
            <View style={styles.profileTags}><Text style={styles.profileTag}>he/him</Text><Text style={styles.profileTag}>Redlands, CA</Text></View>
          </View>
        </View>

        <View style={styles.impactCard}>
          <Text style={styles.impactTitle}>Your Impact</Text>
          <View style={styles.impactMetrics}>
            <View style={styles.metric}><Text style={styles.metricLabel}>Total Saved</Text><Text style={styles.metricValue}>$100.53</Text></View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}><Text style={styles.metricLabel}>Time Saved</Text><Text style={styles.metricValue}>29.4 min</Text></View>
          </View>
        </View>

        <View style={styles.settingsCard}>
          {['Personal Information', 'Notifications', 'Preferences'].map((item, index) => (
            <Pressable accessibilityRole="button" key={item} style={[styles.settingsRow, index < 2 && styles.rowBorder]}>
              <View style={styles.settingsIcon}><DesignIcon name={settingsIcons[index]} size={20} /></View>
              <Text style={styles.settingsText}>{item}</Text><Text style={styles.chevron}>{index === 2 ? '⌃' : '⌄'}</Text>
            </Pressable>
          ))}
          <View style={styles.preferenceSection}>
            <Text style={styles.preferenceTitle}>◉  Dietary Preferences</Text>
            <View style={styles.chipRow}>{dietaryOptions.map((option) => <Chip key={option} label={option} onPress={() => toggle(option, dietary, setDietary)} selected={dietary.includes(option)} />)}</View>
          </View>
          <View style={styles.preferenceSection}>
            <Text style={styles.preferenceTitle}>▣  Store Preferences</Text>
            <View style={styles.chipRow}>{storeOptions.map((option) => <Chip key={option} label={option} onPress={() => toggle(option, stores, setStores)} selected={stores.includes(option)} />)}</View>
          </View>
          <Pressable accessibilityLabel="Change household size" onPress={() => setHouseholdSize((current) => current === 20 ? 1 : current + 1)} style={styles.householdRow}>
            <Text style={styles.preferenceTitle}>⌂  Household Size</Text><Text style={styles.householdValue}>{householdSize}</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" style={styles.feedbackCard}>
          <ListsControl height={37} width={40} />
          <Text style={styles.feedbackText}>Feedback Survey</Text>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </ScrollView>
      <AppBottomNav active="home" navigation={navigation} />
    </SafeAreaView>
  );
}

function Chip({ label, onPress, selected }: { label: string; onPress: () => void; selected: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}><Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl },
  profile: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.xl },
  avatar: { alignItems: 'center', backgroundColor: '#E4EDB5', borderColor: '#000000', borderRadius: 42, borderWidth: 1, height: 82, justifyContent: 'center', width: 82 },
  profileCopy: { flex: 1, marginLeft: spacing.md },
  name: { ...typography.title, fontSize: 21 },
  profileTags: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  profileTag: { ...typography.caption, backgroundColor: colors.primaryMuted, borderRadius: radius.pill, color: colors.primary, overflow: 'hidden', paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  impactCard: { backgroundColor: '#FFFFFF', borderColor: '#D3D3D3', borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg, padding: spacing.lg, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 2 },
  impactTitle: { ...typography.sectionTitle, color: colors.text },
  impactMetrics: { alignItems: 'center', flexDirection: 'row', marginTop: spacing.md },
  metric: { flex: 1 },
  metricValue: { color: colors.primaryLight, fontSize: 20, fontWeight: '700' },
  metricLabel: { ...typography.caption, color: colors.textMuted },
  metricDivider: { backgroundColor: colors.border, height: 40, marginHorizontal: spacing.md, width: 1 },
  settingsCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.lg, paddingBottom: spacing.sm },
  settingsRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48, paddingHorizontal: spacing.md },
  rowBorder: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  settingsIcon: { alignItems: 'center', width: 28 },
  settingsText: { ...typography.body, flex: 1, marginLeft: spacing.xs },
  chevron: { color: colors.textMuted, fontSize: 24 },
  preferenceSection: { paddingHorizontal: 44, paddingVertical: spacing.sm },
  preferenceTitle: { ...typography.body, marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: { borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, minHeight: 28, paddingHorizontal: spacing.sm, paddingVertical: spacing.xxs },
  chipSelected: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  chipText: typography.caption,
  chipTextSelected: { color: colors.primary },
  householdRow: { alignItems: 'center', flexDirection: 'row', paddingHorizontal: 44, paddingVertical: spacing.sm },
  householdValue: { ...typography.caption, backgroundColor: colors.primaryMuted, borderRadius: radius.pill, color: colors.primary, marginLeft: spacing.sm, minWidth: 24, overflow: 'hidden', paddingHorizontal: spacing.xs, textAlign: 'center' },
  feedbackCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 66, paddingHorizontal: spacing.md, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 2 },
  feedbackText: { ...typography.bodyStrong, flex: 1, marginLeft: spacing.sm },
});
