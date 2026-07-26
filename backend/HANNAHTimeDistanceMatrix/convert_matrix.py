"""Convert Caitlin's ArcGIS OD-cost DBF into Cartograph matrix artifacts."""

from __future__ import annotations

import argparse
import csv
import json
import math
import sqlite3
import struct
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
DEFAULT_SOURCE = HERE / "TIme_Distance_Matrix.dbf"
DEFAULT_DATABASE = HERE.parent.parent / "cartograph.db"
DEFAULT_JSON = HERE / "route_travel_matrices.json"
DEFAULT_CSV = HERE / "directed_od_matrix.csv"
ESRI_NODE_ID = 13
WEB_MERCATOR_RADIUS = 6_378_137.0


def _read_dbf(path: Path, encoding: str) -> list[dict[str, Any]]:
    with path.open("rb") as source:
        header = source.read(32)
        if len(header) != 32:
            raise ValueError("DBF header is incomplete")
        record_count = struct.unpack("<I", header[4:8])[0]
        header_length = struct.unpack("<H", header[8:10])[0]
        record_length = struct.unpack("<H", header[10:12])[0]
        fields: list[tuple[str, str, int, int]] = []
        while source.tell() < header_length:
            first = source.read(1)
            if first == b"\r":
                break
            descriptor = first + source.read(31)
            name = descriptor[:11].split(b"\0", 1)[0].decode("ascii")
            fields.append(
                (name, chr(descriptor[11]), descriptor[16], descriptor[17])
            )

        source.seek(header_length)
        rows: list[dict[str, Any]] = []
        for _ in range(record_count):
            record = source.read(record_length)
            if len(record) != record_length:
                raise ValueError("DBF record is incomplete")
            if record[:1] == b"*":
                continue
            offset = 1
            row: dict[str, Any] = {}
            for name, field_type, length, decimals in fields:
                text = record[offset : offset + length].decode(
                    encoding, errors="strict"
                ).strip()
                offset += length
                if field_type in {"N", "F"}:
                    row[name] = (
                        None
                        if not text
                        else float(text)
                        if decimals
                        else int(text)
                    )
                else:
                    row[name] = text
            rows.append(row)
    return rows


def _normalize_address(value: str) -> str:
    return " ".join(value.strip().lower().replace("’", "'").split())


def _wgs84(web_mercator_x: float, web_mercator_y: float) -> tuple[float, float]:
    longitude = math.degrees(web_mercator_x / WEB_MERCATOR_RADIUS)
    latitude = math.degrees(
        2 * math.atan(math.exp(web_mercator_y / WEB_MERCATOR_RADIUS))
        - math.pi / 2
    )
    return latitude, longitude


def _catalog_store_ids(database: Path) -> dict[str, int]:
    connection = sqlite3.connect(database)
    try:
        return {
            _normalize_address(address): store_id
            for store_id, address in connection.execute(
                "SELECT id, address FROM stores ORDER BY id"
            )
        }
    finally:
        connection.close()


