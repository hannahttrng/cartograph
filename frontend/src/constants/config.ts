const DEFAULT_API_BASE_URL = 'http://localhost:8000';

const parseBoolean = (value: string | undefined): boolean =>
  value?.trim().toLowerCase() === 'true';

const configuredBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL;

export const API_BASE_URL = (
  configuredBaseUrl?.trim() || DEFAULT_API_BASE_URL
).replace(/\/+$/, '');

export const USE_MOCK_DATA = parseBoolean(
  process.env.EXPO_PUBLIC_USE_MOCK_DATA ?? process.env.USE_MOCK_DATA,
);

export const API_TIMEOUT_MS = 15_000;
