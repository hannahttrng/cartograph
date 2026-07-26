import { Platform } from 'react-native';

import type { ArcGISMapHost, ArcGISMapSource } from '../types/maps';

const DEFAULT_API_BASE_URL =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'
    : 'http://localhost:8000';

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

export const ARCGIS_API_KEY =
  process.env.EXPO_PUBLIC_ARCGIS_API_KEY?.trim() || '';

export const ARCGIS_MAP_DIAGNOSTICS = parseBoolean(
  process.env.EXPO_PUBLIC_ARCGIS_MAP_DIAGNOSTICS,
);

export const ARCGIS_MAP_HOST: ArcGISMapHost =
  process.env.EXPO_PUBLIC_ARCGIS_MAP_HOST?.trim() === 'mapView'
    ? 'mapView'
    : 'component';

export const ARCGIS_MAP_SOURCE: ArcGISMapSource =
  process.env.EXPO_PUBLIC_ARCGIS_MAP_SOURCE?.trim() === 'basemap'
    ? 'basemap'
    : 'webMap';

export const ARCGIS_GEOCODING_SERVICE_URL =
  'https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer';

export const ARCGIS_ROUTE_SERVICE_URL =
  'https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World';

export const DEMO_ROUTE_ORIGIN = {
  label: 'Demo location',
  latitude: 34.0556,
  longitude: -117.1825,
} as const;

export const ARCGIS_WEB_MAP_ITEM_ID =
  process.env.EXPO_PUBLIC_ARCGIS_WEB_MAP_ITEM_ID?.trim() ||
  '1114223c46f948c4b17a6ddb8c3e4865';

export const ARCGIS_PORTAL_URL = (
  process.env.EXPO_PUBLIC_ARCGIS_PORTAL_URL?.trim() ||
  'https://intern-hackathon.maps.arcgis.com'
).replace(/\/+$/, '');

export const ARCGIS_WEB_MAP_BROWSER_URL =
  `${ARCGIS_PORTAL_URL}/apps/mapviewer/index.html?webmap=${encodeURIComponent(ARCGIS_WEB_MAP_ITEM_ID)}`;
