import { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

import BuildListMascot from '../../assets/svg icons/Group 15.svg';
import DairyIcon from '../../assets/svg icons/dairy 1.svg';
import MeatIcon from '../../assets/svg icons/meat 1.svg';
import ProduceIcon from '../../assets/svg icons/produce 1.svg';
import { AppBottomNav, BackButton, DesignIcon, FilterTabs } from '../components/common';
import type { RootStackParamList } from '../navigation/types';
import type {
  SavedShoppingList,
  SavedShoppingListItem,
  ShoppingListCollection,
} from '../types/savedLists';
import {
  loadSavedListLibrary,
  saveSavedListLibrary,
  type SavedListLibrary,
} from '../utils/savedListsStorage';
import { styles } from './NewShoppingListScreen.styles';

type Props = NativeStackScreenProps<RootStackParamList, 'NewShoppingList'>;
type Category = 'all' | 'dairy' | 'produce' | 'meat' | 'pantry' | 'bakery';

const categories = [
  { label: 'All items', value: 'all' },
  { icon: <DairyIcon height={18} width={15} />, label: 'Dairy', value: 'dairy' },
  { icon: <ProduceIcon height={14} width={13} />, label: 'Produce', value: 'produce' },
  { icon: <MeatIcon height={18} width={18} />, label: 'Meat', value: 'meat' },
  { label: 'Pantry', value: 'pantry' },
  { label: 'Bakery', value: 'bakery' },
] as const;

const normalizeValue = (value: string): string => value.trim().replace(/\s+/g, ' ');
const itemDefaults: Record<string, { quantity: number; unit: string }> = {
  bacon: { quantity: 3, unit: 'lb' },
  eggs: { quantity: 1, unit: 'dozen' },
  ranch: { quantity: 1, unit: 'bottle' },
  'soy milk': { quantity: 1, unit: 'gal' },
};
const units = ['each', 'lb', 'oz', 'gal', 'dozen', 'bottle'];

export function NewShoppingListScreen({ navigation, route }: Props) {
  const initialItems = route.params?.initialItems ?? [];
  const listName = route.params?.title ?? 'Untitled list';
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [items, setItems] = useState<SavedShoppingListItem[]>(() =>
    (initialItems.length > 0 ? initialItems : ['Soy Milk', 'Eggs', 'Bacon', 'Ranch']).map((name) => ({ checked: false, name, quantity: itemDefaults[name.toLocaleLowerCase()]?.quantity ?? 1, unit: itemDefaults[name.toLocaleLowerCase()]?.unit ?? 'each', unitPrice: 0 })),
  );
  const [collections, setCollections] = useState<ShoppingListCollection[]>([]);
  const [savedLists, setSavedLists] = useState<SavedShoppingList[]>([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const normalizedListName = useMemo(() => normalizeValue(listName), [listName]);
  const normalizedItemName = useMemo(() => normalizeValue(itemName), [itemName]);
  const canAddItem = Boolean(normalizedItemName);
  const canSave =
    Boolean(normalizedListName) && items.length > 0 && !isSaving;

  useEffect(() => {
    const loadLibrary = async () => {
      try {
        const library = await loadSavedListLibrary();
        setCollections(library.collections);
        setSavedLists(library.lists);
        setSelectedCollectionId(library.collections[0]?.id ?? null);
      } catch {
        setError('Saved lists could not be loaded.');
      }
    };

    void loadLibrary();
  }, []);

  const persistLibrary = useCallback(async (library: SavedListLibrary): Promise<boolean> => {
    setIsSaving(true);
    setError(null);

    try {
      await saveSavedListLibrary(library);
      setCollections(library.collections);
      setSavedLists(library.lists);
      return true;
    } catch {
      setError('Saved lists could not be updated.');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const addItem = useCallback(() => {
    if (!canAddItem) {
      setError('Enter an item name.');
      return;
    }

    const alreadyExists = items.some(
      (item) => item.name.toLocaleLowerCase() === normalizedItemName.toLocaleLowerCase(),
    );
    if (alreadyExists) {
      setError(`${normalizedItemName} is already on this list.`);
      return;
    }

    setItems((currentItems) => [
      ...currentItems,
      { checked: false, name: normalizedItemName, quantity: 1, unit: 'each', unitPrice: 0 },
    ]);
    setItemName('');
    setError(null);
  }, [canAddItem, items, normalizedItemName]);

  const updateItem = useCallback((name: string, update: Partial<SavedShoppingListItem>) => {
    setItems((currentItems) => currentItems.map((item) => item.name === name ? { ...item, ...update } : item));
  }, []);

  const cycleUnit = useCallback((item: SavedShoppingListItem) => {
    const currentIndex = units.indexOf(item.unit ?? 'each');
    updateItem(item.name, { unit: units[(currentIndex + 1) % units.length] });
  }, [updateItem]);

  const saveList = useCallback(async () => {
    if (!canSave) {
      setError('Add at least one item before saving.');
      return;
    }

    Keyboard.dismiss();
    const fallbackCollection: ShoppingListCollection = { id: 'collection-saved', name: 'Saved Lists' };
    const collectionId = selectedCollectionId ?? collections[0]?.id ?? fallbackCollection.id;
    const nextCollections = collections.length > 0 ? collections : [fallbackCollection];
    const savedList: SavedShoppingList = {
      id: `list-${Date.now()}`,
      name: normalizedListName,
      items: items.map((item) => item.name),
      pricedItems: items,
      collectionId,
      updatedAt: new Date().toISOString(),
    };
    const wasSaved = await persistLibrary({
      collections: nextCollections,
      lists: [savedList, ...savedLists],
    });
    if (wasSaved) {
      navigation.goBack();
    }
  }, [canSave, collections, items, navigation, normalizedListName, persistLibrary, savedLists, selectedCollectionId]);

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.designHeader}>
          <BackButton onPress={() => navigation.goBack()} />
          <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.designHeading}>Build a List</Text><Text style={styles.designSupporting}>Create your list & save it for future trips.</Text></View>
          <Pressable accessibilityLabel="Open profile" onPress={() => navigation.navigate('Account')} style={styles.profileButton}><DesignIcon name="person" size={23} /></Pressable>
        </View>

        <View style={styles.searchInputRow}>
          <DesignIcon name="search" size={20} />
          <TextInput
            accessibilityLabel="Item name"
            onChangeText={setItemName}
            onSubmitEditing={addItem}
            placeholder="Add an item (e.g., milk, eggs)"
            placeholderTextColor="#8A8789"
            style={styles.designInput}
            value={itemName}
          />
          <Pressable accessibilityLabel="Add item" disabled={!canAddItem} onPress={addItem}><Text style={styles.plus}>＋</Text></Pressable>
        </View>
        <View style={styles.categoryTabs}><FilterTabs<Category> onChange={setCategory} options={categories} value={category} /></View>

        <View style={styles.designListCard}>
          <View style={styles.listHeader}><Text style={styles.listTitle}>My List ({items.length})</Text><Pressable onPress={() => setItems([])}><Text style={styles.clearAll}>Clear All</Text></Pressable></View>
          {items.length > 0 ? (
          <View>
            {items.map((item) => (
              <View key={item.name.toLocaleLowerCase()} style={styles.itemRow}>
                <Pressable accessibilityLabel={`${item.checked ? 'Uncheck' : 'Check'} ${item.name}`} accessibilityRole="checkbox" accessibilityState={{ checked: Boolean(item.checked) }} onPress={() => updateItem(item.name, { checked: !item.checked })} style={[styles.checkbox, item.checked && styles.checkboxChecked]}>{item.checked ? <Text style={styles.checkmark}>✓</Text> : null}</Pressable>
                <Text style={styles.itemName}>{item.name}</Text>
                <View style={styles.quantityControl}>
                  <Pressable accessibilityLabel={`Decrease ${item.name} quantity`} hitSlop={6} onPress={() => updateItem(item.name, { quantity: Math.max(1, (item.quantity ?? 1) - 1) })}><Text style={styles.quantityButton}>−</Text></Pressable>
                  <Text style={styles.quantity}>{item.quantity ?? 1}</Text>
                  <Pressable accessibilityLabel={`Increase ${item.name} quantity`} hitSlop={6} onPress={() => updateItem(item.name, { quantity: (item.quantity ?? 1) + 1 })}><Text style={styles.quantityButton}>+</Text></Pressable>
                </View>
                <Pressable accessibilityLabel={`Change ${item.name} unit`} onPress={() => cycleUnit(item)} style={styles.unitButton}><Text numberOfLines={1} style={styles.itemPrice}>{item.unit ?? 'each'}</Text></Pressable>
                <Pressable
                  accessibilityLabel={`Remove ${item.name}`}
                  accessibilityRole="button"
                  onPress={() =>
                    setItems((currentItems) =>
                      currentItems.filter((currentItem) => currentItem.name !== item.name),
                    )
                  }
                >
                  <Text style={styles.editText}>⌫</Text>
                </Pressable>
              </View>
            ))}
          </View>
          ) : <Text style={styles.emptyList}>Add an item to begin your list.</Text>}
        </View>

        <View style={styles.tipCard}><BuildListMascot height={64} width={64} /><Text style={styles.tipText}><Text style={styles.tipStrong}>Tip: Be specific for better results!</Text>{'\n'}Add brands or sizes (e.g., “2% milk”) to get more accurate prices.</Text></View>

        <View style={styles.metricsCard}>{['Est. Savings\n$15.53', 'Est. Time\n15 min', 'Est. Stores\n3'].map((metric) => <Text key={metric} style={styles.metricText}>{metric}</Text>)}</View>

        {error ? <Text accessibilityLiveRegion="polite" style={styles.feedbackText}>{error}</Text> : null}

        <View style={styles.actionRow}>
          <Pressable accessibilityLabel="Save shopping list for later" accessibilityRole="button" disabled={!canSave} onPress={() => void saveList()} style={({ pressed }) => [styles.button, styles.saveLaterButton, (!canSave || pressed) && styles.buttonDisabled]}>
            <Text style={styles.saveLaterText}>{isSaving ? 'Saving…' : 'Save for Later'}</Text>
          </Pressable>
          <Pressable accessibilityLabel="Find best route" accessibilityRole="button" disabled={items.length === 0} onPress={() => navigation.navigate('RouteResults', { items: items.map((item) => item.name) })} style={({ pressed }) => [styles.button, styles.routeButton, (items.length === 0 || pressed) && styles.buttonDisabled]}>
            <Text style={styles.buttonText}>Find Best Route</Text>
          </Pressable>
        </View>
      </ScrollView>
      <AppBottomNav active="home" navigation={navigation} />
    </SafeAreaView>
  );
}