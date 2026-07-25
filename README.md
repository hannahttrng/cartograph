# Cartograph

ESRI 2026 Intern Hackathon project.

## React Native Frontend Structure

```text
cartography/
├── assets/
│   ├── icons/
│   └── images/
├── src/
│   ├── api/
│   ├── components/
│   │   ├── ai/
│   │   ├── common/
│   │   ├── list/
│   │   └── route/
│   ├── constants/
│   ├── hooks/
│   ├── navigation/
│   ├── screens/
│   ├── types/
│   └── utils/
├── tests/
└── README.md
```

## Backend

The backend scaffold uses Python FastAPI, Pydantic, and SQLite. The React Native
client contract is written in TypeScript.

### Setup

Python 3.11 or newer is required.

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.index:app --reload
```

The API is available at `http://127.0.0.1:8000`. Useful initial endpoints are:

- Health: `GET http://127.0.0.1:8000/api/v1/health`
- Shopping Lists: `GET http://127.0.0.1:8000/api/v1/shopping-lists`
- OpenAPI UI: `http://127.0.0.1:8000/docs`

By default, startup creates `cartograph.db` in the repository root. Override
the location before starting the server when needed:

```powershell
$env:CARTOGRAPH_DB_PATH = "C:\data\cartograph.db"
```

### Product pricing

Product and Store names and Store addresses are display text: surrounding
whitespace is stripped while capitalization is preserved. Whitespace-only
values are rejected. Other normalized text fields, including tags, units, and
Route request tags, are stripped and converted to lowercase. Internal spaces in
multiword tags are preserved.

`Price` is the shared value shape used by Product pricing. Every Price contains a
nonnegative floating-point package `price`, a positive finite floating-point
`quantity`, a Boolean `sale` flag, and a `date` expressed as a UTC Unix timestamp
in seconds. Its floating-point `unitPrice` is computed as `price / quantity`; it
is returned by the API but is not stored or accepted as source data. Duplicate
dates in one Product's chronological `priceHistory` list are rejected.

The Product `currentPrice` field owns the newest known Price directly, or is
`null`. The current Price is not also present in `priceHistory`: every history
date must be strictly earlier. Recording a newer Price atomically archives the
old current Price and replaces it. Late observations are added directly to
history, exact retries are no-ops, and conflicting values at one timestamp are
rejected. Clearing a current Price atomically archives it before setting the
Product field to `null`.

The future price-scraping cleanup job must clear `currentPrice` when no Price has
been observed within the previous seven days; having older history does not
imply that a current Price exists. SQLite stores the complete current tuple on
`products` and archived Prices in `price_history`. Database checks and triggers
enforce complete nullable tuples and strict timestamp ordering. A Product with
no current Price cannot be added to a Route. `unitPrice` remains derived.

### Route contract

`RouteCreate` represents shopping intent rather than a client-computed route:

```json
{
	"tags": ["milk", "ground beef", "fruit"]
}
```

Tags are stripped, converted to lowercase, and duplicates are collapsed in
first-seen order. Route optimization considers only Products whose
`currentPrice` is non-null, assign distinct eligible Products to as many
requested tags as possible, derive their stores, order the store visits, and
calculate route metrics.

A `Route` response includes:

- `stores`: unique store IDs in computed visit order.
- `products`: unique product IDs grouped by store visit order, then requested
	tag order within each store.
- `productTags`: selected product IDs mapped to the requested tag they satisfy.
- `selections`: every requested tag and its selected product, or `null` when
	unmatched.
- `distance`, `time`, and `score`: backend-computed metrics.
- `errorCode`: `PARTIAL_TAG_MATCH` when one or more tags are unmatched.

The SQLite schema persists ordered stores and tag selections as the canonical
relationships. The products list and product-to-tags mapping are derived from
those selections rather than stored redundantly.

### Shopping Lists

A Shopping List stores a display name, an `active` flag, and an unordered set of
normalized tags. New and replacement requests default `active` to `true` when
it is omitted. Create requests may also omit `name`; the backend then assigns
the smallest unused exact name `New List x`, starting with `New List 1`. Custom
names are trimmed while preserving capitalization, may be edited, and do not
need to be unique. An explicitly empty tag set is valid.

```json
{
	"name": "Weekend",
	"tags": ["milk", "ground beef"],
	"active": true
}
```

Responses add server-managed route results and computation status:

