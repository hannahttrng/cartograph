import type { GetMapResponse } from './api';
import type { Store } from './models';

export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface RoutePolyline {
  points: MapCoordinate[];
}

export interface StoreMarker extends Store {
  id: string;
  sequence: number;
  coordinate: MapCoordinate;
}

export interface MapRouteData extends GetMapResponse {
  distance: number;
  polyline: RoutePolyline;
  time: number;
}

export type MapState = 'loading' | 'mapUnavailable' | 'routeSelected';