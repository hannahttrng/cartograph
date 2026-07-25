"""Seed realistic grocery stores, products, and price histories."""

from __future__ import annotations

import argparse
import hashlib
import math
import os
import random
import sqlite3
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from backend.resolvers import connect_database, initialize_database, transaction
from backend.types import Price, ProductCreate, StoreCreate, Tag


WEEKS_OF_HISTORY = 156
OBSERVATIONS_PER_WEEK = 2
DEFAULT_RANDOM_SEED = 2026


@dataclass(frozen=True, slots=True)
class StoreSeed:
    name: str
    address: str


@dataclass(frozen=True, slots=True)
class ProductTemplate:
    name: str
    tag_names: tuple[str, ...]
    unit: str
    base_price: float
    quantity: float = 1.0
    seasonal_low_month: int | None = None
    seasonal_amplitude: float = 0.0
    modifiers: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class SeedStats:
    tags: int
    stores: int
    products: int
    price_histories: int


class SeedDataExistsError(RuntimeError):
    pass


def _product(
    name: str,
    tag_names: tuple[str, ...],
    unit: str,
    base_price: float,
    quantity: float = 1.0,
    seasonal_low_month: int | None = None,
    seasonal_amplitude: float = 0.0,
    modifiers: tuple[str, ...] = (),
) -> ProductTemplate:
    return ProductTemplate(
        name=name,
        tag_names=tag_names,
        unit=unit,
        base_price=base_price,
        quantity=quantity,
        seasonal_low_month=seasonal_low_month,
        seasonal_amplitude=seasonal_amplitude,
        modifiers=modifiers,
    )


STORES = (
    StoreSeed("Sprouts", "560 W Stuart Ave, Redlands, CA 92374"),
    StoreSeed("Trader Joes", "552 Orange St, Redlands, CA 92374"),
    StoreSeed("Stater Bros", "11 E Colton Ave, Redlands, CA 92374"),
    StoreSeed("Redlands Ranch Market", "800 E Lugonia Ave, Redlands, CA 92374"),
    StoreSeed("Target Grocery", "27320 W Lugonia Ave, Redlands, CA 92374"),
    StoreSeed("Albertsons", "450 E Cypress Ave, Redlands, CA 92373"),
    StoreSeed("Gerrards", "705 W Cypress Ave, Redlands, CA 92373"),
    StoreSeed("Stater Bros", "1536 Barton Rd, Redlands, CA 92373"),
    StoreSeed("Food 4 Less", "2070 W Redlands Blvd, Redlands, CA 92373"),
    StoreSeed("Stater Bros", "1775 E Lugonia Ave, Redlands, CA 92374"),
)


UNIVERSAL_PRODUCTS = (
    _product(
        "Honeycrisp Apples",
        ("honeycrisp apple", "apple", "fruit"),
        "lbs",
        1.99,
        seasonal_low_month=10,
        seasonal_amplitude=0.20,
        modifiers=("origin: washington",),
    ),
    _product("Bananas", ("banana", "fruit"), "lbs", 0.69, seasonal_low_month=7, seasonal_amplitude=0.04),
    _product("Whole Milk", ("milk", "dairy"), "gallon", 4.29),
    _product("Large Eggs", ("egg", "dairy", "protein"), "count", 4.79, 12.0),
    _product("Sandwich Bread", ("bread", "bakery", "wheat"), "loaf", 3.49),
    _product("Unsalted Butter", ("butter", "dairy"), "oz", 4.99, 16.0),
    _product("Chicken Breasts", ("chicken", "poultry", "meat", "protein"), "lbs", 4.99),
    _product("Ground Beef 80/20", ("ground beef", "beef", "meat", "protein"), "lbs", 5.49),
    _product("Long Grain White Rice", ("rice", "grain", "pantry"), "lbs", 7.99, 5.0),
    _product("Spaghetti Pasta", ("spaghetti", "pasta", "pantry"), "oz", 1.49, 16.0),
    _product("Tomato Pasta Sauce", ("tomato sauce", "sauce", "pasta", "pantry"), "oz", 2.49, 24.0),
    _product("Sharp Cheddar Cheese", ("cheddar", "cheese", "dairy"), "oz", 4.49, 8.0),
    _product("Plain Greek Yogurt", ("greek yogurt", "yogurt", "dairy", "protein"), "oz", 5.99, 32.0),
    _product("Orange Juice", ("orange juice", "juice", "beverage"), "oz", 4.49, 52.0),
    _product("Creamy Peanut Butter", ("peanut butter", "nut butter", "pantry", "protein"), "oz", 3.99, 16.0),
    _product("Russet Potatoes", ("russet potato", "potato", "vegetable"), "lbs", 4.99, 5.0, 9, 0.08),
    _product("Yellow Onions", ("yellow onion", "onion", "vegetable"), "lbs", 3.99, 3.0, 9, 0.07),
    _product("Roma Tomatoes", ("roma tomato", "tomato", "vegetable"), "lbs", 1.49, seasonal_low_month=8, seasonal_amplitude=0.16),
    _product("Hass Avocados", ("hass avocado", "avocado", "fruit"), "count", 4.99, 4.0, 6, 0.10),
    _product("Bottled Water 24-Pack", ("water", "bottled water", "beverage"), "count", 5.99, 24.0),
)


