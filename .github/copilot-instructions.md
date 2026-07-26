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
- Keep the frontend type families distinct: `types/api.ts` describes frontend HTTP payloads, `types/models.ts` contains legacy/map UI models, and `types/maps.ts` contains map-view models. Similar names across these files do not make the shapes interchangeable.
- Backend ShoppingLists are authoritative for names, items, and Active state. Device-local favorites, archives, collections, and their former `savedListsStorage` boundary have been removed.
- Shared application state currently consists of local React hooks and typed navigation parameters. Introduce a global state provider only when a concrete cross-screen ownership or synchronization requirement calls for one.

## Frontend Contract Boundaries

- `backend/types.py` remains the backend wire-contract source of truth. `backend/queries.ts` is an independent strict TypeScript mirror with runtime parsers and a `fetch` client, but it is outside the root `tsconfig.json` include list and is not imported by the React Native app.
- `frontend/src/types/api.ts` explicitly mirrors the integrated Tag, ShoppingList, route-calculation, and enriched RouteCandidate wire contracts. `frontend/src/types/models.ts` remains a separate map-era UI model and is not interchangeable with `RouteCandidateResult`.
- `frontend/src/api/lists.ts` and `catalog.ts` call the implemented ShoppingList/Tag endpoints and validate through `shoppingListParsers.ts`. `frontend/src/api/routes.ts` calls the implemented global calculation/candidate endpoints and validates through `routeParsers.ts`; mock and live responses use the same parsers. `maps.ts` remains a separate map adapter.
- `frontend/src/api/assistant.ts` is different: it calls the implemented `/api/v1/assistant/recipe-import` and `/api/v1/assistant/chat` endpoints, does not use `USE_MOCK_DATA`, and uses a 45-second timeout. Those endpoints return `503` when the optional Carter provider is not configured.
- `frontend/src/api/client.ts::ApiError.code` represents Axios or local transport codes; `domainCode` separately preserves backend `errorCode` response data.

## Backend Ownership And Flow

- `backend/index.py::create_app()` is the application composition root. Its lifespan initializes the database, defaults to `DemoTravelMatrixProvider` when no provider is injected, creates `RouteCalculationManager`, recovers interrupted work, and shuts it down cooperatively.
- `backend/controllers.py::router` owns HTTP paths, Pydantic request/response binding, status codes, and domain-to-HTTP error mapping. Keep database and solver implementation details out of controllers.
- `backend/resolvers.py` owns SQLite connections, schema declarations, idempotent migrations, triggers, transactions, row hydration, ShoppingList CRUD/mutation trigger facts, global calculation state, generation-guarded Route persistence, and optimization-catalog loading.
- `backend/route_optimizer.py::optimize_routes()` owns deterministic bounded assignment search, directed Store-sequence planning, quantized scoring, timeout metadata, and candidate ranking. It receives a catalog and directed matrix rather than opening the database or calling ArcGIS.
- `backend/arcgis_connector.py` defines validated matrix models and the `ArcGISConnector` / `TravelMatrixProvider` protocols. `backend/demo_travel_matrix.py` is the deterministic offline default; a live ArcGIS network/cache implementation remains injectable and deferred.
- `backend/shopping_list_aggregation.py` combines every active list by Tag using default-unit conversion from `backend/unit_conversion.py`, summed quantities, and modifier union.
- `backend/route_calculation.py::RouteCalculationManager` owns the one in-process serial worker, cooperative cancellation, fixed Redlands origin, error classification, and startup recovery. SQLite generation checks, not thread cancellation, are the stale-publication guarantee.
- `GET /api/v1/route-calculation`, `POST /api/v1/route-calculation`, and `GET /api/v1/route-candidates` expose the global calculation and persisted enriched candidates. ShoppingLists do not own Route IDs or computation status.
- `backend/tools/seed.py` creates deterministic catalog fixtures. `backend/tools/export_csv.py` reads `tags`, `tag_products`, `product_modifiers`, Product pricing, and Stores into stable CSV snapshots.

Keep dependencies flowing through these boundaries. Inject application dependencies through `create_app()` / `app.state`; do not replace them with mutable module globals.

## `backend/types.py` Contract Map

`backend/types.py` is the Pydantic source of truth for backend API models, aliases, enums, normalization, and cross-field invariants. Before editing it, inspect every applicable row below.

### Direct Python Consumers

