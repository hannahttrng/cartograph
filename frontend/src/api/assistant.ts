import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecipeImportRequest,
  AssistantRecipeImportResponse,
} from '../types/api';
import { apiClient } from './client';

export const importRecipe = async (
  request: AssistantRecipeImportRequest,
): Promise<AssistantRecipeImportResponse> => {
  const { data } = await apiClient.post<AssistantRecipeImportResponse>(
    '/api/v1/assistant/recipe-import',
    request,
  );
  return data;
};

export const askCarter = async (
  request: AssistantChatRequest,
): Promise<AssistantChatResponse> => {
  const { data } = await apiClient.post<AssistantChatResponse>(
    '/api/v1/assistant/chat',
    request,
  );
  return data;
};