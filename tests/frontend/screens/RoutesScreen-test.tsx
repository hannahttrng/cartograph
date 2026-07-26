import type { ComponentProps } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import * as routeApi from '../../../frontend/src/api';
import { RoutesScreen } from '../../../frontend/src/screens/RoutesScreen';
import type {
  RouteCalculationResponse,
  RouteCandidatesResponse,
} from '../../../frontend/src/types/api';

jest.mock('@react-navigation/native', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(callback, [callback]);
    },
  };
});

jest.mock('../../../frontend/src/api', () => {
  const actual = jest.requireActual('../../../frontend/src/api');
  return {
    ...actual,
    getRouteCalculation: jest.fn(),
    getRouteCandidates: jest.fn(),
    startRouteCalculation: jest.fn(),
  };
});

jest.mock('../../../frontend/src/components/common/AppBottomNav', () => ({
  AppBottomNav: () => null,
}));

const mockedApi = jest.mocked(routeApi);
const navigation = { navigate: jest.fn() };

const succeeded: RouteCalculationResponse = {
  generation: 3,
  status: 'SUCCEEDED',
  activeListCount: 2,
  itemCount: 2,
  resultCount: 1,
  optimizerStatus: 'HEURISTIC',
  startedAt: 100,
  completedAt: 101,
  elapsedSeconds: 1,
  timeoutSeconds: 10,
  errorCode: null,
  detail: null,
};

const running: RouteCalculationResponse = {
  ...succeeded,
  generation: 4,
  status: 'RUNNING',
  resultCount: 0,
  optimizerStatus: null,
  completedAt: null,
  elapsedSeconds: null,
  timeoutSeconds: null,
};

const candidates: RouteCandidatesResponse = {
  generation: 3,
  candidates: [
    {
      id: 7,
      stores: [
        {
          id: 10,
          name: 'Market',
          address: '1 Main St',
          latitude: 34,
          longitude: -117,
        },
        {
          id: 20,
          name: 'Fresh Fields',
          address: '2 Main St',
          latitude: 34.01,
          longitude: -117.01,
        },
      ],
      products: [
        {
          id: 100,
          name: 'Whole Milk',
          store: 10,
          unit: 'gallon',
          modifiers: ['brand: horizon', 'on sale', 'organic'],
          selectionPrice: 8.5,
        },
        {
          id: 200,
          name: 'Sandwich Bread',
          store: 20,
          unit: 'loaf',
          modifiers: ['in season'],
          selectionPrice: 3.5,
        },
      ],
      selections: [
        {
          tag: 'milk',
          modifiers: ['grass fed', 'organic'],
          unit: 'gallon',
          quantity: 2,
          product: 100,
        },
        {
          tag: 'bread',
          modifiers: [],
          unit: 'loaf',
          quantity: 1,
          product: 200,
        },
      ],
      distance: 2.5,
      time: 6,
      score: 23.25,
      productPrice: 12,
      matchedItemCount: 2,
      scoreComponents: {
        productPrice: 12,
        distanceCost: 1.75,
        timeCost: 2,
        storeCost: 5,
        modifierPenalty: 2.5,
      },
      errorCode: null,
    },
    {
      id: 8,
      stores: [{ id: 30, name: 'Budget Mart', address: '3 Main St', latitude: 34.02, longitude: -117.02 }],
      products: [{ id: 300, name: 'Budget Milk', store: 30, unit: 'gallon', modifiers: [], selectionPrice: 5 }],
      selections: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1, product: 300 }],
      distance: 4,
      time: 12,
      score: 12,
      productPrice: 5,
      matchedItemCount: 1,
      scoreComponents: { productPrice: 5, distanceCost: 1, timeCost: 3, storeCost: 3, modifierPenalty: 0 },
      errorCode: null,
    },
    {
      id: 9,
      stores: [{ id: 40, name: 'Quick Shop', address: '4 Main St', latitude: 34.03, longitude: -117.03 }],
      products: [{ id: 400, name: 'Quick Milk', store: 40, unit: 'gallon', modifiers: [], selectionPrice: 10 }],
      selections: [{ tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1, product: 400 }],
      distance: 1,
      time: 4,
      score: 16,
      productPrice: 10,
      matchedItemCount: 1,
      scoreComponents: { productPrice: 10, distanceCost: 1, timeCost: 2, storeCost: 3, modifierPenalty: 0 },
      errorCode: null,
    },
  ],
};

const renderScreen = () =>
  render(
    <RoutesScreen
      {...({ navigation } as unknown as ComponentProps<typeof RoutesScreen>)}
    />,
  );

beforeEach(() => {
  jest.resetAllMocks();
  mockedApi.getRouteCalculation.mockResolvedValue(succeeded);
  mockedApi.getRouteCandidates.mockResolvedValue(candidates);
  mockedApi.startRouteCalculation.mockResolvedValue(running);
});

