import asyncio
from collections import Counter
from datetime import date, datetime, timezone
from random import Random
from statistics import mean, pstdev

import pytest

from backend.demo_travel_matrix import DemoTravelMatrixProvider
from backend.resolvers import (
    connect_database,
    initialize_database,
    load_optimization_catalog,
    transaction,
)
from backend.route_calculation import FIXED_REDLANDS_ORIGIN
from backend.route_optimizer import DirectedTravelMatrix, optimize_routes
from backend.tools import grocery_prices
from backend.tools.grocery_prices import IN_SEASON_MODIFIER
from backend.tools.seed import (
    SPECIALTY_PRODUCTS,
    STORES,
    TAGS,
    UNIVERSAL_PRODUCTS,
    WEEKS_OF_HISTORY,
    SeedDataExistsError,
    _clear_domain_data,
    _sale_discount,
    build_parser,
    generate_modifiers,
    generate_price_history,
    observation_dates,
    products_for_store,
    seed_database,
    specialty_store_indices,
)
from backend.types import Price, ShoppingListItem


EXPECTED_MULTIWORD_TAGS = {
    "acorn squash", "anaheim chile", "baby spinach", "bartlett pear",
    "blood orange", "bottled water", "brussels sprout", "butternut squash",
    "carne asada", "chia seed", "chicken drumstick", "cookie butter",
    "corn tortilla", "delicata squash", "fava bean", "greek yogurt",
    "green bean", "green pea", "ground beef", "hass avocado", "hatch chile",
    "heirloom tomato", "honeycrisp apple", "japanese sweet potato",
    "kiwi berry", "meyer lemon", "non dairy", "nut butter", "oat milk",
    "orange juice", "passion fruit", "peanut butter", "potato salad",
    "potato chip", "rainbow chard", "rainier cherry", "red grape", "roma tomato",
    "russet potato", "stone fruit", "sugar snap pea", "sweet corn",
    "sweet potato", "tomato sauce", "tomato soup", "tropical fruit",
    "yellow onion",
}


def test_catalog_has_balanced_product_availability() -> None:
    assert len(STORES) == 12
    assert len(UNIVERSAL_PRODUCTS) == 10
    assert len(SPECIALTY_PRODUCTS) == 180
    assert [
        len(products_for_store(store_index)) for store_index in range(len(STORES))
    ] == [60] * len(STORES)
    assert [
        len(products_for_store(store_index)) - len(UNIVERSAL_PRODUCTS)
        for store_index in range(len(STORES))
    ] == [50] * len(STORES)

    coverage = Counter(
        len(specialty_store_indices(product_index))
        for product_index in range(len(SPECIALTY_PRODUCTS))
    )
    assert coverage == Counter({1: 30, 2: 30, 3: 30, 4: 30, 5: 60})
    assert sum(store_count * count for store_count, count in coverage.items()) == 600

    products = UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
    assert len({product.name for product in products}) == len(products) == 190
    assert all(
        len(set(specialty_store_indices(product_index)))
        == len(specialty_store_indices(product_index))
        for product_index in range(len(SPECIALTY_PRODUCTS))
    )

    tags = {
        tag
        for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
        for tag in product.tag_names
    }
    assert EXPECTED_MULTIWORD_TAGS <= {tag for tag in tags if " " in tag}


def test_tag_catalog_covers_memberships_with_shopping_defaults() -> None:
    catalog = {tag.tag: tag for tag in TAGS}
    tag_names = {
        tag
        for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
        for tag in product.tag_names
    }

    assert len(TAGS) == len(catalog) == len(tag_names)
    assert set(catalog) == tag_names
    assert all(tag.default_unit == tag.default_unit.strip().lower() for tag in TAGS)
    assert all(tag.default_quantity > 0 for tag in TAGS)
    assert (catalog["egg"].default_unit, catalog["egg"].default_quantity) == (
        "count",
        12,
    )
    assert (
        catalog["corn tortilla"].default_unit,
        catalog["corn tortilla"].default_quantity,
    ) == ("count", 18)
    assert (
        catalog["bottled water"].default_unit,
        catalog["bottled water"].default_quantity,
    ) == ("count", 12)
    assert (catalog["banana"].default_unit, catalog["banana"].default_quantity) == (
        "lbs",
        2,
    )
    assert (
        catalog["ground beef"].default_unit,
        catalog["ground beef"].default_quantity,
    ) == ("lbs", 1.5)


def test_honeycrisp_apples_match_the_product_spec() -> None:
    apples = UNIVERSAL_PRODUCTS[0]

    assert apples.name == "Honeycrisp Apples"
    assert apples.tag_names == ("honeycrisp apple", "apple", "fruit")
    assert apples.unit == "lbs"
    assert apples.base_price == 1.99
    assert apples.quantity == 1.0
    assert apples.modifiers == ()
    assert apples.modifier_variants == (
        "origin: washington",
        "origin: chile",
        None,
    )


