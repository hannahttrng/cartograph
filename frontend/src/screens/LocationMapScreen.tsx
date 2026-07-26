import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MapPreview } from '../components/map/MapPreview';
import { mockStores } from '../mock/mockStores';
import { mockUser } from '../mock/mockUser';
import type { RootStackParamList } from '../navigation/types';
import { colors, radius, spacing, typography } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LocationMap'>;

export function LocationMapScreen({ navigation }: Props) {
  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <MapPreview fullScreen stores={mockStores} userLocation={mockUser.location} />
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Close full screen map"
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
        >
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
        <View style={styles.titleCard}>
          <Text accessibilityRole="header" style={styles.title}>Nearby stores</Text>
          <Text style={styles.subtitle}>Centered on {mockUser.location.label}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.backgroundMuted, flex: 1 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.sm, left: spacing.md, position: 'absolute', right: spacing.md, top: spacing.md },
  closeButton: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: radius.sm, justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md },
  closeText: { ...typography.bodyStrong, color: colors.primary },
  titleCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: radius.sm, flex: 1, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  title: { ...typography.bodyStrong, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  pressed: { backgroundColor: '#E3E5E3' },
});