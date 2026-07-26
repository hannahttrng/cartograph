import { useRef, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import CarterAvatar from '../../assets/svg icons/screens-pt3/Group 87.svg';
import { askCarter, importRecipe, toApiError } from '../api';
import { AppBottomNav, BackButton, DesignIcon } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import { colors, fontFamily, spacing } from '../theme';
import type { AssistantChatMessage, AssistantRecipeImportResponse } from '../types/api';

type Props = NativeStackScreenProps<RootStackParamList, 'AiAssistant'>;

const greeting: AssistantChatMessage = {
  role: 'assistant',
  content: 'Hello, Carter here. How can I assist you?',
};

type CarterMode = 'chat' | 'idea' | 'url';

const modeOptions: ReadonlyArray<{ label: string; mode: CarterMode }> = [
  { label: 'Chat', mode: 'chat' },
  { label: 'Meal idea', mode: 'idea' },
  { label: 'Recipe URL', mode: 'url' },
];

const normalizeRecipeUrl = (source: string): string => {
  const normalized = source.trim();
  if (normalized.startsWith('//')) {
    return `https:${normalized}`;
  }
  if (!/^[a-z][a-z\d+.-]*:\/\//i.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
};

const getCarterErrorMessage = (error: unknown): string => {
  const apiError = toApiError(error);
  return apiError.status === 503
    ? 'Carter needs backend configuration. Restart FastAPI after loading your .env file.'
    : apiError.message;
};

export function AiAssistantScreen({ navigation }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const recipeRequestIdRef = useRef(0);
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<AssistantChatMessage[]>([greeting]);
  const [mode, setMode] = useState<CarterMode>('chat');
  const [recipeResult, setRecipeResult] = useState<AssistantRecipeImportResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const sendMessage = async () => {
    const content = draft.trim();
    if (!content || isSubmitting) {
      return;
    }

    const history = messages.slice(-12);
    const userMessage: AssistantChatMessage = { role: 'user', content };
    setMessages((current) => [...current, userMessage]);
    setDraft('');
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await askCarter({ message: content, messages: history });
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: response.message },
      ]);
    } catch (error: unknown) {
      setErrorMessage(getCarterErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildRecipeList = async () => {
    const source = mode === 'url' ? normalizeRecipeUrl(draft) : draft.trim();
    if (!source || isSubmitting || mode === 'chat') {
      return;
    }

    const requestId = ++recipeRequestIdRef.current;
    setIsSubmitting(true);
    setErrorMessage(null);
    setRecipeResult(null);

    try {
      const result = await importRecipe({
        source,
        sourceType: mode === 'url' ? 'url' : 'text',
      });
      if (recipeRequestIdRef.current === requestId) {
        setDraft(source);
        setRecipeResult(result);
      }
    } catch (error: unknown) {
      if (recipeRequestIdRef.current === requestId) {
        setErrorMessage(getCarterErrorMessage(error));
      }
    } finally {
      if (recipeRequestIdRef.current === requestId) {
        setIsSubmitting(false);
      }
    }
  };

  const selectMode = (nextMode: CarterMode) => {
    recipeRequestIdRef.current += 1;
    setMode(nextMode);
    setDraft('');
    setRecipeResult(null);
    setErrorMessage(null);
    setIsSubmitting(false);
  };

  const createShoppingList = () => {
    if (!recipeResult) {
      return;
    }

    const initialTags = [...new Set([
      ...recipeResult.tags,
      ...recipeResult.ingredients.flatMap((ingredient) => ingredient.tags),
    ])];
    navigation.navigate('NewShoppingList', {
      initialItems: recipeResult.ingredients.map((ingredient) => ingredient.name),
      initialTags,
      title: recipeResult.title ?? (mode === 'url' ? 'Imported Recipe' : 'Carter Meal Idea'),
    });
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <BackButton onPress={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home')} style={styles.backButton} />
          <View style={styles.headerCopy}>
            <Text accessibilityRole="header" style={styles.title}>Carter AI</Text>
            <Text style={styles.subtitle}>Your Grocery Assistant</Text>
          </View>
          <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}>
            <DesignIcon name="person" size={24} />
          </Pressable>
        </View>

        <View accessibilityRole="tablist" style={styles.modeTabs}>
          {modeOptions.map((option) => {
            const isActive = mode === option.mode;
            return (
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                key={option.mode}
                onPress={() => selectMode(option.mode)}
                style={[styles.modeTab, isActive && styles.modeTabActive]}
              >
                <Text style={[styles.modeTabLabel, isActive && styles.modeTabLabelActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'chat' ? (
          <ScrollView
            contentContainerStyle={styles.messages}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message, index) => (
              <View key={`${message.role}-${index}`} style={message.role === 'user' ? styles.userRow : styles.carterRow}>
                {message.role === 'assistant' ? (
                  <View style={styles.carterAvatar}><CarterAvatar height={58} width={63} /></View>
                ) : null}
                <View style={message.role === 'user' ? styles.userBubble : styles.carterBubble}>
                  <Text style={styles.messageText}>{message.content}</Text>
                </View>
              </View>
            ))}
            {isSubmitting ? (
              <View style={styles.carterRow}>
                <View style={styles.carterAvatar}><CarterAvatar height={58} width={63} /></View>
                <View style={styles.loadingBubble}><ActivityIndicator color={colors.primary} /></View>
              </View>
            ) : null}
            {errorMessage ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage}</Text> : null}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.recipeContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.recipeIntro}>
              <View style={styles.recipeMascot}><CarterAvatar height={66} width={72} /></View>
              <View style={styles.recipeIntroCopy}>
                <Text style={styles.recipeTitle}>{mode === 'url' ? 'Import a recipe' : 'Turn an idea into a list'}</Text>
                <Text style={styles.recipeDescription}>
                  {mode === 'url'
                    ? 'Paste a public recipe link. I’ll pull out the ingredients for you.'
                    : 'Describe a dish, occasion, or craving. I’ll suggest the ingredients.'}
                </Text>
              </View>
            </View>

            <View style={styles.recipeInputCard}>
              <Text style={styles.inputLabel}>{mode === 'url' ? 'Recipe link' : 'What are you making?'}</Text>
              <TextInput
                accessibilityLabel={mode === 'url' ? 'Recipe URL' : 'Meal idea'}
                autoCapitalize={mode === 'url' ? 'none' : 'sentences'}
                autoCorrect={mode !== 'url'}
                editable={!isSubmitting}
                keyboardType={mode === 'url' ? 'url' : 'default'}
                key={`recipe-input-${mode}`}
                multiline={mode === 'idea'}
                onChangeText={(value) => {
                  setDraft(value);
                  setRecipeResult(null);
                  setErrorMessage(null);
                }}
                placeholder={mode === 'url' ? 'https://example.com/recipe' : 'Kimchi jjigae for four people'}
                placeholderTextColor={colors.textMuted}
                style={[styles.recipeInput, mode === 'idea' && styles.recipeIdeaInput]}
                value={draft}
              />
              <Pressable
                accessibilityRole="button"
                disabled={!draft.trim() || isSubmitting}
                onPress={() => void buildRecipeList()}
                style={({ pressed }) => [styles.recipeAction, (!draft.trim() || isSubmitting) && styles.actionDisabled, pressed && styles.actionPressed]}
              >
                {isSubmitting ? <ActivityIndicator color={colors.textInverse} /> : <DesignIcon name="shoppingBag" size={20} />}
                <Text style={styles.recipeActionLabel}>{isSubmitting ? 'Building list...' : 'Find ingredients'}</Text>
              </Pressable>
            </View>

            {errorMessage ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{errorMessage}</Text> : null}

            {recipeResult ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultEyebrow}>CARTER’S LIST</Text>
                <Text style={styles.resultTitle}>{recipeResult.title ?? 'Recipe ingredients'}</Text>
                {recipeResult.ingredients.map((ingredient) => (
                  <View key={`${ingredient.name}-${ingredient.quantity ?? ''}`} style={styles.ingredientRow}>
                    <View style={styles.ingredientDot} />
                    <Text style={styles.ingredientName}>{ingredient.name}</Text>
                    {ingredient.quantity ? (
                      <Text style={styles.ingredientQuantity}>{ingredient.quantity}{ingredient.unit ? ` ${ingredient.unit}` : ''}</Text>
                    ) : null}
                  </View>
                ))}
                {recipeResult.warnings.map((warning) => (
                  <Text accessibilityLiveRegion="polite" key={warning} style={styles.warningText}>
                    {warning}
                  </Text>
                ))}
                <Pressable accessibilityRole="button" onPress={createShoppingList} style={({ pressed }) => [styles.createListButton, pressed && styles.actionPressed]}>
                  <DesignIcon name="plus" size={18} />
                  <Text style={styles.createListLabel}>Create shopping list</Text>
                </Pressable>
              </View>
            ) : null}
          </ScrollView>
        )}

        {mode === 'chat' ? (
          <View style={styles.composerWrap}>
            <View style={styles.composer}>
              <DesignIcon name="carter" size={22} />
              <TextInput
                accessibilityLabel="Message Carter"
                editable={!isSubmitting}
                onChangeText={(value) => {
                  setDraft(value);
                  setErrorMessage(null);
                }}
                onSubmitEditing={() => void sendMessage()}
                placeholder="Ask Carter anything..."
                placeholderTextColor="#8A8789"
                returnKeyType="send"
                style={styles.input}
                value={draft}
              />
              <Pressable accessibilityLabel="Send message" accessibilityRole="button" disabled={!draft.trim() || isSubmitting} hitSlop={8} onPress={() => void sendMessage()} style={styles.sendButton}>
                <DesignIcon name="send" size={24} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
          <AppBottomNav active="carter" navigation={navigation} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#FFFEFE', flex: 1 },
  keyboardView: { flex: 1 },
  header: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 82, paddingHorizontal: spacing.lg },
  backButton: { marginLeft: -4 },
  headerCopy: { flex: 1, marginLeft: spacing.sm },
  title: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 27 },
  subtitle: { color: colors.textMuted, fontFamily: fontFamily.bold, fontSize: 13, lineHeight: 18 },
  profileButton: { alignItems: 'center', backgroundColor: '#E8F5BC', borderColor: colors.surface, borderRadius: 22, borderWidth: 2, height: 40, justifyContent: 'center', width: 44 },
  modeTabs: { backgroundColor: colors.backgroundMuted, borderRadius: 9, flexDirection: 'row', marginHorizontal: spacing.lg, marginTop: 12, padding: 4 },
  modeTab: { alignItems: 'center', borderRadius: 7, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 6 },
  modeTabActive: { backgroundColor: colors.primary, shadowColor: '#000000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 2 },
  modeTabLabel: { color: colors.textMuted, fontFamily: fontFamily.bold, fontSize: 12 },
  modeTabLabelActive: { color: colors.textInverse },
  messages: { flexGrow: 1, paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: 28 },
  carterRow: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: 22 },
  userRow: { alignItems: 'flex-end', marginBottom: 22 },
  carterAvatar: { alignItems: 'center', height: 62, justifyContent: 'center', marginRight: 10, width: 62 },
  carterBubble: { backgroundColor: '#F5F5F5', borderRadius: 12, maxWidth: '78%', minHeight: 64, paddingHorizontal: 16, paddingVertical: 12 },
  userBubble: { backgroundColor: '#BDD5C4', borderRadius: 12, maxWidth: '78%', paddingHorizontal: 16, paddingVertical: 12 },
  loadingBubble: { alignItems: 'center', backgroundColor: '#F5F5F5', borderRadius: 12, height: 50, justifyContent: 'center', width: 58 },
  messageText: { color: '#161616', fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 25 },
  error: { color: colors.danger, fontFamily: fontFamily.regular, fontSize: 13, marginBottom: spacing.sm, textAlign: 'center' },
  composerWrap: { paddingHorizontal: spacing.lg, paddingVertical: 12 },
  composer: { alignItems: 'center', backgroundColor: '#FFFAFB', borderRadius: 28, flexDirection: 'row', minHeight: 52, paddingHorizontal: 14, shadowColor: '#000000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 3 },
  input: { color: '#161616', flex: 1, fontFamily: fontFamily.regular, fontSize: 15, marginHorizontal: 10, minHeight: 44, paddingVertical: 8 },
  sendButton: { alignItems: 'center', height: 40, justifyContent: 'center', width: 36 },
  recipeContent: { flexGrow: 1, padding: spacing.lg, paddingBottom: 28 },
  recipeIntro: { alignItems: 'center', flexDirection: 'row', marginBottom: spacing.lg },
  recipeMascot: { alignItems: 'center', backgroundColor: colors.primaryMuted, borderRadius: 38, height: 76, justifyContent: 'center', width: 76 },
  recipeIntroCopy: { flex: 1, marginLeft: spacing.md },
  recipeTitle: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24 },
  recipeDescription: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, marginTop: 3 },
  recipeInputCard: { backgroundColor: colors.surfaceSubtle, borderColor: colors.border, borderRadius: 8, borderWidth: 1, padding: spacing.md },
  inputLabel: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 13, marginBottom: spacing.sm },
  recipeInput: { backgroundColor: colors.surface, borderColor: colors.borderStrong, borderRadius: 8, borderWidth: 1, color: colors.text, fontFamily: fontFamily.regular, fontSize: 14, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10 },
  recipeIdeaInput: { minHeight: 88, textAlignVertical: 'top' },
  recipeAction: { alignItems: 'center', backgroundColor: colors.primary, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', marginTop: spacing.md, minHeight: 46, paddingHorizontal: spacing.md },
  recipeActionLabel: { color: colors.textInverse, fontFamily: fontFamily.bold, fontSize: 14, marginLeft: spacing.sm },
  actionDisabled: { opacity: 0.45 },
  actionPressed: { opacity: 0.72 },
  resultCard: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 8, borderWidth: 1, marginTop: spacing.lg, padding: spacing.lg },
  resultEyebrow: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 10 },
  resultTitle: { color: colors.text, fontFamily: fontFamily.bold, fontSize: 18, lineHeight: 24, marginBottom: spacing.md, marginTop: 3 },
  ingredientRow: { alignItems: 'center', borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 40 },
  ingredientDot: { backgroundColor: colors.primary, borderRadius: 3, height: 6, marginRight: 10, width: 6 },
  ingredientName: { color: colors.text, flex: 1, fontFamily: fontFamily.regular, fontSize: 14 },
  ingredientQuantity: { color: colors.textMuted, fontFamily: fontFamily.regular, fontSize: 12, marginLeft: spacing.sm },
  warningText: { color: colors.warning, fontFamily: fontFamily.regular, fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  createListButton: { alignItems: 'center', borderColor: colors.primary, borderRadius: 8, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg, minHeight: 44 },
  createListLabel: { color: colors.primary, fontFamily: fontFamily.bold, fontSize: 14, marginLeft: spacing.sm },
});