def test_product_modifiers_vary_deterministically_between_stores() -> None:
    current_price = Price(date=1, price=1, quantity=1, sale=False)
    apples = next(
        product for product in UNIVERSAL_PRODUCTS if product.name == "Honeycrisp Apples"
    )
    apple_modifiers = [
        generate_modifiers(
            apples,
            current_price,
            store_index=store_index,
            seed=1234,
        )
        for store_index in range(len(STORES))
    ]
    apple_origins = [
        next(
            (modifier for modifier in modifiers if modifier.startswith("origin: ")),
            None,
        )
        for modifiers in apple_modifiers
    ]

    assert Counter(apple_origins) == {
        "origin: washington": 4,
        "origin: chile": 4,
        None: 4,
    }

    three_brand_products = {
        "Plain Greek Yogurt",
        "Orange Juice",
        "Creamy Peanut Butter",
    }
    branded_products = [
        product
        for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS
        if any(
            modifier is not None and modifier.startswith("brand: ")
            for modifier in product.modifier_variants
        )
    ]
    for product in branded_products:
        available_store_indices = [
            store_index
            for store_index in range(len(STORES))
            if product in products_for_store(store_index)
        ]
        modifiers_by_store = [
            generate_modifiers(
                product,
                current_price,
                store_index=store_index,
                seed=1234,
            )
            for store_index in available_store_indices
        ]
        configured_brands = {
            modifier
            for modifier in product.modifier_variants
            if modifier is not None and modifier.startswith("brand: ")
        }
        realized_brands = {
            modifier
            for modifiers in modifiers_by_store
            for modifier in modifiers
            if modifier.startswith("brand: ")
        }

        expected_brand_count = 3 if product.name in three_brand_products else 2
        assert len(configured_brands) == expected_brand_count
        assert realized_brands <= configured_brands
        if len(available_store_indices) == len(STORES):
            assert realized_brands == configured_brands
        assert modifiers_by_store == [
            generate_modifiers(
                product,
                current_price,
                store_index=store_index,
                seed=1234,
            )
            for store_index in available_store_indices
        ]


def test_product_modifiers_reflect_static_attributes_and_current_sale() -> None:
    peaches = next(
        product for product in SPECIALTY_PRODUCTS if product.name == "Yellow Peaches"
    )
    current_price = generate_price_history(
        peaches,
        store_index=3,
        as_of=date(2026, 7, 24),
        seed=1234,
    )[-1]

    assert generate_modifiers(peaches, current_price) == (
        () if not current_price.sale else ("on sale",)
    )


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


def test_price_variance_and_sale_behavior_match_the_seed_profile() -> None:
    milk = next(
        product for product in UNIVERSAL_PRODUCTS if product.name == "Whole Milk"
    )
    histories = [
        generate_price_history(milk, store_index, date(2026, 7, 24))
        for store_index in range(len(STORES))
    ]
    regular_means = [
        mean(entry.price for entry in history if not entry.sale)
        for history in histories
    ]
    between_store_spread = max(regular_means) / min(regular_means) - 1
    target_regular_prices = [
        entry.price for entry in histories[4] if not entry.sale
    ]
    target_coefficient_of_variation = (
        pstdev(target_regular_prices) / mean(target_regular_prices)
    )

    observations = [
        entry
        for product in UNIVERSAL_PRODUCTS
        for store_index in range(len(STORES))
        for entry in generate_price_history(product, store_index, date(2026, 7, 24))
    ]
    sale_rate = sum(entry.sale for entry in observations) / len(observations)
    discounts = [_sale_discount(Random(seed), True) for seed in range(100)]

    assert 0.20 <= between_store_spread <= 0.60
    assert 0.02 <= target_coefficient_of_variation <= 0.08
    assert 0.03 <= sale_rate <= 0.04
    assert all(0.15 <= discount <= 0.30 for discount in discounts)
    assert _sale_discount(Random(0), False) == 0


