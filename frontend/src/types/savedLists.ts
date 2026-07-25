export interface SavedShoppingListItem {
  name: string;
  unitPrice: number;
}

export interface SavedShoppingList {
  id: string;
  name: string;
  items: string[];
  pricedItems?: SavedShoppingListItem[];
  collectionId: string;
  updatedAt: string;
}

export interface ShoppingListCollection {
  id: string;
  name: string;
}