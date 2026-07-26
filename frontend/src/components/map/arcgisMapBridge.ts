import type {
  ArcGISMapDiagnostic,
  ArcGISMapDiagnosticFact,
  ArcGISMapDiagnosticStage,
  ArcGISMapDiagnosticStatus,
  ArcGISMapHost,
  ArcGISMapMessage,
  ArcGISMapSource,
  MapDirectionStep,
  MapRouteData,
  MapRouteError,
  MapRouteErrorCode,
  MapRouteResult,
} from '../../types/maps';

export interface ArcGISMapHtmlOptions {
  apiKey: string;
  diagnosticsEnabled?: boolean;
  geocodingServiceUrl: string;
  mapHost?: ArcGISMapHost;
  mapData: MapRouteData;
  mapSource?: ArcGISMapSource;
  portalUrl: string;
  routeServiceUrl: string;
  webMapItemId: string;
}

export const ARCGIS_GEOCODE_MIN_SCORE = 80;

const MAP_READY_TIMEOUT_MS = 20_000;
const ROUTE_SOLVE_TIMEOUT_MS = 45_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isFiniteNonnegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isNonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const diagnosticStages = new Set<ArcGISMapDiagnosticStage>([
  'runtime',
  'map-ready',
  'control-added',
  'control-rendered',
  'route-layer-added',
  'route-layer-loaded',
  'route-solve-started',
  'route-solved',
  'route-updated',
  'route-rendered',
  'route-navigated',
  'route-error',
]);

const diagnosticStatuses = new Set<ArcGISMapDiagnosticStatus>([
  'info',
  'passed',
  'failed',
]);

const parseDiagnostic = (value: unknown): ArcGISMapDiagnostic | null => {
  if (
    !isRecord(value) ||
    !isPositiveInteger(value.sequence) ||
    !isNonemptyString(value.stage) ||
    !diagnosticStages.has(value.stage as ArcGISMapDiagnosticStage) ||
    !isNonemptyString(value.status) ||
    !diagnosticStatuses.has(value.status as ArcGISMapDiagnosticStatus) ||
    !isNonemptyString(value.message) ||
    !isRecord(value.facts)
  ) {
    return null;
  }

  const facts: Record<string, ArcGISMapDiagnosticFact> = {};
  for (const [key, fact] of Object.entries(value.facts)) {
    if (
      !key.trim() ||
      (fact !== null &&
        typeof fact !== 'string' &&
        typeof fact !== 'number' &&
        typeof fact !== 'boolean') ||
      (typeof fact === 'number' && !Number.isFinite(fact))
    ) {
      return null;
    }
    facts[key] = fact as ArcGISMapDiagnosticFact;
  }

  return {
    facts,
    message: value.message.trim(),
    sequence: value.sequence,
    stage: value.stage as ArcGISMapDiagnosticStage,
    status: value.status as ArcGISMapDiagnosticStatus,
  };
};

const serializeForInlineScript = (value: unknown): string =>
  (JSON.stringify(value) ?? 'null')
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

const escapeHtmlAttribute = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const parseDirectionStep = (value: unknown): MapDirectionStep | null => {
  if (!isRecord(value)) {
    return null;
  }

  const { distanceMiles, sequence, text, timeMinutes } = value;
  if (
    !isFiniteNonnegativeNumber(distanceMiles) ||
    !isPositiveInteger(sequence) ||
    !isNonemptyString(text) ||
    !isFiniteNonnegativeNumber(timeMinutes)
  ) {
    return null;
  }

  return {
    distanceMiles,
    sequence,
    text: text.trim(),
    timeMinutes,
  };
};

const parseRouteResult = (value: unknown): MapRouteResult | null => {
  if (!isRecord(value) || !Array.isArray(value.directions)) {
    return null;
  }

  const directions = value.directions.map(parseDirectionStep);
  if (
    directions.some((direction) => direction === null) ||
    !isFiniteNonnegativeNumber(value.totalDistanceMiles) ||
    !isFiniteNonnegativeNumber(value.totalTimeMinutes)
  ) {
    return null;
  }

  return {
    directions: directions as MapDirectionStep[],
    totalDistanceMiles: value.totalDistanceMiles,
    totalTimeMinutes: value.totalTimeMinutes,
  };
};

