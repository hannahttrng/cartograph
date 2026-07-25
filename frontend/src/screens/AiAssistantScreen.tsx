import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function AiAssistantScreen() {
  const [recipeSource, setRecipeSource] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const importRecipe = () => {
    const source = recipeSource.trim();

    if (!source) {
      setMessage('Paste a recipe link or ingredients to begin.');
      return;
    }

    setMessage('Recipe import is ready to connect to the AI service.');
  };

  return (
    <SafeAreaView edges={['bottom']} style={styles.screen}>
      <View style={styles.content}>
        <Text accessibilityRole="header" style={styles.title}>
          Recipe Import
        </Text>
        <Text style={styles.description}>
          Add a recipe link or ingredients, then turn it into a shopping list.
        </Text>

        <TextInput
          accessibilityLabel="Recipe link or ingredients"
          multiline
          onChangeText={(value) => {
            setRecipeSource(value);
            setMessage(null);
          }}
          placeholder="Paste a recipe link or ingredients"
          style={styles.input}
          textAlignVertical="top"
          value={recipeSource}
        />

        <Pressable
          accessibilityRole="button"
          onPress={importRecipe}
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        >
          <Text style={styles.buttonText}>Import Recipe</Text>
        </Pressable>

        {message ? (
          <Text accessibilityLiveRegion="polite" style={styles.message}>
            {message}
          </Text>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  content: {
    flex: 1,
    padding: 24,
  },
  title: {
    color: '#1F2933',
    fontSize: 24,
    fontWeight: '600',
  },
  description: {
    color: '#52606D',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  input: {
    borderColor: '#9AA5B1',
    borderRadius: 8,
    borderWidth: 1,
    color: '#1F2933',
    fontSize: 16,
    marginTop: 24,
    minHeight: 144,
    padding: 12,
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#243B53',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  message: {
    color: '#52606D',
    fontSize: 14,
    marginTop: 16,
  },
});