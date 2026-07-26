import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import EmailLoginButton from '../../assets/Group 96.svg';
import UsernameLoginButton from '../../assets/Group 97.svg';
import LoginBackground from '../../assets/svg icons/Rectangle 132.svg';
import CarterPin from '../../assets/svg icons/Group 68.svg';
import Cloud from '../../assets/svg icons/Group 71.svg';
import TreeLeft from '../../assets/svg icons/Group 72.svg';
import TreeRight from '../../assets/svg icons/Group 74.svg';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const login = () => navigation.reset({ index: 0, routes: [{ name: 'Home' }] });

  return (
    <SafeAreaView edges={[]} style={styles.screen}>
      <LoginBackground height="100%" preserveAspectRatio="none" style={StyleSheet.absoluteFill} width="100%" />
      <View pointerEvents="none" style={styles.scene}>
        <Cloud height={36} style={styles.cloudLeft} width={65} />
        <Cloud height={36} style={styles.cloudRight} width={65} />
        <TreeLeft height={74} style={styles.treeLeft} width={63} />
        <TreeRight height={69} style={styles.treeRight} width={51} />
        <CarterPin height={91} style={styles.carterPin} width={77} />
        <View style={styles.routeLine} />
      </View>

      <View style={styles.content}>
        <View style={styles.brandBlock}>
          <Text accessibilityRole="header" style={styles.brand}><Text style={styles.brandAccent}>cart</Text>ograph</Text>
          <Text style={styles.tagline}>chart your cart.</Text>
        </View>

        <Pressable accessibilityLabel="Login with Email" accessibilityRole="button" onPress={login} style={({ pressed }) => [styles.loginControl, pressed && styles.pressed]}>
          <EmailLoginButton height="100%" width="100%" />
        </Pressable>
        <Pressable accessibilityLabel="Login with Username" accessibilityRole="button" onPress={login} style={({ pressed }) => [styles.loginControl, styles.usernameControl, pressed && styles.pressed]}>
          <UsernameLoginButton height="100%" width="100%" />
        </Pressable>
        <View style={styles.orRow}><View style={styles.divider} /><Text style={styles.or}>or</Text><View style={styles.divider} /></View>
        <Pressable accessibilityRole="button" onPress={() => Alert.alert('Account creation', 'Account creation will be available soon.')}>
          <Text style={styles.createAccount}>create an account</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#0D3A17', flex: 1, overflow: 'hidden' },
  scene: { height: 390, left: 0, position: 'absolute', right: 0, top: 82 },
  cloudLeft: { left: '19%', position: 'absolute', top: 88 },
  cloudRight: { position: 'absolute', right: '14%', top: 123 },
  treeLeft: { bottom: 20, left: 20, position: 'absolute' },
  treeRight: { bottom: 20, position: 'absolute', right: 18 },
  carterPin: { alignSelf: 'center', marginTop: 142 },
  routeLine: { alignSelf: 'center', borderColor: '#83DB8C', borderRadius: 40, borderStyle: 'dashed', borderWidth: 2, height: 26, marginTop: -10, transform: [{ rotate: '-3deg' }], width: '58%' },
  content: { paddingHorizontal: 24, paddingTop: 330 },
  brandBlock: { alignItems: 'center' },
  brand: { color: '#FFFFFF', fontFamily: 'Monda_700Bold', fontSize: 37 },
  brandAccent: { color: '#84F190' },
  tagline: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 13, marginTop: -5 },
  loginControl: { height: 43, marginTop: 45, width: '100%' },
  usernameControl: { marginTop: 13 },
  orRow: { alignItems: 'center', flexDirection: 'row', gap: 26, marginTop: 28 },
  divider: { backgroundColor: '#FFFFFF', flex: 1, height: 1 },
  or: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14 },
  createAccount: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14, marginTop: 25, textAlign: 'center' },
  pressed: { opacity: 0.68 },
});