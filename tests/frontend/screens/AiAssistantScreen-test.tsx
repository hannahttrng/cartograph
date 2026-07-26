import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as assistantApi from '../../../frontend/src/api';
import { AiAssistantScreen } from '../../../frontend/src/screens/AiAssistantScreen';

jest.mock('../../../frontend/src/api', () => {
  const actual = jest.requireActual('../../../frontend/src/api');
  return {
    ...actual,
    askCarter: jest.fn(),
    importRecipe: jest.fn(),
  };
});

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

const mockedApi = jest.mocked(assistantApi);
const navigation = {
  canGoBack: jest.fn(() => true),
  goBack: jest.fn(),
  navigate: jest.fn(),
};

beforeEach(() => {
  jest.resetAllMocks();
  navigation.canGoBack.mockReturnValue(true);
});

test('preserves recipe warnings and sends catalog tags to the list builder', async () => {
  mockedApi.importRecipe.mockResolvedValue({
    title: 'Taco Night',
    ingredients: [
      {
        name: 'Ground Beef',
        note: null,
        quantity: '1',
        tags: ['ground beef', 'beef'],
        unit: 'lb',
      },
      {
        name: 'Tomatoes',
        note: null,
        quantity: '2',
        tags: ['tomato', 'produce'],
        unit: null,
      },
    ],
    tags: ['ground beef', 'tomato', 'produce'],
    warnings: ['Review the suggested quantities.'],
  });

  await render(
    <AiAssistantScreen
      {...({ navigation } as unknown as ComponentProps<typeof AiAssistantScreen>)}
    />,
  );

  await fireEvent.press(screen.getByRole('tab', { name: 'Meal idea' }));
  await fireEvent.changeText(screen.getByLabelText('Meal idea'), 'Tacos for four');
  await fireEvent.press(screen.getByRole('button', { name: 'Find ingredients' }));

  expect(await screen.findByText('Review the suggested quantities.')).toBeOnTheScreen();
  expect(mockedApi.importRecipe).toHaveBeenCalledWith({
    source: 'Tacos for four',
    sourceType: 'text',
  });

  await fireEvent.press(screen.getByRole('button', { name: 'Create shopping list' }));
  await waitFor(() => {
    expect(navigation.navigate).toHaveBeenCalledWith('NewShoppingList', {
      initialItems: ['Ground Beef', 'Tomatoes'],
      initialTags: ['ground beef', 'tomato', 'produce', 'beef'],
      title: 'Taco Night',
    });
  });
});