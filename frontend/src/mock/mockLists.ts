import type { DemoShoppingList } from '../types/demo';

// TODO(ERIC): Replace with backend endpoint response from shopping lists.
export const mockLists: DemoShoppingList[] = [
  {
    id: 'demo-weekly',
    title: 'Weekly Groceries',
    iconName: 'grocery',
    items: [
      { id: 'apples', name: 'Apples', quantity: 2, unit: 'lb' },
      { id: 'milk', name: 'Milk', quantity: 1, unit: 'gallon' },
      { id: 'eggs', name: 'Eggs', quantity: 2, unit: 'cartons' },
    ],
    updatedAt: '2026-07-24T18:00:00.000Z',
  },
  {
    id: 'demo-meal-prep',
    title: 'Meal Prep',
    iconName: 'mealPrep',
    items: [
      { id: 'rice', name: 'Rice', quantity: 1, unit: 'package' },
      { id: 'chicken', name: 'Chicken breast', quantity: 3, unit: 'lb' },
    ],
    updatedAt: '2026-07-22T18:00:00.000Z',
  },
  {
    id: 'demo-bbq',
    title: 'Weekend BBQ',
    iconName: 'bbq',
    items: [{ id: 'beef', name: 'Ground beef', quantity: 2, unit: 'lb' }],
    updatedAt: '2026-07-20T18:00:00.000Z',
  },
];