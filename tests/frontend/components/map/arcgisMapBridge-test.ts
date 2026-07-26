import * as ts from 'typescript';

import {
  createArcGISMapCommandScript,
  createArcGISMapHtml,
  parseArcGISMapMessage,
} from '../../../../frontend/src/components/map/arcgisMapBridge';
import type { MapRouteData } from '../../../../frontend/src/types/maps';

const mapData: MapRouteData = {
  estimatedDistanceMiles: 4.25,
  estimatedTimeMinutes: 11,
  origin: {
    label: 'Demo location',
    latitude: 34.0556,
    longitude: -117.1825,
  },
  routeId: 'route-1',
  stops: [
    {
      address: '560 W Stuart Ave, Redlands, CA 92374',
      coordinate: {
        latitude: 34.0622,
        longitude: -117.1906,
      },
      name: 'Sprouts </script><script>alert(1)</script>',
      sequence: 1,
    },
    {
      address: '552 Orange St, Redlands, CA 92374',
      name: 'Trader Joes',
      sequence: 2,
    },
  ],
};

const createHtml = () => createArcGISMapHtml({
  apiKey: 'demo-key',
  geocodingServiceUrl: 'https://example.test/geocode',
  mapData,
  portalUrl: 'https://example.test',
  routeServiceUrl: 'https://example.test/route',
  webMapItemId: 'web-map-id',
});

test('serializes route data safely and preserves ordered round-trip parameters', () => {
  const html = createHtml();

  expect(html).not.toContain('</script><script>alert(1)</script>');
  expect(html).toContain('Sprouts \\u003c/script\\u003e\\u003cscript\\u003ealert(1)');
  expect(html.indexOf(mapData.stops[0]!.address)).toBeLessThan(
    html.indexOf(mapData.stops[1]!.address),
  );
  expect(html).toContain('const routeStops = [');
  expect(html).toContain('...resolvedStops.map');
  expect(html).toContain('routeData.origin.label + " return"');
  expect(html).toContain('@arcgis/core/layers/RouteLayer.js');
  expect(html).toContain('@arcgis/core/layers/GraphicsLayer.js');
  expect(html).toContain('@arcgis/core/Graphic.js');
  expect(html).toContain('@arcgis/core/rest/support/Stop.js');
  expect(html).toContain('new RouteLayer({');
  expect(html).toContain('map.add(routeLayer)');
  expect(html).toContain('const initializeRouteLayer = async () =>');
  expect(html).toContain('await routeLayer.load()');
  expect(html).toContain('const layerView = await view.whenLayerView(routeLayer)');
  expect(html).toContain('const solveRouteLayer = async (routeLayer) =>');
  expect(html).toContain('const solveResult = await routeLayer.solve(routeParameters)');
  expect(html).toContain('routeLayer.update(solveResult)');
  expect(html).toContain('await waitForRenderIdle(reactiveUtils, view, routeLayerView)');
  expect(html.indexOf('view.padding = { top: 32, right: 32, bottom: 48, left: 32 }')).toBeLessThan(
    html.indexOf('const routeScreenshot = await view.takeScreenshot()'),
  );
  expect(html.indexOf('routeLayer.visible = false')).toBeLessThan(
    html.indexOf('const baselineScreenshot = await view.takeScreenshot()'),
  );
  expect(html.indexOf('routeLayer.visible = true')).toBeLessThan(
    html.indexOf('const routeScreenshot = await view.takeScreenshot()'),
  );
  expect(html).toContain('await solveRouteLayer(routeLayer)');
  expect(html).toContain('directionLines: {');
  expect(html).toContain('type: "simple-line"');
  expect(html).toContain('directionPoints: null');
  expect(html).toContain('routeInfo: null');
  expect(html).toContain('findBestSequence: false');
  expect(html).toContain('ignoreInvalidLocations: false');
  expect(html).toContain('@arcgis/core/geometry/support/webMercatorUtils.js');
  expect(html).toContain('const hasValidCoordinate = (coordinate) =>');
  expect(html).toContain('if (hasValidCoordinate(stop.coordinate))');
  expect(html).toContain('point: toOutputPoint(stop.coordinate)');
  expect(html).toContain('locator.addressToLocations(');
  expect(html).toContain('webMercatorUtils.geographicToWebMercator');
  expect(html).toContain('outSpatialReference: outputSpatialReference');
  expect(html).toContain('routeLayer.directionPoints?.toArray()');
  expect(html).toContain('routeLayer.directionLines?.toArray()');
  expect(html).toContain('routeLayer.routeInfo.totalDistance');
  expect(html).toContain('directionDistance * 1609.344');
  expect(html).toContain('routeLayer.routeInfo.totalDuration');
  expect(html).not.toContain('@arcgis/core/rest/route.js');
  expect(html).not.toContain('mapElement.view.graphics.addMany');
  expect(html).toContain('color: [20, 124, 54, 0.96]');
  expect(html).toContain('id: "cartograph-route-display-layer"');
  expect(html).toContain('color: [255, 255, 255, 0.96]');
  expect(html).toContain('const addStopMarkers = () =>');
  expect(html).toContain('id: "cartograph-stop-order-layer"');
  expect(html).toContain('label: "S"');
  expect(html).toContain('label: "E"');
  expect(html).toContain('const isNextStop = index === 0');
  expect(html).toContain('view.on("click"');
  expect(html).toContain('window.cartographHandleCommand = async (command) =>');
  expect(html).toContain('command.type === "recenterRoute"');
  expect(html).toContain('command.type === "selectDirection"');
  expect(html).toContain('command.type === "selectStop"');
  expect(html).toContain('command.type === "setInteraction"');
  expect(html).toContain('https://example.test/geocode');
  expect(html).toContain('https://example.test/route');
  expect(html).toContain('src="https://js.arcgis.com/5.1/"');
  expect(html).not.toContain('https://js.arcgis.com/5.1/map-components/');
});

