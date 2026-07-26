# Caitlin Time/Distance Matrix

This folder contains Caitlin's ArcGIS directed origin-destination export for 12
catalog Stores plus the Esri demo origin.

Run the converter from the repository root:

```sh
source .venv/bin/activate
python backend/HANNAHTimeDistanceMatrix/convert_matrix.py
```

The converter uses only Python's standard library. It validates all 156
directed off-diagonal pairs, adds zero-valued diagonal cells, and maps ArcGIS
node IDs to current catalog Store IDs by normalized address.

Generated artifacts:

- `route_travel_matrices.json`: matches the existing `RouteTravelMatrices`
  wire shape. It contains a `12 x 12` Store matrix and a `2 x 12` current
  location matrix. Row 0 is Esri-to-Store; row 1 is Store-to-Esri.
- `directed_od_matrix.csv`: complete `13 x 13` audit table, including zero
  diagonals.

The DBF's `Latitude` and `Longitude` columns contain Web Mercator coordinates
despite their names. The converter transforms those values to WGS84 for node
metadata. Route metrics use `Total_Miles` and `Total_TravelTime` directly.

These are integration artifacts only. The backend runtime and optimizer are not
changed to load them automatically.