SPECIALTY_PRODUCTS = (
    _product("Bulk Chia Seeds", ("chia seed", "seed", "pantry"), "oz", 8.99, 16.0),
    _product("Speculoos Cookie Butter", ("cookie butter", "spread", "dessert"), "oz", 3.99, 14.1),
    _product("Marinated Carne Asada", ("carne asada", "beef", "meat"), "lbs", 9.99),
    _product("Fresh Corn Tortillas", ("corn tortilla", "tortilla", "bakery"), "count", 2.49, 30.0),
    _product("Maple Almond Granola", ("granola", "cereal", "almond"), "oz", 5.49, 12.0),
    _product("Tomato Basil Soup", ("tomato soup", "soup", "pantry"), "oz", 3.29, 18.5),
    _product("Deli Potato Salad", ("potato salad", "deli", "prepared"), "lbs", 5.99),
    _product("Fresh Hatch Chile Salsa", ("hatch chile", "salsa", "condiment"), "oz", 4.49, 16.0, 8, 0.12),
    _product("Family Pack Chicken Drumsticks", ("chicken drumstick", "chicken", "meat"), "lbs", 8.99, 4.0),
    _product("Bakery Bolillo Rolls", ("bolillo", "bread", "bakery"), "count", 3.99, 6.0),
    _product("Fresh Figs", ("fig", "fruit"), "lbs", 5.99, seasonal_low_month=8, seasonal_amplitude=0.25),
    _product("Meyer Lemons", ("meyer lemon", "lemon", "citrus", "fruit"), "lbs", 3.99, seasonal_low_month=1, seasonal_amplitude=0.18),
    _product("Rainbow Chard", ("rainbow chard", "chard", "vegetable"), "bunch", 2.99, seasonal_low_month=4, seasonal_amplitude=0.10),
    _product("Heirloom Tomatoes", ("heirloom tomato", "tomato", "vegetable"), "lbs", 4.99, seasonal_low_month=8, seasonal_amplitude=0.24),
    _product("Japanese Sweet Potatoes", ("japanese sweet potato", "sweet potato", "vegetable"), "lbs", 2.49, seasonal_low_month=10, seasonal_amplitude=0.12),
    _product("Fuyu Persimmons", ("persimmon", "fruit"), "lbs", 3.99, seasonal_low_month=11, seasonal_amplitude=0.25),
    _product("Blood Oranges", ("blood orange", "orange", "citrus", "fruit"), "lbs", 2.99, seasonal_low_month=2, seasonal_amplitude=0.20),
    _product("Fresh Fava Beans", ("fava bean", "bean", "vegetable"), "lbs", 4.49, seasonal_low_month=4, seasonal_amplitude=0.22),
    _product("Fresh Apricots", ("apricot", "fruit"), "lbs", 4.99, seasonal_low_month=6, seasonal_amplitude=0.24),
    _product("Anaheim Chiles", ("anaheim chile", "chile", "pepper", "vegetable"), "lbs", 2.49, seasonal_low_month=8, seasonal_amplitude=0.14),
    _product("Blackberries", ("blackberry", "berry", "fruit"), "oz", 4.49, 6.0, 6, 0.20),
    _product("Globe Artichokes", ("artichoke", "vegetable"), "count", 5.00, 2.0, 4, 0.18),
    _product("Fresh Leeks", ("leek", "vegetable"), "bunch", 3.49, seasonal_low_month=2, seasonal_amplitude=0.10),
    _product("Dapple Dandy Pluots", ("pluot", "stone fruit", "fruit"), "lbs", 4.49, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("Sugar Snap Peas", ("sugar snap pea", "pea", "vegetable"), "oz", 4.99, 8.0, 4, 0.16),
    _product("Delicata Squash", ("delicata squash", "squash", "vegetable"), "lbs", 2.49, seasonal_low_month=10, seasonal_amplitude=0.18),
    _product("Belgian Endive", ("endive", "leafy", "vegetable"), "count", 4.99, 3.0, 1, 0.08),
    _product("Kiwi Berries", ("kiwi berry", "berry", "fruit"), "oz", 5.99, 6.0, 9, 0.25),
    _product("Romanesco Cauliflower", ("romanesco", "cauliflower", "vegetable"), "count", 4.49, seasonal_low_month=11, seasonal_amplitude=0.12),
    _product("Passion Fruit", ("passion fruit", "tropical fruit", "fruit"), "count", 6.00, 4.0, 7, 0.16),
    _product("Rainier Cherries", ("rainier cherry", "cherry", "fruit"), "lbs", 7.99, seasonal_low_month=6, seasonal_amplitude=0.28),
    _product("Asparagus", ("asparagus", "vegetable"), "lbs", 3.99, seasonal_low_month=4, seasonal_amplitude=0.20),
    _product("Yellow Peaches", ("peach", "stone fruit", "fruit"), "lbs", 3.49, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("White Nectarines", ("nectarine", "stone fruit", "fruit"), "lbs", 3.99, seasonal_low_month=7, seasonal_amplitude=0.24),
    _product("Pomegranates", ("pomegranate", "fruit"), "count", 5.00, 2.0, 11, 0.22),
    _product("Fresh Cranberries", ("cranberry", "berry", "fruit"), "oz", 3.99, 12.0, 11, 0.25),
    _product("Brussels Sprouts", ("brussels sprout", "vegetable"), "lbs", 3.49, seasonal_low_month=11, seasonal_amplitude=0.16),
    _product("Acorn Squash", ("acorn squash", "squash", "vegetable"), "lbs", 1.99, seasonal_low_month=10, seasonal_amplitude=0.16),
    _product("Fresh Green Peas", ("green pea", "pea", "vegetable"), "lbs", 3.99, seasonal_low_month=4, seasonal_amplitude=0.16),
    _product("Mini Watermelons", ("watermelon", "melon", "fruit"), "count", 4.99, seasonal_low_month=7, seasonal_amplitude=0.22),
    _product("Strawberries", ("strawberry", "berry", "fruit"), "lbs", 3.99, seasonal_low_month=5, seasonal_amplitude=0.18),
    _product("Blueberries", ("blueberry", "berry", "fruit"), "oz", 4.49, 6.0, 7, 0.18),
    _product("Raspberries", ("raspberry", "berry", "fruit"), "oz", 4.99, 6.0, 6, 0.18),
    _product("Seedless Watermelon", ("watermelon", "melon", "fruit"), "count", 7.99, seasonal_low_month=7, seasonal_amplitude=0.22),
    _product("Sweet Corn", ("sweet corn", "corn", "vegetable"), "count", 4.00, 4.0, 7, 0.20),
    _product("Green Beans", ("green bean", "bean", "vegetable"), "lbs", 2.99, seasonal_low_month=7, seasonal_amplitude=0.14),
    _product("Zucchini", ("zucchini", "squash", "vegetable"), "lbs", 1.99, seasonal_low_month=7, seasonal_amplitude=0.14),
    _product("Butternut Squash", ("butternut squash", "squash", "vegetable"), "lbs", 1.79, seasonal_low_month=10, seasonal_amplitude=0.14),
    _product("Pie Pumpkins", ("pumpkin", "squash", "vegetable"), "count", 4.99, seasonal_low_month=10, seasonal_amplitude=0.28),
    _product("Red Seedless Grapes", ("red grape", "grape", "fruit"), "lbs", 2.99, seasonal_low_month=9, seasonal_amplitude=0.14),
    _product("Bartlett Pears", ("bartlett pear", "pear", "fruit"), "lbs", 2.49, seasonal_low_month=9, seasonal_amplitude=0.16),
    _product("Broccoli Crowns", ("broccoli", "cruciferous", "vegetable"), "lbs", 2.49, seasonal_low_month=2, seasonal_amplitude=0.08),
    _product("Cauliflower", ("cauliflower", "cruciferous", "vegetable"), "count", 3.49, seasonal_low_month=2, seasonal_amplitude=0.10),
    _product("Baby Spinach", ("baby spinach", "spinach", "leafy", "vegetable"), "oz", 3.99, 5.0, 3, 0.06),
    _product("Lacinato Kale", ("kale", "leafy", "vegetable"), "bunch", 2.49, seasonal_low_month=1, seasonal_amplitude=0.08),
    _product("Cilantro", ("cilantro", "herb"), "bunch", 0.99, seasonal_low_month=4, seasonal_amplitude=0.06),
    _product("Limes", ("lime", "citrus", "fruit"), "count", 3.00, 5.0, 6, 0.10),
    _product("Jalapeno Peppers", ("jalapeno", "pepper", "chile", "vegetable"), "lbs", 1.99, seasonal_low_month=8, seasonal_amplitude=0.12),
    _product("Sourdough Bread", ("sourdough", "bread", "bakery"), "loaf", 5.49),
    _product("Oat Milk", ("oat milk", "non dairy", "beverage"), "oz", 4.49, 64.0),
)


CATEGORY_TAG_DEFAULTS = {
    "bakery": ("count", 1.0),
    "berry": ("oz", 6.0),
    "beverage": ("count", 1.0),
    "bread": ("loaf", 1.0),
    "chicken": ("lbs", 1.0),
    "citrus": ("lbs", 1.0),
    "cruciferous": ("lbs", 1.0),
    "dairy": ("count", 1.0),
    "fruit": ("lbs", 1.0),
    "leafy": ("bunch", 1.0),
    "meat": ("lbs", 1.0),
    "pantry": ("count", 1.0),
    "pasta": ("oz", 16.0),
    "pea": ("lbs", 1.0),
    "protein": ("lbs", 1.0),
    "squash": ("lbs", 1.0),
    "vegetable": ("lbs", 1.0),
}

SHOPPING_TAG_DEFAULTS = {
    "artichoke": ("count", 1.0),
    "bottled water": ("count", 6.0),
    "corn tortilla": ("count", 12.0),
    "egg": ("count", 6.0),
    "hass avocado": ("count", 2.0),
    "pomegranate": ("count", 1.0),
}


def build_tag_catalog() -> tuple[Tag, ...]:
    defaults: dict[str, tuple[str, float]] = {}
    for product in UNIVERSAL_PRODUCTS + SPECIALTY_PRODUCTS:
        for tag in product.tag_names:
            defaults.setdefault(tag, (product.unit, product.quantity))

    defaults.update(CATEGORY_TAG_DEFAULTS)
    defaults.update(SHOPPING_TAG_DEFAULTS)
    return tuple(
        Tag(tag=tag, defaultUnit=unit, defaultQuantity=quantity)
        for tag, (unit, quantity) in sorted(defaults.items())
    )


TAGS = build_tag_catalog()


def specialty_store_indices(product_index: int) -> tuple[int, ...]:
    if not 0 <= product_index < len(SPECIALTY_PRODUCTS):
        raise IndexError("specialty product index is out of range")
    coverage = min(product_index // 10 + 1, 5)
    starting_store = product_index % len(STORES)
    return tuple(
        (starting_store + offset) % len(STORES) for offset in range(coverage)
    )


def products_for_store(store_index: int) -> tuple[ProductTemplate, ...]:
    if not 0 <= store_index < len(STORES):
        raise IndexError("store index is out of range")
    specialty = tuple(
        product
        for product_index, product in enumerate(SPECIALTY_PRODUCTS)
        if store_index in specialty_store_indices(product_index)
    )
    return UNIVERSAL_PRODUCTS + specialty


def observation_dates(
    as_of: date, weeks: int = WEEKS_OF_HISTORY
) -> tuple[date, ...]:
    if weeks <= 0:
        raise ValueError("weeks must be positive")
    latest_thursday = as_of - timedelta(days=(as_of.weekday() - 3) % 7)
    first_monday = latest_thursday - timedelta(days=3, weeks=weeks - 1)
    return tuple(
        observation
        for week in range(weeks)
        for observation in (
            first_monday + timedelta(weeks=week),
            first_monday + timedelta(weeks=week, days=3),
        )
    )


def _stable_random(seed: int, store_index: int, product_name: str) -> random.Random:
    digest = hashlib.sha256(
        f"{seed}:{store_index}:{product_name}".encode("utf-8")
    ).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _seasonal_multiplier(product: ProductTemplate, observed_on: date) -> float:
    if product.seasonal_low_month is None or product.seasonal_amplitude == 0:
        return 1.0
    month_offset = (observed_on.month - product.seasonal_low_month) / 12
    return 1 - product.seasonal_amplitude * math.cos(2 * math.pi * month_offset)


def generate_price_history(
    product: ProductTemplate,
    store_index: int,
    as_of: date,
    seed: int = DEFAULT_RANDOM_SEED,
) -> tuple[Price, ...]:
    generator = _stable_random(seed, store_index, product.name)
    store_multiplier = 1 + (store_index - 4.5) * 0.008 + generator.uniform(-0.025, 0.025)
    weekly_drift = 0.0
    history: list[Price] = []

    for observation_index, observed_on in enumerate(observation_dates(as_of)):
        if observation_index % OBSERVATIONS_PER_WEEK == 0:
            weekly_drift = 0.55 * weekly_drift + generator.uniform(-0.025, 0.025)
        observation_noise = generator.uniform(-0.006, 0.006)
        sale = generator.random() < 0.035
        promotion = -generator.uniform(0.05, 0.14) if sale else 0.0
        multiplier = (
            store_multiplier
            * _seasonal_multiplier(product, observed_on)
            * (1 + weekly_drift + observation_noise + promotion)
        )
        package_price = round(max(0.05, product.base_price * multiplier), 2)
        observed_at = datetime.combine(
            observed_on, time.min, tzinfo=timezone.utc
        ).timestamp()
        history.append(
            Price(
                date=observed_at,
                price=package_price,
                quantity=product.quantity,
                sale=sale,
            )
        )

    return tuple(history)


def generate_modifiers(
    product: ProductTemplate,
    current_price: Price,
) -> tuple[str, ...]:
    modifiers = list(product.modifiers)
    observed_month = datetime.fromtimestamp(
        current_price.date, timezone.utc
    ).month
    if product.seasonal_low_month == observed_month:
        modifiers.append("in season")
    if current_price.sale:
        modifiers.append("on sale")
    return tuple(modifiers)


def _contains_domain_data(connection: sqlite3.Connection) -> bool:
    for table in ("tags", "stores", "products", "price_history", "routes"):
        row = connection.execute(f"SELECT EXISTS(SELECT 1 FROM {table})").fetchone()
        if row[0]:
            return True
    return False


def _clear_domain_data(connection: sqlite3.Connection) -> None:
    connection.execute("DELETE FROM shopping_lists")
    connection.execute("DELETE FROM routes")
    connection.execute("DELETE FROM product_modifiers")
    connection.execute("DELETE FROM tag_products")
    connection.execute("DELETE FROM products")
    connection.execute("DELETE FROM stores")
    connection.execute("DELETE FROM tags")


def _required_lastrowid(cursor: sqlite3.Cursor) -> int:
    if cursor.lastrowid is None:
        raise RuntimeError("SQLite INSERT did not produce a row ID")
    return cursor.lastrowid


def seed_database(
    database_path: str | Path,
    *,
    as_of: date | None = None,
    seed: int = DEFAULT_RANDOM_SEED,
    reset: bool = False,
) -> SeedStats:
    effective_as_of = as_of or date.today()
    initialize_database(database_path)
    connection = connect_database(database_path)
    product_count = 0
    price_history_count = 0
    tag_products: dict[str, list[int]] = {tag.tag: [] for tag in TAGS}

    try:
        with transaction(connection):
            if _contains_domain_data(connection):
                if not reset:
                    raise SeedDataExistsError(
                        "database already contains domain data; rerun with --reset to replace it"
                    )
                _clear_domain_data(connection)

            connection.executemany(
                """
                INSERT INTO tags (tag, default_unit, default_quantity)
                VALUES (?, ?, ?)
                """,
                (
                    (tag.tag, tag.default_unit, tag.default_quantity)
                    for tag in TAGS
                ),
            )

            store_ids: list[int] = []
            for store_seed in STORES:
                store = StoreCreate(name=store_seed.name, address=store_seed.address)
                cursor = connection.execute(
                    "INSERT INTO stores (name, address) VALUES (?, ?)",
                    (store.name, store.address),
                )
                store_ids.append(_required_lastrowid(cursor))

            for store_index, store_id in enumerate(store_ids):
                for template in products_for_store(store_index):
                    history = generate_price_history(
                        template,
                        store_index=store_index,
                        as_of=effective_as_of,
                        seed=seed,
                    )
                    current_price = history[-1]
                    product = ProductCreate(
                        name=template.name,
                        modifiers=list(generate_modifiers(template, current_price)),
                        store=store_id,
                        unit=template.unit,
                    )
                    cursor = connection.execute(
                        """
                        INSERT INTO products (name, store_id, unit)
                        VALUES (?, ?, ?)
                        """,
                        (product.name, product.store, product.unit),
                    )
                    product_id = _required_lastrowid(cursor)
                    connection.executemany(
                        """
                        INSERT INTO product_modifiers
                            (product_id, modifier, position)
                        VALUES (?, ?, ?)
                        """,
                        (
                            (product_id, modifier, position)
                            for position, modifier in enumerate(product.modifiers)
                        ),
                    )
                    for tag_name in template.tag_names:
                        tag_products[tag_name].append(product_id)

                    connection.executemany(
                        """
                        INSERT INTO price_history
                            (product_id, date, price, quantity, sale)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            (
                                product_id,
                                entry.date,
                                entry.price,
                                entry.quantity,
                                entry.sale,
                            )
                            for entry in history[:-1]
                        ),
                    )
                    connection.execute(
                        """
                        UPDATE products
                        SET current_price_date = ?, current_price = ?,
                            current_price_quantity = ?, current_price_sale = ?
                        WHERE id = ?
                        """,
                        (
                            current_price.date,
                            current_price.price,
                            current_price.quantity,
                            current_price.sale,
                            product_id,
                        ),
                    )
                    product_count += 1
                    price_history_count += len(history) - 1

            connection.executemany(
                """
                INSERT INTO tag_products (tag, product_id)
                VALUES (?, ?)
                """,
                (
                    (tag_name, product_id)
                    for tag_name, product_ids in sorted(tag_products.items())
                    for product_id in product_ids
                ),
            )
    finally:
        connection.close()

    return SeedStats(
        tags=len(TAGS),
        stores=len(STORES),
        products=product_count,
        price_histories=price_history_count,
    )


def _parse_date(value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("date must use YYYY-MM-DD format") from error


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--database",
        type=Path,
        default=Path(os.getenv("CARTOGRAPH_DB_PATH", "cartograph.db")),
        help="SQLite database path (default: CARTOGRAPH_DB_PATH or cartograph.db)",
    )
    parser.add_argument(
        "--as-of",
        type=_parse_date,
        default=date.today(),
        help="last calendar date considered for observations (default: today)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=DEFAULT_RANDOM_SEED,
        help=f"deterministic random seed (default: {DEFAULT_RANDOM_SEED})",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete existing domain data before seeding",
    )
    return parser


def main(arguments: list[str] | None = None) -> int:
    options = build_parser().parse_args(arguments)
    try:
        stats = seed_database(
            options.database,
            as_of=options.as_of,
            seed=options.seed,
            reset=options.reset,
        )
    except SeedDataExistsError as error:
        print(f"Seed aborted: {error}", file=sys.stderr)
        return 2

    print(
        f"Seeded {stats.tags} tags, {stats.stores} stores, {stats.products} products, "
        f"and {stats.price_histories} price histories into {options.database}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())