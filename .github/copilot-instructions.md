# Cartograph Project Instructions

Use `README.md` for product behavior, setup details, and public API examples. Keep this file focused on code ownership, cross-file contracts, and the checks required before completing a change.

## Project Stack

- Python 3.11+ backend: FastAPI, Pydantic v2, built-in `sqlite3`, deterministic route heuristics, and ArcGIS SDK contracts.
- TypeScript 6 / React Native 0.85 / Expo 56 frontend with strict type checking.
- Run commands from the repository root in Windows PowerShell unless a command says otherwise.
- SQLite is part of Python's standard library and is intentionally absent from `backend/requirements.txt`.

## Frontend Ownership And Flow

- `frontend/App.tsx::App()` is the frontend composition root. It wraps the application in `SafeAreaProvider` and `NavigationContainer`, then renders `RootNavigator`.
- `frontend/src/navigation/RootNavigator.tsx` owns the flat native stack. Primary screens render `frontend/src/components/common/AppBottomNav.tsx`, whose footer destinations are Home, Lists, Stores, Routes, and Carter. `frontend/src/navigation/types.ts` owns the single root parameter list; update the navigator, parameters, footer, and affected callers together.
- `frontend/src/screens/` owns user journeys, local React state, and loading, success, empty, and error rendering. Keep HTTP configuration and endpoint paths in `frontend/src/api/` rather than calling Axios or `fetch` directly from screens.
- `frontend/src/api/client.ts` owns the shared Axios instance, transport-error conversion, timeout defaults, and path-ID encoding. Endpoint modules own live/mock selection and response adaptation; do not create a second HTTP client for a feature.
- `frontend/src/constants/config.ts` owns `API_BASE_URL`, `USE_MOCK_DATA`, and `API_TIMEOUT_MS`. The base URL intentionally excludes `/api/v1`; integrated endpoint modules must use the complete versioned path.
- Keep the frontend type families distinct: `types/api.ts` describes frontend HTTP payloads, `types/models.ts` contains denormalized UI models, `types/maps.ts` contains map-view models, and `types/savedLists.ts` contains device-local persistence models. Similar names across these files do not make the shapes interchangeable.
- `frontend/src/utils/savedListsStorage.ts` is the AsyncStorage boundary for device-local favorites, archive state, and collections keyed by positive backend ShoppingList IDs. Backend ShoppingLists remain authoritative for names and items; screens must not access AsyncStorage directly or treat metadata as server state.
- Shared application state currently consists of local React hooks and typed navigation parameters. Introduce a global state provider only when a concrete cross-screen ownership or synchronization requirement calls for one.

## Frontend Contract Boundaries

- `backend/types.py` remains the backend wire-contract source of truth. `backend/queries.ts` is an independent strict TypeScript mirror with runtime parsers and a `fetch` client, but it is outside the root `tsconfig.json` include list and is not imported by the React Native app.
- `frontend/src/types/api.ts` explicitly mirrors the integrated Tag and ShoppingList wire contracts; route request and map-era payloads remain separate. `frontend/src/types/models.ts` defines UI-only Store, Product, and Route objects with coordinates and nested objects; these are not mirrors of backend entities or RouteCandidates.
- `frontend/src/api/lists.ts` and `catalog.ts` call the implemented `/api/v1/shopping-lists` and `/api/v1/tags` endpoints and runtime-validate both live and mock responses through `shoppingListParsers.ts`. `routes.ts` and `maps.ts` remain mock-era adapters whose live paths are not implemented by FastAPI.
- `frontend/src/api/assistant.ts` is different: it calls the implemented `/api/v1/assistant/recipe-import` and `/api/v1/assistant/chat` endpoints, does not use `USE_MOCK_DATA`, and uses a 45-second timeout. Those endpoints return `503` when the optional Carter provider is not configured.
- `frontend/src/api/client.ts::ApiError.code` represents Axios or local transport codes; `domainCode` separately preserves backend `errorCode` response data.

## Backend Ownership And Flow

