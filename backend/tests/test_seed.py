from datetime import date, datetime, timezone

import pytest

from backend.resolvers import connect_database
from backend.tools.seed import (
    SPECIALTY_PRODUCTS,
    STORES,
    UNIVERSAL_PRODUCTS,
    WEEKS_OF_HISTORY,
    SeedDataExistsError,
    build_parser,
    generate_price_history,
    observation_dates,
    products_for_store,
    seed_database,
    specialty_store_indices,
)


EXPECTED_MULTIWORD_TAGS = {
    "acorn squash", "anaheim chile", "baby spinach", "bartlett pear",
    "blood orange", "bottled water", "brussels sprout", "butternut squash",
    "carne asada", "chia seed", "chicken drumstick", "cookie butter",
    "corn tortilla", "delicata squash", "fava bean", "greek yogurt",
    "green bean", "green pea", "ground beef", "hass avocado", "hatch chile",
    "heirloom tomato", "honeycrisp apple", "japanese sweet potato",
    "kiwi berry", "meyer lemon", "non dairy", "nut butter", "oat milk",
    "orange juice", "passion fruit", "peanut butter", "potato salad",
    "rainbow chard", "rainier cherry", "red grape", "roma tomato",
    "russet potato", "stone fruit", "sugar snap pea", "sweet corn",
    "sweet potato", "tomato sauce", "tomato soup", "tropical fruit",
    "yellow onion",
}


def test_catalog_has_balanced_product_availability() -> None:
    assert len(STORES) == 10
    assert len(UNIVERSAL_PRODUCTS) == 20
    assert len(SPECIALTY_PRODUCTS) == 60
    assert all(len(products_for_store(store_index)) == 40 for store_index in range(10))
    assert all(
        len(products_for_store(store_index)[20:]) == 20 for store_index in range(10)
    )

    coverage = [
        len(specialty_store_indices(product_index))
        for product_index in range(len(SPECIALTY_PRODUCTS))
    ]
    assert set(coverage) == {1, 2, 3, 4, 5}
    assert all(1 <= store_count <= 5 for store_count in coverage)

    tags = {
        tag
        for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
        for tag in product.tags
    }
    assert {tag for tag in tags if " " in tag} == EXPECTED_MULTIWORD_TAGS


def test_honeycrisp_apples_match_the_product_spec() -> None:
    apples = UNIVERSAL_PRODUCTS[0]

    assert apples.name == "Honeycrisp Apples"
    assert apples.tags == ("honeycrisp apple", "apple", "fruit")
    assert apples.unit == "lbs"
    assert apples.base_price == 1.99
    assert apples.quantity == 1.0


