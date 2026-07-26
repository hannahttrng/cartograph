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
Stores, Routes, and Carter. Account, list editing, and map views remain stack
details. The incoming Monda/SVG visual system is shared across these screens.

The Lists tab calls the implemented `/api/v1/tags` and
`/api/v1/shopping-lists` endpoints. It loads backend Shopping Lists, accepts
only catalog Tags, creates lists, uses name-only PATCH requests when possible,
replaces item drafts with PUT, and deletes server records. Parsed live and mock
responses pass through the same runtime contract checks. Backend Shopping Lists
own list names, items, numeric IDs, and the Active flag. The Lists tab filters
All Lists, Active, and Inactive server records and supports quick Active
updates; the editor exposes the same flag. Each item has a modifier disclosure
that suggests up to four prioritized Product attributes and searches the full
Tag-wide modifier catalog. Selected modifiers are saved with the item as route
preferences. Device-local favorites, archives, and collections have been
removed.

The Routes footer polls `/api/v1/route-calculation` while the global active-list
calculation is running, then reads the matching generation from
`/api/v1/route-candidates`. Each card shows its server rank, Store count,
distance, travel time, and snapshotted Product purchase total; expanding a card
reveals ordered Stores, selected Products, and any unmatched items. Loading,
failed/retry, no-active-list, no-candidate, and populated states are explicit.
Selected Products display badges for stored `on sale` and `in season`
attributes plus requested modifiers that Product fulfilled.
`Best Overall` preserves backend order, while `Cheaper` sorts by snapshotted
purchase total and `Closer` sorts by route distance. Each Route card passes its
ordered Store names, addresses, and nullable coordinates to the separate
client-side ArcGIS map solve.

The route map runs ArcGIS Maps SDK for JavaScript 5.1 inside the existing
WebView. For the demo, it starts and returns at the fixed WGS84 location
`34.0556, -117.1825`, uses each Store's paired coordinates when available, and
geocodes an address only as that Store's fallback. It preserves the selected
Store order and requests a true-shape driving route and directions from the
ArcGIS World Route service. ArcGIS totals replace the optimizer estimates on
the Map screen after the solve, and the ordered maneuvers render in an
accessible native panel below the map.

Create an API key with **Basemaps**, **Geocoding**, and **Routing** privileges,
then set it before starting Expo. The key is intentionally exposed through an
`EXPO_PUBLIC_` variable for this demo and must not be treated as a production
secret. Override the Web Map item or organization portal when those resources
change:

```sh
EXPO_PUBLIC_ARCGIS_API_KEY="YOUR_DEMO_API_KEY" \
EXPO_PUBLIC_ARCGIS_WEB_MAP_ITEM_ID="1114223c46f948c4b17a6ddb8c3e4865" \
EXPO_PUBLIC_ARCGIS_PORTAL_URL="https://intern-hackathon.maps.arcgis.com" \
npm start
```

Expo reads public variables when Metro starts, so restart Metro after changing
the key. The Web Map and referenced layers must be public or otherwise
accessible. A Store geocode failure fails the complete route rather than
dropping or reordering that stop; Cartograph leaves the basemap visible and
offers a route retry. If the WebView or Web Map itself fails, Cartograph offers
retry and external-browser actions and retains the complete
origin/Stores/origin sequence as a text fallback. The external browser action
opens the base Web Map, not the solved route.

For Android WebView rendering diagnosis, enable the native diagnostic viewer
and select the ArcGIS map construction path before restarting Metro:

```sh
EXPO_PUBLIC_ARCGIS_MAP_DIAGNOSTICS=true \
EXPO_PUBLIC_ARCGIS_MAP_SOURCE=webMap \
EXPO_PUBLIC_ARCGIS_MAP_HOST=component \
npm start
```

Use `webMap` or `basemap` for the source and `component` or `mapView` for the
host. The viewer reports bounded runtime, layer, render, hit-test, and screenshot
facts without including the API key. Keep diagnostics disabled during normal
use because screenshot and pixel probes add work after route rendering.

Shopping List mutations schedule the global backend calculation when the active
input set changes. Client-side route geometry and directions remain transient
and are not persisted with backend candidates. Live location acquisition, a
production ArcGIS travel-matrix provider, and backend-driven map geometry
remain deferred; the backend currently uses a deterministic offline Redlands
matrix approximation.

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
Android emulator can reach it through `10.0.2.2`. Limit reload watching to the
backend source directory so dependency or database changes do not restart the
server:

```sh
python -m uvicorn backend.index:app --reload --reload-dir backend --host 0.0.0.0 --port 8000
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
python -m uvicorn backend.index:app --reload --reload-dir backend
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
treats them as weighted preferences. The endpoint remains a Tag-wide catalog
suggestion surface: it is independent of Product units and current-price
eligibility, so a suggested modifier is not a promise that every current route
can fulfill it.

SQLite stores classification membership in unordered `tag_products` rows and
ordered modifiers in `product_modifiers`. On initialization, a legacy
`product_tags` table is migrated into `tag_products`; those values remain
classifications and are not copied into Product modifiers.
`on sale` and `in season` are consumed exactly as stored. Seeding materializes
`on sale`, and the explicit grocery-price postprocessor materializes
`in season`; synchronization with future Price observations belongs to the
future PriceHistory update job rather than Shopping List or route calculation.

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
requested unit, and has a complete current Price. Each requested modifier that
the Product does not contain adds a `$2.50` score penalty rather than excluding
the Product. The item quantity scales its Product cost from the current package
price and package quantity.

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

Responses contain only Shopping List state; route calculation is global:

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
	"active": true
}
```

