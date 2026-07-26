"""Export catalog and pricing tables from SQLite to CSV files."""

from __future__ import annotations

import argparse
import csv
import os
import sqlite3
import sys
from dataclasses import dataclass
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "cartograph.db"
DEFAULT_OUTPUT_DIRECTORY = PROJECT_ROOT / "exports"

EXPORT_QUERIES = {
    "tags": "SELECT * FROM tags ORDER BY tag",
    "stores": "SELECT * FROM stores ORDER BY id",
    "products": "SELECT * FROM products ORDER BY id",
    "tag_products": "SELECT * FROM tag_products ORDER BY tag, product_id",
    "product_modifiers": (
        "SELECT * FROM product_modifiers ORDER BY product_id, position"
    ),
    "price_history": "SELECT * FROM price_history ORDER BY product_id, date",
}

LEGACY_EXPORT_FILENAMES = ("product_tags.csv",)


@dataclass(frozen=True, slots=True)
class ExportStats:
    database_path: Path
    output_directory: Path
    row_counts: dict[str, int]

    @property
    def total_rows(self) -> int:
        return sum(self.row_counts.values())


def _resolve_database_path(database_path: str | Path) -> Path:
    resolved_path = Path(database_path).expanduser().resolve()
    if not resolved_path.exists():
        raise FileNotFoundError(f"database not found: {resolved_path}")
    if not resolved_path.is_file():
        raise IsADirectoryError(f"database path is not a file: {resolved_path}")
    return resolved_path


def _open_read_only(database_path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"{database_path.as_uri()}?mode=ro", uri=True)


def _export_table(
    connection: sqlite3.Connection,
    table_name: str,
    output_directory: Path,
) -> int:
    output_path = output_directory / f"{table_name}.csv"
    temporary_path = output_path.with_suffix(".csv.tmp")
    cursor = connection.execute(EXPORT_QUERIES[table_name])
    headers = [column[0] for column in cursor.description]
    row_count = 0

    try:
        with temporary_path.open("w", encoding="utf-8-sig", newline="") as csv_file:
            writer = csv.writer(csv_file)
            writer.writerow(headers)
            for row in cursor:
                writer.writerow(row)
                row_count += 1
        temporary_path.replace(output_path)
    except BaseException:
        temporary_path.unlink(missing_ok=True)
        raise

    return row_count


def export_catalog_to_csv(
    database_path: str | Path,
    output_directory: str | Path,
) -> ExportStats:
    resolved_database_path = _resolve_database_path(database_path)
    resolved_output_directory = Path(output_directory).expanduser().resolve()
    if resolved_output_directory.exists() and not resolved_output_directory.is_dir():
        raise NotADirectoryError(
            f"output path is not a directory: {resolved_output_directory}"
        )
    resolved_output_directory.mkdir(parents=True, exist_ok=True)

    connection = _open_read_only(resolved_database_path)
    try:
        row_counts = {
            table_name: _export_table(
                connection,
                table_name,
                resolved_output_directory,
            )
            for table_name in EXPORT_QUERIES
        }
    finally:
        connection.close()

    for legacy_filename in LEGACY_EXPORT_FILENAMES:
        (resolved_output_directory / legacy_filename).unlink(missing_ok=True)

    return ExportStats(
        database_path=resolved_database_path,
        output_directory=resolved_output_directory,
        row_counts=row_counts,
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(os.getenv("CARTOGRAPH_DB_PATH", str(DEFAULT_DATABASE_PATH))),
        help="SQLite database path (default: CARTOGRAPH_DB_PATH or project database)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=DEFAULT_OUTPUT_DIRECTORY,
        help="directory for CSV files (default: project exports directory)",
    )
    return parser


def main(arguments: list[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    try:
        stats = export_catalog_to_csv(options.database, options.output)
    except (OSError, sqlite3.Error) as error:
        print(f"Export failed: {error}", file=sys.stderr)
        return 1

    print(f"Exported catalog from {stats.database_path}:")
    for table_name, row_count in stats.row_counts.items():
        print(f"  {table_name}: {row_count} rows")
    print(f"Wrote {stats.total_rows} total rows to {stats.output_directory}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())