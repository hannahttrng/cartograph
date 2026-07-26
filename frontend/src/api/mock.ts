import type {
  CatalogTag,
  EntityId,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecipeImportRequest,
  AssistantRecipeImportResponse,
  GetMapResponse,
  RouteCalculationResponse,
  RouteCandidateResult,
  RouteCandidatesResponse,
  ShoppingListActiveUpdateRequest,
  ShoppingListCreateRequest,
  ShoppingListItem,
  ShoppingListItemInput,
  ShoppingListNameUpdateRequest,
  ShoppingListReplaceRequest,
  ShoppingListResponse,
} from '../types/api';
import type { Route } from '../types/models';
import type { MapRouteData } from '../types/maps';
import { DEMO_ROUTE_ORIGIN } from '../constants/config';
import { ApiError } from './client';

const lists = new Map<EntityId, ShoppingListResponse>();
let nextListId = 1;
let routeGeneration = 0;
let routeCalculation: RouteCalculationResponse = {
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
};

const catalogTags: readonly CatalogTag[] = [
  { tag: 'bread', defaultUnit: 'loaf', defaultQuantity: 1, products: [] },
  { tag: 'egg', defaultUnit: 'count', defaultQuantity: 12, products: [] },
  { tag: 'ground beef', defaultUnit: 'lbs', defaultQuantity: 1.5, products: [] },
  { tag: 'milk', defaultUnit: 'gallon', defaultQuantity: 1, products: [] },
];

const catalogModifiers: Readonly<Record<string, readonly string[]>> = {
  bread: ["brand: dave's killer bread", 'gluten free', 'on sale', 'organic'],
  egg: ['free range', 'large', 'on sale', 'organic'],
  'ground beef': ['grass fed', 'on sale', 'organic'],
  milk: ['brand: horizon', 'on sale', 'organic'],
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const resolveItems = (
  inputs: readonly ShoppingListItemInput[],
): readonly ShoppingListItem[] => {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const tag = normalizeText(input.tag);
    const catalogTag = catalogTags.find((candidate) => candidate.tag === tag);
    if (!catalogTag) {
      throw new ApiError(`unknown shopping list tags: ${tag}`, { status: 422 });
    }
    if (seen.has(tag)) {
      throw new ApiError('item tags must not contain duplicates', { status: 422 });
    }
    seen.add(tag);
    return {
      tag,
      modifiers: [...(input.modifiers ?? [])].map(normalizeText).sort(),
      unit: input.unit == null ? catalogTag.defaultUnit : normalizeText(input.unit),
      quantity: input.quantity ?? catalogTag.defaultQuantity,
    };
  });
};

const requireList = (id: EntityId): ShoppingListResponse => {
  const list = lists.get(id);
  if (!list) {
    throw new ApiError('Shopping list not found', { status: 404 });
  }
  return list;
};

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

const cloneRoutes = (): Route[] =>
  mockRoutes.map((route) => ({
    ...route,
    stores: route.stores.map((store) => ({ ...store })),
    products: route.products.map((product) => ({
      ...product,
      store: { ...product.store },
    })),
  }));

const mockRouteCandidate: RouteCandidateResult = {
  id: 1,
  stores: [
    {
      id: 1,
      name: 'Cartograph Market',
      address: '100 Main Street',
      latitude: 34.056,
      longitude: -117.195,
    },
    {
      id: 2,
      name: 'Fresh Fields',
      address: '220 Citrus Avenue',
      latitude: 34.0612,
      longitude: -117.1884,
    },
  ],
  products: [
    { id: 10, name: 'Whole Milk', store: 1, unit: 'gallon', modifiers: ['on sale', 'organic'], selectionPrice: 4.25 },
    { id: 20, name: 'Sandwich Bread', store: 2, unit: 'loaf', modifiers: ['in season'], selectionPrice: 3.49 },
  ],
  selections: [
    { tag: 'milk', modifiers: [], unit: 'gallon', quantity: 1, product: 10 },
    { tag: 'bread', modifiers: [], unit: 'loaf', quantity: 1, product: 20 },
  ],
  distance: 3.2,
  time: 12,
  productPrice: 7.74,
  matchedItemCount: 2,
  score: 18.31,
  scoreComponents: {
    productPrice: 7.74,
    distanceCost: 2.24,
    timeCost: 3.33,
    storeCost: 5,
    modifierPenalty: 0,
  },
  errorCode: null,
};

const cloneCalculation = (): RouteCalculationResponse => ({ ...routeCalculation });