test('serializes native map commands safely', () => {
  expect(createArcGISMapCommandScript({
    type: 'selectDirection',
    sequence: 3,
    bottomPadding: 180,
  })).toBe(
    'window.cartographHandleCommand?.({"type":"selectDirection","sequence":3,"bottomPadding":180}); true;',
  );
});

test('parses a selected Store message', () => {
  expect(parseArcGISMapMessage(JSON.stringify({
    type: 'stopSelected',
    stop: { name: 'Sprouts', sequence: 2 },
  }))).toEqual({
    type: 'stopSelected',
    stop: { name: 'Sprouts', sequence: 2 },
  });
});

test('generates opt-in runtime diagnostics for component and core MapView hosts', () => {
  const componentHtml = createArcGISMapHtml({
    apiKey: 'demo-key',
    diagnosticsEnabled: true,
    geocodingServiceUrl: 'https://example.test/geocode',
    mapData,
    mapHost: 'component',
    mapSource: 'basemap',
    portalUrl: 'https://example.test',
    routeServiceUrl: 'https://example.test/route',
    webMapItemId: 'web-map-id',
  });
  const mapViewHtml = createArcGISMapHtml({
    apiKey: 'demo-key',
    diagnosticsEnabled: true,
    geocodingServiceUrl: 'https://example.test/geocode',
    mapData,
    mapHost: 'mapView',
    mapSource: 'webMap',
    portalUrl: 'https://example.test',
    routeServiceUrl: 'https://example.test/route',
    webMapItemId: 'web-map-id',
  });

  expect(componentHtml).toContain('basemap="arcgis/navigation"');
  expect(componentHtml).toContain('postDiagnostic("runtime"');
  expect(componentHtml).toContain('postDiagnostic("map-ready"');
  expect(componentHtml).toContain('cartograph-diagnostic-control');
  expect(componentHtml).toContain('type: "simple-marker"');
  expect(componentHtml).toContain('view.takeScreenshot()');
  expect(componentHtml).toContain('view.hitTest(controlScreenPoint');
  expect(componentHtml).toContain('"control-rendered",');
  expect(componentHtml).toContain('"route-rendered",');
  expect(componentHtml).toContain(
    '"RouteLayer was hit-testable but produced no visible pixels."',
  );
  expect(componentHtml).toContain('failedStage: currentRouteStage');
  expect(componentHtml).not.toContain('apiKey: "demo-key"');
  expect(mapViewHtml).toContain('<div id="cartograph-map"></div>');
  expect(mapViewHtml).toContain('@arcgis/core/views/MapView.js');
  expect(mapViewHtml).toContain('new WebMap({ portalItem: { id: bridgeConfig.webMapItemId } })');
});

