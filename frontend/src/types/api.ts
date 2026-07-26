import type { Route, Store } from './models';

/**
 * Eric's endpoint documentation does not yet define the fields in list
 * request/response bodies. These interfaces keep those payloads typed as JSON
 * objects without imposing a frontend-owned backend contract. They can be
 * extended when the backend publishes the final list schema.
 */
export interface CreateListRequest {
  readonly [key: string]: unknown;
}

export interface UpdateListRequest {
  readonly [key: string]: unknown;
}

export interface ListResponse {
  readonly [key: string]: unknown;
}

export interface GetRoutesRequest {
  readonly items: string[];
  readonly listId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly limit?: number;
  readonly catalog?: RouteHydrationCatalog;
}

export type GetRoutesResponse = Route[];

export interface RouteHydrationCatalog {
  readonly stores: Readonly<Record<number, Store>>;
  readonly products: Readonly<Record<number, import('./models').Product>>;
}

export interface RouteCandidateWire {
  readonly stores: number[];
  readonly products: number[];
  readonly distance: number;
  readonly time: number;
  readonly score: number;
  readonly productTags: Readonly<Record<number, string[]>>;
  readonly selections: ReadonlyArray<{ readonly tag: string; readonly product: number | null }>;
  readonly productPrice: number;
  readonly matchedTagCount: number;
  readonly scoreComponents: {
    readonly productPrice: number;
    readonly distanceCost: number;
    readonly timeCost: number;
    readonly storeCost: number;
  };
  readonly errorCode?: 'PARTIAL_TAG_MATCH' | null;
}

export interface RouteOptimizationResponseWire {
  readonly candidates: RouteCandidateWire[];
  readonly status: 'OPTIMAL' | 'FEASIBLE_TIMEOUT';
  readonly requestedLimit: number;
  readonly provenPrefixCount: number;
  readonly elapsedSeconds: number;
  readonly timeoutSeconds: number;
}

export interface GetMapResponse {
  readonly routeId: string;
  readonly stores: Store[];
}

export type RecipeSourceType = 'auto' | 'text' | 'url';

export interface AssistantRecipeImportRequest {
  readonly source: string;
  readonly sourceType: RecipeSourceType;
}

export interface AssistantRecipeIngredient {
  readonly name: string;
  readonly quantity: string | null;
  readonly unit: string | null;
  readonly note: string | null;
  readonly tags: string[];
}

export interface AssistantRecipeImportResponse {
  readonly title: string | null;
  readonly ingredients: AssistantRecipeIngredient[];
  readonly tags: string[];
  readonly warnings: string[];
}

export interface AssistantChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface AssistantChatRequest {
  readonly message: string;
  readonly messages: AssistantChatMessage[];
}

export interface AssistantChatResponse {
  readonly message: string;
}

export interface ApiErrorBody {
  readonly message?: string;
  readonly detail?: string;
  readonly [key: string]: unknown;
}
