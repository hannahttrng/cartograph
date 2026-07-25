import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const destinations: Array<{
  description: string;
  screen: 'ShoppingList' | 'AiAssistant' | 'Account';
  title: string;
}> = [
  {
    title: 'Shopping List',
    description: 'Add items and find an efficient route.',
    screen: 'ShoppingList',
  },
  {
    title: 'Recipe Import',
    description: 'Turn a recipe into a grocery list.',
    screen: 'AiAssistant',
  },
  {
    title: 'Account',
    description: 'Manage preferences and personalization.',
    screen: 'Account',
  },
];

export function HomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Cartograph
        </Text>
        <Text style={styles.subtitle}>
          Build a smarter grocery trip.
        </Text>

        <View style={styles.destinationList}>
          {destinations.map((destination) => (
            <Pressable
              accessibilityRole="button"
              key={destination.screen}
              onPress={() => navigation.navigate(destination.screen)}
              style={({ pressed }) => [styles.destination, pressed && styles.destinationPressed]}
            >
              <Text style={styles.destinationTitle}>{destination.title}</Text>
              <Text style={styles.destinationDescription}>{destination.description}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    color: '#1F2933',
    fontSize: 28,
    fontWeight: '600',
  },
  subtitle: {
    color: '#52606D',
    fontSize: 16,
    marginTop: 6,
  },
  destinationList: {
    gap: 12,
    marginTop: 28,
  },
  destination: {
    borderColor: '#D9E2EC',
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 92,
    justifyContent: 'center',
    padding: 16,
  },
  destinationPressed: {
    backgroundColor: '#F0F4F8',
  },
  destinationTitle: {
    color: '#243B53',
    fontSize: 18,
    fontWeight: '600',
  },
  destinationDescription: {
    color: '#52606D',
    fontSize: 15,
    lineHeight: 21,
    marginTop: 4,
  },
});