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
from backend.demo_travel_matrix import DEMO_STORE_COORDINATES
from backend.tools import seed_catalog
from backend.tools.grocery_prices import seasonal
from backend.types import Price, ProductCreate, StoreCreate


WEEKS_OF_HISTORY = 156
OBSERVATIONS_PER_WEEK = 2
DEFAULT_RANDOM_SEED = 2026
STORE_PRODUCT_JITTER = 0.06
WEEKLY_DRIFT_PERSISTENCE = 0.65
WEEKLY_DRIFT_INNOVATION = 0.035
OBSERVATION_NOISE = 0.012
SALE_PROBABILITY = 0.035
MINIMUM_SALE_DISCOUNT = 0.15
MAXIMUM_SALE_DISCOUNT = 0.30


@dataclass(frozen=True, slots=True)
class StoreSeed:
    name: str
    address: str
    latitude: float
    longitude: float
    price_multiplier: float


@dataclass(frozen=True, slots=True)
class SeedStats:
    tags: int
    stores: int
    products: int
    price_histories: int


class SeedDataExistsError(RuntimeError):
    pass


def _store_seed(
    name: str,
    address: str,
    price_multiplier: float,
) -> StoreSeed:
    latitude, longitude = DEMO_STORE_COORDINATES[address]
    return StoreSeed(name, address, latitude, longitude, price_multiplier)


STORES = (
    _store_seed("Sprouts", "560 W Stuart Ave, Redlands, CA 92374", 1.08),
    _store_seed("Trader Joes", "552 Orange St, Redlands, CA 92374", 1.02),
    _store_seed("Stater Bros", "11 E Colton Ave, Redlands, CA 92374", 0.98),
    _store_seed("Redlands Ranch Market", "800 E Lugonia Ave, Redlands, CA 92374", 0.94),
    _store_seed("Target Grocery", "27320 W Lugonia Ave, Redlands, CA 92374", 1.00),
    _store_seed("Albertsons", "450 E Cypress Ave, Redlands, CA 92373", 1.05),
    _store_seed("Gerrards", "705 W Cypress Ave, Redlands, CA 92373", 1.15),
    _store_seed("Stater Bros", "1536 Barton Rd, Redlands, CA 92373", 0.98),
    _store_seed("Food 4 Less", "2070 W Redlands Blvd, Redlands, CA 92373", 0.85),
    _store_seed("Stater Bros", "1775 E Lugonia Ave, Redlands, CA 92374", 0.98),
    _store_seed("Costco Wholesale", "28000 Greenspot Rd, Highland, CA 92346", 0.90),
    _store_seed("Grocery Outlet", "27945 Greenspot Rd, Highland, CA 92346", 0.88),
)

# Keep seed.py's established imports stable while the catalog data lives separately.
ProductTemplate = seed_catalog.ProductTemplate
UNIVERSAL_PRODUCTS = seed_catalog.UNIVERSAL_PRODUCTS
SPECIALTY_PRODUCTS = seed_catalog.SPECIALTY_PRODUCTS
CATEGORY_TAG_DEFAULTS = seed_catalog.CATEGORY_TAG_DEFAULTS
SHOPPING_TAG_DEFAULTS = seed_catalog.SHOPPING_TAG_DEFAULTS
TAGS = seed_catalog.TAGS
build_tag_catalog = seed_catalog.build_tag_catalog


def specialty_store_indices(product_index: int) -> tuple[int, ...]:
    if not 0 <= product_index < len(SPECIALTY_PRODUCTS):
        raise IndexError("specialty product index is out of range")
    coverage = min(product_index // 30 + 1, 5)
    coverage_band = min(product_index // 30, 4)
    band_start = coverage_band * 30
    preceding_memberships = sum(
        30 * band_coverage
        for band_coverage in range(1, coverage)
    )
    membership_offset = (
        preceding_memberships
        + (product_index - band_start) * coverage
    )
    return tuple(
        (membership_offset + offset) % len(STORES)
        for offset in range(coverage)
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


def _sale_discount(generator: random.Random, sale: bool) -> float:
    if not sale:
        return 0.0
    return generator.uniform(MINIMUM_SALE_DISCOUNT, MAXIMUM_SALE_DISCOUNT)


def generate_price_history(
    product: ProductTemplate,
    store_index: int,
    as_of: date,
    seed: int = DEFAULT_RANDOM_SEED,
) -> tuple[Price, ...]:
    if not 0 <= store_index < len(STORES):
        raise IndexError("store index is out of range")
    generator = _stable_random(seed, store_index, product.name)
    store_multiplier = STORES[store_index].price_multiplier * (
        1 + generator.uniform(-STORE_PRODUCT_JITTER, STORE_PRODUCT_JITTER)
    )
    weekly_drift = 0.0
    history: list[Price] = []

    for observation_index, observed_on in enumerate(observation_dates(as_of)):
        if observation_index % OBSERVATIONS_PER_WEEK == 0:
            weekly_drift = (
                WEEKLY_DRIFT_PERSISTENCE * weekly_drift
                + generator.uniform(
                    -WEEKLY_DRIFT_INNOVATION,
                    WEEKLY_DRIFT_INNOVATION,
                )
            )
        observation_noise = generator.uniform(
            -OBSERVATION_NOISE,
            OBSERVATION_NOISE,
        )
        sale = generator.random() < SALE_PROBABILITY
        sale_discount = _sale_discount(generator, sale)
        regular_multiplier = (
            store_multiplier
            * _seasonal_multiplier(product, observed_on)
            * (1 + weekly_drift + observation_noise)
        )
        multiplier = regular_multiplier * (1 - sale_discount)
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
    *,
    store_index: int = 0,
    seed: int = DEFAULT_RANDOM_SEED,
) -> tuple[str, ...]:
    if store_index < 0:
        raise ValueError("store_index must be nonnegative")

    modifiers = list(product.modifiers)
    if product.modifier_variants:
        digest = hashlib.sha256(
            f"{seed}:modifier:{product.name}".encode("utf-8")
        ).digest()
        offset = int.from_bytes(digest[:8], "big") % len(product.modifier_variants)
        variant = product.modifier_variants[
            (store_index + offset) % len(product.modifier_variants)
        ]
        if variant is not None:
            modifiers.append(variant)
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
    seasonal_product_ids: list[int] = []
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
                store = StoreCreate(
                    name=store_seed.name,
                    address=store_seed.address,
                    latitude=store_seed.latitude,
                    longitude=store_seed.longitude,
                )
                cursor = connection.execute(
                    """
                    INSERT INTO stores (name, address, latitude, longitude)
                    VALUES (?, ?, ?, ?)
                    """,
                    (store.name, store.address, store.latitude, store.longitude),
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
                        modifiers=list(
                            generate_modifiers(
                                template,
                                current_price,
                                store_index=store_index,
                                seed=seed,
                            )
                        ),
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
                    if (
                        template.seasonal_low_month is not None
                        and template.seasonal_amplitude > 0
                    ):
                        seasonal_product_ids.append(product_id)
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
            seasonal(
                connection,
                as_of=effective_as_of,
                product_ids=seasonal_product_ids,
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