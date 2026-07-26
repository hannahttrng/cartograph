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

## Frontend

Install the Expo dependencies from the repository root:

```sh
cd "/Users/han15121/Library/CloudStorage/OneDrive-Esri/cartography"
npm install
```

Start the Expo development server:

```sh
npm start
```

Copy the tracked environment template before the first run:

```sh
cp .env.example .env
```

For live Carter chat and recipe import, keep `EXPO_PUBLIC_USE_MOCK_DATA=false`,
set the backend-only Carter values described below, start FastAPI, and then
restart Expo with a cleared cache:

```sh
npm start -- --clear
```

Use `EXPO_PUBLIC_USE_MOCK_DATA=true` only for the offline UI demo. Expo reads
its public variables when Metro starts, so changing `.env` requires restarting
Metro. The iOS Simulator can use `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000`.
For a physical phone, replace `localhost` with the development Mac's LAN IP.
Authentication, profile, nearby-store, deal, and Home activity data are still
frontend demo data in both modes; their backend integrations are tracked in
`ERIC_AGENT.md`.

With Xcode and an iOS Simulator installed, build and open the iOS app directly:

```sh
npm run ios
```

Start the FastAPI backend before testing Carter or any live API functionality.
The frontend uses `http://localhost:8000` on iOS and
`http://10.0.2.2:8000` on an Android emulator by default. When running the app
on a physical phone, set the backend to your computer's LAN address before
starting Expo, replacing the example address with your computer's local IP:

```sh
EXPO_PUBLIC_API_BASE_URL="http://192.168.1.50:8000" npm start
```

The phone and computer must be on the same network. For a contract-equivalent
offline Shopping List demo, use mock data instead:

```sh
EXPO_PUBLIC_USE_MOCK_DATA=true npm start
```

### Current frontend prototype

The application uses a flat native stack with a custom footer for Home, Lists,
Stores, Routes, and Carter. Account, list editing, route preview, and map views
remain stack details. The incoming Monda/SVG visual system is shared across
these screens.

The Lists tab calls the implemented `/api/v1/tags` and
`/api/v1/shopping-lists` endpoints. It loads backend Shopping Lists, accepts
only catalog Tags, creates lists, uses name-only PATCH requests when possible,
replaces item drafts with PUT, and deletes server records. Parsed live and mock
responses pass through the same runtime contract checks. Backend Shopping Lists
own list names, items, and numeric IDs. Favorites, archive state, and collection
assignment are optional device-local metadata keyed by those server IDs; they
do not synchronize across devices. Legacy device-local free-text lists are
discarded rather than guessed into catalog Tags.

The Routes footer and the post-save Route Preview render three best-first
candidates adapted from the deterministic milk-and-bread optimizer fixture in
`backend/tests/test_route_optimizer.py`. Each card shows its rank, Store count,
distance, travel time, and Product purchase total; expanding a card reveals the
ordered Stores and assigned Products. Preview labels explicitly distinguish
these fixtures from routes calculated for the user's saved list.

The route map embeds the hackathon ArcGIS Web Map without requiring backend
route geometry. Override the Web Map item or organization portal before
starting Expo when those resources change:

```sh
EXPO_PUBLIC_ARCGIS_WEB_MAP_ITEM_ID="1114223c46f948c4b17a6ddb8c3e4865" \
EXPO_PUBLIC_ARCGIS_PORTAL_URL="https://intern-hackathon.maps.arcgis.com" \
npm start
```

The Web Map and referenced layers must be accessible to the signed-in user or
publicly shared. If the embedded map cannot load, Cartograph offers retry and
external-browser actions and retains the selected fixture's local Store
sequence as a text fallback.

Shopping List CRUD is integrated, but submission does not call route
optimization. The displayed route Store/Product details remain fixture
hydration, and the ArcGIS Web Map is not route-specific geometry. Live
location acquisition, route-candidate integration, route catalog hydration,
and backend-driven map routing remain deferred.

## Backend

The backend scaffold uses Python FastAPI, Pydantic, and SQLite. The React Native
client contract is written in TypeScript.

### Setup

Python 3.11 or newer is required.

On macOS, install Python 3.11 outside the repository with Homebrew, then create
the project virtual environment inside this repository:

```sh
brew install python@3.11
cd "/Users/han15121/Library/CloudStorage/OneDrive-Esri/cartography"
"$(brew --prefix python@3.11)/bin/python3.11" -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
```

On Windows PowerShell:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend/requirements.txt
```

With the virtual environment active, start the server. Bind to `0.0.0.0` so an
Android emulator can reach it through `10.0.2.2`:

```sh
python -m uvicorn backend.index:app --reload --host 0.0.0.0 --port 8000
```

The API is available at `http://127.0.0.1:8000`. Useful initial endpoints are:

- Health: `GET http://127.0.0.1:8000/api/v1/health`
- Tags: `GET http://127.0.0.1:8000/api/v1/tags`
- Shopping Lists: `GET http://127.0.0.1:8000/api/v1/shopping-lists`
- Recipe Import: `POST http://127.0.0.1:8000/api/v1/assistant/recipe-import`
- Carter chat: `POST http://127.0.0.1:8000/api/v1/assistant/chat`
- OpenAPI UI: `http://127.0.0.1:8000/docs`

By default, startup creates `cartograph.db` in the repository root. Override
the location before starting the server when needed:

```powershell
$env:CARTOGRAPH_DB_PATH = "C:\data\cartograph.db"
```

### Azure OpenAI recipe import

Recipe import and Carter chat keep credentials on the backend. Set
`CARTER_API_URL` to the **exact POST inference URL** from the Esri/Azure gateway
documentation or its working curl example. It must include any required path
and query parameters. Never place the Azure key in an Expo environment variable
or commit `.env`.

`.env.example` is the shareable configuration contract. Copy it to `.env`, then
obtain the real `CARTER_API_URL` and `AZURE_OPENAI_API_KEY` from the team's
approved secret-sharing channel. Do not send the key through Git, pull requests,
issues, chat transcripts, screenshots, or an `EXPO_PUBLIC_` variable. Eric needs
the exact gateway URL, API mode, and key; the placeholder values in
`.env.example` are intentionally nonfunctional.

```dotenv
CARTER_API_URL="https://gateway.example.com/complete/inference/path"
AZURE_OPENAI_API_KEY=
# Use responses for OpenAI Responses-shaped payloads, or chat-completions for
# OpenAI Chat Completions-shaped payloads.
CARTER_API_MODE="responses"
```

`AZURE_OPENAI_ENDPOINT` remains supported for compatibility, but it is treated
as the complete inference URL and no path is appended automatically. A `502`
stating that the gateway endpoint was not found means the configured URL is not
the gateway's actual inference endpoint.

On macOS or Linux:

```sh
cp .env.example .env
set -a
source .env
set +a
python -m uvicorn backend.index:app --reload
```

Restart Uvicorn after creating or changing `.env`. A successful configuration
allows `POST /api/v1/assistant/recipe-import`; a `503 Carter is not configured
yet.` response means the server was started without one or both variables.

Verify the live Carter path before starting Expo:

```sh
curl --fail --show-error \
	-H 'Content-Type: application/json' \
	-d '{"message":"I want tacos tonight","messages":[]}' \
	http://127.0.0.1:8000/api/v1/assistant/chat
```

The recipe-import endpoint accepts pasted recipe text or a public recipe URL:

```json
{
	"source": "Tacos with ground beef, corn tortillas, tomatoes, and cilantro",
	"sourceType": "text"
}
```

It returns a title, structured ingredient names, optional quantities and units,
normalized grocery tags, and any warnings. Recipe URLs must resolve to a public
host, return HTML, complete within three redirects, and fit within a 1 MB
response limit. When a URL cannot be read, paste the recipe text instead.

### Carter chat

Carter chat accepts a current `message` plus up to 12 prior `messages` for
short-lived conversational context. Each history item has a `role` of `user` or
`assistant` and a non-empty `content` value. The client owns this transcript;
the backend does not persist chat history.

### Catalog classification and Product modifiers

A `Tag` owns the Product IDs classified under it. The relationship is
many-to-many: one Tag may contain many Products, and one Product may belong to
many Tags. The Tag contract exposes normalized `tag`, `defaultUnit`,
`defaultQuantity`, and a unique `products` list in ascending Product-ID order.
`GET /api/v1/tags` returns every Tag in normalized name order, including Tags
without Products.

`GET /api/v1/tags/{tagId}/modifiers` returns the unique normalized modifiers
attached to any Product classified under that Tag, in alphabetical order. The
`tagId` path value is the normalized string returned in the Tag's `tag` field;
multiword values must be URL-encoded. All classified Products participate,
regardless of current-price eligibility. A known Tag with no modifiers returns
an empty array, while an unknown Tag returns `404 Not Found`.

A Product does not expose its classifications as `tags`. Its independent
`modifiers` list contains ordered, normalized attributes such as `organic` or
`frozen`. Modifiers are stripped, converted to lowercase, and rejected when
blank or duplicated after normalization. They are independent from catalog Tag
membership. Shopping List items may request modifiers, and optimization then
requires each selected Product to contain all of them.

SQLite stores classification membership in unordered `tag_products` rows and
ordered modifiers in `product_modifiers`. On initialization, a legacy
`product_tags` table is migrated into `tag_products`; those values remain
classifications and are not copied into Product modifiers.

### Product pricing

