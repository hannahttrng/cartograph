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
  readonly [key: string]: unknown;
}

export type GetRoutesResponse = Route[];

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