const routeErrorCodes = new Set<MapRouteErrorCode>([
  'CONFIGURATION',
  'GEOCODING',
  'ROUTING',
  'TIMEOUT',
]);

const parseRouteError = (value: unknown): MapRouteError | null => {
  if (
    !isRecord(value) ||
    !isNonemptyString(value.code) ||
    !routeErrorCodes.has(value.code as MapRouteErrorCode) ||
    !isNonemptyString(value.message)
  ) {
    return null;
  }

  if (
    value.stopName !== undefined &&
    !isNonemptyString(value.stopName)
  ) {
    return null;
  }
  if (
    value.stopSequence !== undefined &&
    !isPositiveInteger(value.stopSequence)
  ) {
    return null;
  }

  return {
    code: value.code as MapRouteErrorCode,
    message: value.message.trim(),
    ...(value.stopName === undefined
      ? {}
      : { stopName: value.stopName.trim() }),
    ...(value.stopSequence === undefined
      ? {}
      : { stopSequence: value.stopSequence }),
  };
};

export const parseArcGISMapMessage = (
  serializedMessage: string,
): ArcGISMapMessage | null => {
  let value: unknown;
  try {
    value = JSON.parse(serializedMessage);
  } catch {
    return null;
  }

  if (!isRecord(value) || !isNonemptyString(value.type)) {
    return null;
  }

  switch (value.type) {
    case 'mapReady':
      return { type: 'mapReady' };
    case 'routeSolving':
      return { type: 'routeSolving' };
    case 'routeSolved': {
      const result = parseRouteResult(value.result);
      return result ? { type: 'routeSolved', result } : null;
    }
    case 'routeError': {
      const error = parseRouteError(value.error);
      return error ? { type: 'routeError', error } : null;
    }
    case 'diagnostic': {
      const diagnostic = parseDiagnostic(value.diagnostic);
      return diagnostic ? { type: 'diagnostic', diagnostic } : null;
    }
    case 'mapError':
      return isNonemptyString(value.message)
        ? { type: 'mapError', message: value.message.trim() }
        : null;
    case 'timeout':
      return value.stage === 'map' || value.stage === 'route'
        ? { type: 'timeout', stage: value.stage }
        : null;
    default:
      return null;
  }
};