Item order is preserved. Shopping Lists do not own Route IDs or computation
status.

The REST operations are:

- `POST /api/v1/shopping-lists`: create a Shopping List.
- `GET /api/v1/shopping-lists`: list Shopping Lists in ID order.
- `GET /api/v1/shopping-lists/{id}`: fetch one Shopping List.
- `PUT /api/v1/shopping-lists/{id}`: replace its name, items, and active flag.
- `PATCH /api/v1/shopping-lists/{id}/name`: update only its display name.
- `PATCH /api/v1/shopping-lists/{id}/active`: update only its Active flag.
- `DELETE /api/v1/shopping-lists/{id}`: delete it.
- `GET /api/v1/route-calculation`: read global calculation state.
- `POST /api/v1/route-calculation`: explicitly start a fresh calculation.
- `GET /api/v1/route-candidates`: read the current global ranked Route set.

An active create, active deletion, true Active transition, or saved item change
on an active list starts a new generation. Name-only updates and item changes
that remain inactive do not. Starting atomically clears global Routes. A
single-process worker cooperatively cancels superseded work and publishes only
when its SQLite generation remains current, so stale work cannot replace newer
results. Deactivating the final list succeeds with zero Routes.

SQLite stores Shopping Lists, ordered items, and modifiers independently from
the one global ranked Route set. `route_calculation_state` is a singleton row
containing generation, `IDLE`/`RUNNING`/`SUCCEEDED`/`FAILED` status, counts,
optimizer timing, and typed failure detail. Initialization preserves Lists and
items, removes obsolete per-list status/revision/ownership, and deletes legacy
Routes whose snapshots do not satisfy the global contract.

### Route optimization

All active Shopping List items are combined before optimization. Duplicate tags
use the Tag's default unit, converted quantities are summed, and normalized
modifiers are unioned. Pint handles conversions, including contextual mass or
fluid interpretation for `oz`; incompatible or unknown units fail the complete
generation with `UNIT_CONVERSION_FAILED` rather than dropping an item.

The manager uses the fixed WGS84 Redlands demo origin:

```json
{"latitude": 34.0556, "longitude": -117.1825}
```

`GET /api/v1/route-calculation` returns the current generation and state:

```json
{
	"generation": 4,
	"status": "RUNNING",
	"activeListCount": 2,
	"itemCount": 7,
	"resultCount": 0,
	"optimizerStatus": null,
	"startedAt": 1785051694.0,
	"completedAt": null,
	"elapsedSeconds": null,
	"timeoutSeconds": null,
	"errorCode": null,
	"detail": null
}
```

The optimizer loads current-priced Products owned by each combined catalog Tag.
Version 1 supports at most 50 deduplicated items and 12 candidate Stores.
Eligibility also requires an exact unit match. Requested modifiers are soft
preferences, and each Product may satisfy at most one item.

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
	+ (0.40 * miles) + (8.00 * driving hours) + (1.50 * stores)
	+ (1.50 * missed requested modifiers)