Product and Store names and Store addresses are display text: surrounding
whitespace is stripped while capitalization is preserved. Whitespace-only
values are rejected. Other normalized text fields, including catalog Tags,
Product modifiers, units, and Route request tags, are stripped and converted to
lowercase. Meaningful internal spaces are preserved.

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
	"items": [
		{
			"tag": "milk",
			"modifiers": ["organic"],
			"unit": "gallon",
			"quantity": 1
		}
	]
}
```

Item tags, modifiers, and units are normalized lowercase text. Item tags must
be unique. Route optimization considers only Products whose `currentPrice` is
non-null, assigns distinct eligible Products to as many requested items as
possible, derives their Stores, orders the Store visits, and calculates route
metrics. An eligible Product belongs to the requested Tag, uses the exact
requested unit, and contains every requested modifier. The item quantity scales
its Product cost from the current package price and package quantity.

A `Route` response includes:

- `stores`: unique store IDs in computed visit order.
- `products`: unique product IDs grouped by store visit order, then requested
	item order within each store.
- `selections`: every requested item, including modifiers, unit, and quantity,
	plus its selected Product or `null` when unmatched.
- `distance`, `time`, and `score`: backend-computed metrics.
- `errorCode`: `PARTIAL_ITEM_MATCH` when one or more items are unmatched.

The SQLite schema persists ordered Stores and item selections as the canonical
relationships. The Products list is derived from those selections rather than
stored redundantly.

### Shopping Lists

A Shopping List stores a display name, an `active` flag, and an ordered list of
items with unique normalized tags. New and replacement requests default
`active` to `true` when it is omitted. Create requests may also omit `name`; the
backend then assigns the smallest unused exact name `New List x`, starting with
`New List 1`. Custom names are trimmed while preserving capitalization, may be
edited, and do not need to be unique. An explicitly empty item list is valid.

```json
{
	"name": "Weekend",
	"items": [
		{"tag": "milk"},
		{"tag": "ground beef", "unit": "lbs", "quantity": 1}
	],
	"active": true
}
```

Responses add server-managed route results and computation status:

```json
{
	"id": 1,
	"name": "Weekend",
	"items": [
		{
			"tag": "milk",
			"modifiers": [],
			"unit": "gallon",
			"quantity": 1
		},
		{
			"tag": "ground beef",
			"modifiers": [],
			"unit": "lbs",
			"quantity": 1
		}
	],
	"active": true,
	"routes": [12, 19],
	"status": "READY"
}
```

Item order is preserved. `routes` is an ordered list of Route IDs ranked
best-first. The supported status values are
`PENDING`, `COMPUTING`, `READY`, and `FAILED`.

The REST operations are:

- `POST /api/v1/shopping-lists`: create a Shopping List.
- `GET /api/v1/shopping-lists`: list Shopping Lists in ID order.
- `GET /api/v1/shopping-lists/{id}`: fetch one Shopping List.
- `PUT /api/v1/shopping-lists/{id}`: replace its name, items, and active flag.
- `PATCH /api/v1/shopping-lists/{id}/name`: update only its display name.
- `POST /api/v1/shopping-lists/{id}/route-candidates`: optimize its items from
	a supplied current location.
- `DELETE /api/v1/shopping-lists/{id}`: delete it and its owned Routes.

Changing only a name through the dedicated endpoint preserves active state,
items, status, Route results, and the internal revision. Changing items through
PUT invalidates owned Routes, increments the revision, and returns the Shopping
List to `PENDING`. Future route-computation workers claim pending lists,
publish ranked Route IDs, or mark computations failed through resolver helpers.
Completion is guarded by the claimed revision so stale work cannot be attached
after a newer tag update. Scheduling and route computation are not implemented
by the CRUD API.

SQLite stores Shopping Lists, their ordered items and modifiers, and their
ranked Route ownership in `shopping_lists`, `shopping_list_items`,
`shopping_list_item_modifiers`, and `shopping_list_routes`. A Route can be
owned by at most one Shopping List; standalone Routes remain supported.
Initialization migrates legacy `shopping_list_tags` rows into items using
lexical tag order, each Tag's current default unit and quantity, and no
modifiers. Because legacy Routes were scored as whole packages and lack item
snapshots, initialization deletes them rather than presenting stale scores
under the new contract. Former Route-owning lists return to `PENDING` with one
revision increment; unaffected list states and revisions are preserved.

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

The optimizer loads the saved Shopping List's ordered items and the current-
priced Products owned by each matching catalog Tag. Version 1 supports at most
50 items and 10 candidate Stores. Eligibility also requires an exact unit match
and all requested modifiers. Each Product may satisfy at most one item.

A deterministic bounded beam search generates item-to-Product assignments. A
maximum-cardinality matching witness protects coverage, while bounded directed
Store-sequence search and a fixed-Store-set dynamic-programming witness produce
round trips that start and end at the input location. The location is not
included in `stores`. Null ArcGIS matrix cells are forbidden arcs, and matrix
direction is preserved.

Candidates are ranked first by matched-item count descending, then by this
lower-is-better dollar-equivalent score:

```text
sum(package price / package quantity * requested quantity)
	+ (0.70 * miles) + (20.00 * driving hours) + (2.50 * stores)
