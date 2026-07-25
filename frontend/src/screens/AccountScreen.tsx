import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const preferenceSections = [
  'Dietary preferences',
  'Preferred stores',
  'Route priorities',
];

export function AccountScreen() {
  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Account
        </Text>
        <Text style={styles.description}>
          Personalize recommendations for your grocery trips.
        </Text>

        <View style={styles.preferenceList}>
          {preferenceSections.map((preference) => (
            <Pressable
              accessibilityRole="button"
              key={preference}
              style={({ pressed }) => [styles.preference, pressed && styles.preferencePressed]}
            >
              <Text style={styles.preferenceText}>{preference}</Text>
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
    fontSize: 24,
    fontWeight: '600',
  },
  description: {
    color: '#52606D',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  preferenceList: {
    gap: 10,
    marginTop: 24,
  },
  preference: {
    borderBottomColor: '#D9E2EC',
    borderBottomWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    minHeight: 56,
  },
  preferencePressed: {
    backgroundColor: '#F0F4F8',
  },
  preferenceText: {
    color: '#243B53',
    fontSize: 16,
    fontWeight: '500',
  },
});