```

Each quantity-scaled Product cost is rounded half-up to cents, distance to
0.001 mile, and driving time to 0.01 minute before exact integer scoring.
`scoreComponents` returns `productPrice`, `distanceCost`, `timeCost`,
`storeCost`, and `modifierPenalty` using the same arithmetic. Coverage remains
the first ranking objective, so a lower-scoring partial route never precedes a
complete route solely because it missed items.
Complete candidates always precede partial candidates; partial selections use
`PARTIAL_ITEM_MATCH`. Candidates are unique by unordered Store ID set. Alternate
Store orders and Product substitutions still participate in optimization, but
only one representative for each Store set is returned. For limits of at least
two, final selection reserves space for the absolute cheapest and shortest runs
among generated candidates whose matched-item count is at least 85% of Best
Overall's matched-item count, rounded up to a whole item. Those Store sets may
displace ordinary Best Overall candidates near the limit. The cheapest eligible
run may replace the normal representative for its Store set. The shortest
eligible run only protects its Store set, whose Best Overall representative is
still returned. The selected candidates remain in Best Overall order. A limit
of one continues to return Best Overall when the cheapest and shortest runs
differ. The response can contain fewer than the requested limit when fewer
unique Store sets are found.

A completed search returns `HEURISTIC` with `provenPrefixCount` set to zero;
the bounded search does not claim global optimality. `FEASIBLE_TIMEOUT` returns
the deterministic best-known list if the 10-second emergency deadline expires,
also with zero proven candidates. `OPTIMAL` remains a backward-compatible wire
value but is not emitted by this optimizer. Zero eligible Products fail the
persisted calculation with `NO_ELIGIBLE_PRODUCTS`. Matrix and optimization
failures use typed `MATRIX_UNAVAILABLE` and `OPTIMIZATION_FAILED` states.

Performance acceptance tests time only `optimize_routes()` after the catalog
and matrix are loaded, with 10 Stores and `limit=20`. Their median targets are
under one second for 5-10 items and under four seconds for 15-20 items; a
12-Store case protects the expanded bound. These are test metrics, not
end-to-end HTTP deadlines.

Candidates are persisted globally with rank, score components, requested
selections, ordered Stores, snapshotted selection prices, and the selected
Products' normalized modifiers. GET responses enrich IDs with Store
names/addresses/coordinates and Product names/units/modifiers, so the frontend
requires no separate Product or Store endpoint. Route cards show stored
`on sale`, stored `in season`, and requested modifiers fulfilled by the selected
Product. Cancellation of the synchronous solver is cooperative; generation
checks are the hard guard that prevents stale publication.

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
Store coordinates are nullable paired fields in SQLite. Seeded addresses have
deterministic Redlands/Highland coordinates, including migration backfills. The
default `DemoTravelMatrixProvider` emits Haversine miles and a fixed 30 MPH time
estimate while preserving the directed matrix shape; missing custom Store
coordinates produce diagnostics. A live ArcGIS network/cache provider remains
outside this implementation and may still be injected through `create_app()`.

### Project layout

- `backend/index.py`: FastAPI application factory and startup lifecycle.
- `backend/types.py`: Pydantic API contracts.
- `backend/resolvers.py`: SQLite schema and resolver protocols.
- `backend/arcgis_connector.py`: internal ArcGIS travel-matrix contracts.
- `backend/route_optimizer.py`: deterministic bounded route heuristic.
- `backend/route_calculation.py`: cancellable global generation manager.
- `backend/shopping_list_aggregation.py`: active-list item combination.
- `backend/unit_conversion.py`: contextual Pint quantity conversion.
- `backend/demo_travel_matrix.py`: deterministic offline matrix provider.
- `backend/controllers.py`: versioned HTTP routes.
- `backend/queries.ts`: React Native API types and client helpers.
- `backend/tools/seed.py`: deterministic grocery catalog and price-history seeder.
- `backend/tools/seed_catalog.py`: curated Product templates and Tag defaults.
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
- Exactly 60 Products per store and 720 Product rows total.
- 10 universal product concepts available at all stores.
- 180 limited-availability concepts stocked by between 1 and 5 stores. Thirty
	concepts appear in each of 1, 2, 3, and 4 stores, and 60 appear in 5 stores;
	the deterministic assignment gives every store exactly 50 limited concepts.
- 286 reusable Tag definitions covering all 2,285 Tag-to-Product memberships,
	with normalized default units and shopping quantities. Common defaults are
	larger than the prior catalog, including 12 eggs, 2 pounds of bananas, 2
	pounds of chicken, and 1.5 pounds of ground beef.
- Ordered Product modifiers such as `origin: washington`, `origin: chile`,
	`brand: barilla`, `in season`, and `on sale`. Honeycrisp origins are balanced
	between Washington, Chile, and no origin. Branded Products draw sparsely from
	two brands; Greek yogurt, orange juice, and peanut butter draw from three.
	These variants are deterministic for the same seed and Store.
	`on sale` matches the current Price's sale flag, and `in season` is derived
	after seeding for Products with configured seasonal curves by fitting each
	complete archived-plus-current price series and comparing the current month
	with the model's low-price months. Seed classifications remain separate Tag
	memberships.
- Explicit multiword tags such as `honeycrisp apple` and `ground beef`, stored
	as single tag values.
- 311 archived Prices per Product, or 223,920 `price_history` rows total.
- One Product-owned `currentPrice` containing the final generated observation,
	for 224,640 generated Prices across current values and history.

Generated prices are deterministic for the same seed, cutoff, Product, and
Store. Explicit Store profiles range from `0.85` for Food 4 Less to `1.15` for
Gerrards, with deterministic Product-level jitter and wider weekly and
observation changes. Each observation has a 3.5% sale chance; a sale reduces
that observation's regular generated price by 15-30%. Seasonal curves remain
for relevant produce. Honeycrisp Apples follow the documented `lbs`/quantity
`1.0` Product contract and are least expensive around the fall harvest.

As a curation reference rather than a hard-coded optimizer target, default
quantities for milk, eggs, bread, bananas, and chicken total about `$23.93` at
their template base prices before Store profiles, temporal variation,
seasonality, or sales. On the development Windows environment, the fixed seed
above takes roughly two minutes because the configured seasonal Products are
classified with Prophet.

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

This backend implements database initialization, Shopping List CRUD and Active
lifecycle, cancellable global route generations, persisted ranked candidates,
matrix contracts, and an offline demo provider. Product/Store CRUD, direct
persisted Route mutation, and a concrete live ArcGIS network/cache provider
remain future work.
