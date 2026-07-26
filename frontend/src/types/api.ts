import type { Store } from './models';

export type EntityId = number;

export interface CatalogTag {
  readonly tag: string;
  readonly defaultUnit: string;
  readonly defaultQuantity: number;
  readonly products: readonly EntityId[];
}

export interface ShoppingListItemInput {
  readonly tag: string;
  readonly modifiers?: readonly string[];
  readonly unit?: string | null;
  readonly quantity?: number | null;
}

export interface ShoppingListItem {
  readonly tag: string;
  readonly modifiers: readonly string[];
  readonly unit: string;
  readonly quantity: number;
}

export interface ShoppingListCreateRequest {
  readonly name?: string | null;
  readonly items: readonly ShoppingListItemInput[];
  readonly active?: boolean;
}

export interface ShoppingListReplaceRequest {
  readonly name: string;
  readonly items: readonly ShoppingListItemInput[];
  readonly active?: boolean;
}

export interface ShoppingListNameUpdateRequest {
  readonly name: string;
}

export interface ShoppingListActiveUpdateRequest {
  readonly active: boolean;
}

export interface ShoppingListResponse {
  readonly id: EntityId;
  readonly name: string;
  readonly items: readonly ShoppingListItem[];
  readonly active: boolean;
}

export interface RouteStoreSummary {
  readonly id: EntityId;
  readonly name: string;
  readonly address: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

export interface RouteProductSummary {
  readonly id: EntityId;
  readonly name: string;
  readonly store: EntityId;
  readonly unit: string;
  readonly modifiers: readonly string[];
  readonly selectionPrice: number;
}

export interface RouteItemSelection extends ShoppingListItem {
  readonly product: EntityId | null;
}

export interface RouteScoreComponents {
  readonly productPrice: number;
  readonly distanceCost: number;
  readonly timeCost: number;
  readonly storeCost: number;
  readonly modifierPenalty: number;
}

export type RouteErrorCode = 'PARTIAL_ITEM_MATCH';

export interface RouteCandidateResult {
  readonly id: EntityId;
  readonly stores: readonly RouteStoreSummary[];
  readonly products: readonly RouteProductSummary[];
  readonly selections: readonly RouteItemSelection[];
  readonly distance: number;
  readonly time: number;
  readonly score: number;
  readonly productPrice: number;
  readonly matchedItemCount: number;
  readonly scoreComponents: RouteScoreComponents;
  readonly errorCode: RouteErrorCode | null;
}

export interface RouteCandidatesResponse {
  readonly generation: number;
  readonly candidates: readonly RouteCandidateResult[];
}

export type RouteOptimizationStatus =
  | 'OPTIMAL'
  | 'HEURISTIC'
  | 'FEASIBLE_TIMEOUT';

export type RouteOptimizationErrorCode =
  | 'NO_ELIGIBLE_PRODUCTS'
  | 'MATRIX_UNAVAILABLE'
  | 'UNIT_CONVERSION_FAILED'
  | 'OPTIMIZATION_FAILED';

export type RouteCalculationStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED';

export interface RouteCalculationResponse {
  readonly generation: number;
  readonly status: RouteCalculationStatus;
  readonly activeListCount: number;
  readonly itemCount: number;
  readonly resultCount: number;
  readonly optimizerStatus: RouteOptimizationStatus | null;
  readonly startedAt: number | null;
  readonly completedAt: number | null;
  readonly elapsedSeconds: number | null;
  readonly timeoutSeconds: number | null;
  readonly errorCode: RouteOptimizationErrorCode | null;
  readonly detail: string | null;
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
  readonly errorCode?: string | null;
  readonly [key: string]: unknown;
}
