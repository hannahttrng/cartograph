import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppBottomNav, BackButton, DesignIcon } from '../components/common';
import { StoreAccordion } from '../components/store';
import { mockStores } from '../mock/mockStores';
import type { RootStackParamList } from '../navigation/types';
import { colors, fontFamily, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyDeals'>;

export function NearbyDealsScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} />
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
          {mockStores.map((store) => <StoreAccordion key={store.id} onSelect={() => navigation.navigate('NewShoppingList')} store={store} />)}
        </View>
      </ScrollView>
      <AppBottomNav active="stores" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.surface, flex: 1 },
  header: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 82, paddingHorizontal: spacing.lg },
  headerCopy: { flex: 1, marginLeft: spacing.sm, minWidth: 0 },
  title: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 27 },
  subtitle: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18, marginTop: 2 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: colors.surface, borderRadius: 22, borderWidth: 2, height: 40, justifyContent: 'center', width: 44 },
  content: { paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  list: { gap: spacing.sm },
});
