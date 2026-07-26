import type { StyleProp, ViewStyle } from 'react-native';
import { Pressable, StyleSheet } from 'react-native';

import BackIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';

interface BackButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export function BackButton({ onPress, style }: BackButtonProps) {
  return (
    <Pressable accessibilityLabel="Go back" accessibilityRole="button" hitSlop={12} onPress={onPress} style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}>
      <BackIcon height={25} width={25} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', height: 40, justifyContent: 'center', transform: [{ rotate: '-90deg' }], width: 40 },
  pressed: { opacity: 0.6 },
});