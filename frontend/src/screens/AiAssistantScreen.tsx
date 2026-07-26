import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { askCarter, importRecipe, toApiError } from '../api';
import { DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import type {
  AssistantChatMessage,
  AssistantRecipeImportResponse,
  RecipeSourceType,
} from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'AiAssistant'>;
type CarterMode = 'list' | 'chat';

export function AiAssistantScreen({ navigation }: Props) {
  const [recipeSource, setRecipeSource] = useState('');
  const [sourceType, setSourceType] = useState<RecipeSourceType>('auto');
  const [carterMode, setCarterMode] = useState<CarterMode>('list');
  const [result, setResult] = useState<AssistantRecipeImportResponse | null>(null);
  const [chatMessages, setChatMessages] = useState<AssistantChatMessage[]>([]);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const source = recipeSource.trim();

    if (!source) {
      setErrorMessage(
        carterMode === 'list'
          ? 'Paste a recipe link, recipe text, or meal idea to begin.'
          : 'Ask Carter a question to begin.',
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setResult(null);
    try {
      if (carterMode === 'chat') {
        const history = chatMessages.slice(-12);
        const response = await askCarter({ message: source, messages: history });
        setChatMessages((currentMessages) => [
          ...currentMessages,
          { role: 'user', content: source },
          { role: 'assistant', content: response.message },
        ]);
        setRecipeSource('');
      } else {
        const importedRecipe = await importRecipe({ source, sourceType });
        setResult(importedRecipe);
        setSelectedIngredients(importedRecipe.ingredients.map((ingredient) => ingredient.name));
      }
    } catch (error: unknown) {
      setErrorMessage(toApiError(error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleIngredient = (name: string) => {
    setSelectedIngredients((current) =>
      current.includes(name)
        ? current.filter((ingredient) => ingredient !== name)
        : [...current, name],
    );
  };

  const useInShoppingList = () => {
    if (!result || selectedIngredients.length === 0) {
      return;
    }
    navigation.navigate('NewShoppingList', {
      initialItems: selectedIngredients,
      title: result.title ?? 'Recipe ingredients',
    });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
      <ScrollView
        bounces
        contentContainerStyle={styles.content}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled
        showsVerticalScrollIndicator
        style={styles.scrollView}
      >
        <Text accessibilityRole="header" style={styles.title}>
          Ask Carter
        </Text>
        <Text style={styles.description}>
          {carterMode === 'list'
            ? 'Paste a recipe, recipe URL, or meal idea. Carter will create an editable shopping list.'
            : 'Ask about grocery planning, recipes, or how Cartograph works.'}
        </Text>

        <View style={styles.modeRow}>
          {(['list', 'chat'] as CarterMode[]).map((mode) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: carterMode === mode }}
              key={mode}
              onPress={() => {
                setCarterMode(mode);
                setErrorMessage(null);
                setResult(null);
                setChatMessages([]);
              }}
              style={[styles.modeButton, carterMode === mode && styles.modeButtonSelected]}
            >
              <Text style={[styles.modeButtonText, carterMode === mode && styles.modeButtonTextSelected]}>
                {mode === 'list' ? 'Build list' : 'Ask Carter'}
              </Text>
            </Pressable>
          ))}
        </View>

        {carterMode === 'list' ? (
        <View style={styles.modeRow}>
          {(['auto', 'text', 'url'] as RecipeSourceType[]).map((mode) => (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: sourceType === mode }}
              key={mode}
              onPress={() => setSourceType(mode)}
              style={[styles.modeButton, sourceType === mode && styles.modeButtonSelected]}
            >
              <Text style={[styles.modeButtonText, sourceType === mode && styles.modeButtonTextSelected]}>
                {mode === 'auto' ? 'Auto' : mode === 'text' ? 'Recipe text' : 'URL'}
              </Text>
            </Pressable>
          ))}
        </View>
        ) : null}

        <TextInput
          accessibilityLabel={carterMode === 'list' ? 'Recipe link or ingredients' : 'Question for Carter'}
          editable={!isSubmitting}
          multiline
          onChangeText={(value) => {
            setRecipeSource(value);
            setErrorMessage(null);
          }}
          placeholder={
            carterMode === 'chat'
              ? 'What can Cartograph help me plan?'
              : sourceType === 'url'
                ? 'https://example.com/recipe'
                : 'Paste a recipe or describe a meal, such as high protein pasta with turkey'
          }
          placeholderTextColor="#77847D"
          style={styles.input}
          textAlignVertical="top"
          value={recipeSource}
        />

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [styles.button, (pressed || isSubmitting) && styles.buttonPressed]}
        >
          {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <View style={styles.buttonContent}><Text style={styles.buttonText}>{carterMode === 'list' ? 'Create shopping list' : 'Ask Carter'}</Text><DesignIcon name={carterMode === 'list' ? 'plus' : 'send'} size={20} /></View>}
        </Pressable>

        {errorMessage ? (
          <Text accessibilityLiveRegion="assertive" style={styles.errorMessage}>
            {errorMessage}
          </Text>
        ) : null}

        {carterMode === 'chat' && chatMessages.length > 0 ? (
          <View style={styles.chatTranscript}>
            {chatMessages.map((message, index) => (
              <View
                key={`${message.role}-${index}`}
                style={message.role === 'user' ? styles.userMessage : styles.chatReply}
              >
                <Text style={styles.chatMessageLabel}>
                  {message.role === 'user' ? 'You' : 'Carter'}
                </Text>
                <Text style={styles.chatReplyText}>{message.content}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {result ? (
          <View style={styles.resultSection}>
            <Text accessibilityRole="header" style={styles.resultTitle}>
              {result.title ?? 'Suggested ingredients'}
            </Text>
            <Text style={styles.resultDescription}>
              Review the ingredients before adding them to a list.
            </Text>
            {result.ingredients.map((ingredient) => {
              const isSelected = selectedIngredients.includes(ingredient.name);
              const detail = [ingredient.quantity, ingredient.unit, ingredient.note]
                .filter((value): value is string => Boolean(value))
                .join(' ');

              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: isSelected }}
                  key={ingredient.name}
                  onPress={() => toggleIngredient(ingredient.name)}
                  style={[styles.ingredientRow, isSelected && styles.ingredientRowSelected]}
                >
                  <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
                    {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </View>
                  <View style={styles.ingredientCopy}>
                    <Text style={styles.ingredientName}>{ingredient.name}</Text>
                    {detail ? <Text style={styles.ingredientDetail}>{detail}</Text> : null}
                    <Text style={styles.ingredientTags}>{ingredient.tags.join(' · ')}</Text>
                  </View>
                </Pressable>
              );
            })}
            {result.warnings.map((warning) => (
              <Text key={warning} style={styles.warning}>{warning}</Text>
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={selectedIngredients.length === 0}
              onPress={useInShoppingList}
              style={({ pressed }) => [
                styles.button,
                styles.useListButton,
                (pressed || selectedIngredients.length === 0) && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>Use in shopping list</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    paddingBottom: 72,
  },
  title: {
    color: '#1F2933',
    fontSize: 24,
    fontWeight: '600',
  },
  description: {
    color: '#526E5A',
    fontSize: 16,
    lineHeight: 23,
    marginTop: 8,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 20,
  },
  modeButton: {
    borderColor: '#B7C8B7',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeButtonSelected: {
    backgroundColor: '#DFF0DD',
    borderColor: '#167438',
  },
  modeButtonText: { color: '#526E5A', fontSize: 13, fontWeight: '600' },
  modeButtonTextSelected: { color: '#167438' },
  input: {
    borderColor: '#B7C8B7',
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
    backgroundColor: '#167438',
    borderRadius: 8,
    justifyContent: 'center',
    marginTop: 16,
    minHeight: 48,
    paddingHorizontal: 16,
  },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  buttonPressed: {
    opacity: 0.65,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorMessage: {
    color: '#B42318',
    fontSize: 14,
    marginTop: 16,
  },
  resultSection: {
    borderTopColor: '#DCE5DC',
    borderTopWidth: 1,
    marginTop: 28,
    paddingTop: 20,
  },
  chatTranscript: {
    gap: 12,
    marginTop: 24,
  },
  chatReply: {
    backgroundColor: '#F2F9F0',
    borderColor: '#DCE5DC',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 24,
    padding: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#E7EDF6',
    borderRadius: 8,
    maxWidth: '88%',
    padding: 16,
  },
  chatMessageLabel: { color: '#526E5A', fontSize: 13, fontWeight: '700' },
  chatReplyText: { color: '#1F2933', fontSize: 15, lineHeight: 22, marginTop: 8 },
  resultTitle: { color: '#1B2A1E', fontSize: 20, fontWeight: '700' },
  resultDescription: { color: '#526E5A', fontSize: 14, marginTop: 5 },
  ingredientRow: {
    alignItems: 'center',
    borderColor: '#DCE5DC',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    marginTop: 12,
    padding: 12,
  },
  ingredientRowSelected: { backgroundColor: '#F2F9F0', borderColor: '#77A67F' },
  checkbox: {
    alignItems: 'center',
    borderColor: '#7F8D81',
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginRight: 12,
    width: 22,
  },
  checkboxSelected: { backgroundColor: '#167438', borderColor: '#167438' },
  checkmark: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  ingredientCopy: { flex: 1 },
  ingredientName: { color: '#1B2A1E', fontSize: 16, fontWeight: '700' },
  ingredientDetail: { color: '#526E5A', fontSize: 13, marginTop: 2 },
  ingredientTags: { color: '#167438', fontSize: 12, marginTop: 4 },
  warning: { color: '#9A5A00', fontSize: 13, lineHeight: 19, marginTop: 10 },
  useListButton: { marginTop: 20 },
});