import csv
from pathlib import Path

import pytest

from backend.resolvers import connect_database, initialize_database
from backend.tools.export_csv import build_parser, export_catalog_to_csv, main


EXPECTED_HEADERS = {
    "tags": ["tag", "default_unit", "default_quantity"],
    "stores": ["id", "name", "address", "latitude", "longitude"],
    "products": [
        "id",
        "name",
        "store_id",
        "unit",
        "current_price_date",
        "current_price",
        "current_price_quantity",
        "current_price_sale",
    ],
    "tag_products": ["tag", "product_id"],
    "product_modifiers": ["product_id", "modifier", "position"],
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
            """
            INSERT INTO tags (tag, default_unit, default_quantity)
            VALUES (?, ?, ?)
            """,
            [
                ("bakery", "loaf", 1),
                ("fresh", "lbs", 1.5),
                ("stone fruit", "lbs", 2),
            ],
        )
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
        connection.execute(
            """
            UPDATE products
            SET current_price_date = 300, current_price = 2.99,
                current_price_quantity = 1, current_price_sale = 0
            WHERE id = 10
            """
        )
        connection.executemany(
            """
            INSERT INTO tag_products (tag, product_id)
            VALUES (?, ?)
            """,
            [("stone fruit", 10), ("fresh", 10), ("bakery", 20)],
        )
        connection.executemany(
            """
            INSERT INTO product_modifiers (product_id, modifier, position)
            VALUES (?, ?, ?)
            """,
            [(10, "ripe", 1), (10, "organic", 0)],
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


def test_export_writes_catalog_csvs_with_stable_rows(tmp_path: Path) -> None:
    database_path = tmp_path / "catalog.db"
    output_directory = tmp_path / "exports"
    _create_catalog_database(database_path)
    output_directory.mkdir()
    (output_directory / "product_tags.csv").write_text(
        "legacy\n", encoding="utf-8"
    )

    stats = export_catalog_to_csv(database_path, output_directory)

    assert {path.name for path in output_directory.iterdir()} == {
        "tags.csv",
        "stores.csv",
        "products.csv",
        "tag_products.csv",
        "product_modifiers.csv",
        "price_history.csv",
    }
    assert stats.row_counts == {
        "tags": 3,
        "stores": 2,
        "products": 2,
        "tag_products": 3,
        "product_modifiers": 2,
        "price_history": 3,
    }
    assert stats.total_rows == 15

    for table_name, expected_headers in EXPECTED_HEADERS.items():
        headers, _ = _read_csv(output_directory / f"{table_name}.csv")
        assert headers == expected_headers

    _, catalog_tags = _read_csv(output_directory / "tags.csv")
    _, stores = _read_csv(output_directory / "stores.csv")
    _, products = _read_csv(output_directory / "products.csv")
    _, tag_products = _read_csv(output_directory / "tag_products.csv")
    _, modifiers = _read_csv(output_directory / "product_modifiers.csv")
    _, histories = _read_csv(output_directory / "price_history.csv")

    assert [row["id"] for row in stores] == ["1", "2"]
    assert [row["tag"] for row in catalog_tags] == [
        "bakery",
        "fresh",
        "stone fruit",
    ]
    assert catalog_tags[1] == {
        "tag": "fresh",
        "default_unit": "lbs",
        "default_quantity": "1.5",
    }
    assert stores[0]["name"] == 'Caf\u00e9, "Centro"'
    assert stores[0]["latitude"] == ""
    assert stores[0]["longitude"] == ""
    assert [row["id"] for row in products] == ["10", "20"]
    assert products[0]["current_price_date"] == "300.0"
    assert products[0]["current_price"] == "2.99"
    assert products[0]["current_price_quantity"] == "1.0"
    assert products[0]["current_price_sale"] == "0"
    assert [(row["tag"], row["product_id"]) for row in tag_products] == [
        ("bakery", "20"),
        ("fresh", "10"),
        ("stone fruit", "10"),
    ]
    assert [(row["product_id"], row["modifier"]) for row in modifiers] == [
        ("10", "organic"),
        ("10", "ripe"),
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
    assert "Wrote 15 total rows" in output
    assert str(output_directory.resolve()) in output