```json
{
	"id": 1,
	"name": "Weekend",
	"tags": ["milk", "ground beef"],
	"active": true,
	"routes": [12, 19],
	"status": "READY"
}
```

JSON represents tags as an array, but tag order has no meaning. `routes` is an
ordered list of Route IDs ranked best-first. The supported status values are
`PENDING`, `COMPUTING`, `READY`, and `FAILED`.

The REST operations are:

- `POST /api/v1/shopping-lists`: create a Shopping List.
- `GET /api/v1/shopping-lists`: list Shopping Lists in ID order.
- `GET /api/v1/shopping-lists/{id}`: fetch one Shopping List.
- `PUT /api/v1/shopping-lists/{id}`: replace its name, tags, and active flag.
- `PATCH /api/v1/shopping-lists/{id}/name`: update only its display name.
- `POST /api/v1/shopping-lists/{id}/route-candidates`: optimize its tags from
	a supplied current location.
- `DELETE /api/v1/shopping-lists/{id}`: delete it and its owned Routes.

Changing only a name through the dedicated endpoint preserves active state,
tags, status, Route results, and the internal revision. Changing tags through
PUT invalidates owned Routes, increments the revision, and returns the Shopping
List to `PENDING`. Future route-computation workers claim pending lists,
publish ranked Route IDs, or mark computations failed through resolver helpers.
Completion is guarded by the claimed revision so stale work cannot be attached
after a newer tag update. Scheduling and route computation are not implemented
by the CRUD API.

SQLite stores Shopping Lists, their unordered tags, and their ranked Route
ownership in `shopping_lists`, `shopping_list_tags`, and
`shopping_list_routes`. A Route can be owned by at most one Shopping List;
standalone Routes remain supported.

### Route optimization

The route-candidate endpoint accepts WGS84 latitude/longitude and an optional
result limit. The limit defaults to 10 and must be between 1 and 20:

```json
{
	"latitude": 34.0556,
	"longitude": -117.1825,
	"limit": 10
}
```

The optimizer loads the saved Shopping List's normalized tags and all matching
Products with a current package price. Version 1 supports at most 50 unique
tags and 10 candidate Stores. One tag represents one package, each Product may
satisfy at most one tag, and quantities and unit conversion are not modeled.

OR-Tools CP-SAT jointly chooses tag-to-Product assignments, the visited Store
set, and a directed round trip that starts and ends at the input location. The
location is not included in `stores`. Null ArcGIS matrix cells are forbidden
arcs, and matrix direction is preserved.

Candidates are ranked first by matched-tag count descending, then by this
lower-is-better dollar-equivalent score:

```text
package price + (0.70 * miles) + (20.00 * driving hours) + (2.50 * stores)
```

Package prices are rounded half-up to cents, distance to 0.001 mile, and
driving time to 0.01 minute before exact integer scoring. `scoreComponents`
returns product, distance, time, and Store costs using the same arithmetic.
Complete candidates always precede partial candidates; partial selections use
`PARTIAL_TAG_MATCH`. Product substitutions are separate candidates, capped at
three candidates for an identical ordered Store sequence.

An `OPTIMAL` response proves every returned rank. `FEASIBLE_TIMEOUT` returns
the deterministic best-known list when the server deadline expires;
`provenPrefixCount` identifies the leading candidates whose ranks were proven.
Empty lists and zero eligible Products return `NO_ELIGIBLE_PRODUCTS`. Matrix
and solver failures use typed `MATRIX_UNAVAILABLE` and `OPTIMIZATION_FAILED`
errors.

Route candidates are transient: optimization does not insert `routes` rows or
change Shopping List status, revision, or existing Route ownership. The app
receives a `TravelMatrixProvider` through `create_app`; that provider owns
preloaded matrix lookup and synchronous ArcGIS regeneration. The concrete
network/cache provider remains outside this implementation.

### ArcGIS matrix contract

`backend.arcgis_connector` defines the internal boundary for ArcGIS geocoding
and driving metrics. It does not expose HTTP endpoints or make live ArcGIS
requests yet.

`ArcGISConnector.get_store_travel_matrix` accepts Stores and returns a strict
directional `N x N` matrix. Store IDs retain input order and label both axes:
rows are origins and columns are destinations. A cell therefore describes the
trip from `storeIds[row]` to `storeIds[column]`; reverse trips are independent.
Diagonal cells contain zero miles and zero minutes.