def test_cli_uses_cartograph_database_environment_variable(
    tmp_path: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "configured.db"  # type: ignore[operator]
    monkeypatch.setenv("CARTOGRAPH_DB_PATH", str(database_path))

    options = build_parser().parse_args([])

    assert options.database == database_path


def test_observation_dates_are_twice_weekly_for_156_weeks() -> None:
    observations = observation_dates(date(2026, 7, 24))

    assert len(observations) == WEEKS_OF_HISTORY * 2
    assert observations == tuple(sorted(observations))
    assert {observed_on.weekday() for observed_on in observations} == {0, 3}
    assert observations[-1] == date(2026, 7, 23)


def test_price_history_is_deterministic_and_seasonal() -> None:
    apples = UNIVERSAL_PRODUCTS[0]
    history = generate_price_history(apples, store_index=0, as_of=date(2026, 7, 24))
    repeated = generate_price_history(apples, store_index=0, as_of=date(2026, 7, 24))

    assert history == repeated
    assert len(history) == WEEKS_OF_HISTORY * 2
    assert all(entry.quantity == 1.0 for entry in history)
    assert {entry.sale for entry in history} == {False, True}
    assert [(entry.price, entry.sale) for entry in history[:10]] == [
        (1.89, False),
        (1.68, False),
        (1.68, False),
        (1.67, False),
        (1.69, False),
        (1.69, False),
        (1.49, True),
        (1.71, False),
        (1.70, False),
        (1.71, False),
    ]
    assert sum(entry.sale for entry in history) == 13

    october_prices = [
        entry.price
        for entry in history
        if datetime.fromtimestamp(entry.date, timezone.utc).month == 10
    ]
    april_prices = [
        entry.price
        for entry in history
        if datetime.fromtimestamp(entry.date, timezone.utc).month == 4
    ]
    assert sum(october_prices) / len(october_prices) < sum(april_prices) / len(april_prices)


def test_prices_vary_between_stores() -> None:
    apples = UNIVERSAL_PRODUCTS[0]
    first_store = generate_price_history(apples, 0, date(2026, 7, 24))
    second_store = generate_price_history(apples, 1, date(2026, 7, 24))

    assert [entry.price for entry in first_store] != [
        entry.price for entry in second_store
    ]


def test_seed_database_writes_expected_rows_and_relationships(tmp_path: object) -> None:
    database_path = tmp_path / "seed.db"  # type: ignore[operator]

    stats = seed_database(database_path, as_of=date(2026, 7, 24), seed=1234)

    assert stats.stores == 10
    assert stats.products == 400
    assert stats.price_histories == 124_400

    connection = connect_database(database_path)
    try:
        products_per_store = [
            row["product_count"]
            for row in connection.execute(
                """
                SELECT store_id, COUNT(*) AS product_count
                FROM products GROUP BY store_id ORDER BY store_id
                """
            )
        ]
        store_rows = connection.execute(
            "SELECT name, address FROM stores ORDER BY id"
        ).fetchall()
        product_tag_count = connection.execute(
            "SELECT COUNT(*) FROM product_tags"
        ).fetchone()[0]
        histories_per_product = {
            row["history_count"]
            for row in connection.execute(
                """
                SELECT product_id, COUNT(*) AS history_count
                FROM price_history GROUP BY product_id
                """
            )
        }
        honeycrisp_tags = [
            row["tag"]
            for row in connection.execute(
                """
                SELECT tag FROM product_tags
                WHERE product_id = (
                    SELECT id FROM products
                    WHERE name = 'Honeycrisp Apples' AND store_id = 1
                )
                ORDER BY position
                """
            )
        ]
        ground_beef_tags = [
            row["tag"]
            for row in connection.execute(
                """
                SELECT tag FROM product_tags
                WHERE product_id = (
                    SELECT id FROM products
                    WHERE name = 'Ground Beef 80/20' AND store_id = 1
                )
                ORDER BY position
                """
            )
        ]
        universal_store_counts = {
            row["name"]: row["store_count"]
            for row in connection.execute(
                """
                SELECT name, COUNT(DISTINCT store_id) AS store_count
                FROM products
                WHERE name IN ({})
                GROUP BY name
                """.format(",".join("?" for _ in UNIVERSAL_PRODUCTS)),
                [product.name for product in UNIVERSAL_PRODUCTS],
            )
        }
        specialty_store_counts = [
            row["store_count"]
            for row in connection.execute(
                """
                SELECT name, COUNT(DISTINCT store_id) AS store_count
                FROM products
                WHERE name IN ({})
                GROUP BY name
                """.format(",".join("?" for _ in SPECIALTY_PRODUCTS)),
                [product.name for product in SPECIALTY_PRODUCTS],
            )
        ]
        missing_current_prices = connection.execute(
            "SELECT COUNT(*) FROM products WHERE current_price_date IS NULL"
        ).fetchone()[0]
        latest_observation = connection.execute(
            "SELECT MAX(current_price_date) FROM products"
        ).fetchone()[0]
        honeycrisp_latest_prices = {
            row["current_price"]
            for row in connection.execute(
                """
                SELECT current_price
                FROM products AS product
                WHERE product.name = 'Honeycrisp Apples'
                """
            )
        }
        sale_counts = {
            bool(row["sale"]): row["history_count"]
            for row in connection.execute(
                """
                SELECT sale, COUNT(*) AS history_count
                FROM (
                    SELECT sale FROM price_history
                    UNION ALL
                    SELECT current_price_sale AS sale FROM products
                )
                GROUP BY sale ORDER BY sale
                """
            )
        }
        honeycrisp_sale_history = [
            (row["date"], bool(row["sale"]))
            for row in connection.execute(
                """
                SELECT history.date, history.sale
                FROM products AS product
                JOIN price_history AS history ON history.product_id = product.id
                WHERE product.name = 'Honeycrisp Apples' AND product.store_id = 1
                ORDER BY history.date
                """
            )
        ]
    finally:
        connection.close()

    assert products_per_store == [40] * 10
    assert [(row["name"], row["address"]) for row in store_rows] == [
        (store.name, store.address) for store in STORES
    ]
    assert product_tag_count == 1_207
    assert histories_per_product == {311}
    assert honeycrisp_tags == ["honeycrisp apple", "apple", "fruit"]
    assert ground_beef_tags == ["ground beef", "beef", "meat", "protein"]
    assert set(universal_store_counts.values()) == {10}
    assert len(universal_store_counts) == 20
    assert len(specialty_store_counts) == 60
    assert set(specialty_store_counts) == {1, 2, 3, 4, 5}
    assert missing_current_prices == 0
    assert datetime.fromtimestamp(latest_observation, timezone.utc).date() == date(
        2026, 7, 23
    )
    assert len(honeycrisp_latest_prices) > 1
    assert set(sale_counts) == {False, True}
    assert sum(sale_counts.values()) == 124_800
    expected_honeycrisp_history = generate_price_history(
        UNIVERSAL_PRODUCTS[0],
        store_index=0,
        as_of=date(2026, 7, 24),
        seed=1234,
    )
    assert honeycrisp_sale_history == [
        (entry.date, entry.sale) for entry in expected_honeycrisp_history[:-1]
    ]
    connection = connect_database(database_path)
    try:
        honeycrisp_current = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products
            WHERE name = 'Honeycrisp Apples' AND store_id = 1
            """
        ).fetchone()
    finally:
        connection.close()
    assert dict(honeycrisp_current) == {
        "current_price_date": expected_honeycrisp_history[-1].date,
        "current_price": expected_honeycrisp_history[-1].price,
        "current_price_quantity": expected_honeycrisp_history[-1].quantity,
        "current_price_sale": int(expected_honeycrisp_history[-1].sale),
    }

    with pytest.raises(SeedDataExistsError):
        seed_database(database_path, as_of=date(2026, 7, 24), seed=1234)