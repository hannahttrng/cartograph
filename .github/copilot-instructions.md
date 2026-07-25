# Cartograph Project Instructions

Use `README.md` for product behavior, setup details, and public API examples. Keep this file focused on code ownership, cross-file contracts, and the checks required before completing a change.

## Project Stack

- Python 3.11+ backend: FastAPI, Pydantic v2, built-in `sqlite3`, OR-Tools CP-SAT, and ArcGIS SDK contracts.
- TypeScript 6 / React Native 0.85 / Expo 56 frontend with strict type checking.
- Run commands from the repository root in Windows PowerShell unless a command says otherwise.
- SQLite is part of Python's standard library and is intentionally absent from `backend/requirements.txt`.

## Backend Ownership And Flow

- `backend/index.py::create_app()` is the application composition root. Its lifespan initializes the database and stores the database path, optional travel-matrix provider, score policy, and solver settings on `app.state`.
- `backend/controllers.py::router` owns HTTP paths, Pydantic request/response binding, status codes, and domain-to-HTTP error mapping. Keep database and solver implementation details out of controllers.
- `backend/resolvers.py` owns SQLite connections, schema declarations, idempotent migrations, triggers, transactions, row hydration, CRUD, ShoppingList lifecycle transitions, and optimization-catalog loading.
- `backend/route_optimizer.py::optimize_routes()` owns pure CP-SAT model construction, candidate extraction, quantized scoring, proof metadata, and deterministic ranking. It receives a catalog and directed matrix rather than opening the database or calling ArcGIS.
- `backend/arcgis_connector.py` defines validated matrix models and the `ArcGISConnector` / `TravelMatrixProvider` protocols. A provider is injected into `create_app()`; there is no live default network/cache implementation.
- `POST /api/v1/shopping-lists/{id}/route-candidates` loads the saved tags and catalog, obtains matrices through the provider, and runs the optimizer in a worker thread. Its candidates are transient: this endpoint does not insert `routes` rows or mutate ShoppingList status, revision, or route ownership.
- `backend/tools/seed.py` creates deterministic catalog fixtures. `backend/tools/export_csv.py` reads the persisted catalog into stable CSV snapshots.

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
| `backend/route_optimizer.py` | Constructs `RouteTagSelection`, `RouteScoreComponents`, `RouteCandidate`, optimization status, and the final response. |
| `backend/tools/seed.py` | Constructs `StoreCreate`, `ProductCreate`, and `Price`, then persists their database representation. |
| `backend/tests/test_contract.py` | Covers model validation, alias serialization, resolver behavior, and HTTP contracts. |
| `backend/tests/test_arcgis_connector_contract.py` | Uses the shared `Store` model in matrix contract tests. |
| `backend/tests/test_route_optimizer.py` | Uses `Store` and `RouteOptimizationStatus` while testing candidate construction and ranking. |

### Structural Mirrors And Indirect Consumers

- `backend/queries.ts` independently mirrors the HTTP wire interfaces, camelCase fields, enum literals, and runtime invariants. Update both its interfaces and parser functions. It is outside the root `tsconfig.json` include list and requires its own compile command.
- `backend/resolvers.py` repeats contract semantics in SQLite column types, `CHECK` clauses, triggers, migrations, lifecycle SQL, and row-to-model hydration. Pydantic acceptance alone does not make a value database-compatible.
- `backend/tools/export_csv.py`, `backend/tests/test_seed.py`, and `backend/tests/test_export_csv.py` depend on persisted Store, Product, tag, and Price shapes even though they do not import `backend.types` directly.
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

## Contract Invariants

- Display text (Product/Store names, Store addresses, ShoppingList names) is stripped while preserving case. Tags, units, and route-selection tags are stripped and lowercased. Preserve meaningful internal spaces in tags.
- Product tags reject duplicates after normalization. `RouteCreate` collapses duplicate requested tags in first-seen order. ShoppingList tags are an unordered normalized set.
- JSON uses explicit camelCase Pydantic aliases such as `priceHistory`, `currentPrice`, `unitPrice`, `productTags`, `errorCode`, `matchedTagCount`, and proof/timing fields. Use `model_dump(by_alias=True)` for manually serialized API models.
- Price-history dates are unique per Product and model history is chronological. `unitPrice` is computed from package price and quantity; it is not persisted source data. `currentPrice` is a nullable Product-owned `Price`, is absent from history, and is strictly newer than every archived Price. Newer observations atomically archive and replace current; late observations enter history; exact retries are idempotent; same-timestamp conflicts fail; clearing current archives it. Database triggers enforce the direct tuple and prevent route selection of Products without a current price.
- ShoppingList route IDs are unique and ranked best-first. Nonempty routes require `READY`. Tag-changing replacement invalidates owned routes, increments the internal revision, and returns the list to `PENDING`; a name-only patch preserves tags, active state, status, routes, and revision. Computation publish/fail operations must honor the claimed revision.
- Route and RouteCandidate `products`, `selections`, and `productTags` must describe the same one-product-per-tag assignment. Unmatched selections require `PARTIAL_TAG_MATCH`; complete selections require no error code. Candidate selections are tag-sorted, `matchedTagCount` matches them, `productPrice` matches its score component, and total score matches all components at the score quantum.
- Optimization responses contain 1-20 candidates, cannot exceed `requestedLimit`, and cannot claim more proven candidates than returned. `OPTIMAL` proves the full returned list; `FEASIBLE_TIMEOUT` may prove only a prefix.
- ArcGIS matrices preserve supplied Store ID order and direction. Store matrices are `N x N`; current-location matrices are outbound/return `2 x N`. Every null cell requires an in-bounds diagnostic. Do not describe the live ArcGIS provider as implemented.
- CP-SAT requires bounded integer arithmetic. Preserve Decimal `ROUND_HALF_UP` quantization, deterministic tie-breaking, and exact score reconstruction when changing costs or objectives. The established workload is roughly 5-15 requested items; prioritize correctness and stable ranking there before speculative large-scale redesigns.
- Preserve SQLite foreign-key enforcement and transaction boundaries. Schema changes must remain compatible with existing database files.
- Preserve deterministic seeding for the same seed, cutoff, Store, and Product inputs. Do not introduce wall-clock or unseeded randomness into generated prices.

## Deferred Features

Do not present these as complete unless the implementation and tests have actually landed:

- Live ArcGIS geocoding/routing and matrix cache/regeneration provider.
- A scheduled worker that claims pending ShoppingLists and persists ranked Routes.
- Product, Store, or persisted Route CRUD endpoints.
- Direct integration between `backend/queries.ts` and the current React Native API modules.

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
npm run typecheck
```

`npm run typecheck` follows the root `tsconfig.json` and does not compile `backend/queries.ts`; passing one TypeScript check does not replace the other.
