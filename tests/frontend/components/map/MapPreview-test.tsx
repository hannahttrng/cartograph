import { render, screen } from '@testing-library/react-native';

import {
  createLocationPreviewHtml,
  MapPreview,
} from '../../../../frontend/src/components/map/MapPreview';
import type { DemoStore, UserLocation } from '../../../../frontend/src/types/demo';

let webViewProps: Record<string, unknown> | undefined;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    WebView: (props: Record<string, unknown>) => {
      webViewProps = props;
      return React.createElement(View, {
        accessibilityLabel: props.accessibilityLabel,
        testID: 'location-map-webview',
      });
    },
  };
});

const userLocation: UserLocation = {
  label: 'Redlands, CA',
  latitude: 34.0556,
  longitude: -117.1825,
};

const stores: DemoStore[] = [{
  id: 'store-1',
  name: 'Fresh Market',
  address: '123 Citrus Ave',
  distance: 1.2,
  estimatedSavings: 4,
  latitude: 34.0622,
  longitude: -117.1906,
  logoName: 'sprouts',
  deals: [],
}];

test('builds a live ArcGIS location map without route services', async () => {
  const html = createLocationPreviewHtml(userLocation, stores);

  expect(html).toContain('arcgis-map-components.esm.js');
  expect(html).toContain('<arcgis-map');
  expect(html).toContain(`center="${userLocation.longitude},${userLocation.latitude}"`);
  expect(html).toContain('await mapElement.viewOnReady()');
  expect(html).toContain('popupTemplate: { title: config.userLocation.label }');
  expect(html).toContain('view.padding = { top: 56, right: 32, bottom: 56, left: 32 }');
  expect(html).toContain('await view.goTo(view.graphics.toArray()');
  expect(html).toContain('notify("mapReady")');
  expect(html).not.toContain('RouteLayer');
  expect(html).not.toContain('route-api.arcgis.com');

  await render(<MapPreview stores={stores} userLocation={userLocation} />);

  expect(screen.getByLabelText('Interactive map centered near Redlands, CA')).toBeOnTheScreen();
  expect((webViewProps?.source as { html: string }).html).toBe(html);
  expect(screen.getByText('Redlands, CA · 1 stores nearby')).toBeOnTheScreen();
});