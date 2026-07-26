# Map SDK Evaluation

## Implemented

- Padded, animated camera fitting uses the solved route geometry, origin, and
  every resolved Store point. Each new route remounts the WebView by route ID,
  clears prior selection state, solves, and fits the new graphics.
- `Recenter Route` restores the complete optimized route with panel-aware
  bottom padding.
- Route rendering uses a white casing beneath a Cartograph green line for
  contrast across light and dark basemap features.
- Stop graphics are created once and reused:
  - `S` dark-green circle for the start.
  - Light-green `1` marker for the next Store.
  - Green numbered markers for intermediate Stores.
  - `E` green square for the return location.
- Start and return markers use opposite horizontal symbol offsets because the
  demo route starts and ends at the same Esri coordinate.
- Store markers support ArcGIS popups. Tapping a Store enlarges it, applies an
  amber selection outline, centers the camera, and reports the selection to the
  native screen.
- Direction rows are selectable. Selecting a maneuver centers the camera and,
  when ArcGIS exposes direction-line geometry, draws a light-green highlighted
  segment with a white casing.
- Expanding Directions increases map bottom padding and temporarily disables
  direct WebView pointer interaction; collapsing restores interaction.
- Route, stop, and selection graphics use separate persistent layers. Recenter,
  stop selection, and direction selection update or clear existing graphics
  instead of recreating the route.
- Loading, timeout, map failure, route failure, retry, text fallback, and empty
  route states remain explicit.

## ArcGIS Capability Findings

| Capability | SDK support | Cartograph status |
| --- | --- | --- |
| Custom route symbology | Supported with simple-line, CIM, or graphics symbols | Implemented with two reusable line graphics for casing and branded core |
| Padded camera fitting | Supported by `view.padding` and `view.goTo()` | Implemented |
| Direction-step highlighting | Direction geometry is available when returned by RouteLayer | Implemented with a point-centering fallback when line geometry is absent |
| Route segment selection | Supported through graphics hit testing and custom highlight layers | Implemented for native direction selection; direct route-line tapping remains deferred |
| Stop popup and selection | Supported by Graphic popup templates and `view.hitTest()` | Implemented |
| Route animation | No single RouteLayer playback API; requires a custom moving Graphic along the solved polyline | Deferred |
| Camera tracking | Supported through repeated `view.goTo()` or viewpoint updates | Deferred until live location exists |
| Dynamic rerouting | Requires live device location, deviation detection, and repeated route-service solves | Deferred; the app has a fixed demo origin |
| Marker clustering | Supported for FeatureLayer/GeoJSONLayer feature reduction, not directly useful for this 12-stop GraphicsLayer | Not enabled; numbered order must remain individually readable |
| Traffic-aware routing | Requires network-analysis parameters, service privileges, and traffic availability | Deferred; adding a traffic tile alone does not make route calculations traffic-aware |
| Traffic map layer | Available only with appropriate ArcGIS authentication/privileges | Deferred to avoid an unauthorized or misleading demo layer |

## Limitations

- The route solve runs inside an ArcGIS Maps SDK for JavaScript WebView. Native
  controls communicate through a typed injected-command bridge rather than
  direct SDK objects.
- ArcGIS may return a direction point without a corresponding line geometry.
  In that case Cartograph centers on the maneuver but cannot highlight a full
  segment.
- The backend does not persist a route polyline or directions. Geometry remains
  transient and client-owned.
- There is no live device-location stream, so camera tracking and rerouting
  would be simulated rather than operational.
- Hover is not a primary iOS interaction. Stop selection uses tap, popup, size,
  and outline states instead.
- Clustering conflicts with ordered stop numbering at the current maximum of 12
  Stores and would reduce route readability.

## Recommended Next Enhancements

1. **Live location and rerouting**: highest user impact, but requires a real
   location source and route-deviation policy.
2. **Persist or cache solved geometry**: avoids repeat client solves when users
   reopen the same candidate and improves perceived performance.
3. **Traffic-aware route solve**: pass supported traffic parameters into the
   route service after validating API-key privileges and judging requirements.
4. **Direct route-segment tapping**: add route display hit testing and synchronize
   the selected segment with the nearest direction row.
5. **Guided route playback**: animate a dedicated location Graphic and follow it
   with the camera; keep this optional so it does not interfere with inspection.
6. **Incremental route updates**: replace the current route-ID WebView remount
   with an `updateRoute` command if list editing becomes an in-map workflow.