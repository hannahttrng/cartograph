import type { SvgProps } from 'react-native-svg';

import CarterIcon from '../../../assets/svg icons/carter_home.svg';
import FavoriteIcon from '../../../assets/svg icons/favorite.svg';
import InfoIcon from '../../../assets/svg icons/Info.svg';
import EmailIcon from '../../../assets/svg icons/mark_email_unread.svg';
import MoonIcon from '../../../assets/svg icons/Moon.svg';
import NotificationsIcon from '../../../assets/svg icons/notifications.svg';
import PersonIcon from '../../../assets/svg icons/person.svg';
import PlusIcon from '../../../assets/svg icons/Plus.svg';
import SearchIcon from '../../../assets/svg icons/Search.svg';
import SendIcon from '../../../assets/svg icons/send.svg';
import ShoppingBagIcon from '../../../assets/svg icons/Shopping bag.svg';
import StarIcon from '../../../assets/svg icons/Star.svg';
import UserIcon from '../../../assets/svg icons/User.svg';

const icons = {
  carter: CarterIcon,
  email: EmailIcon,
  favorite: FavoriteIcon,
  info: InfoIcon,
  moon: MoonIcon,
  notifications: NotificationsIcon,
  person: PersonIcon,
  plus: PlusIcon,
  search: SearchIcon,
  send: SendIcon,
  shoppingBag: ShoppingBagIcon,
  star: StarIcon,
  user: UserIcon,
} as const;

export type DesignIconName = keyof typeof icons;

interface DesignIconProps extends SvgProps {
  name: DesignIconName;
  size?: number;
}

export function DesignIcon({ name, size = 24, ...props }: DesignIconProps) {
  const Icon = icons[name];
  return <Icon height={size} width={size} {...props} />;
}