export const createArcGISMapHtml = ({
  apiKey,
  diagnosticsEnabled = false,
  geocodingServiceUrl,
  mapHost = 'component',
  mapData,
  mapSource = 'webMap',
  portalUrl,
  routeServiceUrl,
  webMapItemId,
}: ArcGISMapHtmlOptions): string => {
  const bridgeConfig = serializeForInlineScript({
    apiKey,
    diagnosticsEnabled,
    geocodeMinScore: ARCGIS_GEOCODE_MIN_SCORE,
    geocodingServiceUrl,
    mapHost,
    mapReadyTimeoutMs: MAP_READY_TIMEOUT_MS,
    mapSource,
    portalUrl,
    routeServiceUrl,
    routeSolveTimeoutMs: ROUTE_SOLVE_TIMEOUT_MS,
    webMapItemId,
  });
  const serializedMapData = serializeForInlineScript(mapData);
  const center = `${mapData.origin.longitude},${mapData.origin.latitude}`;
  const mapMarkup = mapHost === 'mapView'
    ? '<div id="cartograph-map"></div>'
    : mapSource === 'webMap'
      ? `<arcgis-map
      id="cartograph-map"
      item-id="${escapeHtmlAttribute(webMapItemId)}"
      center="${escapeHtmlAttribute(center)}"
      zoom="12"
    >
      <arcgis-zoom slot="top-left"></arcgis-zoom>
    </arcgis-map>`
      : `<arcgis-map
      id="cartograph-map"
      basemap="arcgis/navigation"
      center="${escapeHtmlAttribute(center)}"
      zoom="12"
    >
      <arcgis-zoom slot="top-left"></arcgis-zoom>
    </arcgis-map>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <style>
      html, body, #cartograph-map { height: 100%; width: 100%; margin: 0; }
      body { overflow: hidden; background: #f4f7f4; }
    </style>
    <link rel="stylesheet" href="https://js.arcgis.com/5.1/esri/themes/light/main.css" />
    <script>
      const bridgeConfig = ${bridgeConfig};
      const routeData = ${serializedMapData};
      var esriConfig = {
        apiKey: bridgeConfig.apiKey,
        portalUrl: bridgeConfig.portalUrl,
      };

      const notify = (message) => {
        window.ReactNativeWebView?.postMessage(JSON.stringify(message));
      };
      const sanitizeDiagnosticText = (value) => {
        let text = String(value ?? "");
        if (bridgeConfig.apiKey) {
          text = text.split(bridgeConfig.apiKey).join("[REDACTED]");
        }
        return text
          .replace(/([?&](?:token|apiKey)=)[^&\\s]+/gi, "$1[REDACTED]")
          .slice(0, 500);
      };
      let diagnosticSequence = 0;
      const postDiagnostic = (stage, status, message, facts = {}) => {
        if (!bridgeConfig.diagnosticsEnabled) return;
        const safeFacts = {};
        for (const [key, value] of Object.entries(facts).slice(0, 40)) {
          if (
            value === null ||
            typeof value === "boolean" ||
            (typeof value === "number" && Number.isFinite(value))
          ) {
            safeFacts[key] = value;
          } else if (typeof value === "string") {
            safeFacts[key] = sanitizeDiagnosticText(value);
          }
        }
        notify({
          type: "diagnostic",
          diagnostic: {
            facts: safeFacts,
            message: sanitizeDiagnosticText(message),
            sequence: ++diagnosticSequence,
            stage,
            status,
          },
        });
      };
      const errorMessage = (error, fallback) =>
        typeof error?.message === "string" && error.message.trim()
          ? error.message.trim()
          : fallback;
      let mapTerminal = false;
      let routeTerminal = false;
      let routeTimeout;
      const mapReadyTimeout = window.setTimeout(() => {
        mapTerminal = true;
        notify({ type: "timeout", stage: "map" });
      }, bridgeConfig.mapReadyTimeoutMs);
      const reportMapError = (message) => {
        if (mapTerminal) return;
        mapTerminal = true;
        routeTerminal = true;
        window.clearTimeout(mapReadyTimeout);
        if (routeTimeout !== undefined) window.clearTimeout(routeTimeout);
        postDiagnostic("map-ready", "failed", message);
        notify({ type: "mapError", message });
      };
      window.cartographMapLoadError = () => {
        reportMapError("The ArcGIS map SDK could not be loaded.");
      };
    </script>
    <script
      type="module"
      src="https://js.arcgis.com/5.1/"
      onerror="window.cartographMapLoadError()"
    ></script>
  </head>
  <body>
    ${mapMarkup}
    <script type="module">
      const mapContainer = document.querySelector("#cartograph-map");

      window.addEventListener("error", (event) => {
        reportMapError(errorMessage(event.error, "The ArcGIS map encountered an unexpected error."));
      });
      window.addEventListener("unhandledrejection", (event) => {
        reportMapError(errorMessage(event.reason, "The ArcGIS map encountered an unexpected error."));
      });

      const postRouteError = (error) => {
        if (routeTerminal) return;
        routeTerminal = true;
        if (routeTimeout !== undefined) window.clearTimeout(routeTimeout);
        notify({ type: "routeError", error });
      };

      const toNonnegativeNumber = (value, fallback = 0) => {
        const number = Number(value);
        return Number.isFinite(number) && number >= 0 ? number : fallback;
      };

      const getWebGLFacts = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("webgl2");
        if (!context) {
          return { webgl2: false, webglRenderer: "unavailable" };
        }
        const debugInfo = context.getExtension("WEBGL_debug_renderer_info");
        return {
          webgl2: true,
          webglRenderer: debugInfo
            ? String(context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
            : "masked",
        };
      };

      const diagnosticErrorFacts = (error) => {
        const rawUrl = typeof error?.url === "string"
          ? error.url
          : typeof error?.details?.url === "string"
            ? error.details.url
            : "";
        let requestPath = "";
        if (rawUrl) {
          try {
            requestPath = new URL(rawUrl, document.baseURI).pathname;
          } catch {
            requestPath = "unparseable";
          }
        }
        return {
          errorName: String(error?.name ?? "Error"),
          errorMessage: sanitizeDiagnosticText(errorMessage(error, "Unknown ArcGIS error.")),
          httpStatus: Number.isFinite(Number(error?.details?.httpStatus))
            ? Number(error.details.httpStatus)
            : null,
          requestPath,
        };
      };

      const withTimeout = async (promise, timeoutMs, message) => {
        let timeoutId;
        try {
          return await Promise.race([
            promise,
            new Promise((_, reject) => {
              timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
            }),
          ]);
        } finally {
          if (timeoutId !== undefined) window.clearTimeout(timeoutId);
        }
      };

      const nextRenderFrame = () => new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });

      const waitForRenderIdle = async (reactiveUtils, view, layerView) => {
        await nextRenderFrame();
        await withTimeout(
          reactiveUtils.whenOnce(
            () => !view.updating && !layerView.updating,
          ),
          10_000,
          "The ArcGIS layer did not finish rendering.",
        );
      };

      const layerViewFacts = (view, layerView) => ({
        layerViewSpatialReferenceSupported:
          layerView.spatialReferenceSupported === undefined
            ? null
            : Boolean(layerView.spatialReferenceSupported),
        layerViewSuspended: Boolean(layerView.suspended),
        layerViewUpdating: Boolean(layerView.updating),
        layerViewVisible: Boolean(layerView.visible),
        layerViewVisibleAtCurrentScale:
          layerView.visibleAtCurrentScale === undefined
            ? null
            : Boolean(layerView.visibleAtCurrentScale),
        viewStationary: Boolean(view.stationary),
        viewUpdating: Boolean(view.updating),
      });

      const screenshotPixelCount = (screenshot, matches) => {
        const pixels = screenshot?.data?.data;
        if (!pixels || typeof pixels.length !== "number") return 0;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if (matches(
            pixels[index],
            pixels[index + 1],
            pixels[index + 2],
            pixels[index + 3],
          )) {
            count += 1;
          }
        }
        return count;
      };

      const countControlPixels = (screenshot) => screenshotPixelCount(
        screenshot,
        (red, green, blue, alpha) =>
          red >= 220 && green <= 70 && blue >= 220 && alpha >= 128,
      );

      const countRoutePixels = (screenshot) => screenshotPixelCount(
        screenshot,
        (red, green, blue, alpha) =>
          red <= 80 && green >= 110 && green <= 210 && blue >= 180 && alpha >= 128,
      );

      try {
        if (!mapContainer) throw new Error("The ArcGIS map container was not created.");
        postDiagnostic("runtime", "info", "ArcGIS runtime initialized.", {
          arcgisVersion: "5.1",
          documentOrigin: window.location.origin,
          mapHost: bridgeConfig.mapHost,
          mapSource: bridgeConfig.mapSource,
          referrerOrigin: document.referrer
            ? new URL(document.referrer).origin
            : "none",
          userAgent: navigator.userAgent,
          ...getWebGLFacts(),
        });

        let map;
        let view;
        if (bridgeConfig.mapHost === "component") {
          mapContainer.addEventListener("arcgisLoadError", () => {
            reportMapError("The ArcGIS Web Map or one of its layers could not be loaded.");
          });
          mapContainer.addEventListener("arcgisViewReadyError", () => {
            reportMapError("The ArcGIS map view could not be created.");
          });
          await customElements.whenDefined("arcgis-map");
          await mapContainer.viewOnReady();
          map = mapContainer.map;
          view = mapContainer.view;
        } else {
          const [Map, MapView, WebMap] = await $arcgis.import([
            "@arcgis/core/Map.js",
            "@arcgis/core/views/MapView.js",
            "@arcgis/core/WebMap.js",
          ]);
          map = bridgeConfig.mapSource === "webMap"
            ? new WebMap({ portalItem: { id: bridgeConfig.webMapItemId } })
            : new Map({ basemap: "arcgis/navigation" });
          view = new MapView({
            center: [routeData.origin.longitude, routeData.origin.latitude],
            container: mapContainer,
            map,
            zoom: 12,
          });
          await view.when();
        }
        if (mapTerminal) throw new Error("The map became ready after its timeout.");

        window.clearTimeout(mapReadyTimeout);
        const reactiveUtils = await $arcgis.import(
          "@arcgis/core/core/reactiveUtils.js",
        );
        postDiagnostic("map-ready", "passed", "The ArcGIS map view is ready.", {
          basemapReferenceLayerCount: map.basemap?.referenceLayers?.length ?? 0,
          fatalError: Boolean(view.fatalError),
          layerCount: map.layers?.length ?? 0,
          spatialReference: String(
            view.spatialReference?.latestWkid ??
            view.spatialReference?.wkid ??
            "unknown"
          ),
          suspended: Boolean(view.suspended),
          updating: Boolean(view.updating),
        });
        map.layers?.forEach((layer, index) => {
          postDiagnostic("map-ready", "info", "Operational layer loaded.", {
            blendMode: String(layer.blendMode ?? "normal"),
            index,
            layerId: String(layer.id ?? ""),
            opacity: Number(layer.opacity ?? 1),
            title: String(layer.title ?? ""),
            type: String(layer.type ?? "unknown"),
            visible: Boolean(layer.visible),
          });
        });

        if (bridgeConfig.diagnosticsEnabled) {
          try {
            const [
              Graphic,
              GraphicsLayer,
              Polyline,
            ] = await $arcgis.import([
              "@arcgis/core/Graphic.js",
              "@arcgis/core/layers/GraphicsLayer.js",
              "@arcgis/core/geometry/Polyline.js",
            ]);
            const extent = view.extent?.clone();
            const controlPoint = view.center?.clone();
            if (!extent || !controlPoint) {
              throw new Error("The diagnostic control could not read the view extent.");
            }
            const centerY = (extent.ymin + extent.ymax) / 2;
            const inset = extent.width * 0.2;
            const controlLine = new Polyline({
              paths: [[
                [extent.xmin + inset, centerY],
                [extent.xmax - inset, centerY],
              ]],
              spatialReference: view.spatialReference,
            });
            const controlLayer = new GraphicsLayer({
              blendMode: "normal",
              graphics: [
                new Graphic({
                  geometry: controlLine,
                  symbol: {
                    type: "simple-line",
                    color: [255, 0, 255, 1],
                    width: 12,
                    cap: "round",
                    join: "round",
                  },
                }),
                new Graphic({
                  geometry: controlPoint,
                  symbol: {
                    type: "simple-marker",
                    color: [255, 0, 255, 1],
                    outline: {
                      color: [255, 255, 255, 1],
                      width: 3,
                    },
                    size: 32,
                  },
                }),
              ],
              id: "cartograph-diagnostic-control",
              listMode: "hide",
              opacity: 1,
              title: "Cartograph diagnostic control",
            });
            map.add(controlLayer);
            postDiagnostic("control-added", "passed", "Diagnostic control added.", {
              graphicCount: controlLayer.graphics.length,
              layerIndex: map.layers.indexOf(controlLayer),
              mapLayerCount: map.layers.length,
              parentAttached: controlLayer.parent === map,
            });

            await controlLayer.load();
            const controlLayerView = await view.whenLayerView(controlLayer);
            await waitForRenderIdle(reactiveUtils, view, controlLayerView);
            const controlScreenPoint = view.toScreen(controlPoint);
            const hitResult = controlScreenPoint
              ? await view.hitTest(controlScreenPoint, { include: controlLayer })
              : null;
            const screenshot = await view.takeScreenshot();
            const controlPixels = countControlPixels(screenshot);
            const baselineRoutePixels = countRoutePixels(screenshot);
            const controlHits = hitResult?.results?.length ?? 0;
            postDiagnostic(
              "control-rendered",
              controlPixels > 0 && controlHits > 0 ? "passed" : "failed",
              controlPixels > 0 && controlHits > 0
                ? "Diagnostic control rendered and was hit-testable."
                : "Diagnostic control was not proven visible.",
              {
                baselineRoutePixels,
                controlHits,
                controlPixels,
                screenX: controlScreenPoint?.x ?? null,
                screenY: controlScreenPoint?.y ?? null,
                ...layerViewFacts(view, controlLayerView),
              },
            );
          } catch (error) {
            postDiagnostic(
              "control-rendered",
              "failed",
              "Diagnostic control failed.",
              diagnosticErrorFacts(error),
            );
          }
        }
        notify({ type: "mapReady" });

        if (!bridgeConfig.apiKey) {
          postRouteError({
            code: "CONFIGURATION",
            message: "Set EXPO_PUBLIC_ARCGIS_API_KEY and restart Metro to calculate directions.",
          });
        } else if (routeData.stops.length === 0) {
          postRouteError({
            code: "ROUTING",
            message: "This route does not contain any Store stops.",
          });
        } else {
          notify({ type: "routeSolving" });
          routeTimeout = window.setTimeout(() => {
            if (routeTerminal) return;
            routeTerminal = true;
            notify({ type: "timeout", stage: "route" });
          }, bridgeConfig.routeSolveTimeoutMs);

          const [
            Point,
            webMercatorUtils,
            locator,
            RouteLayer,
            RouteParameters,
            Stop,
          ] = await $arcgis.import([
            "@arcgis/core/geometry/Point.js",
            "@arcgis/core/geometry/support/webMercatorUtils.js",
            "@arcgis/core/rest/locator.js",
            "@arcgis/core/layers/RouteLayer.js",
            "@arcgis/core/rest/support/RouteParameters.js",
            "@arcgis/core/rest/support/Stop.js",
          ]);

          const geographicOriginPoint = new Point({
            latitude: routeData.origin.latitude,
            longitude: routeData.origin.longitude,
            spatialReference: { wkid: 4326 },
          });
          const outputSpatialReference = view.spatialReference;
          const toOutputPoint = (coordinate) => {
            const geographicPoint = new Point({
              latitude: coordinate.latitude,
              longitude: coordinate.longitude,
              spatialReference: { wkid: 4326 },
            });
            return outputSpatialReference?.isWebMercator
              ? webMercatorUtils.geographicToWebMercator(geographicPoint)
              : geographicPoint;
          };
          const hasValidCoordinate = (coordinate) =>
            coordinate &&
            Number.isFinite(coordinate.latitude) &&
            coordinate.latitude >= -90 &&
            coordinate.latitude <= 90 &&
            Number.isFinite(coordinate.longitude) &&
            coordinate.longitude >= -180 &&
            coordinate.longitude <= 180;
          const originPoint = toOutputPoint(routeData.origin);

          let resolvedStops;
          try {
            resolvedStops = await Promise.all(routeData.stops.map(async (stop) => {
              if (hasValidCoordinate(stop.coordinate)) {
                return { ...stop, point: toOutputPoint(stop.coordinate) };
              }

              const candidates = await locator.addressToLocations(
                bridgeConfig.geocodingServiceUrl,
                {
                  address: { SingleLine: stop.address },
                  location: geographicOriginPoint,
                  maxLocations: 5,
                  outFields: ["Match_addr"],
                  outSpatialReference: outputSpatialReference,
                },
              );
              const candidate = candidates
                .filter((item) => item.location && Number.isFinite(item.score))
                .sort((first, second) => second.score - first.score)[0];

              if (!candidate || candidate.score < bridgeConfig.geocodeMinScore) {
                throw {
                  stop,
                  message: "No sufficiently precise location matched this Store address.",
                };
              }

              return { ...stop, point: candidate.location };
            }));
          } catch (error) {
            const stop = error?.stop;
            postRouteError({
              code: "GEOCODING",
              message: errorMessage(error, "A Store address could not be located."),
              ...(stop ? { stopName: stop.name, stopSequence: stop.sequence } : {}),
            });
          }

          if (!routeTerminal && resolvedStops) {
            let currentRouteStage = "route-layer-added";
            const routeStops = [
              new Stop({
                geometry: originPoint,
                name: routeData.origin.label,
                sequence: 1,
              }),
              ...resolvedStops.map((stop, index) => new Stop({
                geometry: stop.point,
                name: stop.name,
                sequence: index + 2,
              })),
              new Stop({
                geometry: originPoint,
                name: routeData.origin.label + " return",
                sequence: resolvedStops.length + 2,
              }),
            ];

            try {
              const initializeRouteLayer = async () => {
                const routeLayer = new RouteLayer({
                  id: "cartograph-route-layer",
                  listMode: "hide",
                  stops: routeStops,
                  title: "Cartograph route",
                  url: bridgeConfig.routeServiceUrl,
                  defaultSymbols: {
                    directionLines: {
                      type: "simple-line",
                      color: [28, 159, 232, 0.98],
                      width: 7,
                      cap: "round",
                      join: "round",
                    },
                    directionPoints: null,
                    routeInfo: null,
                  },
                });
                map.add(routeLayer);
                postDiagnostic(
                  "route-layer-added",
                  "passed",
                  "RouteLayer added to the map.",
                  {
                    layerIndex: map.layers.indexOf(routeLayer),
                    mapLayerCount: map.layers.length,
                    parentAttached: routeLayer.parent === map,
                    visible: Boolean(routeLayer.visible),
                  },
                );

                currentRouteStage = "route-layer-loaded";
                await routeLayer.load();
                const layerView = await view.whenLayerView(routeLayer);
                postDiagnostic(
                  "route-layer-loaded",
                  "passed",
                  "RouteLayer loaded and created a LayerView.",
                  {
                    loadStatus: String(routeLayer.loadStatus),
                    warningCount: routeLayer.loadWarnings?.length ?? 0,
                    ...layerViewFacts(view, layerView),
                  },
                );
                return routeLayer;
              };

              const routePointForHitTest = (routeLayer) => {
                const path = routeLayer.routeInfo?.geometry?.paths?.[0];
                const vertex = path?.[Math.floor(path.length / 2)];
                if (!vertex) return null;
                return new Point({
                  spatialReference: routeLayer.routeInfo.geometry.spatialReference,
                  x: vertex[0],
                  y: vertex[1],
                });
              };

              const solveRouteLayer = async (routeLayer) => {
                const routeParameters = new RouteParameters({
                  apiKey: bridgeConfig.apiKey,
                  findBestSequence: false,
                  ignoreInvalidLocations: false,
                  outSpatialReference: outputSpatialReference,
                });
                currentRouteStage = "route-solve-started";
                postDiagnostic(
                  "route-solve-started",
                  "info",
                  "RouteLayer solve started.",
                  { stopCount: routeLayer.stops.length },
                );
                const solveResult = await routeLayer.solve(routeParameters);
                postDiagnostic(
                  "route-solved",
                  "passed",
                  "ArcGIS returned a RouteLayer solve result.",
                  { solveResultPresent: Boolean(solveResult) },
                );
                if (routeTerminal) {
                  throw new Error("The route completed after its timeout.");
                }

                currentRouteStage = "route-updated";
                routeLayer.update(solveResult);
                if (!routeLayer.routeInfo?.geometry) {
                  throw new Error("ArcGIS did not return RouteLayer geometry.");
                }
                const routeGeometry = routeLayer.routeInfo.geometry;
                const routeLayerView = await view.whenLayerView(routeLayer);
                postDiagnostic(
                  "route-updated",
                  "passed",
                  "RouteLayer accepted the solved route.",
                  {
                    directionLineCount: routeLayer.directionLines?.length ?? 0,
                    directionPointCount: routeLayer.directionPoints?.length ?? 0,
                    geometryIntersectsView: Boolean(
                      view.extent && routeGeometry.extent.intersects(view.extent)
                    ),
                    geometrySpatialReference: String(
                      routeGeometry.spatialReference?.latestWkid ??
                      routeGeometry.spatialReference?.wkid ??
                      "unknown"
                    ),
                    symbolJson: JSON.stringify(routeLayer.defaultSymbols?.toJSON?.() ?? {}),
                    ...layerViewFacts(view, routeLayerView),
                  },
                );

                currentRouteStage = "route-navigated";
                await view.goTo(routeGeometry.extent.expand(1.2));
                await waitForRenderIdle(reactiveUtils, view, routeLayerView);
                postDiagnostic(
                  "route-navigated",
                  "passed",
                  "The map navigated to the solved route.",
                  layerViewFacts(view, routeLayerView),
                );

                currentRouteStage = "route-rendered";
                if (bridgeConfig.diagnosticsEnabled) {
                  let baselineRoutePixels = 0;
                  routeLayer.visible = false;
                  try {
                    await waitForRenderIdle(reactiveUtils, view, routeLayerView);
                    const baselineScreenshot = await view.takeScreenshot();
                    baselineRoutePixels = countRoutePixels(baselineScreenshot);
                  } finally {
                    routeLayer.visible = true;
                    await waitForRenderIdle(reactiveUtils, view, routeLayerView);
                  }
                  const routePoint = routePointForHitTest(routeLayer);
                  const routeScreenPoint = routePoint ? view.toScreen(routePoint) : null;
                  const routeHitResult = routeScreenPoint
                    ? await view.hitTest(routeScreenPoint, { include: routeLayer })
                    : null;
                  const routeScreenshot = await view.takeScreenshot();
                  const routePixels = countRoutePixels(routeScreenshot);
                  const routePixelDelta = Math.max(
                    0,
                    routePixels - baselineRoutePixels,
                  );
                  const routeHits = routeHitResult?.results?.length ?? 0;
                  postDiagnostic(
                    "route-rendered",
                    routePixelDelta > 0 ? "passed" : "failed",
                    routePixelDelta > 0
                      ? "RouteLayer produced visible pixels."
                      : routeHits > 0
                        ? "RouteLayer was hit-testable but produced no visible pixels."
                        : "RouteLayer produced no visible or hit-testable output.",
                    {
                      baselineRoutePixels,
                      routeHits,
                      routePixelDelta,
                      routePixels,
                      screenX: routeScreenPoint?.x ?? null,
                      screenY: routeScreenPoint?.y ?? null,
                      ...layerViewFacts(view, routeLayerView),
                    },
                  );
                }
                return routeLayer;
              };

              const routeLayer = await initializeRouteLayer();
              await solveRouteLayer(routeLayer);

              const directionLines = routeLayer.directionLines?.toArray() ?? [];
              const rawDirections = (routeLayer.directionPoints?.toArray() ?? [])
                .sort((first, second) =>
                  toNonnegativeNumber(first.sequence) - toNonnegativeNumber(second.sequence)
                )
                .map((directionPoint, index) => {
                  const lineIndex = Math.max(
                    0,
                    toNonnegativeNumber(directionPoint.sequence, index + 1) - 1,
                  );
                  const directionLine = directionLines[lineIndex] ?? directionLines[index];
                  return {
                    text: String(directionPoint.displayText ?? "").trim(),
                    distanceMiles: toNonnegativeNumber(directionLine?.distance) / 1609.344,
                    timeMinutes: toNonnegativeNumber(directionLine?.duration),
                  };
                })
                .filter((direction) => direction.text.length > 0);
              const directions = rawDirections.map((direction, index) => ({
                ...direction,
                sequence: index + 1,
              }));
              const directionDistance = directions.reduce(
                (total, direction) => total + direction.distanceMiles,
                0,
              );
              const directionTime = directions.reduce(
                (total, direction) => total + direction.timeMinutes,
                0,
              );

              window.clearTimeout(routeTimeout);
              routeTerminal = true;
              notify({
                type: "routeSolved",
                result: {
                  directions,
                  totalDistanceMiles: toNonnegativeNumber(
                    routeLayer.routeInfo.totalDistance,
                    directionDistance * 1609.344,
                  ) / 1609.344,
                  totalTimeMinutes: toNonnegativeNumber(
                    routeLayer.routeInfo.totalDuration,
                    directionTime,
                  ),
                },
              });
            } catch (error) {
              postDiagnostic(
                "route-error",
                "failed",
                errorMessage(error, "ArcGIS could not calculate this route."),
                {
                  failedStage: currentRouteStage,
                  ...diagnosticErrorFacts(error),
                },
              );
              postRouteError({
                code: "ROUTING",
                message: errorMessage(error, "ArcGIS could not calculate this route."),
              });
            }
          }
        }
      } catch (error) {
        reportMapError(errorMessage(error, "The ArcGIS map could not be initialized."));
      }
    </script>
  </body>
</html>`;
};