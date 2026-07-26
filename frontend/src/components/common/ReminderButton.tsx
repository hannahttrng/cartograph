import { Pressable, StyleSheet, Text } from 'react-native';

import ReminderIcon from '../../../assets/svg icons/notifications.svg';
import { colors, fontFamily, radius, spacing } from '../../theme';

interface ReminderButtonProps {
  active?: boolean;
  label?: string;
  onPress: () => void;
}

export function ReminderButton({ active = false, label = 'Remind me', onPress }: ReminderButtonProps) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.button, active && styles.active]}>
      <ReminderIcon height={18} width={20} />
      <Text style={[styles.label, active && styles.activeLabel]}>{active ? 'Reminder set' : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', borderColor: colors.border, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md },
  active: { backgroundColor: colors.primaryMuted, borderColor: colors.primary },
  label: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 11 },
  activeLabel: { color: colors.primary },
});