test('emits syntactically valid modern JavaScript in every inline script', () => {
  const scripts = [...createHtml().matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => match[1]?.trim() ?? '')
    .filter(Boolean);

  const diagnostics = scripts.flatMap((script) =>
    ts.transpileModule(script, {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      reportDiagnostics: true,
    }).diagnostics ?? [],
  ).filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  expect(diagnostics.map((diagnostic) => diagnostic.messageText)).toEqual([]);
});

test('parses a solved route into finite native direction values', () => {
  expect(parseArcGISMapMessage(JSON.stringify({
    type: 'routeSolved',
    result: {
      directions: [
        {
          distanceMiles: 0.75,
          sequence: 1,
          text: 'Turn right on Orange Street',
          timeMinutes: 2.5,
        },
      ],
      totalDistanceMiles: 4.2,
      totalTimeMinutes: 11,
    },
  }))).toEqual({
    type: 'routeSolved',
    result: {
      directions: [
        {
          distanceMiles: 0.75,
          sequence: 1,
          text: 'Turn right on Orange Street',
          timeMinutes: 2.5,
        },
      ],
      totalDistanceMiles: 4.2,
      totalTimeMinutes: 11,
    },
  });
});

test.each([
  'not-json',
  JSON.stringify({ type: 'unknown' }),
  JSON.stringify({
    type: 'routeSolved',
    result: { directions: [], totalDistanceMiles: -1, totalTimeMinutes: 5 },
  }),
  JSON.stringify({
    type: 'routeSolved',
    result: {
      directions: [{ distanceMiles: null, sequence: 1, text: 'Go', timeMinutes: 1 }],
      totalDistanceMiles: 1,
      totalTimeMinutes: 1,
    },
  }),
  JSON.stringify({ type: 'timeout', stage: 'geocoding' }),
])('rejects malformed WebView message %s', (message) => {
  expect(parseArcGISMapMessage(message)).toBeNull();
});

test('parses route errors with optional Store context', () => {
  expect(parseArcGISMapMessage(JSON.stringify({
    type: 'routeError',
    error: {
      code: 'GEOCODING',
      message: 'No precise match.',
      stopName: 'Sprouts',
      stopSequence: 1,
    },
  }))).toEqual({
    type: 'routeError',
    error: {
      code: 'GEOCODING',
      message: 'No precise match.',
      stopName: 'Sprouts',
      stopSequence: 1,
    },
  });
});

test('parses primitive-only diagnostic snapshots', () => {
  expect(parseArcGISMapMessage(JSON.stringify({
    type: 'diagnostic',
    diagnostic: {
      facts: {
        layerVisible: true,
        routeColorPixels: 128,
        spatialReference: '3857',
        warning: null,
      },
      message: 'Route layer finished rendering.',
      sequence: 4,
      stage: 'route-rendered',
      status: 'passed',
    },
  }))).toEqual({
    type: 'diagnostic',
    diagnostic: {
      facts: {
        layerVisible: true,
        routeColorPixels: 128,
        spatialReference: '3857',
        warning: null,
      },
      message: 'Route layer finished rendering.',
      sequence: 4,
      stage: 'route-rendered',
      status: 'passed',
    },
  });

  expect(parseArcGISMapMessage(JSON.stringify({
    type: 'diagnostic',
    diagnostic: {
      facts: { nested: { token: 'must not cross the bridge' } },
      message: 'Invalid facts.',
      sequence: 1,
      stage: 'runtime',
      status: 'info',
    },
  }))).toBeNull();
});