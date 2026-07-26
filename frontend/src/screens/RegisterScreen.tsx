import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CarterLogo from '../../assets/svg icons/carter_home.svg';
import { BackButton } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { AuthService } from '../services/auth';
import { colors, fontFamily, radius, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const canSubmit = Boolean(name.trim() && email.trim() && password.length >= 4);

  const register = async () => {
    if (!canSubmit) {
      setError('Enter your name, email, and a password of at least four characters.');
      return;
    }
    try {
      await AuthService.register({ email, name, password });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch {
      setError('Your demo account could not be saved. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.content}>
        <BackButton onPress={() => navigation.goBack()} style={styles.back} />
        <View style={styles.brand}><CarterLogo height={72} width={72} /><Text accessibilityRole="header" style={styles.title}>Create your account</Text><Text style={styles.subtitle}>Save lists and keep your shopping preferences together.</Text></View>
        <View style={styles.form}>
          <TextInput accessibilityLabel="Name" autoCapitalize="words" onChangeText={setName} placeholder="Name" placeholderTextColor={colors.textMuted} style={styles.input} value={name} />
          <TextInput accessibilityLabel="Email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" onChangeText={setEmail} placeholder="Email" placeholderTextColor={colors.textMuted} style={styles.input} value={email} />
          <TextInput accessibilityLabel="Password" onChangeText={setPassword} placeholder="Password" placeholderTextColor={colors.textMuted} secureTextEntry style={styles.input} value={password} />
          {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
          <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={() => void register()} style={({ pressed }) => [styles.button, (!canSubmit || pressed) && styles.buttonDisabled]}><Text style={styles.buttonText}>Create Account</Text></Pressable>
        </View>
        <Pressable accessibilityRole="button" onPress={() => navigation.goBack()}><Text style={styles.loginLink}>Already have an account? Log in</Text></Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#F4F8EE', flex: 1 },
  content: { flex: 1, paddingHorizontal: spacing.xl },
  back: { marginLeft: -8 },
  brand: { alignItems: 'center', marginTop: 34 },
  title: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 23, marginTop: spacing.md },
  subtitle: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: spacing.xs, maxWidth: 290, textAlign: 'center' },
  form: { gap: spacing.sm, marginTop: 38 },
  input: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontFamily: fontFamily.regular, fontSize: 14, minHeight: 48, paddingHorizontal: spacing.md },
  error: { color: colors.danger, fontFamily: fontFamily.regular, fontSize: 11 },
  button: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: radius.md, justifyContent: 'center', marginTop: spacing.sm, minHeight: 48 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: colors.textInverse, fontFamily: fontFamily.bold, fontSize: 14 },
  loginLink: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 12, marginTop: spacing.xl, textAlign: 'center' },
});