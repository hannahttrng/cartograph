# Eric Agent: Backend Integration Handoff

This document is the backend integration guide for the Cartograph demo frontend. ShoppingList Active state and global persisted Route candidates are now integrated; remaining mock boundaries cover auth, nearby Stores/deals, and the separate map prototype.

## 1. Ownership And Merge Boundaries

Eric owns backend contracts, shopping-list persistence, route optimization, route candidate responses, and data services. The frontend should adapt to those contracts.

Treat the global route-calculation/candidate contracts, runtime parsers, and `RoutesScreen` generation checks as one boundary. Update backend models, `backend/queries.ts`, frontend API types/parsers, mocks, and route tests together.

Hannah owns screen state, navigation, loading/error states, mock switching, and presentation components. Lynette's Figma remains the visual source of truth.

## 2. Frontend Integration Surfaces

The new integration-friendly files are:

- `frontend/src/types/demo.ts`: frontend display models for user, location, stores, deals, lists, and route summaries.
- `frontend/src/mock/mockUser.ts`: authenticated-user and current-location placeholder.
- `frontend/src/mock/mockStores.ts`: nearby-store and deal placeholders.
- `frontend/src/mock/mockLists.ts`: structured shopping-list placeholders.
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
| `mockLists` | Shopping-list list/detail endpoint | Home recent activity only; Saved Lists already use backend CRUD and Active state |
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

Saved Lists and Build a List use backend `ShoppingListResponse` values with structured items and Active state. Device-local favorites, archives, collections, and legacy ShoppingList metadata hydration have been removed.

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

## 7. Global Route Results Protection

`RoutesScreen` consumes parsed `RouteCalculationResponse` and enriched
`RouteCandidatesResponse` values directly. Preserve server rank, generation
equality checks, polling only while work is current, partial-match rendering,
and explicit loading/failed/retry/empty states. The separate ArcGIS map demo is
not a fallback for persisted candidates.

## 8. TODO(ERIC) Inventory

The explicit integration markers are:

- `frontend/src/mock/mockUser.ts`: authenticated profile and location.
- `frontend/src/mock/mockStores.ts`: nearby stores and deals.
- `frontend/src/mock/mockLists.ts`: shopping lists.
- `frontend/src/components/map/MapPreview.tsx`: real location and store coordinates.
- `frontend/src/services/auth/AuthService.ts`: live authentication and session persistence.

Resolve a marker only when its live implementation, error handling, loading behavior, and mock fallback are all available.

## 9. Recommended Integration Order

1. Keep `EXPO_PUBLIC_USE_MOCK_DATA=true` as the known-good demo path.
2. Implement live auth behind `AuthServiceContract`.
3. Add a profile/location hook that returns the `DemoUser`-compatible view model.
4. Add a nearby-store adapter that enriches backend stores with distance/deal display fields.
5. Switch Home, Nearby Stores, and Nearby Deals through a mock-or-live service selector.
6. Keep backend ShoppingLists authoritative for names, items, and Active state.
7. Preserve the integrated global Routes contract while replacing unrelated mocks.
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
- Routes polls global calculation status and fetches only matching-generation candidates.
- Turning the backend off leaves the configured mock demo path functional.
- No backend file or route contract is changed solely to satisfy frontend presentation.
