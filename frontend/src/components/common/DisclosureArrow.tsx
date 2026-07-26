import type { StyleProp, ViewStyle } from 'react-native';

import ArrowIcon from '../../../assets/svg icons/keyboard_arrow_up.svg';

interface DisclosureArrowProps {
  direction?: 'down' | 'right' | 'up';
  size?: number;
  style?: StyleProp<ViewStyle>;
}

const rotations = { down: '180deg', right: '90deg', up: '0deg' } as const;

export function DisclosureArrow({ direction = 'right', size = 20, style }: DisclosureArrowProps) {
  return <ArrowIcon height={size} style={[{ transform: [{ rotate: rotations[direction] }] }, style]} width={size} />;
}