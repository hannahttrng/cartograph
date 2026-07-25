import axios, { type AxiosError } from 'axios';

import { API_BASE_URL, API_TIMEOUT_MS } from '../constants/config';
import type { ApiErrorBody } from '../types/api';

export interface ApiErrorOptions<T = unknown> {
  status?: number;
  code?: string;
  data?: T;
}

export class ApiError<T = unknown> extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly data?: T;

  constructor(message: string, options: ApiErrorOptions<T> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code;
    this.data = options.data;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const getResponseMessage = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const body = data as ApiErrorBody;
  return typeof body.detail === 'string'
    ? body.detail
    : typeof body.message === 'string'
      ? body.message
      : undefined;
};

export const toApiError = (error: unknown): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    return new ApiError(
      error instanceof Error ? error.message : 'An unexpected API error occurred.',
    );
  }

  const axiosError = error as AxiosError<unknown>;
  const status = axiosError.response?.status;
  const data = axiosError.response?.data;

  let fallbackMessage = 'Unable to connect to Cartograph.';
  if (status) {
    fallbackMessage = `Cartograph request failed (${status}).`;
  } else if (axiosError.code === 'ECONNABORTED') {
    fallbackMessage = 'The Cartograph request timed out.';
  }

  return new ApiError(getResponseMessage(data) ?? fallbackMessage, {
    status,
    code: axiosError.code,
    data,
  });
};

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiError(error)),
);

export const encodePathId = (id: string, label: string): string => {
  const value = id.trim();
  if (!value) {
    throw new ApiError(`${label} is required.`, { code: 'INVALID_ARGUMENT' });
  }

  return encodeURIComponent(value);
};