- `backend/index.py::create_app()` is the application composition root. Its lifespan initializes the database and stores the database path, optional travel-matrix provider, score policy, and solver settings on `app.state`.
- `backend/controllers.py::router` owns HTTP paths, Pydantic request/response binding, status codes, and domain-to-HTTP error mapping. Keep database and solver implementation details out of controllers.
- `backend/resolvers.py` owns SQLite connections, schema declarations, idempotent migrations, triggers, transactions, row hydration, CRUD, ShoppingList lifecycle transitions, and optimization-catalog loading.
- `backend/route_optimizer.py::optimize_routes()` owns deterministic bounded assignment search, directed Store-sequence planning, quantized scoring, timeout metadata, and candidate ranking. It receives a catalog and directed matrix rather than opening the database or calling ArcGIS.
- `backend/arcgis_connector.py` defines validated matrix models and the `ArcGISConnector` / `TravelMatrixProvider` protocols. A provider is injected into `create_app()`; there is no live default network/cache implementation.
- `POST /api/v1/shopping-lists/{id}/route-candidates` loads the saved items and catalog, obtains matrices through the provider, and runs the optimizer in a worker thread. Its candidates are transient: this endpoint does not insert `routes` rows or mutate ShoppingList status, revision, or route ownership.
- `backend/tools/seed.py` creates deterministic catalog fixtures. `backend/tools/export_csv.py` reads `tags`, `tag_products`, `product_modifiers`, Product pricing, and Stores into stable CSV snapshots.

Keep dependencies flowing through these boundaries. Inject application dependencies through `create_app()` / `app.state`; do not replace them with mutable module globals.

## `backend/types.py` Contract Map

`backend/types.py` is the Pydantic source of truth for backend API models, aliases, enums, normalization, and cross-field invariants. Before editing it, inspect every applicable row below.

### Direct Python Consumers

| File | Contract dependency |
| --- | --- |
| `backend/arcgis_connector.py` | Reuses `ApiModel`, finite nonnegative numbers, and `Store` in the matrix boundary. |
| `backend/controllers.py` | Binds ShoppingList and optimization request/response models and maps `RouteOptimizationErrorCode`. |
| `backend/index.py` | Builds `ApiError` and manually serializes it with aliases. |
| `backend/resolvers.py` | Accepts and hydrates Product, Store, ShoppingList, selection, and status models; also mirrors their rules in SQL. |
| `backend/route_optimizer.py` | Constructs `RouteItemSelection`, `RouteScoreComponents`, `RouteCandidate`, optimization status, and the final response. |
| `backend/tools/seed.py` | Constructs `Tag`, `StoreCreate`, `ProductCreate`, and `Price`, then persists their database representation. |
| `backend/tests/test_contract.py` | Covers model validation, alias serialization, resolver behavior, and HTTP contracts. |
| `backend/tests/test_arcgis_connector_contract.py` | Uses the shared `Store` model in matrix contract tests. |
| `backend/tests/test_route_optimizer.py` | Uses `Store` and `RouteOptimizationStatus` while testing candidate construction and ranking. |

### Structural Mirrors And Indirect Consumers

- `backend/queries.ts` independently mirrors the HTTP wire interfaces, camelCase fields, enum literals, and runtime invariants. Update both its interfaces and parser functions. It is outside the root `tsconfig.json` include list and requires its own compile command.
- `backend/resolvers.py` repeats contract semantics in SQLite column types, `CHECK` clauses, triggers, migrations, lifecycle SQL, and row-to-model hydration. Pydantic acceptance alone does not make a value database-compatible.
- `backend/tools/export_csv.py`, `backend/tests/test_seed.py`, and `backend/tests/test_export_csv.py` depend on persisted Store, Product, Tag membership, modifier, and Price shapes even though they do not import every corresponding model directly.
- `README.md` documents public JSON names, persistence rules, ShoppingList lifecycle, matrix semantics, and optimizer behavior. Update it when externally visible behavior changes.
- `frontend/src/types/api.ts` and `frontend/src/api/client.ts` currently mirror only part of the backend error surface. `frontend/src/types/models.ts`, `frontend/src/api/`, mocks, and screens are a separate placeholder/UI contract, not consumers of `backend/queries.ts`. Reconcile them when the changed endpoint is actually connected to the app; do not assume backend types reach the UI automatically.

