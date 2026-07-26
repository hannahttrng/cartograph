import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
import { loadAccountPreferences, saveAccountPreferences } from '../utils/accountPreferencesStorage';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isEntering, setIsEntering] = useState(false);
  const canEnter = Boolean(name.trim() && email.trim() && !isEntering);

  const login = async () => {
    if (!canEnter) {
      Alert.alert('Enter the demo', 'Add your name and email to continue.');
      return;
    }
    setIsEntering(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await AuthService.register({ email, name, password: 'demo' });
      const savedPreferences = await loadAccountPreferences();
      await saveAccountPreferences({
        dealAlerts: savedPreferences?.dealAlerts ?? true,
        dietary: savedPreferences?.dietary ?? [],
        displayName: name.trim(),
        householdSize: savedPreferences?.householdSize ?? 1,
        listReminders: savedPreferences?.listReminders ?? false,
        location: savedPreferences?.location ?? 'Redlands, CA',
        pronouns: savedPreferences?.pronouns ?? '',
        routeUpdates: savedPreferences?.routeUpdates ?? true,
        stores: savedPreferences?.stores ?? [],
      });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {
      Alert.alert('Login unavailable', 'Your session could not be saved. Please try again.');
    } finally {
      setIsEntering(false);
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

        <View style={styles.form}>
          <Text style={styles.formPrompt}>Sign in to save lists and shopping preferences.</Text>
          <TextInput
            accessibilityLabel="Name"
            autoCapitalize="words"
            editable={!isEntering}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor="#77847D"
            style={styles.input}
            value={name}
          />
          <TextInput
            accessibilityLabel="Email"
            autoCapitalize="none"
            editable={!isEntering}
            keyboardType="email-address"
            onChangeText={setEmail}
            onSubmitEditing={() => void login()}
            placeholder="you@example.com"
            placeholderTextColor="#77847D"
            returnKeyType="go"
            style={styles.input}
            value={email}
          />
        </View>
        <Pressable accessibilityLabel="Sign in" accessibilityRole="button" accessibilityState={{ busy: isEntering, disabled: !canEnter }} disabled={!canEnter} onPress={() => void login()} style={({ pressed }) => [styles.loginControl, (!canEnter || pressed) && styles.loginControlDisabled]}>
          {isEntering ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.loginControlText}>Sign In</Text>}
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
  content: { paddingHorizontal: 24, paddingTop: 326 },
  brandBlock: { alignItems: 'center' },
  brandLogo: { height: 35, width: 185 },
  tagline: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 13, marginTop: 4 },
  form: { gap: 8, marginTop: 24 },
  formPrompt: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 12, textAlign: 'center' },
  input: { backgroundColor: '#FFFFFF', borderColor: '#D9DED8', borderRadius: 8, borderWidth: 1, color: '#1D2820', fontFamily: 'Monda_400Regular', fontSize: 14, minHeight: 44, paddingHorizontal: 14 },
  loginControl: { alignItems: 'center', backgroundColor: '#147C36', borderRadius: 8, height: 43, justifyContent: 'center', marginTop: 13, width: '100%' },
  loginControlText: { color: '#FFFFFF', fontFamily: 'Monda_700Bold', fontSize: 14 },
  loginControlDisabled: { opacity: 0.48 },
  orRow: { alignItems: 'center', flexDirection: 'row', gap: 26, marginTop: 28 },
  divider: { backgroundColor: '#FFFFFF', flex: 1, height: 1 },
  or: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14 },
  createAccount: { color: '#FFFFFF', fontFamily: 'Monda_400Regular', fontSize: 14, marginTop: 25, textAlign: 'center' },
  pressed: { opacity: 0.68 },
});