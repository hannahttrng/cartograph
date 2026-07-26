import { USE_MOCK_DATA } from '../constants/config';
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRecipeImportRequest,
  AssistantRecipeImportResponse,
} from '../types/api';
import { apiClient } from './client';
import { mockApi } from './mock';

const CARTER_TIMEOUT_MS = 45_000;

export const importRecipe = async (
  request: AssistantRecipeImportRequest,
): Promise<AssistantRecipeImportResponse> => {
  if (USE_MOCK_DATA) {
    return mockApi.importRecipe(request);
  }

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
  if (USE_MOCK_DATA) {
    return mockApi.askCarter(request);
  }

  const { data } = await apiClient.post<AssistantChatResponse>(
    '/api/v1/assistant/chat',
    request,
    { timeout: CARTER_TIMEOUT_MS },
  );
  return data;
};