| File | Contract dependency |
| --- | --- |
| `backend/arcgis_connector.py` | Reuses `ApiModel`, finite nonnegative numbers, and `Store` in the matrix boundary. |
| `backend/controllers.py` | Binds ShoppingList, Active update, global calculation-status, and enriched candidate HTTP models. |
| `backend/index.py` | Creates the default matrix provider and lifespan-owned calculation manager. |
| `backend/resolvers.py` | Accepts and hydrates Product, Store, ShoppingList, selection, enriched candidate, and global calculation-status models; also mirrors their rules in SQL. |
| `backend/route_optimizer.py` | Constructs `RouteItemSelection`, `RouteScoreComponents`, `RouteCandidate`, optimization status, and the final response. |
| `backend/tools/seed.py` | Constructs `Tag`, `StoreCreate`, `ProductCreate`, and `Price`, then persists their database representation. |
| `backend/tests/test_contract.py` | Covers model validation, alias serialization, resolver behavior, and HTTP contracts. |
| `backend/tests/test_arcgis_connector_contract.py` | Uses the shared `Store` model in matrix contract tests. |
| `backend/tests/test_route_optimizer.py` | Uses `Store` and `RouteOptimizationStatus` while testing candidate construction and ranking. |

### Structural Mirrors And Indirect Consumers

- `backend/queries.ts` independently mirrors the HTTP wire interfaces, camelCase fields, enum literals, and runtime invariants. Update both its interfaces and parser functions. It is outside the root `tsconfig.json` include list and requires its own compile command.
- `backend/resolvers.py` repeats contract semantics in SQLite column types, `CHECK` clauses, triggers, migrations, lifecycle SQL, and row-to-model hydration. Pydantic acceptance alone does not make a value database-compatible.
- `backend/tools/export_csv.py`, `backend/tests/test_seed.py`, and `backend/tests/test_export_csv.py` depend on persisted Store, Product, Tag membership, modifier, and Price shapes even though they do not import every corresponding model directly.
- `README.md` documents public JSON names, persistence rules, ShoppingList/route-calculation lifecycle, matrix semantics, and optimizer behavior. Update it when externally visible behavior changes.
- `frontend/src/types/api.ts`, runtime parsers, mocks, and endpoint modules independently mirror the integrated backend surface; they are not generated from or consumers of `backend/queries.ts`. Update both boundaries together.

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
- `NewShoppingListScreen` is the backend-authoritative create/edit surface. It sends structured `{ tag, modifiers, unit, quantity }` items plus Active state, preserves resolved metadata when editing, and uses POST, focused PATCH, full PUT, and DELETE through `frontend/src/api/lists.ts`.
- Active creates/deletes/transitions and saved item changes on active lists trigger a new global generation. Name-only and inactive item changes do not. `Find Best Route` ensures Active and explicitly starts only when its save did not already trigger work.
- `RoutesScreen` is the sole result surface. It polls calculation status while RUNNING, requires candidate generation equality, preserves server order for Best Overall, and derives stable Cheaper/Closer view sorts from productPrice/distance. It renders enriched Store/Product snapshots without a separate catalog read endpoint.
- Backend calculations use the fixed `34.0556, -117.1825` origin and deterministic demo matrices by default. The frontend still has no live location acquisition flow.
- The backend exposes no map/polyline endpoint. A candidate's Open Map action passes ordered Store names, addresses, nullable coordinates, and estimated metrics to the separate demo-only ArcGIS WebView solve. The client prefers paired coordinates and geocodes only as a per-Store fallback; solved geometry remains transient and client-owned.
- Global Route rows are cleared when a generation starts and atomically repopulated only by that current generation. They have no ShoppingList owner.

## Frontend Implementation Conventions

- Keep navigation type-safe through `RootStackParamList`; do not pass untyped route payloads or duplicate route-name unions in screens.
- Keep request orchestration in event handlers, effects, or focused hooks and HTTP mechanics in `frontend/src/api/`. Screens should consume parsed domain results and `ApiError`, not Axios response objects.
- Follow neighboring styling organization: use `StyleSheet.create`, and retain or introduce a sibling `.styles.ts` file when a screen's styles are substantial. Do not perform unrelated palette or layout rewrites during integration work.
- Preserve the existing safe-area and accessibility baseline: `SafeAreaView`, meaningful roles and labels, `accessibilityState` for selected/busy/disabled controls, polite live regions for progress, and assertive live regions for errors.
- Continue to render explicit loading, empty, unavailable, and retry states. A mock fallback must not silently make a failed live integration appear successful.

## Contract Invariants