## Required API Change Workflow

Never change `backend/types.py` in isolation unless the change is demonstrably validation-only and repository search shows no affected mirror.

1. Classify the change as one or more of: validation/normalization, wire field or alias, persisted shape, enum/lifecycle, or optimizer candidate/score shape.
2. Search for the Python model and field names, camelCase aliases, enum string values, SQL column names, and validation error literals. Search the entire repository, not only Python imports.
3. Update all constructors and consumers: controllers, resolver hydration and writes, optimizer extraction, ArcGIS models, seed/export behavior, and relevant frontend callers.
4. Update `backend/queries.ts` interfaces and runtime parsers together. A TypeScript interface-only edit does not protect runtime responses.
5. For persisted changes, update fresh-schema declarations and add an idempotent migration invoked by `initialize_database()`. Preserve existing databases and test both fresh and representative legacy shapes. Review triggers, foreign keys, cleanup order, and CSV columns.
6. Update focused contract, endpoint, optimizer, seed, and export tests. Assert both accepted output and rejected inconsistent states; include `model_dump(by_alias=True)` assertions for wire changes.
7. Update `README.md` when request/response JSON, lifecycle, persistence, scoring, or implementation status changes.
8. Run the narrowest relevant checks first, then the complete backend and appropriate TypeScript checks listed below.

Typical impact by change type:

- Validation-only: `types.py`, the constructing code if behavior changes, and focused contract tests.
- Wire field/alias: types, controllers/manual serialization, `backend/queries.ts` interface and parser, endpoint tests, connected frontend code, and README.
- Persisted field: all wire work plus resolver schema, migration, reads/writes, seed/export paths, and database tests.
- Enum/lifecycle: Python enum, TypeScript union/parser, SQL `CHECK`/transition logic, controllers, tests, and README.
- Candidate/score structure: types, optimizer construction/ranking, controller response, `backend/queries.ts` parsing, optimizer/API tests, and any candidate rendering. Keep product-assignment variants flat unless all of these layers change together.

## Required Frontend Integration Workflow

Before connecting a React Native flow to a backend endpoint:

1. Verify the implemented method, full `/api/v1/...` path, status codes, and error mapping in `backend/controllers.py`. Inspect the request/response models and aliases in `backend/types.py`, plus the applicable interface and runtime parser in `backend/queries.ts`.
2. Use the shared `frontend/src/api/client.ts::apiClient` and a complete versioned endpoint path. Do not make a URL-only swap while retaining incompatible mock payloads.
3. Add explicit camelCase wire types in `frontend/src/types/api.ts` and validate or adapt the untrusted response at the API boundary. TypeScript interfaces and Axios generic casts alone are not runtime validation; reuse the behavior of the applicable `backend/queries.ts` parser or implement an equivalent frontend parser.
4. Preserve purposeful model boundaries. Convert wire entities into UI view models in an API adapter or utility instead of changing local saved-list, navigation, map, and backend entity shapes into one shared interface.
5. When an endpoint supports mock mode, update `frontend/src/api/mock.ts` to emit the same wire contract and send mock and live responses through the same parser/adapter. A UI-only fixture is not contract-parity evidence.
6. Update `RootStackParamList`, navigation callers, and consuming screens together. Cover loading, success, empty, retryable error, and disabled states, and preserve the established accessibility semantics.
7. Parse backend `{ detail, errorCode? }` errors separately from Axios transport errors. Preserve machine-readable `errorCode` for branching while displaying `detail` to the user.
8. Update focused backend/API tests, frontend checks, and `README.md` examples whenever externally visible behavior changes.

### Current Integration Gaps

Resolve each applicable group as one integration slice rather than hiding it behind casts or fallback data:

- Backend ShoppingList IDs and their contract-parity mock IDs are positive numbers. Fixture route and `Map` navigation IDs remain strings in the separate UI model.
- `NewShoppingListScreen` is the backend-authoritative create/edit surface. It sends structured `{ tag, modifiers, unit, quantity }` items, preserves resolved metadata when editing, and uses POST, name-only PATCH, item-replacement PUT, and DELETE through `frontend/src/api/lists.ts`.
- Route optimization requires `latitude` and `longitude`, but the frontend currently has no location permission, location service, or manual-coordinate input flow.
- RouteOptimizationResponse candidates are already coverage-first and best-first, with lower score preferred after coverage. Preserve server order; the fixture-backed `RoutesScreen` already follows this ordering.
- RouteCandidates contain Store and Product IDs. The backend exposes no Product or Store read endpoint yet, so the current nested UI Route model cannot be hydrated from the live API without an additional catalog contract.
- The backend exposes no map/polyline endpoint and Store persistence has no coordinates. `ArcGISMapAdapter` loads the public `CARTograph_2` Web Map through a WebView; its fallback is built from fixture coordinates.
- On-demand route candidates are transient. Fetching them must not imply that Routes were persisted or that ShoppingList status, revision, or route ownership changed.

## Frontend Implementation Conventions

- Keep navigation type-safe through `RootStackParamList`; do not pass untyped route payloads or duplicate route-name unions in screens.
- Keep request orchestration in event handlers, effects, or focused hooks and HTTP mechanics in `frontend/src/api/`. Screens should consume parsed domain results and `ApiError`, not Axios response objects.
- Follow neighboring styling organization: use `StyleSheet.create`, and retain or introduce a sibling `.styles.ts` file when a screen's styles are substantial. Do not perform unrelated palette or layout rewrites during integration work.
- Preserve the existing safe-area and accessibility baseline: `SafeAreaView`, meaningful roles and labels, `accessibilityState` for selected/busy/disabled controls, polite live regions for progress, and assertive live regions for errors.
- Continue to render explicit loading, empty, unavailable, and retry states. A mock fallback must not silently make a failed live integration appear successful.

## Contract Invariants

- Display text (Product/Store names, Store addresses, ShoppingList names) is stripped while preserving case. Catalog Tags, Product modifiers, units, and route-selection tags are stripped and lowercased. Preserve meaningful internal spaces.
- `Tag.products` contains unique positive Product IDs in ascending order. Tag-to-Product membership is many-to-many and persisted as unordered `(tag, product_id)` rows in `tag_products`; both foreign keys cascade on deletion.
- Product `modifiers` are an ordered, normalized, duplicate-free list persisted in `product_modifiers`. They are independent from catalog membership. Legacy `product_tags` values migrate only to `tag_products`, leaving modifiers empty.
- ShoppingList and Route items preserve ordered unique tags plus normalized modifiers, units, and positive quantities. Optimization requires Tag membership, an exact unit match, and every requested modifier; requested quantity scales Product cost from the current package price and package quantity.
- JSON uses explicit camelCase Pydantic aliases such as `priceHistory`, `currentPrice`, `unitPrice`, `errorCode`, `matchedItemCount`, and proof/timing fields. Use `model_dump(by_alias=True)` for manually serialized API models.
- Price-history dates are unique per Product and model history is chronological. `unitPrice` is computed from package price and quantity; it is not persisted source data. `currentPrice` is a nullable Product-owned `Price`, is absent from history, and is strictly newer than every archived Price. Newer observations atomically archive and replace current; late observations enter history; exact retries are idempotent; same-timestamp conflicts fail; clearing current archives it. Database triggers enforce the direct tuple and prevent route selection of Products without a current price.
- ShoppingList route IDs are unique and ranked best-first. Nonempty routes require `READY`. Item-changing replacement invalidates owned routes, increments the internal revision, and returns the list to `PENDING`; a name-only patch preserves items, active state, status, routes, and revision. Computation publish/fail operations must honor the claimed revision.
- Legacy `shopping_list_tags` migrate to lexically ordered item snapshots using Tag defaults and empty modifiers. Legacy Routes are deleted because their scores cannot satisfy item quantity semantics; former owners return to `PENDING` with one revision increment. Seed reset clears ShoppingLists before Tags.
- Route and RouteCandidate `products` and `selections` must describe the same one-product-per-item assignment. Unmatched selections require `PARTIAL_ITEM_MATCH`; complete selections require no error code. `matchedItemCount` matches selections, `productPrice` matches its score component, and total score matches all components at the score quantum.
- Optimization responses contain 1-20 candidates and cannot exceed `requestedLimit`. `OPTIMAL` requires a fully proven list, `HEURISTIC` requires `provenPrefixCount = 0`, and heuristic timeouts emit `FEASIBLE_TIMEOUT` with zero proof.
- ArcGIS matrices preserve supplied Store ID order and direction. Store matrices are `N x N`; current-location matrices are outbound/return `2 x N`. Every null cell requires an in-bounds diagnostic. Do not describe the live ArcGIS provider as implemented.
- Preserve Decimal `ROUND_HALF_UP` quantization, deterministic coverage-first ranking, distinct Product assignments, and exact score reconstruction. Fixed Store sets need a directed feasibility witness so beam pruning cannot incorrectly reject a routable assignment. Performance checks use 10 Stores, `limit=20`, and median targets below 1 second for 5-10 items and below 4 seconds for 15-20 items.
- Preserve SQLite foreign-key enforcement and transaction boundaries. Schema changes must remain compatible with existing database files.
- Preserve deterministic seeding for the same seed, cutoff, Store, and Product inputs. Do not introduce wall-clock or unseeded randomness into generated prices.