test('renders store-chain headings, one-line metrics, map actions, and persisted details', async () => {
  await renderScreen();

  expect(await screen.findByText('Routes')).toBeOnTheScreen();
  const route = await screen.findByLabelText(/Market → Fresh Fields, rank 1 of 3/);
  expect(route.props.accessibilityState).toEqual({ expanded: false });
  expect(screen.getByText('Market → Fresh Fields')).toBeOnTheScreen();
  expect(screen.getByText('2')).toBeOnTheScreen();
  expect(screen.getByText('2.5')).toBeOnTheScreen();
  expect(screen.getByText('6')).toBeOnTheScreen();
  expect(screen.getByText('$12.00')).toBeOnTheScreen();
  expect(screen.queryByLabelText('Open live ArcGIS route demo')).not.toBeOnTheScreen();

  await fireEvent.press(screen.getByLabelText('Open Market → Fresh Fields map'));
  expect(navigation.navigate).toHaveBeenCalledWith('Map', {
    route: candidates.candidates[0],
    routeId: '7',
  });

  await fireEvent.press(route);
  expect(screen.getByText('Store order')).toBeOnTheScreen();
  expect(screen.getByText('Market')).toBeOnTheScreen();
  expect(screen.getByText('Whole Milk')).toBeOnTheScreen();
  expect(screen.getByText('$8.50')).toBeOnTheScreen();
  expect(screen.getByText('Sandwich Bread')).toBeOnTheScreen();
  expect(screen.getByText('On Sale', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByText('In Season', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.getByText('Organic', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(screen.queryByText('Grass Fed', { includeHiddenElements: true })).not.toBeOnTheScreen();
  expect(screen.queryByText('Brand: Horizon', { includeHiddenElements: true })).not.toBeOnTheScreen();
  expect(screen.getByLabelText(
    'Whole Milk, $8.50, modifiers: On Sale, Organic',
  )).toBeOnTheScreen();
  expect(screen.queryByText(/sample routes/i)).not.toBeOnTheScreen();
  expect(screen.queryByText(/fixed data/i)).not.toBeOnTheScreen();
});

test('title-cases unmatched multiword Tags', async () => {
  const route = candidates.candidates[0];
  mockedApi.getRouteCalculation.mockResolvedValueOnce({
    ...succeeded,
    itemCount: 3,
  });
  mockedApi.getRouteCandidates.mockResolvedValueOnce({
    generation: candidates.generation,
    candidates: [{
      ...route,
      selections: [
        ...route.selections,
        {
          tag: 'ground beef',
          modifiers: [],
          unit: 'lbs',
          quantity: 1,
          product: null,
        },
      ],
      errorCode: 'PARTIAL_ITEM_MATCH',
    }],
  });

  await renderScreen();
  await fireEvent.press(await screen.findByLabelText(/Market → Fresh Fields, rank 1 of 1/));

  expect(screen.getByText('Not matched')).toBeOnTheScreen();
  expect(screen.getByText('Ground Beef')).toBeOnTheScreen();
  expect(screen.queryByText('ground beef')).not.toBeOnTheScreen();
});

test('sorts by backend rank, purchase price, and distance', async () => {
  await renderScreen();

  const rankedRoutes = await screen.findAllByLabelText(/rank \d of 3/);
  expect(rankedRoutes[0]?.props.accessibilityLabel).toContain('Market → Fresh Fields, rank 1');

  await fireEvent.press(screen.getByText('Cheaper'));
  expect(screen.getAllByLabelText(/rank \d of 3/)[0]?.props.accessibilityLabel)
    .toContain('Budget Mart, rank 1');

  await fireEvent.press(screen.getByText('Closer'));
  expect(screen.getAllByLabelText(/rank \d of 3/)[0]?.props.accessibilityLabel)
    .toContain('Quick Shop, rank 1');

  await fireEvent.press(screen.getByText('Best Overall'));
  expect(screen.getAllByLabelText(/rank \d of 3/)[0]?.props.accessibilityLabel)
    .toContain('Market → Fresh Fields, rank 1');
});

test('polls a running generation until candidates are ready', async () => {
  mockedApi.getRouteCalculation
    .mockResolvedValueOnce(running)
    .mockResolvedValueOnce({ ...succeeded, generation: 4 });
  mockedApi.getRouteCandidates.mockResolvedValueOnce({ ...candidates, generation: 4 });

  await renderScreen();

  expect(await screen.findByText('Calculating routes for your active lists...')).toBeOnTheScreen();
  expect(await screen.findByLabelText(/Market → Fresh Fields, rank 1 of 3/, {}, { timeout: 2_500 })).toBeOnTheScreen();
  expect(mockedApi.getRouteCalculation).toHaveBeenCalledTimes(2);
});

test('starts a fresh calculation after a failed job', async () => {
  const failed: RouteCalculationResponse = {
    ...succeeded,
    status: 'FAILED',
    resultCount: 0,
    optimizerStatus: null,
    errorCode: 'MATRIX_UNAVAILABLE',
    detail: 'Travel matrix could not be generated',
  };
  mockedApi.getRouteCalculation
    .mockResolvedValueOnce(failed)
    .mockResolvedValueOnce(succeeded);

  await renderScreen();
  expect(await screen.findByText('Calculation failed')).toBeOnTheScreen();

  await fireEvent.press(screen.getByText('Try again'));
  await waitFor(() => expect(mockedApi.startRouteCalculation).toHaveBeenCalledTimes(1));
  expect(await screen.findByLabelText(/Market → Fresh Fields, rank 1 of 3/)).toBeOnTheScreen();
});

test('shows an actionable empty state when no lists are active', async () => {
  mockedApi.getRouteCalculation.mockResolvedValueOnce({
    ...succeeded,
    activeListCount: 0,
    itemCount: 0,
    resultCount: 0,
    optimizerStatus: null,
    timeoutSeconds: null,
  });
  mockedApi.getRouteCandidates.mockResolvedValueOnce({ generation: 3, candidates: [] });

  await renderScreen();

  expect(await screen.findByText('No active lists')).toBeOnTheScreen();
  await fireEvent.press(screen.getByText('Open Lists'));
  expect(navigation.navigate).toHaveBeenCalledWith('SavedLists');
});
