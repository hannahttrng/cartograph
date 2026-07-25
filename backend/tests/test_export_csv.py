import csv
from pathlib import Path

import pytest

from backend.resolvers import connect_database, initialize_database
from backend.tools.export_csv import build_parser, export_catalog_to_csv, main


EXPECTED_HEADERS = {
    "stores": ["id", "name", "address"],
    "products": ["id", "name", "store_id", "unit", "current_price_date"],
    "product_tags": ["product_id", "tag", "position"],
    "price_history": ["product_id", "date", "price", "quantity", "sale"],
}


def _read_csv(csv_path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with csv_path.open(encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        return list(reader.fieldnames or []), list(reader)


def _create_catalog_database(database_path: Path) -> None:
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.executemany(
            "INSERT INTO stores (id, name, address) VALUES (?, ?, ?)",
            [
                (2, "Second Market", "2 Main St"),
                (1, 'Caf\u00e9, "Centro"', "1 Main St"),
            ],
        )
        connection.executemany(
            """
            INSERT INTO products (id, name, store_id, unit)
            VALUES (?, ?, ?, ?)
            """,
            [
                (20, "Bread", 2, "loaf"),
                (10, "Apples", 1, "lbs"),
            ],
        )
        connection.executemany(
            """
            INSERT INTO product_tags (product_id, tag, position)
            VALUES (?, ?, ?)
            """,
            [(10, "stone fruit", 1), (10, "fresh", 0), (20, "bakery", 0)],
        )
        connection.executemany(
            """
            INSERT INTO price_history (product_id, date, price, quantity, sale)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (10, 200, 2.49, 1, 0),
                (10, 100, 1.99, 1, 1),
                (20, 100, 3.49, 1, 0),
            ],
        )
    finally:
        connection.close()


def test_export_writes_four_catalog_csvs_with_stable_rows(tmp_path: Path) -> None:
    database_path = tmp_path / "catalog.db"
    output_directory = tmp_path / "exports"
    _create_catalog_database(database_path)

    stats = export_catalog_to_csv(database_path, output_directory)

    assert {path.name for path in output_directory.iterdir()} == {
        "stores.csv",
        "products.csv",
        "product_tags.csv",
        "price_history.csv",
    }
    assert stats.row_counts == {
        "stores": 2,
        "products": 2,
        "product_tags": 3,
        "price_history": 3,
    }
    assert stats.total_rows == 10

    for table_name, expected_headers in EXPECTED_HEADERS.items():
        headers, _ = _read_csv(output_directory / f"{table_name}.csv")
        assert headers == expected_headers

    _, stores = _read_csv(output_directory / "stores.csv")
    _, products = _read_csv(output_directory / "products.csv")
    _, tags = _read_csv(output_directory / "product_tags.csv")
    _, histories = _read_csv(output_directory / "price_history.csv")

    assert [row["id"] for row in stores] == ["1", "2"]
    assert stores[0]["name"] == 'Caf\u00e9, "Centro"'
    assert [row["id"] for row in products] == ["10", "20"]
    assert [(row["product_id"], row["tag"]) for row in tags] == [
        ("10", "fresh"),
        ("10", "stone fruit"),
        ("20", "bakery"),
    ]
    assert [(row["product_id"], row["date"]) for row in histories] == [
        ("10", "100.0"),
        ("10", "200.0"),
        ("20", "100.0"),
    ]
    assert [row["sale"] for row in histories] == ["1", "0", "0"]


def test_export_writes_header_only_files_for_empty_tables(tmp_path: Path) -> None:
    database_path = tmp_path / "empty.db"
    output_directory = tmp_path / "exports"
    initialize_database(database_path)

    stats = export_catalog_to_csv(database_path, output_directory)

    assert stats.total_rows == 0
    for table_name, expected_headers in EXPECTED_HEADERS.items():
        headers, rows = _read_csv(output_directory / f"{table_name}.csv")
        assert headers == expected_headers
        assert rows == []


def test_missing_database_is_not_created(tmp_path: Path) -> None:
    database_path = tmp_path / "misspelled.db"
    output_directory = tmp_path / "exports"

    with pytest.raises(FileNotFoundError, match="database not found"):
        export_catalog_to_csv(database_path, output_directory)

    assert not database_path.exists()
    assert not output_directory.exists()


def test_cli_uses_cartograph_database_environment_variable(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "configured.db"
    monkeypatch.setenv("CARTOGRAPH_DB_PATH", str(database_path))

    options = build_parser().parse_args([])

    assert options.database == database_path


def test_cli_reports_per_table_counts(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    database_path = tmp_path / "catalog.db"
    output_directory = tmp_path / "csv files"
    _create_catalog_database(database_path)

    exit_code = main(
        ["--database", str(database_path), "--output", str(output_directory)]
    )

    output = capsys.readouterr().out
    assert exit_code == 0
    assert "stores: 2 rows" in output
    assert "price_history: 3 rows" in output
    assert "Wrote 10 total rows" in output
    assert str(output_directory.resolve()) in output