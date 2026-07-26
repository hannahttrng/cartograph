import { apiClient } from '../../../frontend/src/api/client';
import {
  getRouteCalculation,
  getRouteCandidates,
  startRouteCalculation,
} from '../../../frontend/src/api/routes';
import {
  parseRouteCalculation,
  parseRouteCandidates,
} from '../../../frontend/src/api/routeParsers';

const calculation = {
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
} as const;

const candidateResponse = {
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
      ],
      products: [
        {
          id: 100,
          name: 'Whole Milk',
          store: 10,
          unit: 'gallon',
          modifiers: ['on sale', 'organic'],
          selectionPrice: 8.5,
        },
      ],
      selections: [
        {
          tag: 'milk',
          modifiers: [],
          unit: 'gallon',
          quantity: 2,
          product: 100,
        },
      ],
      distance: 2.5,
      time: 6,
      score: 14.75,
      productPrice: 8.5,
      matchedItemCount: 1,
      scoreComponents: {
        productPrice: 8.5,
        distanceCost: 1.75,
        timeCost: 2,
        storeCost: 2.5,
        modifierPenalty: 0,
      },
      errorCode: null,
    },
  ],
} as const;

afterEach(() => {
  jest.restoreAllMocks();
});

test('calls the global calculation and candidate endpoints', async () => {
  const get = jest
    .spyOn(apiClient, 'get')
    .mockResolvedValueOnce({ data: calculation })
    .mockResolvedValueOnce({ data: candidateResponse });
  const post = jest.spyOn(apiClient, 'post').mockResolvedValue({ data: calculation });

  await expect(getRouteCalculation()).resolves.toEqual(calculation);
  await expect(startRouteCalculation()).resolves.toEqual(calculation);
  await expect(getRouteCandidates()).resolves.toEqual(candidateResponse);

  expect(get).toHaveBeenNthCalledWith(1, '/api/v1/route-calculation');
  expect(post).toHaveBeenCalledWith('/api/v1/route-calculation');
  expect(get).toHaveBeenNthCalledWith(2, '/api/v1/route-candidates');
});

test('parses valid calculation states', () => {
  expect(parseRouteCalculation({
    generation: 0,
    status: 'IDLE',
    activeListCount: 0,
    itemCount: 0,
    resultCount: 0,
    optimizerStatus: null,
    startedAt: null,
    completedAt: null,
    elapsedSeconds: null,
    timeoutSeconds: null,
    errorCode: null,
    detail: null,
  }).status).toBe('IDLE');
  expect(parseRouteCalculation(calculation)).toEqual(calculation);
  expect(parseRouteCalculation({
    ...calculation,
    status: 'FAILED',
    resultCount: 0,
    optimizerStatus: null,
    errorCode: 'UNIT_CONVERSION_FAILED',
    detail: 'Cannot convert apples',
  }).status).toBe('FAILED');
});

test.each([
  [{ ...calculation, status: 'RUNNING' }, 'calculation metadata'],
  [{ ...calculation, status: 'FAILED' }, 'calculation error data'],
  [{ ...calculation, errorCode: 'MATRIX_UNAVAILABLE' }, 'calculation error data'],
])('rejects inconsistent calculation responses', (payload, message) => {
  expect(() => parseRouteCalculation(payload)).toThrow(message);
});

test('parses enriched candidates with score snapshots', () => {
  expect(parseRouteCandidates(candidateResponse)).toEqual(candidateResponse);
});

test.each([
  [
    {
      ...candidateResponse,
      candidates: [candidateResponse.candidates[0], candidateResponse.candidates[0]],
    },
    'duplicate Route candidate IDs',
  ],
  [
    {
      ...candidateResponse,
      candidates: [{ ...candidateResponse.candidates[0], matchedItemCount: 2 }],
    },
    'matchedItemCount',
  ],
  [
    {
      ...candidateResponse,
      candidates: [{ ...candidateResponse.candidates[0], productPrice: 9 }],
    },
    'score components',
  ],
  [
    {
      ...candidateResponse,
      candidates: [{
        ...candidateResponse.candidates[0],
        products: [{
          ...candidateResponse.candidates[0].products[0],
          modifiers: ['organic', 'on sale'],
        }],
      }],
    },
    'unordered route modifiers',
  ],
  [
    {
      ...candidateResponse,
      candidates: [{
        ...candidateResponse.candidates[0],
        stores: [{ ...candidateResponse.candidates[0].stores[0], longitude: null }],
      }],
    },
    'Store coordinates',
  ],
])('rejects inconsistent candidate responses', (payload, message) => {
  expect(() => parseRouteCandidates(payload)).toThrow(message);
});