def convert(
    source_path: Path,
    database_path: Path,
    json_path: Path,
    csv_path: Path,
) -> None:
    encoding_path = source_path.with_suffix(".cpg")
    encoding = encoding_path.read_text(encoding="ascii").strip() or "UTF-8"
    rows = _read_dbf(source_path, encoding)
    if len(rows) != 156:
        raise ValueError(f"expected 156 directed OD rows, found {len(rows)}")

    pair_rows = {
        (int(row["OriginID"]), int(row["Destinatio"])): row for row in rows
    }
    if len(pair_rows) != len(rows):
        raise ValueError("origin/destination pairs must be unique")
    node_ids = tuple(range(1, 14))
    expected_pairs = {
        (origin_id, destination_id)
        for origin_id in node_ids
        for destination_id in node_ids
        if origin_id != destination_id
    }
    if set(pair_rows) != expected_pairs:
        raise ValueError("DBF must contain every directed off-diagonal pair")

    catalog_ids = _catalog_store_ids(database_path)
    nodes: dict[int, dict[str, Any]] = {}
    for node_id in node_ids:
        row = next(row for row in rows if int(row["OriginID"]) == node_id)
        node_name = str(row["Name"]).split(" to ", 1)[0]
        latitude, longitude = _wgs84(
            float(row["Longitude"]), float(row["Latitude"])
        )
        address = str(row["Address"])
        catalog_store_id = (
            None
            if node_id == ESRI_NODE_ID
            else catalog_ids.get(_normalize_address(address))
        )
        if node_id != ESRI_NODE_ID and catalog_store_id is None:
            raise ValueError(f"no catalog Store matches node {node_id}: {address}")
        nodes[node_id] = {
            "matrixNodeId": node_id,
            "catalogStoreId": catalog_store_id,
            "name": node_name,
            "address": address,
            "latitude": round(latitude, 8),
            "longitude": round(longitude, 8),
        }

    store_nodes = sorted(
        (node for node in nodes.values() if node["catalogStoreId"] is not None),
        key=lambda node: int(node["catalogStoreId"]),
    )
    store_ids = [int(node["catalogStoreId"]) for node in store_nodes]
    node_id_by_store_id = {
        int(node["catalogStoreId"]): int(node["matrixNodeId"])
        for node in store_nodes
    }

    def metric(origin_node_id: int, destination_node_id: int) -> dict[str, float]:
        if origin_node_id == destination_node_id:
            return {"distanceMiles": 0.0, "travelTimeMinutes": 0.0}
        row = pair_rows[(origin_node_id, destination_node_id)]
        return {
            "distanceMiles": round(float(row["Total_Mile"]), 6),
            "travelTimeMinutes": round(float(row["Total_Trav"]), 6),
        }

    store_matrix = [
        [
            metric(node_id_by_store_id[origin], node_id_by_store_id[destination])
            for destination in store_ids
        ]
        for origin in store_ids
    ]
    outbound = [
        metric(ESRI_NODE_ID, node_id_by_store_id[store_id])
        for store_id in store_ids
    ]
    returning = [
        metric(node_id_by_store_id[store_id], ESRI_NODE_ID)
        for store_id in store_ids
    ]
    payload = {
        "source": source_path.name,
        "origin": nodes[ESRI_NODE_ID],
        "nodes": [nodes[node_id] for node_id in node_ids],
        "storeMatrix": {
            "storeIds": store_ids,
            "matrix": store_matrix,
            "diagnostics": [],
        },
        "currentLocationMatrix": {
            "storeIds": store_ids,
            "matrix": [outbound, returning],
            "diagnostics": [],
        },
    }
    json_path.write_text(
        json.dumps(payload, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )

    with csv_path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.writer(output)
        writer.writerow(
            [
                "origin_node_id",
                "origin_name",
                "destination_node_id",
                "destination_name",
                "distance_miles",
                "travel_time_minutes",
            ]
        )
        for origin_id in node_ids:
            for destination_id in node_ids:
                values = metric(origin_id, destination_id)
                writer.writerow(
                    [
                        origin_id,
                        nodes[origin_id]["name"],
                        destination_id,
                        nodes[destination_id]["name"],
                        values["distanceMiles"],
                        values["travelTimeMinutes"],
                    ]
                )

    print(
        f"Converted {len(rows)} directed rows into "
        f"{len(store_ids)}x{len(store_ids)} store and 2x{len(store_ids)} location matrices."
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--database", type=Path, default=DEFAULT_DATABASE)
    parser.add_argument("--json", type=Path, default=DEFAULT_JSON)
    parser.add_argument("--csv", type=Path, default=DEFAULT_CSV)
    arguments = parser.parse_args()
    convert(arguments.source, arguments.database, arguments.json, arguments.csv)


if __name__ == "__main__":
    main()