- Display text (Product/Store names, Store addresses, ShoppingList names) is stripped while preserving case. Catalog Tags, Product modifiers, units, and route-selection tags are stripped and lowercased. Preserve meaningful internal spaces.
- `Tag.products` contains unique positive Product IDs in ascending order. Tag-to-Product membership is many-to-many and persisted as unordered `(tag, product_id)` rows in `tag_products`; both foreign keys cascade on deletion.
- Product `modifiers` are an ordered, normalized, duplicate-free list persisted in `product_modifiers`. They are independent from catalog membership and unit. `GET /api/v1/tags/{tagId}/modifiers` returns the Tag-wide union regardless of current-price eligibility. Legacy `product_tags` values migrate only to `tag_products`, leaving modifiers empty.
- ShoppingList and Route items preserve ordered unique tags plus normalized modifiers, units, and positive quantities. Optimization requires Tag membership, an exact unit match, and a complete current Price. Each missed requested modifier contributes the configured `$2.50` `modifierPenalty` instead of excluding the Product; requested quantity scales Product cost from the current package price and package quantity.
- Active-list aggregation deduplicates by normalized Tag, converts every quantity to the Tag default unit with contextual Pint rules, sums with Decimal, and unions sorted modifiers. Any incompatible or unknown conversion fails the complete generation with `UNIT_CONVERSION_FAILED`.
- JSON uses explicit camelCase Pydantic aliases such as `priceHistory`, `currentPrice`, `unitPrice`, `errorCode`, `matchedItemCount`, and proof/timing fields. Use `model_dump(by_alias=True)` for manually serialized API models.
- Price-history dates are unique per Product and model history is chronological. `unitPrice` is computed from package price and quantity; it is not persisted source data. `currentPrice` is a nullable Product-owned `Price`, is absent from history, and is strictly newer than every archived Price. Newer observations atomically archive and replace current; late observations enter history; exact retries are idempotent; same-timestamp conflicts fail; clearing current archives it. Database triggers enforce the direct tuple and prevent route selection of Products without a current price.
- ShoppingList responses contain only ID, name, ordered items, and Active state. `route_calculation_state` is the singleton generation/status authority; beginning work clears global Routes, and publish/fail operations must match the current RUNNING generation.
- Legacy `shopping_list_tags` migrate to lexically ordered item snapshots using Tag defaults and empty modifiers. Legacy per-list status/revision/ownership and Routes are removed while ShoppingLists/items/Active values survive. Seed reset clears ShoppingLists before Tags.
- Route and RouteCandidate `products` and `selections` must describe the same one-product-per-item assignment. Unmatched selections require `PARTIAL_ITEM_MATCH`; complete selections require no error code. `matchedItemCount` matches selections, `productPrice` matches its score component, and total score matches product, distance, time, Store, and modifier-penalty components at the score quantum. Persist selected Product modifier snapshots separately from requested selection modifiers.
- Optimization responses contain 1-20 candidates and cannot exceed `requestedLimit`. `OPTIMAL` requires a fully proven list, `HEURISTIC` requires `provenPrefixCount = 0`, and heuristic timeouts emit `FEASIBLE_TIMEOUT` with zero proof.
- ArcGIS matrices preserve supplied Store ID order and direction. Store matrices are `N x N`; current-location matrices are outbound/return `2 x N`. Every null cell requires an in-bounds diagnostic. The offline demo provider is implemented; do not describe a live ArcGIS network/cache provider as implemented.
- Preserve Decimal `ROUND_HALF_UP` quantization, deterministic coverage-first ranking, distinct Product assignments, and exact score reconstruction. Modifier misses must participate in witness adjacency, Product choice, assignment-state pruning, the exact quality oracle, and final score, not only final sorting. Fixed Store sets need a directed feasibility witness so beam pruning cannot incorrectly reject a routable assignment. The optimizer supports 12 Stores; existing 10-Store median targets remain below 1 second for 5-10 items and below 4 seconds for 15-20 items, with separate 12-Store coverage.
- Preserve SQLite foreign-key enforcement and transaction boundaries. Schema changes must remain compatible with existing database files.
- Preserve deterministic seeding for the same seed, cutoff, Store, and Product inputs. Do not introduce wall-clock or unseeded randomness into generated prices.

## Deferred Features

Do not present these as complete unless the implementation and tests have actually landed:

- Live ArcGIS geocoding/routing and matrix cache/regeneration provider.
- Product, Store, or persisted Route CRUD endpoints.
- Direct integration between `backend/queries.ts` and the current React Native API modules.
- Live device-location acquisition for route origin selection.
- A backend map/polyline endpoint or production-owned route rendering. The current frontend adapter performs a demo-only, transient client-side ArcGIS solve and is not connected to persisted global candidates.

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
