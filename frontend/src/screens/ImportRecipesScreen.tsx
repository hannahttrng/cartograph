import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import RecipeMascot from '../../assets/svg icons/Group 14.svg';
import { AppBottomNav, BackButton, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';

export function ImportRecipesScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'ImportRecipes'>) {
  const [ingredients, setIngredients] = useState('Chicken\nEggs\nOnions');

  const createList = () => {
    const initialItems = ingredients.split('\n').map((item) => item.trim()).filter(Boolean);
    navigation.navigate('NewShoppingList', { initialItems, title: 'Imported Recipe' });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <BackButton onPress={() => navigation.goBack()} style={styles.backButton} />
          <View style={styles.headingCopy}>
            <Text accessibilityRole="header" style={styles.title}>Import Recipes</Text>
            <Text style={styles.subtitle}>Paste your recipe ingredients and we’ll help you chart your cart.</Text>
          </View>
          <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}>
            <DesignIcon name="person" size={23} />
          </Pressable>
        </View>

        <TextInput
          accessibilityLabel="Recipe ingredients"
          multiline
          onChangeText={setIngredients}
          placeholder="Paste ingredients here..."
          placeholderTextColor="#8A8789"
          style={styles.ingredientInput}
          textAlignVertical="top"
          value={ingredients}
        />

        <Pressable accessibilityRole="button" disabled={!ingredients.trim()} onPress={createList} style={({ pressed }) => [styles.createButton, (!ingredients.trim() || pressed) && styles.pressed]}>
          <Text style={styles.createLabel}>Create List & Compare Prices</Text>
        </Pressable>

        <View style={styles.tipCard}>
          <RecipeMascot height={72} width={72} />
          <Text style={styles.tipText}><Text style={styles.tipStrong}>Tip:</Text> One ingredient per line for best results.</Text>
        </View>
      </ScrollView>
      <AppBottomNav active="home" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#FFFFFF', flex: 1 },
  content: { flexGrow: 1, paddingBottom: 28, paddingHorizontal: 24 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 24 },
  backButton: { marginLeft: -18, marginTop: 42 },
  headingCopy: { flex: 1, minWidth: 0, paddingTop: 42 },
  title: { color: '#090909', fontFamily: 'Monda_700Bold', fontSize: 20 },
  subtitle: { color: '#626268', fontFamily: 'Monda_700Bold', fontSize: 13, lineHeight: 22, marginTop: 4 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: '#000000', borderRadius: 22, borderWidth: 1, height: 40, justifyContent: 'center', width: 44 },
  ingredientInput: { backgroundColor: '#FFFCFD', borderColor: '#E2DEE0', borderRadius: 18, borderWidth: 1, color: '#8A8789', flex: 1, fontFamily: 'Monda_400Regular', fontSize: 15, lineHeight: 24, marginTop: 18, minHeight: 360, padding: 14, shadowColor: '#000000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 2 },
  createButton: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#31965C', borderRadius: 9, justifyContent: 'center', marginTop: 17, minHeight: 43, paddingHorizontal: 24 },
  createLabel: { color: '#FFFFFF', fontFamily: 'Monda_700Bold', fontSize: 14 },
  tipCard: { alignItems: 'center', backgroundColor: '#DDF3DF', borderRadius: 9, flexDirection: 'row', marginTop: 28, minHeight: 100, paddingHorizontal: 18 },
  tipText: { color: '#252525', flex: 1, fontFamily: 'Monda_400Regular', fontSize: 14, lineHeight: 23, marginLeft: 10 },
  tipStrong: { fontFamily: 'Monda_700Bold' },
  pressed: { opacity: 0.5 },
});
