import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecipeImportRequest,
  AssistantRecipeImportResponse,
} from '../types/api';
import { apiClient } from './client';

const CARTER_TIMEOUT_MS = 45_000;

export const importRecipe = async (
  request: AssistantRecipeImportRequest,
): Promise<AssistantRecipeImportResponse> => {
  const { data } = await apiClient.post<AssistantRecipeImportResponse>(
    '/api/v1/assistant/recipe-import',
    request,
    { timeout: CARTER_TIMEOUT_MS },
  );
  return data;
};

export const askCarter = async (
  request: AssistantChatRequest,
): Promise<AssistantChatResponse> => {
  const { data } = await apiClient.post<AssistantChatResponse>(
    '/api/v1/assistant/chat',
    request,
    { timeout: CARTER_TIMEOUT_MS },
  );
  return data;
};