`ArcGISConnector.get_location_travel_matrix` accepts an
`arcgis.geometry.Point` with an explicit spatial reference and returns a strict
`2 x N` matrix. Row 0 contains current-location-to-Store trips and row 1
contains Store-to-current-location trips. Columns follow `storeIds` input order
and the result contains no Store-to-Store cells.

Every successful cell atomically contains `distanceMiles` and
`travelTimeMinutes`. A geocoding, unreachable-route, or ArcGIS service failure
leaves the affected cell null and adds a diagnostic identifying its zero-based
row and column. This preserves matrix dimensions during partial failures.
Store addresses are geocoded at the future connector boundary; this phase does
not persist coordinates or change the SQLite schema.

### Project layout

- `backend/index.py`: FastAPI application factory and startup lifecycle.
- `backend/types.py`: Pydantic API contracts.
- `backend/resolvers.py`: SQLite schema and resolver protocols.
- `backend/arcgis_connector.py`: internal ArcGIS travel-matrix contracts.
- `backend/route_optimizer.py`: deterministic CP-SAT route optimization.
- `backend/controllers.py`: versioned HTTP routes.
- `backend/queries.ts`: React Native API types and client helpers.
- `backend/tools/seed.py`: deterministic grocery catalog and price-history seeder.
- `backend/tools/export_csv.py`: read-only catalog CSV exporter.
- `export-catalog.ps1`: path-safe PowerShell launcher for CSV exports.

### Seed data

Seed the configured database using the current date as the history cutoff:

```powershell
python -m backend.tools.seed
```

Use a fixed cutoff for reproducible data. For this cutoff, observations run on
Monday and Thursday for 156 complete weeks and end on Thursday, July 23, 2026:

```powershell
python -m backend.tools.seed --as-of 2026-07-24 --seed 2026
```

The command refuses to mix seed data with existing Stores, Products, Routes, or
PriceHistories. Explicitly replace existing domain data when appropriate:

```powershell
python -m backend.tools.seed --reset --as-of 2026-07-24
```

`--database PATH` overrides `CARTOGRAPH_DB_PATH`. A completed run creates:

- 10 Redlands grocery stores.
- 40 Products per store and 400 Product rows total.
- 20 universal product concepts available at all stores.
- 60 limited-availability concepts stocked by between 1 and 5 stores, balanced
	so each store receives 20 of them.
- Explicit multiword tags such as `honeycrisp apple` and `ground beef`, stored
	as single tag values.
- 311 archived Prices per Product, or 124,400 `price_history` rows total.
- One Product-owned `currentPrice` containing the final generated observation,
	for 124,800 generated Prices across current values and history.

Generated prices are deterministic for the same seed, cutoff, Product, and
Store. They include small weekly and per-Store differences, occasional
promotions labeled with `sale: true`, and seasonal curves for relevant produce.
Honeycrisp Apples follow the documented `lbs`/quantity `1.0` contract and are
least expensive around the fall harvest.

### CSV export

Export the catalog and pricing tables without installing the SQLite command-line
tool. The PowerShell launcher finds the project database and Python environment
even when it is called from another working directory:

```powershell
.\export-catalog.ps1
```

The command replaces four snapshots in `exports/`: `stores.csv`,
`products.csv`, `product_tags.csv`, and `price_history.csv`. Route tables are
not included. Override either path when needed; quoted paths with spaces are
supported:

```powershell
.\export-catalog.ps1 `
	-Database "C:\data\Cartograph DB\cartograph.db" `
	-OutputDirectory "C:\exports\Cartograph"
```

The exporter can also be called directly from the repository root. It uses only
Python standard-library modules:

```powershell
python -m backend.tools.export_csv `
	--database ".\cartograph.db" `
	--output ".\exports"
```

A missing database path fails without creating an empty SQLite database.

### Validation

```powershell
python -m pytest backend/tests/test_export_csv.py -q
python -m pytest backend/tests/test_contract.py -q
python -m pytest backend/tests/test_seed.py -q
npx --yes --package typescript tsc --noEmit --strict --target ES2020 --module ES2020 --lib ES2020,DOM backend/queries.ts
```

This backend implements database initialization, health checks, Shopping List
CRUD, matrix contracts, and on-demand ranked route optimization. Product,
Store, and persisted Route CRUD, `createRoute`, and the concrete live ArcGIS
network/cache provider remain future work.