```

Each quantity-scaled Product cost is rounded half-up to cents, distance to
0.001 mile, and driving time to 0.01 minute before exact integer scoring.
`scoreComponents` returns product, distance, time, and Store costs using the
same arithmetic.
Complete candidates always precede partial candidates; partial selections use
`PARTIAL_ITEM_MATCH`. Product substitutions are separate candidates, capped at
three candidates for an identical ordered Store sequence.

A completed search returns `HEURISTIC` with `provenPrefixCount` set to zero;
the bounded search does not claim global optimality. `FEASIBLE_TIMEOUT` returns
the deterministic best-known list if the 10-second emergency deadline expires,
also with zero proven candidates. `OPTIMAL` remains a backward-compatible wire
value but is not emitted by this optimizer. Empty lists and zero eligible
Products return `NO_ELIGIBLE_PRODUCTS`. Matrix and optimization failures use
typed `MATRIX_UNAVAILABLE` and `OPTIMIZATION_FAILED` errors.

Performance acceptance tests time only `optimize_routes()` after the catalog
and matrix are loaded, with 10 Stores and `limit=20`. Their median targets are
under one second for 5-10 items and under four seconds for 15-20 items. These
are test metrics, not end-to-end HTTP or matrix-provider deadlines.

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
- `backend/route_optimizer.py`: deterministic bounded route heuristic.
- `backend/controllers.py`: versioned HTTP routes.
- `backend/queries.ts`: React Native API types and client helpers.
- `backend/tools/seed.py`: deterministic grocery catalog and price-history seeder.
- `backend/tools/grocery_prices.py`: Prophet-based price forecasting and seasonal
	Product modifier postprocessing.
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

Reset also deletes Shopping Lists before replacing the Tag catalog so their
item-to-Tag foreign keys cannot retain stale user data or block deterministic
reseeding.

`--database PATH` overrides `CARTOGRAPH_DB_PATH`. A completed run creates:

- 12 Redlands and Highland grocery stores.
- Between 36 and 40 Products per store and 452 Product rows total.
- 21 universal product concepts available at all stores.
- 60 limited-availability concepts stocked by between 1 and 5 stores, balanced
	so each store receives between 15 and 19 of them.
- 140 reusable Tag definitions covering all 1,367 Tag-to-Product memberships,
	with normalized default units and shopping quantities. A few defaults, such
	as 6 eggs for a 12-count package, intentionally differ from store packages.
- Ordered Product modifiers such as `origin: washington`, `origin: chile`,
	`brand: lays`, `in season`, and `on sale`. Honeycrisp origins are balanced
	between Washington, Chile, and no origin. Branded Products draw sparsely from
	two brands; Greek yogurt, orange juice, and peanut butter draw from three.
	These variants are deterministic for the same seed and Store.
	`on sale` matches the current Price's sale flag, and `in season` is derived
	after seeding by fitting each Product's complete archived-plus-current price
	series and comparing the current month with the model's low-price months.
	Seed classifications remain separate Tag memberships.
- Explicit multiword tags such as `honeycrisp apple` and `ground beef`, stored
	as single tag values.
- 311 archived Prices per Product, or 140,572 `price_history` rows total.
- One Product-owned `currentPrice` containing the final generated observation,
	for 141,024 generated Prices across current values and history.

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

The command replaces six snapshots in `exports/`: `tags.csv`, `stores.csv`,
`products.csv`, `tag_products.csv`, `product_modifiers.csv`, and
`price_history.csv`. A successful export removes the obsolete
`product_tags.csv`. Route tables are not included. Override either path when
needed; quoted paths with spaces are supported:

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
npm run test:frontend -- --runInBand
npm run typecheck:tests
npm run typecheck
python -m pytest backend/tests/test_export_csv.py -q
python -m pytest backend/tests/test_contract.py -q
python -m pytest backend/tests/test_seed.py -q
npx --yes --package typescript tsc --ignoreConfig --noEmit --strict --target ES2020 --module ES2020 --lib ES2020,DOM backend/queries.ts
```

This backend implements database initialization, health checks, Shopping List
CRUD, matrix contracts, and on-demand ranked route optimization. Product,
Store, and persisted Route CRUD, `createRoute`, and the concrete live ArcGIS
network/cache provider remain future work.
