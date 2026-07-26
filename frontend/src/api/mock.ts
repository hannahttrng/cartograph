import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecipeImportRequest,
  AssistantRecipeImportResponse,
  CreateListRequest,
  GetMapResponse,
  GetRoutesRequest,
  GetRoutesResponse,
  ListResponse,
  UpdateListRequest,
} from '../types/api';
import type { Route } from '../types/models';
import type { MapRouteData } from '../types/maps';
import { ApiError } from './client';

const lists = new Map<string, ListResponse>();
let nextListId = 1;

const mockRoutes: Route[] = [
  {
    stores: [
      {
        name: 'Cartograph Market',
        address: '100 Main Street',
        latitude: 34.056,
        longitude: -117.195,
      },
      {
        name: 'Fresh Fields',
        address: '220 Citrus Avenue',
        latitude: 34.0612,
        longitude: -117.1884,
      },
      {
        name: 'Value Pantry',
        address: '475 University Parkway',
        latitude: 34.0489,
        longitude: -117.1817,
      },
    ],
    products: [],
    distance: 3.2,
    time: 12,
    score: 92,
  },
];

const cloneRoutes = (): GetRoutesResponse =>
  mockRoutes.map((route) => ({
    ...route,
    stores: route.stores.map((store) => ({ ...store })),
    products: route.products.map((product) => ({
      ...product,
      store: { ...product.store },
    })),
  }));

const mockRecipeFor = (
  request: AssistantRecipeImportRequest,
): AssistantRecipeImportResponse => {
  const source = request.source.toLowerCase();

  if (source.includes('taco')) {
    return {
      title: 'Taco night',
      ingredients: [
        { name: 'Ground beef', quantity: '1', unit: 'lb', note: null, tags: ['ground beef'] },
        { name: 'Tortillas', quantity: '12', unit: null, note: null, tags: ['tortillas'] },
        { name: 'Lettuce', quantity: '1', unit: 'head', note: null, tags: ['lettuce'] },
        { name: 'Tomatoes', quantity: '2', unit: null, note: null, tags: ['tomatoes'] },
        { name: 'Shredded cheese', quantity: '8', unit: 'oz', note: null, tags: ['cheese'] },
      ],
      tags: ['ground beef', 'tortillas', 'lettuce', 'tomatoes', 'cheese'],
      warnings: ['Ingredients and quantities are suggested for a meal idea.'],
    };
  }

  return {
    title: 'Suggested meal ingredients',
    ingredients: [
      { name: 'Pasta', quantity: '1', unit: 'lb', note: null, tags: ['pasta'] },
      { name: 'Tomato sauce', quantity: '24', unit: 'oz', note: null, tags: ['tomato sauce'] },
      { name: 'Spinach', quantity: '5', unit: 'oz', note: null, tags: ['spinach'] },
      { name: 'Parmesan cheese', quantity: '4', unit: 'oz', note: null, tags: ['parmesan cheese'] },
    ],
    tags: ['pasta', 'tomato sauce', 'spinach', 'parmesan cheese'],
    warnings: ['Mock mode uses a sample ingredient list. Connect Carter for source-specific results.'],
  };
};

const mockChatResponse = (request: AssistantChatRequest): AssistantChatResponse => {
  const question = request.message.toLowerCase();
  if (question.includes('cheapest') || question.includes('save money')) {
    return {
      message: 'I can help compare route costs after you build a shopping list. Add the items you need, then open route recommendations to compare the available totals.',
    };
  }

  return {
    message: 'I can help with meal planning, grocery ideas, and using Cartograph. For a ready-to-edit ingredient list, switch to Build list and describe the meal you want to make.',
  };
};

export const mockApi = {
  importRecipe(request: AssistantRecipeImportRequest): AssistantRecipeImportResponse {
    return mockRecipeFor(request);
  },

  askCarter(request: AssistantChatRequest): AssistantChatResponse {
    return mockChatResponse(request);
  },

  createList(request: CreateListRequest): ListResponse {
    const id = `mock-list-${nextListId++}`;
    const list: ListResponse = { ...request, id };
    lists.set(id, list);
    return { ...list };
  },

  getList(id: string): ListResponse {
    const list = lists.get(id);
    if (!list) {
      throw new ApiError(`Shopping list "${id}" was not found.`, {
        status: 404,
        code: 'MOCK_NOT_FOUND',
      });
    }

    return { ...list };
  },

  updateList(id: string, request: UpdateListRequest): ListResponse {
    const current = this.getList(id);
    const updated: ListResponse = { ...current, ...request, id };
    lists.set(id, updated);
    return { ...updated };
  },

  getRoutes(_request: GetRoutesRequest): GetRoutesResponse {
    return cloneRoutes();
  },

  getMap(routeId: string): MapRouteData {
    const route = cloneRoutes()[0];

    return {
      routeId,
      stores: route?.stores ?? [],
      distance: route?.distance ?? 0,
      time: route?.time ?? 0,
      polyline: {
        points: route?.stores.map(({ latitude, longitude }) => ({ latitude, longitude })) ?? [],
      },
    };
  },
};
