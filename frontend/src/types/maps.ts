export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface MapRouteOrigin extends MapCoordinate {
  label: string;
}

export interface MapRouteStop {
  address: string;
  coordinate?: MapCoordinate;
  name: string;
  sequence: number;
}

export interface MapDirectionStep {
  distanceMiles: number;
  sequence: number;
  text: string;
  timeMinutes: number;
}

export interface MapRouteResult {
  directions: MapDirectionStep[];
  totalDistanceMiles: number;
  totalTimeMinutes: number;
}

export interface MapStopSelection {
  name: string;
  sequence: number;
}

export type ArcGISMapCommandPayload =
  | { type: 'recenterRoute'; bottomPadding: number }
  | { type: 'selectDirection'; sequence: number; bottomPadding: number }
  | { type: 'selectStop'; sequence: number; bottomPadding: number }
  | { type: 'setInteraction'; enabled: boolean; bottomPadding: number };

export interface ArcGISMapCommand {
  id: number;
  payload: ArcGISMapCommandPayload;
}

export type MapRouteErrorCode =
  | 'CONFIGURATION'
  | 'GEOCODING'
  | 'ROUTING'
  | 'TIMEOUT';

export interface MapRouteError {
  code: MapRouteErrorCode;
  message: string;
  stopName?: string;
  stopSequence?: number;
}

export interface MapRouteData {
  estimatedDistanceMiles: number;
  estimatedTimeMinutes: number;
  origin: MapRouteOrigin;
  routeId: string;
  stops: MapRouteStop[];
}

export type ArcGISMapHost = 'component' | 'mapView';

export type ArcGISMapSource = 'webMap' | 'basemap';

export type ArcGISMapDiagnosticStage =
  | 'runtime'
  | 'map-ready'
  | 'control-added'
  | 'control-rendered'
  | 'route-layer-added'
  | 'route-layer-loaded'
  | 'route-solve-started'
  | 'route-solved'
  | 'route-updated'
  | 'route-rendered'
  | 'route-navigated'
  | 'route-error';

export type ArcGISMapDiagnosticStatus = 'info' | 'passed' | 'failed';

export type ArcGISMapDiagnosticFact = string | number | boolean | null;

export interface ArcGISMapDiagnostic {
  facts: Record<string, ArcGISMapDiagnosticFact>;
  message: string;
  sequence: number;
  stage: ArcGISMapDiagnosticStage;
  status: ArcGISMapDiagnosticStatus;
}

export type ArcGISMapMessage =
  | { type: 'mapReady' }
  | { type: 'routeSolving' }
  | { type: 'routeSolved'; result: MapRouteResult }
  | { type: 'stopSelected'; stop: MapStopSelection }
  | { type: 'routeError'; error: MapRouteError }
  | { type: 'diagnostic'; diagnostic: ArcGISMapDiagnostic }
  | { type: 'mapError'; message: string }
  | { type: 'timeout'; stage: 'map' | 'route' };

export type MapState =
  | 'loadingMap'
  | 'solvingRoute'
  | 'routeReady'
  | 'routeUnavailable'
  | 'mapUnavailable';