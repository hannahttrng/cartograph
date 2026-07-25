import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NearbyDeals'>;

const deals = [
  { item: 'Honeycrisp Apples', store: 'Sprouts', price: '$1.49 / lb', saving: 'Save $0.50' },
  { item: 'Whole Milk', store: 'Stater Bros', price: '$3.79 / gallon', saving: 'Save $0.50' },
  { item: 'Hass Avocados', store: 'Trader Joes', price: '$3.99 / 4-pack', saving: 'Save $1.00' },
];

export function NearbyDealsScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>Deals near Redlands</Text>
        <Text style={styles.subtitle}>Mock savings from the seeded grocery catalog.</Text>
        {deals.map((deal) => (
          <View key={deal.item} style={styles.dealCard}>
            <View style={styles.dealCopy}>
              <Text style={styles.item}>{deal.item}</Text>
              <Text style={styles.store}>{deal.store}</Text>
              <Text style={styles.price}>{deal.price}</Text>
            </View>
            <View>
              <Text style={styles.saving}>{deal.saving}</Text>
              <Pressable
                accessibilityLabel={`Add ${deal.item} to a shopping list`}
                accessibilityRole="button"
                onPress={() => navigation.navigate('NewShoppingList')}
                style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
              >
                <Text style={styles.addButtonText}>Add to list</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { padding: 20 },
  title: { color: '#17231A', fontSize: 25, fontWeight: '700' },
  subtitle: { color: '#667168', fontSize: 15, lineHeight: 21, marginTop: 6 },
  dealCard: {
    alignItems: 'center',
    borderColor: '#DCE3DC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    padding: 16,
  },
  dealCopy: { flex: 1, paddingRight: 12 },
  item: { color: '#1C2820', fontSize: 17, fontWeight: '700' },
  store: { color: '#667168', fontSize: 14, marginTop: 4 },
  price: { color: '#245C36', fontSize: 15, fontWeight: '700', marginTop: 6 },
  saving: { color: '#167438', fontSize: 13, fontWeight: '700', textAlign: 'right' },
  addButton: {
    backgroundColor: '#167438',
    borderRadius: 6,
    marginTop: 10,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  addButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  pressed: { opacity: 0.72 },
});