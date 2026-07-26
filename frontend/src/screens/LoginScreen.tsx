import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmailLoginButton from '../../assets/Group 96.svg';
import UsernameLoginButton from '../../assets/Group 97.svg';
import LoginBackground from '../../assets/svg icons/Rectangle 132.svg';
import CarterPin from '../../assets/svg icons/cartograph-18/Group 68.svg';
import MapPin from '../../assets/svg icons/cartograph-18/Group 70.svg';
import BushLeft from '../../assets/svg icons/cartograph-18/Group 71.svg';
import TreeLeft from '../../assets/svg icons/cartograph-18/Group 72.svg';
import BushRight from '../../assets/svg icons/cartograph-18/Group 73.svg';
import TreeRight from '../../assets/svg icons/cartograph-18/Group 74.svg';
import RouteLine from '../../assets/svg icons/cartograph-18/Vector.svg';
import Cloud from '../../assets/svg icons/cartograph-18/Vector-1.svg';
import Sparkle from '../../assets/svg icons/cartograph-18/Vector-2.svg';
import type { RootStackParamList } from '../navigation/types';
import { AuthService } from '../services/auth';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const login = async () => {
    try {
      await AuthService.login({ email: 'carter@cartograph.demo', password: 'demo' });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {
      Alert.alert('Login unavailable', 'Your demo session could not be saved. Please try again.');
    }
  };

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <LoginBackground height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} width="100%" />
      <View pointerEvents="none" style={styles.scene}>
        <Cloud height={35} style={styles.cloudLeft} width={66} />
        <Cloud height={35} style={styles.cloudRight} width={66} />
        <Sparkle height={22} style={styles.sparkleTopLeft} width={22} />
        <Sparkle height={22} style={styles.sparkleTopRight} width={22} />
        <Sparkle height={22} style={styles.sparkleCenter} width={22} />
        <Sparkle height={22} style={styles.sparkleBottomLeft} width={22} />
        <Sparkle height={22} style={styles.sparkleBottomRight} width={22} />
        <RouteLine height={40} style={styles.routeLine} width="72%" />
        <MapPin height={20} style={styles.mapPinLeft} width={14} />
        <MapPin height={20} style={styles.mapPinRight} width={14} />
        <TreeLeft height={74} style={styles.treeLeft} width={63} />
        <TreeRight height={69} style={styles.treeRight} width={51} />
        <BushLeft height={36} style={styles.bushLeft} width={65} />
        <BushRight height={36} style={styles.bushRight} width={65} />
        <CarterPin height={109} style={styles.carterPin} width={92} />
      </View>

      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Image accessibilityLabel="Cartograph" resizeMode="contain" source={require('../../assets/svg icons/cartograph-18/cartograph.png')} style={styles.brandLogo} />
          <Text style={styles.tagline}>chart your cart.</Text>
        </View>

        <Pressable accessibilityLabel="Login with Email" accessibilityRole="button" onPress={() => void login()} style={({ pressed }) => [styles.loginControl, pressed && styles.pressed]}>
          <EmailLoginButton height="100%" width="100%" />
        </Pressable>
        <Pressable accessibilityLabel="Login with Username" accessibilityRole="button" onPress={() => void login()} style={({ pressed }) => [styles.loginControl, styles.usernameControl, pressed && styles.pressed]}>
          <UsernameLoginButton height="100%" width="100%" />
        </Pressable>
        <View style={styles.orRow}><View style={styles.divider} /><Text style={styles.or}>or</Text><View style={styles.divider} /></View>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Register')}>
          <Text style={styles.createAccount}>create an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0D3A17', flex: 1, overflow: 'hidden' },
  scene: { height: 350, left: 0, position: 'absolute', right: 0, top: 105 },
  cloudLeft: { left: '22%', position: 'absolute', top: 58 },
  cloudRight: { position: 'absolute', right: '15%', top: 96, transform: [{ scale: 1.1 }] },
  sparkleTopLeft: { left: '17%', position: 'absolute', top: 28 },
  sparkleTopRight: { position: 'absolute', right: '21%', top: 31 },
  sparkleCenter: { left: '48%', position: 'absolute', top: 66 },
  sparkleBottomLeft: { left: '28%', position: 'absolute', top: 142 },
  sparkleBottomRight: { position: 'absolute', right: '11%', top: 158 },
  routeLine: { left: '14%', position: 'absolute', top: 205 },
  mapPinLeft: { left: '25%', position: 'absolute', top: 201 },
  mapPinRight: { position: 'absolute', right: '27%', top: 190 },
  treeLeft: { left: 18, position: 'absolute', top: 202, zIndex: 2 },
  treeRight: { position: 'absolute', right: 18, top: 201, zIndex: 2 },
  bushLeft: { left: 52, position: 'absolute', top: 230, zIndex: 3 },
  bushRight: { position: 'absolute', right: 48, top: 229, zIndex: 3 },
  carterPin: { alignSelf: 'center', marginTop: 100, zIndex: 4 },
  content: { paddingHorizontal: 24, paddingTop: 350 },
  brandBlock: { alignItems: 'center' },
  brandLogo: { height: 35, width: 185 },
  tagline: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 13, marginTop: 4 },
  loginControl: { height: 43, marginTop: 45, width: '100%' },
  usernameControl: { marginTop: 13 },
  orRow: { alignItems: 'center', flexDirection: 'row', gap: 26, marginTop: 28 },
  divider: { backgroundColor: '#FFFFFF', flex: 1, height: 1 },
  or: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14 },
  createAccount: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14, marginTop: 25, textAlign: 'center' },
  pressed: { opacity: 0.68 },
});