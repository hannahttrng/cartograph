import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import CostcoLogo from '../../../assets/svg icons/image 5.svg';
import TraderJoesLogo from '../../../assets/svg icons/image 3.svg';
import { DisclosureArrow } from '../common/DisclosureArrow';
import { SavingsBadge } from '../common/SavingsBadge';
import { colors, fontFamily, radius, spacing } from '../../theme';
import type { DemoStore } from '../../types/demo';

const logoSources = {
  albertsons: require('../../../assets/images/store-logos/albertsons.png'),
  'food-4-less': require('../../../assets/images/store-logos/food-4-less.png'),
  gerrards: require('../../../assets/images/store-logos/gerrards.png'),
  sprouts: require('../../../assets/images/store-logos/sprouts.png'),
  'stater-bros': require('../../../assets/images/store-logos/stater-bros.png'),
  target: require('../../../assets/images/store-logos/target.png'),
  walmart: require('../../../assets/images/store-logos/walmart.png'),
} as const;

interface StoreCardProps {
  expanded?: boolean;
  onPress?: () => void;
  store: DemoStore;
}

export function StoreLogo({ store, size = 48 }: { store: DemoStore; size?: number }) {
  if (store.logoName === 'trader-joes') return <TraderJoesLogo height={size} width={size} />;
  if (store.logoName === 'costco') return <CostcoLogo height={size * 0.7} width={size} />;
  const source = logoSources[store.logoName as keyof typeof logoSources];
  return source ? <Image resizeMode="contain" source={source} style={{ height: size, width: size }} /> : <View style={[styles.fallbackLogo, { height: size, width: size }]}><Text style={styles.fallbackText}>{store.name.slice(0, 2)}</Text></View>;
}

export function StoreCard({ expanded = false, onPress, store }: StoreCardProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} disabled={!onPress} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.logoSlot}><StoreLogo store={store} /></View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.name}>{store.name}</Text>
        <Text numberOfLines={1} style={styles.detail}>{store.distance.toFixed(1)} mi away · {store.deals[0]?.itemCount ?? 0} deal items</Text>
      </View>
      <SavingsBadge amount={`$${store.estimatedSavings.toFixed(0)}`} />
      {onPress ? <DisclosureArrow direction={expanded ? 'up' : 'down'} style={styles.arrow} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, flexDirection: 'row', minHeight: 82, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  pressed: { opacity: 0.72 },
  logoSlot: { alignItems: 'center', height: 52, justifyContent: 'center', width: 52 },
  copy: { flex: 1, marginHorizontal: spacing.sm, minWidth: 0 },
  name: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 14 },
  detail: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 10, marginTop: 2 },
  arrow: { marginLeft: spacing.xs },
  fallbackLogo: { alignItems: 'center', backgroundColor: colors.primaryMuted, borderRadius: 24, justifyContent: 'center' },
  fallbackText: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 12 },
});