def test_seed_database_writes_expected_rows_and_relationships(
    tmp_path: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_path = tmp_path / "seed.db"  # type: ignore[operator]
    classified_product_ids: list[int] = []
    expected_products_per_store = [
        len(products_for_store(store_index)) for store_index in range(len(STORES))
    ]
    expected_product_count = sum(expected_products_per_store)
    observations_per_product = WEEKS_OF_HISTORY * 2
    expected_observation_count = expected_product_count * observations_per_product
    expected_price_history_count = expected_product_count * (
        observations_per_product - 1
    )
    expected_tag_product_count = sum(
        len(product.tag_names)
        for store_index in range(len(STORES))
        for product in products_for_store(store_index)
    )
    expected_seasonal_product_ids = [
        product_id
        for product_id, product in enumerate(
            (
                product
                for store_index in range(len(STORES))
                for product in products_for_store(store_index)
            ),
            start=1,
        )
        if product.seasonal_low_month is not None
        and product.seasonal_amplitude > 0
    ]
    modifier_price = Price(date=1, price=1, quantity=1, sale=False)
    expected_brand_counts = Counter(
        (product.name, modifier)
        for store_index in range(len(STORES))
        for product in products_for_store(store_index)
        for modifier in generate_modifiers(
            product,
            modifier_price,
            store_index=store_index,
            seed=1234,
        )
        if modifier.startswith("brand: ")
    )

    def classify_seasonality(
        price_history: object,
        product_id: int,
        date_var: str,
        **options: object,
    ) -> grocery_prices.SeasonalityResult:
        assert len(price_history) == expected_observation_count  # type: ignore[arg-type]
        assert date_var == "date"
        assert options["min_history"] == 30
        classified_product_ids.append(product_id)
        is_in_season = product_id == 1
        return {
            "product_id": product_id,
            "has_seasonality": is_in_season,
            "seasonal_months": [7] if is_in_season else [],
        }

    monkeypatch.setattr(
        grocery_prices,
        "_classify_seasonality",
        classify_seasonality,
    )

    stats = seed_database(database_path, as_of=date(2026, 7, 24), seed=1234)

    assert stats.stores == len(STORES)
    assert stats.tags == len(TAGS)
    assert stats.products == expected_product_count
    assert stats.price_histories == expected_price_history_count
    assert classified_product_ids == expected_seasonal_product_ids

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
        tag_product_count = connection.execute(
            "SELECT COUNT(*) FROM tag_products"
        ).fetchone()[0]
        tag_rows = connection.execute(
            "SELECT tag, default_unit, default_quantity FROM tags ORDER BY tag"
        ).fetchall()
        uncovered_tag_product_count = connection.execute(
            """
            SELECT COUNT(*)
            FROM tag_products AS tag_product
            LEFT JOIN tags AS tag ON tag.tag = tag_product.tag
            WHERE tag.tag IS NULL
            """
        ).fetchone()[0]
        modifier_count = connection.execute(
            "SELECT COUNT(*) FROM product_modifiers"
        ).fetchone()[0]
        distinct_modifiers = {
            row["modifier"]
            for row in connection.execute(
                "SELECT DISTINCT modifier FROM product_modifiers"
            )
        }
        in_season_product_ids = {
            row["product_id"]
            for row in connection.execute(
                """
                SELECT product_id FROM product_modifiers
                WHERE modifier = ?
                """,
                (IN_SEASON_MODIFIER,),
            )
        }
        sale_modifier_mismatches = connection.execute(
            """
            SELECT COUNT(*)
            FROM products AS product
            WHERE product.current_price_sale != EXISTS (
                SELECT 1 FROM product_modifiers AS modifier
                WHERE modifier.product_id = product.id
                  AND modifier.modifier = 'on sale'
            )
            """
        ).fetchone()[0]
        invalid_modifier_positions = connection.execute(
            """
            SELECT COUNT(*)
            FROM (
                SELECT product_id, COUNT(*) AS modifier_count,
                       MAX(position) AS maximum_position
                FROM product_modifiers
                GROUP BY product_id
            )
            WHERE maximum_position != modifier_count - 1
            """
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
                SELECT tag FROM tag_products
                WHERE product_id = (
                    SELECT id FROM products
                    WHERE name = 'Honeycrisp Apples' AND store_id = 1
                )
                ORDER BY tag
                """
            )
        ]
        honeycrisp_origins = [
            row["modifier"]
            for row in connection.execute(
                """
                SELECT modifier.modifier
                FROM products AS product
                LEFT JOIN product_modifiers AS modifier
                    ON modifier.product_id = product.id
                    AND modifier.modifier LIKE 'origin: %'
                WHERE product.name = 'Honeycrisp Apples'
                ORDER BY product.store_id
                """
            )
        ]
        persisted_brand_counts = Counter({
            (row["name"], row["modifier"]): row["product_count"]
            for row in connection.execute(
                """
                SELECT product.name, modifier.modifier,
                       COUNT(*) AS product_count
                FROM products AS product
                JOIN product_modifiers AS modifier
                    ON modifier.product_id = product.id
                WHERE modifier.modifier LIKE 'brand: %'
                GROUP BY product.name, modifier.modifier
                ORDER BY product.name, modifier.modifier
                """
            )
        })
        ground_beef_tags = [
            row["tag"]
            for row in connection.execute(
                """
                SELECT tag FROM tag_products
                WHERE product_id = (
                    SELECT id FROM products
                    WHERE name = 'Ground Beef 80/20' AND store_id = 1
                )
                ORDER BY tag
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

    assert products_per_store == expected_products_per_store
    assert [(row["name"], row["address"]) for row in store_rows] == [
        (store.name, store.address) for store in STORES
    ]
    assert tag_product_count == expected_tag_product_count
    assert len(tag_rows) == len(TAGS)
    assert uncovered_tag_product_count == 0
    assert modifier_count > 0
    assert {
        "origin: washington",
        "origin: chile",
        "brand: barilla",
        "in season",
        "on sale",
    } <= distinct_modifiers
    assert Counter(honeycrisp_origins) == {
        "origin: washington": 4,
        "origin: chile": 4,
        None: 4,
    }
    assert persisted_brand_counts == expected_brand_counts
    assert in_season_product_ids
    assert sale_modifier_mismatches == 0
    assert invalid_modifier_positions == 0
    assert {
        row["tag"]: (row["default_unit"], row["default_quantity"])
        for row in tag_rows
        if row["tag"] in {
            "banana",
            "bottled water",
            "corn tortilla",
            "egg",
            "ground beef",
        }
    } == {
        "banana": ("lbs", 2.0),
        "bottled water": ("count", 12.0),
        "corn tortilla": ("count", 18.0),
        "egg": ("count", 12.0),
        "ground beef": ("lbs", 1.5),
    }
    assert histories_per_product == {311}
    assert set(honeycrisp_tags) == {"honeycrisp apple", "apple", "fruit"}
    assert set(ground_beef_tags) == {"ground beef", "beef", "meat", "protein"}
    assert set(universal_store_counts.values()) == {len(STORES)}
    assert len(universal_store_counts) == len(UNIVERSAL_PRODUCTS)
    assert len(specialty_store_counts) == 180
    assert Counter(specialty_store_counts) == Counter(
        {1: 30, 2: 30, 3: 30, 4: 30, 5: 60}
    )
    assert missing_current_prices == 0
    assert datetime.fromtimestamp(latest_observation, timezone.utc).date() == date(
        2026, 7, 23
    )
    assert len(honeycrisp_latest_prices) > 1
    assert set(sale_counts) == {False, True}
    assert sum(sale_counts.values()) == expected_observation_count
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

    defaults = {tag.tag: tag for tag in TAGS}
    requested_items = tuple(
        ShoppingListItem(
            tag=tag_name,
            unit=defaults[tag_name].default_unit,
            quantity=defaults[tag_name].default_quantity,
        )
        for tag_name in ("milk", "egg", "bread", "banana", "chicken")
    )
    connection = connect_database(database_path)
    try:
        optimization_catalog = load_optimization_catalog(
            connection,
            requested_items,
        )
    finally:
        connection.close()
    matrices = asyncio.run(
        DemoTravelMatrixProvider().get_route_travel_matrices(
            FIXED_REDLANDS_ORIGIN,
            optimization_catalog.stores,
        )
    )
    optimized = optimize_routes(
        optimization_catalog,
        DirectedTravelMatrix.compose(matrices),
        limit=3,
    )

    assert len(optimization_catalog.stores) == len(STORES) == 12
    assert len(optimization_catalog.products) >= len(STORES) * len(requested_items)
    assert len(optimized.candidates) == 3
    assert optimized.candidates[0].matched_item_count == len(requested_items)

    with pytest.raises(SeedDataExistsError):
        seed_database(database_path, as_of=date(2026, 7, 24), seed=1234)


def test_seed_reset_cleanup_removes_shopping_lists_before_tags(
    tmp_path: object,
) -> None:
    database_path = tmp_path / "seed-reset.db"  # type: ignore[operator]
    initialize_database(database_path)
    connection = connect_database(database_path)
    try:
        connection.execute("INSERT INTO tags VALUES ('milk', 'gallon', 1)")
        connection.execute(
            "INSERT INTO shopping_lists (id, name) VALUES (1, 'Weekly')"
        )
        connection.execute(
            """
            INSERT INTO shopping_list_items
                (shopping_list_id, position, tag, unit, quantity)
            VALUES (1, 0, 'milk', 'gallon', 1)
            """
        )

        with transaction(connection):
            _clear_domain_data(connection)

        assert connection.execute("SELECT COUNT(*) FROM shopping_lists").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM shopping_list_items").fetchone()[0] == 0
        assert connection.execute("SELECT COUNT(*) FROM tags").fetchone()[0] == 0
        assert connection.execute("PRAGMA foreign_key_check").fetchall() == []
    finally:
        connection.close()