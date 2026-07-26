# Eric Agent: Backend Integration Handoff

This document is the backend integration guide for the Cartograph demo frontend. The refactor intentionally keeps demo data and UI components outside the existing backend client and Route Results implementation so backend work can be merged with minimal conflict.

## 1. Ownership And Merge Boundaries

Eric owns backend contracts, shopping-list persistence, route optimization, route candidate responses, and data services. The frontend should adapt to those contracts.

Do not replace or redesign Eric's route endpoint, optimizer models, `backend/queries.ts`, `frontend/src/api/routes.ts`, or `frontend/src/screens/RouteResultsScreen.tsx` during mock replacement. The new `RouteSummaryAccordion` is intentionally unconnected and can be adopted later.

Hannah owns screen state, navigation, loading/error states, mock switching, and presentation components. Lynette's Figma remains the visual source of truth.

## 2. Frontend Integration Surfaces

The new integration-friendly files are:

- `frontend/src/types/demo.ts`: frontend display models for user, location, stores, deals, lists, and route summaries.
- `frontend/src/mock/mockUser.ts`: authenticated-user and current-location placeholder.
- `frontend/src/mock/mockStores.ts`: nearby-store and deal placeholders.
- `frontend/src/mock/mockLists.ts`: structured shopping-list placeholders.
- `frontend/src/mock/mockRoutes.ts`: isolated route-summary placeholder; not connected to Route Results.
- `frontend/src/services/auth/AuthService.ts`: mock login/register/logout interface.
- `frontend/src/components/map/MapPreview.tsx`: display-only map preview using location and store props.
- `frontend/src/components/store/StoreCard.tsx`: display-only store summary.
- `frontend/src/components/store/StoreAccordion.tsx`: local expansion/reminder state around a store.

The existing Axios API layer remains the preferred home for live requests. Keep API calls out of presentation components.

## 3. Mock-To-Backend Replacement Map

| Mock source | Replace with | Frontend consumers |
| --- | --- | --- |
| `mockUser` | Authenticated profile plus current-location source | Home greeting and map preview |
| `mockStores` | Nearby stores/deals endpoint or composed service response | Home map, Nearby Stores, Nearby Deals |
| `mockLists` | Shopping-list list/detail endpoint | Home recent activity; Saved Lists can continue using its current storage adapter until migrated |
| `mockRoutes` | Optimized route candidate response | No current consumer; coordinate adoption before connecting |
| `AuthService` mock | Backend authentication endpoints and secure session/token storage | Login and Register |

Replace imports at the screen/service boundary. Do not push request logic into `StoreCard`, `StoreAccordion`, `MapPreview`, `ListIcon`, or `GreetingHeader`.

## 4. Expected Field Mappings

### User And Location

Frontend `DemoUser` needs `id`, `name`, and `location`. `UserLocation` needs numeric `latitude`, numeric `longitude`, and a display `label`.

If authentication and geolocation arrive separately, compose them in a hook or service before passing them to Home. Preserve the fallback:

```ts
const displayName = currentUser?.name ?? 'User';
```

### Store And Deals

Frontend `DemoStore` expects `id`, `name`, `address`, `distance`, `estimatedSavings`, `latitude`, `longitude`, `logoName`, and `deals`.

The current backend `Store` shape already supplies name, address, latitude, and longitude. Distance, savings, logo identity, and deal summaries may require a view-model adapter. Keep money numeric in the adapter; components format it for display.

### Shopping Lists

The demo list model includes structured `quantity` and `unit`, but current route navigation still sends only product names:

```ts
items.map((item) => item.name)
```

`SavedShoppingListItem.quantity`, `unit`, and `checked` are optional for backward-compatible AsyncStorage hydration. A backend migration does not need to happen before the UI can read older records.

## 5. Authentication Integration

`AuthServiceContract` exposes:

```ts
login(input: LoginInput): Promise<AuthUser>
register(input: RegisterInput): Promise<AuthUser>
logout(): Promise<void>
```

Implement the same contract with Axios so Login and Register require minimal screen changes. The mock currently persists a demo profile in AsyncStorage and does not model tokens, refresh, password policy, or server validation.

For live auth:

1. Add the endpoint implementation in the service/API layer.
2. Store credentials or tokens using the agreed secure mechanism, not plain AsyncStorage.
3. Translate backend errors into screen-safe messages.
4. Add session restoration before changing the navigator's initial route.
5. Keep the demo/mock implementation available behind configuration for judging reliability.

## 6. Nearby Store And Map Integration

`MapPreview` is intentionally display-only. It accepts `stores`, `userLocation`, and `onPress`; it must not fetch data.

The current preview marker positions are illustrative. When live coordinates are available, either:

- replace the static preview with the ArcGIS map component, or
- project coordinates into preview bounds in a dedicated map adapter.

Do not make map availability block store lists. Nearby Stores and Nearby Deals already render useful distance, savings, address, and deal information without ArcGIS.

## 7. Route Results Protection

The frontend refactor does not connect `mockRoutes` or `RouteSummaryAccordion` to Route Results. Eric can continue changing route calculation and candidate rendering independently.

Before adopting the summary accordion:

1. Confirm the final candidate response and score semantics.
2. Add an adapter from the backend route candidate to `DemoRouteSummary`, or replace that demo type with the accepted API type.
3. Preserve existing navigation params until all callers migrate together.
4. Validate loading, partial-match, timeout, and API-error states.
5. Remove `mockRoutes` only after the live path has an offline fallback.

## 8. TODO(ERIC) Inventory

The explicit integration markers are:

- `frontend/src/mock/mockUser.ts`: authenticated profile and location.
- `frontend/src/mock/mockStores.ts`: nearby stores and deals.
- `frontend/src/mock/mockLists.ts`: shopping lists.
- `frontend/src/mock/mockRoutes.ts`: optimized route candidates.
- `frontend/src/components/map/MapPreview.tsx`: real location and store coordinates.
- `frontend/src/services/auth/AuthService.ts`: live authentication and session persistence.

Resolve a marker only when its live implementation, error handling, loading behavior, and mock fallback are all available.

## 9. Recommended Integration Order

1. Keep `EXPO_PUBLIC_USE_MOCK_DATA=true` as the known-good demo path.
2. Implement live auth behind `AuthServiceContract`.
3. Add a profile/location hook that returns the `DemoUser`-compatible view model.
4. Add a nearby-store adapter that enriches backend stores with distance/deal display fields.
5. Switch Home, Nearby Stores, and Nearby Deals through a mock-or-live service selector.
6. Connect shopping-list persistence without changing the route item-name projection in the same commit.
7. Integrate Route Results separately after Eric's candidate contract is stable.
8. Remove individual mocks only after live and failure-path testing succeeds.

Keeping each integration step narrow avoids shared edits to screens and route code in one merge.

## 10. Validation And Demo Checklist

Run from the repository root:

```sh
npm run typecheck
```

For backend contract changes, also run the focused backend tests and the full backend suite described in `.github/copilot-instructions.md`. Compile `backend/queries.ts` separately whenever its wire contract changes.

Before demo handoff, verify:

- Login and Register reach Home in mock mode.
- Home greeting uses a fallback when the profile is absent.
- Home search opens Build a List with the entered item.
- Nearby Deals expands every store and reminder controls respond.
- Nearby Stores and Map remain useful without live ArcGIS.
- Saved Lists display distinct icons and aligned disclosure arrows.
- Build a List checkboxes, quantities, units, saving, and route navigation work.
- Route Results still consumes its existing item payload and API path.
- Turning the backend off leaves the configured mock demo path functional.
- No backend file or route contract is changed solely to satisfy frontend presentation.