const completeMockCalculation = (): RouteCalculationResponse => {
  routeGeneration += 1;
  const activeLists = [...lists.values()].filter((list) => list.active);
  const itemCount = new Set(
    activeLists.flatMap((list) => list.items.map((item) => item.tag)),
  ).size;
  const hasResults = itemCount > 0;
  routeCalculation = {
    generation: routeGeneration,
    status: 'SUCCEEDED',
    activeListCount: activeLists.length,
    itemCount,
    resultCount: hasResults ? 1 : 0,
    optimizerStatus: hasResults ? 'HEURISTIC' : null,
    startedAt: routeGeneration,
    completedAt: routeGeneration,
    elapsedSeconds: 0,
    timeoutSeconds: hasResults ? 10 : null,
    errorCode: null,
    detail: null,
  };
  return cloneCalculation();
};

const mockRecipeFor = (
  request: AssistantRecipeImportRequest,
): AssistantRecipeImportResponse => {
  if (request.sourceType === 'url') {
    throw new ApiError(
      'Recipe links cannot be fetched in mock mode. Set EXPO_PUBLIC_USE_MOCK_DATA=false, restart Metro, and run the Cartograph backend.',
      { code: 'MOCK_RECIPE_URL_UNAVAILABLE' },
    );
  }

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

  listCatalogTags(): readonly CatalogTag[] {
    return catalogTags.map((tag) => ({ ...tag, products: [...tag.products] }));
  },

  listTagModifiers(tag: string): readonly string[] {
    if (!catalogTags.some((candidate) => candidate.tag === tag)) {
      throw new ApiError('Tag not found', { status: 404 });
    }
    return [...(catalogModifiers[tag] ?? [])];
  },

  listShoppingLists(): readonly ShoppingListResponse[] {
    return [...lists.values()].map((list) => ({
      ...list,
      items: list.items.map((item) => ({ ...item, modifiers: [...item.modifiers] })),
    }));
  },

  createShoppingList(request: ShoppingListCreateRequest): ShoppingListResponse {
    const id = nextListId++;
    const list: ShoppingListResponse = {
      id,
      name: request.name?.trim() || `New List ${id}`,
      items: resolveItems(request.items),
      active: request.active ?? true,
    };
    lists.set(id, list);
    if (list.active) completeMockCalculation();
    return { ...list };
  },

  getShoppingList(id: EntityId): ShoppingListResponse {
    const list = requireList(id);
    return { ...list };
  },

  replaceShoppingList(
    id: EntityId,
    request: ShoppingListReplaceRequest,
  ): ShoppingListResponse {
    const current = requireList(id);
    const updated: ShoppingListResponse = {
      ...current,
      name: request.name.trim(),
      items: resolveItems(request.items),
      active: request.active ?? true,
    };
    lists.set(id, updated);
    const itemsChanged = JSON.stringify(current.items) !== JSON.stringify(updated.items);
    if (current.active !== updated.active || (itemsChanged && updated.active)) {
      completeMockCalculation();
    }
    return { ...updated };
  },

  updateShoppingListName(
    id: EntityId,
    request: ShoppingListNameUpdateRequest,
  ): ShoppingListResponse {
    const updated = { ...requireList(id), name: request.name.trim() };
    lists.set(id, updated);
    return { ...updated };
  },

  updateShoppingListActive(
    id: EntityId,
    request: ShoppingListActiveUpdateRequest,
  ): ShoppingListResponse {
    const current = requireList(id);
    const updated = { ...current, active: request.active };
    lists.set(id, updated);
    if (current.active !== updated.active) completeMockCalculation();
    return { ...updated };
  },

  deleteShoppingList(id: EntityId): void {
    const current = lists.get(id);
    if (!current || !lists.delete(id)) {
      throw new ApiError('Shopping list not found', { status: 404 });
    }
    if (current.active) completeMockCalculation();
  },

  getRouteCalculation(): RouteCalculationResponse {
    return cloneCalculation();
  },

  startRouteCalculation(): RouteCalculationResponse {
    return completeMockCalculation();
  },

  getRouteCandidates(): RouteCandidatesResponse {
    return {
      generation: routeCalculation.generation,
      candidates: routeCalculation.resultCount > 0
        ? [{
            ...mockRouteCandidate,
            stores: mockRouteCandidate.stores.map((store) => ({ ...store })),
            products: mockRouteCandidate.products.map((product) => ({ ...product })),
            selections: mockRouteCandidate.selections.map((selection) => ({
              ...selection,
              modifiers: [...selection.modifiers],
            })),
            scoreComponents: { ...mockRouteCandidate.scoreComponents },
          }]
        : [],
    };
  },

  getMap(routeId: string): MapRouteData {
    const route = cloneRoutes()[0];

    return {
      routeId,
      origin: { ...DEMO_ROUTE_ORIGIN },
      stops: route?.stores.map(({ address, name }, index) => ({
        address,
        name,
        sequence: index + 1,
      })) ?? [],
      estimatedDistanceMiles: route?.distance ?? 0,
      estimatedTimeMinutes: route?.time ?? 0,
    };
  },
};