## Deferred Features

Do not present these as complete unless the implementation and tests have actually landed:

- Live ArcGIS geocoding/routing and matrix cache/regeneration provider.
- A scheduled worker that claims pending ShoppingLists and persists ranked Routes.
- Product, Store, or persisted Route CRUD endpoints.
- Direct integration between `backend/queries.ts` and the current React Native API modules.
- Live React Native route-candidate integration, including location acquisition and Product/Store hydration for RouteCandidate rendering.
- A backend map/polyline endpoint and road-following ArcGIS route rendering; the current frontend adapter displays a public, non-route-specific test Web Map.

## Build And Validation

Setup and run the API:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.index:app --reload
```

Run focused backend checks based on the touched boundary:

```powershell
python -m pytest backend/tests/test_contract.py -q
python -m pytest backend/tests/test_arcgis_connector_contract.py -q
python -m pytest backend/tests/test_route_optimizer.py -q
python -m pytest backend/tests/test_route_optimizer_performance.py -q
python -m pytest backend/tests/test_route_optimizer_quality.py -q
python -m pytest backend/tests/test_seed.py -q
python -m pytest backend/tests/test_export_csv.py -q
```

Finish backend changes with:

```powershell
python -m pytest backend/tests -q
```

Compile the standalone backend wire client whenever `backend/queries.ts` or an API contract changes:

```powershell
npx --yes --package typescript tsc --ignoreConfig --noEmit --strict --target ES2020 --module ES2020 --lib ES2020,DOM backend/queries.ts
```

Run the Expo/frontend typecheck separately:

```powershell
npm run test:frontend -- --runInBand
npm run typecheck:tests
npm run typecheck
```

`npm run typecheck` follows the strict root `tsconfig.json` and covers `index.ts`, `frontend/App.tsx`, and `frontend/src/**/*.ts(x)`. It does not compile `backend/queries.ts`; passing one TypeScript check does not replace the other.

There is currently no frontend lint script. Frontend Jest tests use `jest-expo` and React Native Testing Library; the shared ShoppingList JSON fixture is asserted by both pytest and Jest. For frontend behavior changes, also run the app with `npm start` and smoke-test the affected loading, success, empty, and error states. For integration changes, exercise both supported mock behavior and the implemented live backend path; mock-only success does not validate a live integration.
