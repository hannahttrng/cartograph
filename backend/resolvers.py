"""Database bootstrap and extension contracts for backend resolvers."""

import sqlite3
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Protocol

from backend.demo_travel_matrix import DEMO_STORE_COORDINATES
from backend.types import (
    Price,
    Product,
    RouteCandidateResult,
    RouteCandidatesResponse,
    RouteCalculationResponse,
    RouteCalculationStatus,
    RouteItemSelection,
    RouteOptimizationErrorCode,
    RouteOptimizationResponse,
    RouteProductSummary,
    RouteScoreComponents,
    RouteStoreSummary,
    ShoppingList,
    ShoppingListActiveUpdate,
    ShoppingListCreate,
    ShoppingListItem,
    ShoppingListItemInput,
    ShoppingListNameUpdate,
    ShoppingListReplace,
    Store,
    Tag,
)

from backend.route_optimizer import OptimizationCatalog, OptimizationProduct


SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS tags (
        tag TEXT PRIMARY KEY CHECK (
            length(trim(tag)) > 0
            AND tag = trim(tag)
            AND tag = lower(tag)
        ),
        default_unit TEXT NOT NULL CHECK (
            length(trim(default_unit)) > 0
            AND default_unit = trim(default_unit)
            AND default_unit = lower(default_unit)
        ),
        default_quantity REAL NOT NULL CHECK (default_quantity > 0)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        address TEXT NOT NULL CHECK (length(trim(address)) > 0),
        latitude REAL CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
        longitude REAL CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
        CHECK (
            (latitude IS NULL AND longitude IS NULL)
            OR (latitude IS NOT NULL AND longitude IS NOT NULL)
        )
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        store_id INTEGER NOT NULL,
        unit TEXT NOT NULL CHECK (length(trim(unit)) > 0),
        current_price_date REAL,
        current_price REAL,
        current_price_quantity REAL,
        current_price_sale INTEGER,
        CHECK (
            (
                current_price_date IS NULL
                AND current_price IS NULL
                AND current_price_quantity IS NULL
                AND current_price_sale IS NULL
            ) OR (
                current_price_date >= 0
                AND current_price >= 0
                AND current_price_quantity > 0
                AND current_price_sale IN (0, 1)
            )
        ),
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tag_products (
        tag TEXT NOT NULL CHECK (
            length(trim(tag)) > 0
            AND tag = trim(tag)
            AND tag = lower(tag)
        ),
        product_id INTEGER NOT NULL,
        PRIMARY KEY (tag, product_id),
        FOREIGN KEY (tag) REFERENCES tags(tag) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS product_modifiers (
        product_id INTEGER NOT NULL,
        modifier TEXT NOT NULL CHECK (
            length(trim(modifier)) > 0
            AND modifier = trim(modifier)
            AND modifier = lower(modifier)
        ),
        position INTEGER NOT NULL CHECK (position >= 0),
        PRIMARY KEY (product_id, modifier),
        UNIQUE (product_id, position),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS price_history (
        product_id INTEGER NOT NULL,
        date REAL NOT NULL CHECK (date >= 0),
        price REAL NOT NULL CHECK (price >= 0),
        quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
        sale INTEGER NOT NULL DEFAULT 0 CHECK (sale IN (0, 1)),
        PRIMARY KEY (product_id, date),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shopping_lists (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (
            length(trim(name)) > 0 AND name = trim(name)
        ),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shopping_list_items (
        shopping_list_id INTEGER NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        tag TEXT NOT NULL CHECK (
            length(trim(tag)) > 0
            AND tag = trim(tag)
            AND tag = lower(tag)
        ),
        unit TEXT NOT NULL CHECK (
            length(trim(unit)) > 0
            AND unit = trim(unit)
            AND unit = lower(unit)
        ),
        quantity REAL NOT NULL CHECK (
            quantity > 0 AND quantity <= 1.7976931348623157e308
        ),
        PRIMARY KEY (shopping_list_id, position),
        UNIQUE (shopping_list_id, tag),
        FOREIGN KEY (shopping_list_id)
            REFERENCES shopping_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (tag) REFERENCES tags(tag) ON DELETE RESTRICT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shopping_list_item_modifiers (
        shopping_list_id INTEGER NOT NULL,
        item_position INTEGER NOT NULL CHECK (item_position >= 0),
        modifier TEXT NOT NULL CHECK (
            length(trim(modifier)) > 0
            AND modifier = trim(modifier)
            AND modifier = lower(modifier)
        ),
        PRIMARY KEY (shopping_list_id, item_position, modifier),
        FOREIGN KEY (shopping_list_id, item_position)
            REFERENCES shopping_list_items(shopping_list_id, position)
            ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
        distance REAL NOT NULL CHECK (distance >= 0),
        time REAL NOT NULL CHECK (time >= 0),
        score REAL NOT NULL,
        product_price REAL NOT NULL CHECK (product_price >= 0),
        matched_item_count INTEGER NOT NULL CHECK (matched_item_count > 0),
        distance_cost REAL NOT NULL CHECK (distance_cost >= 0),
        time_cost REAL NOT NULL CHECK (time_cost >= 0),
        store_cost REAL NOT NULL CHECK (store_cost >= 0),
        modifier_penalty REAL NOT NULL DEFAULT 0 CHECK (modifier_penalty >= 0),
        error_code TEXT CHECK (
            error_code IS NULL OR error_code IN ('PARTIAL_ITEM_MATCH')
        )
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_stores (
        route_id INTEGER NOT NULL,
        store_id INTEGER NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        PRIMARY KEY (route_id, store_id),
        UNIQUE (route_id, position),
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_item_selections (
        route_id INTEGER NOT NULL,
        position INTEGER NOT NULL CHECK (position >= 0),
        requested_tag TEXT NOT NULL CHECK (
            length(trim(requested_tag)) > 0
            AND requested_tag = trim(requested_tag)
            AND requested_tag = lower(requested_tag)
        ),
        requested_unit TEXT NOT NULL CHECK (
            length(trim(requested_unit)) > 0
            AND requested_unit = trim(requested_unit)
            AND requested_unit = lower(requested_unit)
        ),
        requested_quantity REAL NOT NULL CHECK (
            requested_quantity > 0
            AND requested_quantity <= 1.7976931348623157e308
        ),
        product_id INTEGER,
        selection_price REAL,
        CHECK (
            (product_id IS NULL AND selection_price IS NULL)
            OR (
                product_id IS NOT NULL
                AND selection_price IS NOT NULL
                AND selection_price >= 0
            )
        ),
        PRIMARY KEY (route_id, position),
        UNIQUE (route_id, requested_tag),
        UNIQUE (route_id, product_id),
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_item_selection_modifiers (
        route_id INTEGER NOT NULL,
        selection_position INTEGER NOT NULL CHECK (selection_position >= 0),
        modifier TEXT NOT NULL CHECK (
            length(trim(modifier)) > 0
            AND modifier = trim(modifier)
            AND modifier = lower(modifier)
        ),
        PRIMARY KEY (route_id, selection_position, modifier),
        FOREIGN KEY (route_id, selection_position)
            REFERENCES route_item_selections(route_id, position)
            ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_item_product_modifiers (
        route_id INTEGER NOT NULL,
        selection_position INTEGER NOT NULL CHECK (selection_position >= 0),
        modifier TEXT NOT NULL CHECK (
            length(trim(modifier)) > 0
            AND modifier = trim(modifier)
            AND modifier = lower(modifier)
        ),
        PRIMARY KEY (route_id, selection_position, modifier),
        FOREIGN KEY (route_id, selection_position)
            REFERENCES route_item_selections(route_id, position)
            ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS route_calculation_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        generation INTEGER NOT NULL DEFAULT 0 CHECK (generation >= 0),
        status TEXT NOT NULL DEFAULT 'IDLE' CHECK (
            status IN ('IDLE', 'RUNNING', 'SUCCEEDED', 'FAILED')
        ),
        active_list_count INTEGER NOT NULL DEFAULT 0 CHECK (active_list_count >= 0),
        item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count >= 0),
        result_count INTEGER NOT NULL DEFAULT 0 CHECK (result_count >= 0),
        optimizer_status TEXT CHECK (
            optimizer_status IS NULL
            OR optimizer_status IN ('OPTIMAL', 'HEURISTIC', 'FEASIBLE_TIMEOUT')
        ),
        started_at REAL CHECK (started_at IS NULL OR started_at >= 0),
        completed_at REAL CHECK (completed_at IS NULL OR completed_at >= 0),
        elapsed_seconds REAL CHECK (elapsed_seconds IS NULL OR elapsed_seconds >= 0),
        timeout_seconds REAL CHECK (timeout_seconds IS NULL OR timeout_seconds > 0),
        error_code TEXT CHECK (
            error_code IS NULL OR error_code IN (
                'NO_ELIGIBLE_PRODUCTS',
                'MATRIX_UNAVAILABLE',
                'UNIT_CONVERSION_FAILED',
                'OPTIMIZATION_FAILED'
            )
        ),
        detail TEXT CHECK (detail IS NULL OR length(trim(detail)) > 0)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id)",
    "CREATE INDEX IF NOT EXISTS idx_tag_products_product ON tag_products(product_id)",
    """
    CREATE INDEX IF NOT EXISTS idx_price_history_latest
    ON price_history(product_id, date DESC)
    """,
    "CREATE INDEX IF NOT EXISTS idx_route_stores_store ON route_stores(store_id)",
    """
    CREATE INDEX IF NOT EXISTS idx_route_item_selections_product
    ON route_item_selections(product_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_shopping_list_items_tag
    ON shopping_list_items(tag)
    """,
)

TRIGGER_STATEMENTS = (
    """
    CREATE TRIGGER IF NOT EXISTS validate_store_coordinates_insert
    BEFORE INSERT ON stores
    WHEN (NEW.latitude IS NULL) != (NEW.longitude IS NULL)
    BEGIN
        SELECT RAISE(ABORT, 'store latitude and longitude must be provided together');
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_store_coordinates_update
    BEFORE UPDATE OF latitude, longitude ON stores
    WHEN (NEW.latitude IS NULL) != (NEW.longitude IS NULL)
    BEGIN
        SELECT RAISE(ABORT, 'store latitude and longitude must be provided together');
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_product_current_price_insert
    BEFORE INSERT ON products
    BEGIN
        SELECT RAISE(ABORT, 'current price fields must be all null or all populated')
        WHERE (
            (NEW.current_price_date IS NOT NULL)
            + (NEW.current_price IS NOT NULL)
            + (NEW.current_price_quantity IS NOT NULL)
            + (NEW.current_price_sale IS NOT NULL)
        ) NOT IN (0, 4);
        SELECT RAISE(ABORT, 'current price fields are invalid')
        WHERE NEW.current_price_date IS NOT NULL AND (
            NEW.current_price_date < 0
            OR NEW.current_price < 0
            OR NEW.current_price_quantity <= 0
            OR NEW.current_price_sale NOT IN (0, 1)
        );
        SELECT RAISE(ABORT, 'current price must be newer than product price history')
        WHERE NEW.current_price_date IS NOT NULL AND EXISTS (
            SELECT 1 FROM price_history
            WHERE product_id = NEW.id AND date >= NEW.current_price_date
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_product_current_price_update
    BEFORE UPDATE OF id, current_price_date, current_price,
        current_price_quantity, current_price_sale ON products
    BEGIN
        SELECT RAISE(ABORT, 'current price fields must be all null or all populated')
        WHERE (
            (NEW.current_price_date IS NOT NULL)
            + (NEW.current_price IS NOT NULL)
            + (NEW.current_price_quantity IS NOT NULL)
            + (NEW.current_price_sale IS NOT NULL)
        ) NOT IN (0, 4);
        SELECT RAISE(ABORT, 'current price fields are invalid')
        WHERE NEW.current_price_date IS NOT NULL AND (
            NEW.current_price_date < 0
            OR NEW.current_price < 0
            OR NEW.current_price_quantity <= 0
            OR NEW.current_price_sale NOT IN (0, 1)
        );
        SELECT RAISE(ABORT, 'current price must be newer than product price history')
        WHERE NEW.current_price_date IS NOT NULL AND EXISTS (
            SELECT 1 FROM price_history
            WHERE product_id = NEW.id AND date >= NEW.current_price_date
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_price_history_insert
    BEFORE INSERT ON price_history
    BEGIN
        SELECT RAISE(ABORT, 'price history must be older than current price')
        WHERE EXISTS (
            SELECT 1 FROM products
            WHERE id = NEW.product_id
                AND current_price_date IS NOT NULL
                AND NEW.date >= current_price_date
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_price_history_update
    BEFORE UPDATE OF product_id, date ON price_history
    BEGIN
        SELECT RAISE(ABORT, 'price history must be older than current price')
        WHERE EXISTS (
            SELECT 1 FROM products
            WHERE id = NEW.product_id
                AND current_price_date IS NOT NULL
                AND NEW.date >= current_price_date
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_route_item_product_insert
    BEFORE INSERT ON route_item_selections
    WHEN NEW.product_id IS NOT NULL
    BEGIN
        SELECT RAISE(ABORT, 'route product must have a current price')
        WHERE NOT EXISTS (
            SELECT 1 FROM products
            WHERE id = NEW.product_id
                AND current_price_date IS NOT NULL
                AND current_price IS NOT NULL
                AND current_price_quantity IS NOT NULL
                AND current_price_sale IS NOT NULL
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_route_item_product_update
    BEFORE UPDATE OF product_id ON route_item_selections
    WHEN NEW.product_id IS NOT NULL
    BEGIN
        SELECT RAISE(ABORT, 'route product must have a current price')
        WHERE NOT EXISTS (
            SELECT 1 FROM products
            WHERE id = NEW.product_id
                AND current_price_date IS NOT NULL
                AND current_price IS NOT NULL
                AND current_price_quantity IS NOT NULL
                AND current_price_sale IS NOT NULL
        );
    END
    """,
)


def connect_database(database_path: str | Path) -> sqlite3.Connection:
    connection = sqlite3.connect(database_path, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


@contextmanager
def transaction(
    connection: sqlite3.Connection, *, immediate: bool = False
) -> Iterator[sqlite3.Connection]:
    connection.execute("BEGIN IMMEDIATE" if immediate else "BEGIN")
    try:
        yield connection
    except BaseException:
        connection.rollback()
        raise
    else:
        connection.commit()


def _migrate_legacy_product_prices(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(products)")
    }
    if "price" not in columns:
        return

    connection.execute(
        """
        INSERT OR IGNORE INTO price_history (product_id, date, price)
        SELECT id, 0, price FROM products
        """
    )
    connection.execute("ALTER TABLE products DROP COLUMN price")


def _ensure_price_history_quantity_real(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"]: row["type"].upper()
        for row in connection.execute("PRAGMA table_info(price_history)")
    }
    if "quantity" not in columns:
        connection.execute(
            """
            ALTER TABLE price_history ADD COLUMN quantity REAL
            NOT NULL DEFAULT 1 CHECK (quantity > 0)
            """
        )
        return
    if columns["quantity"] == "REAL":
        return

    for trigger_name in (
        "validate_product_current_price_insert",
        "validate_product_current_price_update",
        "protect_current_price_delete",
        "protect_current_price_update",
    ):
        connection.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")
    connection.execute("DROP INDEX IF EXISTS idx_price_history_latest")
    connection.execute("ALTER TABLE price_history RENAME TO price_history_legacy")
    connection.execute(
        """
        CREATE TABLE price_history (
            product_id INTEGER NOT NULL,
            date REAL NOT NULL CHECK (date >= 0),
            price REAL NOT NULL CHECK (price >= 0),
            quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0),
            sale INTEGER NOT NULL DEFAULT 0 CHECK (sale IN (0, 1)),
            PRIMARY KEY (product_id, date),
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
        )
        """
    )
    if "sale" in columns:
        connection.execute(
            """
            INSERT INTO price_history (product_id, date, price, quantity, sale)
            SELECT product_id, date, price, CAST(quantity AS REAL), sale
            FROM price_history_legacy
            """
        )
    else:
        connection.execute(
            """
            INSERT INTO price_history (product_id, date, price, quantity)
            SELECT product_id, date, price, CAST(quantity AS REAL)
            FROM price_history_legacy
            """
        )
    connection.execute("DROP TABLE price_history_legacy")
    connection.execute(
        """
        CREATE INDEX idx_price_history_latest
        ON price_history(product_id, date DESC)
        """
    )


def _ensure_price_history_sale(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(price_history)")
    }
    if "sale" not in columns:
        connection.execute(
            """
            ALTER TABLE price_history ADD COLUMN sale INTEGER
            NOT NULL DEFAULT 0 CHECK (sale IN (0, 1))
            """
        )


def _drop_pricing_triggers(connection: sqlite3.Connection) -> None:
    for trigger_name in (
        "validate_product_current_price_insert",
        "validate_product_current_price_update",
        "protect_current_price_delete",
        "protect_current_price_update",
        "validate_price_history_insert",
        "validate_price_history_update",
        "validate_route_product_insert",
        "validate_route_product_update",
        "validate_route_item_product_insert",
        "validate_route_item_product_update",
    ):
        connection.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")


def _ensure_current_price_columns(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(products)")
    }
    if "current_price_date" not in columns:
        connection.execute(
            """
            ALTER TABLE products ADD COLUMN current_price_date REAL
            CHECK (current_price_date IS NULL OR current_price_date >= 0)
            """
        )
    if "current_price" not in columns:
        connection.execute(
            """
            ALTER TABLE products ADD COLUMN current_price REAL
            CHECK (current_price IS NULL OR current_price >= 0)
            """
        )
    if "current_price_quantity" not in columns:
        connection.execute(
            """
            ALTER TABLE products ADD COLUMN current_price_quantity REAL
            CHECK (current_price_quantity IS NULL OR current_price_quantity > 0)
            """
        )
    if "current_price_sale" not in columns:
        connection.execute(
            """
            ALTER TABLE products ADD COLUMN current_price_sale INTEGER
            CHECK (current_price_sale IS NULL OR current_price_sale IN (0, 1))
            """
        )


def _migrate_current_price_references(connection: sqlite3.Connection) -> None:
    legacy_products = connection.execute(
        """
        SELECT id, current_price_date
        FROM products
        WHERE current_price_date IS NOT NULL
            AND current_price IS NULL
            AND current_price_quantity IS NULL
            AND current_price_sale IS NULL
        """
    ).fetchall()
    for product in legacy_products:
        referenced = connection.execute(
            """
            SELECT 1 FROM price_history
            WHERE product_id = ? AND date = ?
            """,
            (product["id"], product["current_price_date"]),
        ).fetchone()
        if referenced is None:
            raise sqlite3.IntegrityError(
                "current price must reference product price history"
            )

        latest = connection.execute(
            """
            SELECT date, price, quantity, sale
            FROM price_history
            WHERE product_id = ?
            ORDER BY date DESC
            LIMIT 1
            """,
            (product["id"],),
        ).fetchone()
        if latest is None:
            raise sqlite3.IntegrityError(
                "current price must reference product price history"
            )
        connection.execute(
            """
            UPDATE products
            SET current_price_date = ?, current_price = ?,
                current_price_quantity = ?, current_price_sale = ?
            WHERE id = ?
            """,
            (
                latest["date"],
                latest["price"],
                latest["quantity"],
                latest["sale"],
                product["id"],
            ),
        )
        connection.execute(
            "DELETE FROM price_history WHERE product_id = ? AND date = ?",
            (product["id"], latest["date"]),
        )

    invalid_tuple = connection.execute(
        """
        SELECT id FROM products
        WHERE (
            (current_price_date IS NOT NULL)
            + (current_price IS NOT NULL)
            + (current_price_quantity IS NOT NULL)
            + (current_price_sale IS NOT NULL)
        ) NOT IN (0, 4)
        OR (
            current_price_date IS NOT NULL AND (
                current_price_date < 0
                OR current_price < 0
                OR current_price_quantity <= 0
                OR current_price_sale NOT IN (0, 1)
            )
        )
        LIMIT 1
        """
    ).fetchone()
    if invalid_tuple is not None:
        raise sqlite3.IntegrityError(
            "current price fields must be all null or all populated"
        )

    invalid_order = connection.execute(
        """
        SELECT product.id
        FROM products AS product
        WHERE product.current_price_date IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM price_history AS history
                WHERE history.product_id = product.id
                    AND history.date >= product.current_price_date
            )
        LIMIT 1
        """
    ).fetchone()
    if invalid_order is not None:
        raise sqlite3.IntegrityError(
            "current price must be newer than product price history"
        )


def _ensure_shopping_list_active_column(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(shopping_lists)")
    }
    if "active" not in columns:
        connection.execute(
            """
            ALTER TABLE shopping_lists ADD COLUMN active INTEGER
            NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
            """
        )


def _ensure_store_coordinate_columns(connection: sqlite3.Connection) -> None:
    columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(stores)")
    }
    if "latitude" not in columns:
        connection.execute(
            """
            ALTER TABLE stores ADD COLUMN latitude REAL
            CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90)
            """
        )
    if "longitude" not in columns:
        connection.execute(
            """
            ALTER TABLE stores ADD COLUMN longitude REAL
            CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
            """
        )
    connection.executemany(
        """
        UPDATE stores SET latitude = ?, longitude = ?
        WHERE address = ? AND latitude IS NULL AND longitude IS NULL
        """,
        (
            (latitude, longitude, address)
            for address, (latitude, longitude) in DEMO_STORE_COORDINATES.items()
        ),
    )
    inconsistent = connection.execute(
        """
        SELECT id FROM stores
        WHERE (latitude IS NULL) != (longitude IS NULL)
        LIMIT 1
        """
    ).fetchone()
    if inconsistent is not None:
        raise sqlite3.IntegrityError(
            "store latitude and longitude must be provided together"
        )


def _table_exists(connection: sqlite3.Connection, table_name: str) -> bool:
    return (
        connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
        is not None
    )


def _migrate_legacy_product_tags(connection: sqlite3.Connection) -> None:
    if not _table_exists(connection, "product_tags"):
        return

    connection.execute(
        """
        INSERT OR IGNORE INTO tags (tag, default_unit, default_quantity)
        SELECT membership.tag, lower(trim(product.unit)),
               COALESCE(product.current_price_quantity, 1)
        FROM (
            SELECT lower(trim(tag)) AS tag, MIN(product_id) AS product_id
            FROM product_tags
            GROUP BY lower(trim(tag))
        ) AS membership
        JOIN products AS product ON product.id = membership.product_id
        """
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO tag_products (tag, product_id)
        SELECT DISTINCT lower(trim(tag)), product_id
        FROM product_tags
        """
    )
    missing_relationship = connection.execute(
        """
        SELECT lower(trim(tag)) AS tag, product_id
        FROM product_tags
        EXCEPT
        SELECT tag, product_id
        FROM tag_products
        LIMIT 1
        """
    ).fetchone()
    if missing_relationship is not None:
        raise sqlite3.IntegrityError("legacy product tag migration was incomplete")
    connection.execute("DROP TABLE product_tags")


def _migrate_legacy_shopping_list_tags(connection: sqlite3.Connection) -> None:
    if not _table_exists(connection, "shopping_list_tags"):
        return

    connection.execute(
        """
        INSERT OR IGNORE INTO tags (tag, default_unit, default_quantity)
        SELECT DISTINCT lower(trim(tag)), 'count', 1
        FROM shopping_list_tags
        """
    )
    connection.execute(
        """
        INSERT OR IGNORE INTO shopping_list_items (
            shopping_list_id, position, tag, unit, quantity
        )
        SELECT shopping_list_id,
               ROW_NUMBER() OVER (
                   PARTITION BY shopping_list_id ORDER BY lower(trim(legacy.tag))
               ) - 1,
               lower(trim(legacy.tag)), tag.default_unit, tag.default_quantity
        FROM shopping_list_tags AS legacy
        JOIN tags AS tag ON tag.tag = lower(trim(legacy.tag))
        ORDER BY shopping_list_id, lower(trim(legacy.tag))
        """
    )
    missing_item = connection.execute(
        """
        SELECT shopping_list_id, lower(trim(tag))
        FROM shopping_list_tags
        EXCEPT
        SELECT shopping_list_id, tag
        FROM shopping_list_items
        LIMIT 1
        """
    ).fetchone()
    if missing_item is not None:
        raise sqlite3.IntegrityError(
            "legacy shopping list item migration was incomplete"
        )
    connection.execute("DROP INDEX IF EXISTS idx_shopping_list_tags_tag")
    connection.execute("DROP TABLE shopping_list_tags")


def _create_global_route_tables(connection: sqlite3.Connection) -> None:
    for statement in (
        """
        CREATE TABLE routes (
            id INTEGER PRIMARY KEY,
            position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
            distance REAL NOT NULL CHECK (distance >= 0),
            time REAL NOT NULL CHECK (time >= 0),
            score REAL NOT NULL,
            product_price REAL NOT NULL CHECK (product_price >= 0),
            matched_item_count INTEGER NOT NULL CHECK (matched_item_count > 0),
            distance_cost REAL NOT NULL CHECK (distance_cost >= 0),
            time_cost REAL NOT NULL CHECK (time_cost >= 0),
            store_cost REAL NOT NULL CHECK (store_cost >= 0),
            modifier_penalty REAL NOT NULL DEFAULT 0 CHECK (modifier_penalty >= 0),
            error_code TEXT CHECK (
                error_code IS NULL OR error_code IN ('PARTIAL_ITEM_MATCH')
            )
        )
        """,
        """
        CREATE TABLE route_stores (
            route_id INTEGER NOT NULL,
            store_id INTEGER NOT NULL,
            position INTEGER NOT NULL CHECK (position >= 0),
            PRIMARY KEY (route_id, store_id),
            UNIQUE (route_id, position),
            FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
            FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE RESTRICT
        )
        """,
        """
        CREATE TABLE route_item_selections (
            route_id INTEGER NOT NULL,
            position INTEGER NOT NULL CHECK (position >= 0),
            requested_tag TEXT NOT NULL CHECK (
                length(trim(requested_tag)) > 0
                AND requested_tag = trim(requested_tag)
                AND requested_tag = lower(requested_tag)
            ),
            requested_unit TEXT NOT NULL CHECK (
                length(trim(requested_unit)) > 0
                AND requested_unit = trim(requested_unit)
                AND requested_unit = lower(requested_unit)
            ),
            requested_quantity REAL NOT NULL CHECK (
                requested_quantity > 0
                AND requested_quantity <= 1.7976931348623157e308
            ),
            product_id INTEGER,
            selection_price REAL,
            CHECK (
                (product_id IS NULL AND selection_price IS NULL)
                OR (
                    product_id IS NOT NULL
                    AND selection_price IS NOT NULL
                    AND selection_price >= 0
                )
            ),
            PRIMARY KEY (route_id, position),
            UNIQUE (route_id, requested_tag),
            UNIQUE (route_id, product_id),
            FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
        )
        """,
        """
        CREATE TABLE route_item_selection_modifiers (
            route_id INTEGER NOT NULL,
            selection_position INTEGER NOT NULL CHECK (selection_position >= 0),
            modifier TEXT NOT NULL CHECK (
                length(trim(modifier)) > 0
                AND modifier = trim(modifier)
                AND modifier = lower(modifier)
            ),
            PRIMARY KEY (route_id, selection_position, modifier),
            FOREIGN KEY (route_id, selection_position)
                REFERENCES route_item_selections(route_id, position)
                ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE route_item_product_modifiers (
            route_id INTEGER NOT NULL,
            selection_position INTEGER NOT NULL CHECK (selection_position >= 0),
            modifier TEXT NOT NULL CHECK (
                length(trim(modifier)) > 0
                AND modifier = trim(modifier)
                AND modifier = lower(modifier)
            ),
            PRIMARY KEY (route_id, selection_position, modifier),
            FOREIGN KEY (route_id, selection_position)
                REFERENCES route_item_selections(route_id, position)
                ON DELETE CASCADE
        )
        """,
        "CREATE INDEX idx_route_stores_store ON route_stores(store_id)",
        """
        CREATE INDEX idx_route_item_selections_product
        ON route_item_selections(product_id)
        """,
    ):
        connection.execute(statement)


def _migrate_global_route_lifecycle(connection: sqlite3.Connection) -> None:
    for trigger_name in (
        "validate_route_product_insert",
        "validate_route_product_update",
        "validate_route_item_product_insert",
        "validate_route_item_product_update",
        "validate_shopping_list_route_insert",
        "validate_shopping_list_route_update",
        "protect_shopping_list_route_status",
        "delete_owned_shopping_list_routes",
    ):
        connection.execute(f"DROP TRIGGER IF EXISTS {trigger_name}")

    connection.execute("DROP INDEX IF EXISTS idx_shopping_list_routes_owner")
    connection.execute("DROP TABLE IF EXISTS shopping_list_routes")

    route_columns = {
        row["name"] for row in connection.execute("PRAGMA table_info(routes)")
    }
    required_route_columns = {
        "id",
        "position",
        "distance",
        "time",
        "score",
        "product_price",
        "matched_item_count",
        "distance_cost",
        "time_cost",
        "store_cost",
        "modifier_penalty",
        "error_code",
    }
    selection_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(route_item_selections)")
    }
    route_schema_rebuilt = (
        route_columns != required_route_columns
        or "selection_price" not in selection_columns
    )
    if route_schema_rebuilt:
        for table_name in (
            "route_item_product_modifiers",
            "route_item_selection_modifiers",
            "route_item_selections",
            "route_tag_selections",
            "route_stores",
            "routes",
        ):
            connection.execute(f"DROP TABLE IF EXISTS {table_name}")
        _create_global_route_tables(connection)

        connection.execute(
            """
            UPDATE route_calculation_state
            SET generation = 0, status = 'IDLE', active_list_count = 0,
                item_count = 0, result_count = 0, optimizer_status = NULL,
                started_at = NULL, completed_at = NULL,
                elapsed_seconds = NULL, timeout_seconds = NULL,
                error_code = NULL, detail = NULL
            WHERE singleton = 1
            """
        )

    shopping_list_columns = {
        row["name"]
        for row in connection.execute("PRAGMA table_info(shopping_lists)")
    }
    for obsolete_column in ("status", "revision"):
        if obsolete_column in shopping_list_columns:
            connection.execute(
                f"ALTER TABLE shopping_lists DROP COLUMN {obsolete_column}"
            )

    connection.execute(
        """
        INSERT OR IGNORE INTO route_calculation_state (singleton)
        VALUES (1)
        """
    )


def initialize_database(database_path: str | Path) -> None:
    if str(database_path) != ":memory:":
        Path(database_path).expanduser().parent.mkdir(parents=True, exist_ok=True)

    connection = connect_database(database_path)
    try:
        with transaction(connection):
            for statement in SCHEMA_STATEMENTS:
                connection.execute(statement)
            _drop_pricing_triggers(connection)
            _ensure_price_history_quantity_real(connection)
            _ensure_price_history_sale(connection)
            _migrate_legacy_product_prices(connection)
            _ensure_current_price_columns(connection)
            _migrate_current_price_references(connection)
            _ensure_shopping_list_active_column(connection)
            _ensure_store_coordinate_columns(connection)
            _migrate_legacy_product_tags(connection)
            _migrate_legacy_shopping_list_tags(connection)
            _migrate_global_route_lifecycle(connection)
            for statement in TRIGGER_STATEMENTS:
                connection.execute(statement)
    finally:
        connection.close()


def is_product_route_eligible(product: Product) -> bool:
    return product.current_price is not None


def list_tags(connection: sqlite3.Connection) -> list[Tag]:
    rows = connection.execute(
        """
        SELECT tag.tag, tag.default_unit, tag.default_quantity,
               tag_product.product_id
        FROM tags AS tag
        LEFT JOIN tag_products AS tag_product ON tag_product.tag = tag.tag
        ORDER BY tag.tag, tag_product.product_id
        """
    ).fetchall()

    tag_data: dict[str, tuple[str, float, list[int]]] = {}
    for row in rows:
        _, _, product_ids = tag_data.setdefault(
            row["tag"],
            (row["default_unit"], row["default_quantity"], []),
        )
        if row["product_id"] is not None:
            product_ids.append(row["product_id"])

    return [
        Tag(
            tag=tag,
            defaultUnit=default_unit,
            defaultQuantity=default_quantity,
            products=product_ids,
        )
        for tag, (default_unit, default_quantity, product_ids) in tag_data.items()
    ]


def list_tag_modifiers(
    connection: sqlite3.Connection, tag_id: str
) -> list[str] | None:
    tag_exists = connection.execute(
        "SELECT 1 FROM tags WHERE tag = ?",
        (tag_id,),
    ).fetchone()
    if tag_exists is None:
        return None

    return [
        row["modifier"]
        for row in connection.execute(
            """
            SELECT DISTINCT product_modifier.modifier
            FROM tag_products AS tag_product
            JOIN product_modifiers AS product_modifier
                ON product_modifier.product_id = tag_product.product_id
            WHERE tag_product.tag = ?
            ORDER BY product_modifier.modifier
            """,
            (tag_id,),
        )
    ]


class ProductPriceConflictError(ValueError):
    pass


def _price_payload_matches(row: sqlite3.Row, price: Price) -> bool:
    return (
        row["price"] == price.price
        and row["quantity"] == price.quantity
        and bool(row["sale"]) == price.sale
    )


def _insert_price_history(
    connection: sqlite3.Connection, product_id: int, price: Price
) -> bool:
    existing = connection.execute(
        """
        SELECT price, quantity, sale FROM price_history
        WHERE product_id = ? AND date = ?
        """,
        (product_id, price.date),
    ).fetchone()
    if existing is not None:
        if _price_payload_matches(existing, price):
            return False
        raise ProductPriceConflictError(
            f"product {product_id} already has a different price at {price.date}"
        )
    connection.execute(
        """
        INSERT INTO price_history (product_id, date, price, quantity, sale)
        VALUES (?, ?, ?, ?, ?)
        """,
        (product_id, price.date, price.price, price.quantity, price.sale),
    )
    return True


def record_product_price(
    connection: sqlite3.Connection, product_id: int, observed_price: Price
) -> bool:
    with transaction(connection, immediate=True):
        product = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = ?
            """,
            (product_id,),
        ).fetchone()
        if product is None:
            raise LookupError(f"product {product_id} does not exist")

        current_date = product["current_price_date"]
        if current_date is not None:
            current_price = Price(
                date=current_date,
                price=product["current_price"],
                quantity=product["current_price_quantity"],
                sale=bool(product["current_price_sale"]),
            )
            if observed_price.date == current_price.date:
                if observed_price == current_price:
                    return False
                raise ProductPriceConflictError(
                    f"product {product_id} already has a different price "
                    f"at {observed_price.date}"
                )
            if observed_price.date < current_price.date:
                return _insert_price_history(connection, product_id, observed_price)

            connection.execute(
                """
                UPDATE products
                SET current_price_date = ?, current_price = ?,
                    current_price_quantity = ?, current_price_sale = ?
                WHERE id = ?
                """,
                (
                    observed_price.date,
                    observed_price.price,
                    observed_price.quantity,
                    observed_price.sale,
                    product_id,
                ),
            )
            _insert_price_history(connection, product_id, current_price)
            return True

        latest_history = connection.execute(
            """
            SELECT date, price, quantity, sale
            FROM price_history
            WHERE product_id = ?
            ORDER BY date DESC
            LIMIT 1
            """,
            (product_id,),
        ).fetchone()
        if latest_history is not None and observed_price.date <= latest_history["date"]:
            return _insert_price_history(connection, product_id, observed_price)

        connection.execute(
            """
            UPDATE products
            SET current_price_date = ?, current_price = ?,
                current_price_quantity = ?, current_price_sale = ?
            WHERE id = ?
            """,
            (
                observed_price.date,
                observed_price.price,
                observed_price.quantity,
                observed_price.sale,
                product_id,
            ),
        )
        return True


def clear_product_current_price(
    connection: sqlite3.Connection, product_id: int
) -> bool:
    with transaction(connection, immediate=True):
        product = connection.execute(
            """
            SELECT current_price_date, current_price,
                   current_price_quantity, current_price_sale
            FROM products WHERE id = ?
            """,
            (product_id,),
        ).fetchone()
        if product is None:
            raise LookupError(f"product {product_id} does not exist")
        if product["current_price_date"] is None:
            return False

        current_price = Price(
            date=product["current_price_date"],
            price=product["current_price"],
            quantity=product["current_price_quantity"],
            sale=bool(product["current_price_sale"]),
        )
        connection.execute(
            """
            UPDATE products
            SET current_price_date = NULL, current_price = NULL,
                current_price_quantity = NULL, current_price_sale = NULL
            WHERE id = ?
            """,
            (product_id,),
        )
        _insert_price_history(connection, product_id, current_price)
        return True


def _next_shopping_list_name(connection: sqlite3.Connection) -> str:
    existing_names = {
        row["name"] for row in connection.execute("SELECT name FROM shopping_lists")
    }
    number = 1
    while f"New List {number}" in existing_names:
        number += 1
    return f"New List {number}"


class UnknownShoppingListTagError(ValueError):
    pass


def _resolve_shopping_list_items(
    connection: sqlite3.Connection,
    requested_items: Sequence[ShoppingListItemInput],
) -> tuple[ShoppingListItem, ...]:
    if not requested_items:
        return ()

    tags = tuple(item.tag for item in requested_items)
    placeholders = ", ".join("?" for _ in tags)
    defaults = {
        row["tag"]: (row["default_unit"], row["default_quantity"])
        for row in connection.execute(
            f"""
            SELECT tag, default_unit, default_quantity
            FROM tags
            WHERE tag IN ({placeholders})
            """,
            tags,
        )
    }
    missing_tags = [tag for tag in tags if tag not in defaults]
    if missing_tags:
        raise UnknownShoppingListTagError(
            f"unknown shopping list tags: {', '.join(missing_tags)}"
        )

    return tuple(
        ShoppingListItem(
            tag=item.tag,
            modifiers=item.modifiers,
            unit=item.unit or defaults[item.tag][0],
            quantity=(
                item.quantity
                if item.quantity is not None
                else defaults[item.tag][1]
            ),
        )
        for item in requested_items
    )


def _load_shopping_list_items(
    connection: sqlite3.Connection, shopping_list_id: int
) -> tuple[ShoppingListItem, ...]:
    rows = connection.execute(
        """
        SELECT item.position, item.tag, item.unit, item.quantity,
               modifier.modifier
        FROM shopping_list_items AS item
        LEFT JOIN shopping_list_item_modifiers AS modifier
            ON modifier.shopping_list_id = item.shopping_list_id
            AND modifier.item_position = item.position
        WHERE item.shopping_list_id = ?
        ORDER BY item.position, modifier.modifier
        """,
        (shopping_list_id,),
    ).fetchall()
    item_data: dict[int, tuple[str, str, float, list[str]]] = {}
    for row in rows:
        tag, unit, quantity, modifiers = item_data.setdefault(
            row["position"],
            (row["tag"], row["unit"], row["quantity"], []),
        )
        if row["modifier"] is not None:
            modifiers.append(row["modifier"])

    return tuple(
        ShoppingListItem(
            tag=tag,
            modifiers=modifiers,
            unit=unit,
            quantity=quantity,
        )
        for tag, unit, quantity, modifiers in item_data.values()
    )


def _insert_shopping_list_items(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    items: Sequence[ShoppingListItem],
) -> None:
    connection.executemany(
        """
        INSERT INTO shopping_list_items (
            shopping_list_id, position, tag, unit, quantity
        )
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            (shopping_list_id, position, item.tag, item.unit, item.quantity)
            for position, item in enumerate(items)
        ),
    )
    connection.executemany(
        """
        INSERT INTO shopping_list_item_modifiers (
            shopping_list_id, item_position, modifier
        )
        VALUES (?, ?, ?)
        """,
        (
            (shopping_list_id, position, modifier)
            for position, item in enumerate(items)
            for modifier in item.modifiers
        ),
    )


def get_shopping_list(
    connection: sqlite3.Connection, shopping_list_id: int
) -> ShoppingList | None:
    row = connection.execute(
        "SELECT id, name, active FROM shopping_lists WHERE id = ?",
        (shopping_list_id,),
    ).fetchone()
    if row is None:
        return None

    items = _load_shopping_list_items(connection, shopping_list_id)
    return ShoppingList(
        id=row["id"],
        name=row["name"],
        active=bool(row["active"]),
        items=list(items),
    )


def list_shopping_lists(connection: sqlite3.Connection) -> list[ShoppingList]:
    shopping_lists: list[ShoppingList] = []
    for row in connection.execute("SELECT id FROM shopping_lists ORDER BY id"):
        shopping_list = get_shopping_list(connection, row["id"])
        if shopping_list is not None:
            shopping_lists.append(shopping_list)
    return shopping_lists


def create_shopping_list(
    connection: sqlite3.Connection, request: ShoppingListCreate
) -> ShoppingList:
    with transaction(connection, immediate=True):
        items = _resolve_shopping_list_items(connection, request.items)
        name = request.name or _next_shopping_list_name(connection)
        cursor = connection.execute(
            "INSERT INTO shopping_lists (name, active) VALUES (?, ?)",
            (name, request.active),
        )
        shopping_list_id = cursor.lastrowid
        if shopping_list_id is None:
            raise RuntimeError("created shopping list did not receive an ID")
        _insert_shopping_list_items(connection, shopping_list_id, items)

    shopping_list = get_shopping_list(connection, shopping_list_id)
    if shopping_list is None:
        raise RuntimeError("created shopping list could not be loaded")
    return shopping_list


@dataclass(frozen=True, slots=True)
class ShoppingListMutation:
    shopping_list: ShoppingList
    route_calculation_required: bool


def replace_shopping_list(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    request: ShoppingListReplace,
) -> ShoppingListMutation | None:
    with transaction(connection, immediate=True):
        items = _resolve_shopping_list_items(connection, request.items)
        row = connection.execute(
            "SELECT active FROM shopping_lists WHERE id = ?",
            (shopping_list_id,),
        ).fetchone()
        if row is None:
            return None

        existing_items = _load_shopping_list_items(connection, shopping_list_id)
        items_changed = existing_items != items
        active_changed = bool(row["active"]) != request.active
        connection.execute(
            "UPDATE shopping_lists SET name = ?, active = ? WHERE id = ?",
            (request.name, request.active, shopping_list_id),
        )
        if items_changed:
            connection.execute(
                "DELETE FROM shopping_list_items WHERE shopping_list_id = ?",
                (shopping_list_id,),
            )
            _insert_shopping_list_items(connection, shopping_list_id, items)

    shopping_list = get_shopping_list(connection, shopping_list_id)
    if shopping_list is None:
        raise RuntimeError("updated shopping list could not be loaded")
    return ShoppingListMutation(
        shopping_list=shopping_list,
        route_calculation_required=active_changed or (items_changed and request.active),
    )


def update_shopping_list_name(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    request: ShoppingListNameUpdate,
) -> ShoppingList | None:
    with transaction(connection, immediate=True):
        cursor = connection.execute(
            "UPDATE shopping_lists SET name = ? WHERE id = ?",
            (request.name, shopping_list_id),
        )
        if cursor.rowcount == 0:
            return None
    return get_shopping_list(connection, shopping_list_id)


def update_shopping_list_active(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    request: ShoppingListActiveUpdate,
) -> ShoppingListMutation | None:
    with transaction(connection, immediate=True):
        row = connection.execute(
            "SELECT active FROM shopping_lists WHERE id = ?",
            (shopping_list_id,),
        ).fetchone()
        if row is None:
            return None
        active_changed = bool(row["active"]) != request.active
        if active_changed:
            connection.execute(
                "UPDATE shopping_lists SET active = ? WHERE id = ?",
                (request.active, shopping_list_id),
            )

    shopping_list = get_shopping_list(connection, shopping_list_id)
    if shopping_list is None:
        raise RuntimeError("updated shopping list could not be loaded")
    return ShoppingListMutation(
        shopping_list=shopping_list,
        route_calculation_required=active_changed,
    )


def delete_shopping_list(
    connection: sqlite3.Connection, shopping_list_id: int
) -> ShoppingList | None:
    with transaction(connection, immediate=True):
        deleted = get_shopping_list(connection, shopping_list_id)
        if deleted is None:
            return None
        cursor = connection.execute(
            "DELETE FROM shopping_lists WHERE id = ?",
            (shopping_list_id,),
        )
        if cursor.rowcount == 0:
            raise RuntimeError("shopping list disappeared during deletion")
    return deleted


@dataclass(frozen=True, slots=True)
class ActiveShoppingListSnapshot:
    active_list_count: int
    items: tuple[ShoppingListItem, ...]
    tag_defaults: tuple[Tag, ...]


def load_active_shopping_list_snapshot(
    connection: sqlite3.Connection,
) -> ActiveShoppingListSnapshot:
    with transaction(connection):
        active_ids = [
            row["id"]
            for row in connection.execute(
                "SELECT id FROM shopping_lists WHERE active = 1 ORDER BY id"
            )
        ]
        items = tuple(
            item
            for shopping_list_id in active_ids
            for item in _load_shopping_list_items(connection, shopping_list_id)
        )
        tags = tuple(list_tags(connection))
    return ActiveShoppingListSnapshot(
        active_list_count=len(active_ids),
        items=items,
        tag_defaults=tags,
    )


def _route_calculation_from_row(row: sqlite3.Row) -> RouteCalculationResponse:
    return RouteCalculationResponse(
        generation=row["generation"],
        status=row["status"],
        activeListCount=row["active_list_count"],
        itemCount=row["item_count"],
        resultCount=row["result_count"],
        optimizerStatus=row["optimizer_status"],
        startedAt=row["started_at"],
        completedAt=row["completed_at"],
        elapsedSeconds=row["elapsed_seconds"],
        timeoutSeconds=row["timeout_seconds"],
        errorCode=row["error_code"],
        detail=row["detail"],
    )


def get_route_calculation(
    connection: sqlite3.Connection,
) -> RouteCalculationResponse:
    row = connection.execute(
        "SELECT * FROM route_calculation_state WHERE singleton = 1"
    ).fetchone()
    if row is None:
        raise RuntimeError("route calculation state is not initialized")
    return _route_calculation_from_row(row)


def begin_route_calculation(
    connection: sqlite3.Connection,
    *,
    active_list_count: int,
    item_count: int,
    started_at: float,
) -> RouteCalculationResponse:
    with transaction(connection, immediate=True):
        connection.execute("DELETE FROM routes")
        row = connection.execute(
            """
            UPDATE route_calculation_state
            SET generation = generation + 1,
                status = 'RUNNING',
                active_list_count = ?,
                item_count = ?,
                result_count = 0,
                optimizer_status = NULL,
                started_at = ?,
                completed_at = NULL,
                elapsed_seconds = NULL,
                timeout_seconds = NULL,
                error_code = NULL,
                detail = NULL
            WHERE singleton = 1
            RETURNING *
            """,
            (active_list_count, item_count, started_at),
        ).fetchone()
        if row is None:
            raise RuntimeError("route calculation state is not initialized")
        calculation = _route_calculation_from_row(row)
    return calculation


def complete_empty_route_calculation(
    connection: sqlite3.Connection,
    generation: int,
    *,
    completed_at: float,
) -> bool:
    with transaction(connection, immediate=True):
        cursor = connection.execute(
            """
            UPDATE route_calculation_state
            SET status = 'SUCCEEDED', result_count = 0,
                completed_at = ?, elapsed_seconds = completed_at - started_at
            WHERE singleton = 1 AND generation = ? AND status = 'RUNNING'
            """,
            (completed_at, generation),
        )
    return cursor.rowcount > 0


def fail_route_calculation(
    connection: sqlite3.Connection,
    generation: int,
    *,
    error_code: RouteOptimizationErrorCode,
    detail: str,
    completed_at: float,
) -> bool:
    normalized_detail = detail.strip()
    if not normalized_detail:
        raise ValueError("detail must not be blank")
    with transaction(connection, immediate=True):
        cursor = connection.execute(
            """
            UPDATE route_calculation_state
            SET status = 'FAILED', result_count = 0,
                completed_at = ?, elapsed_seconds = completed_at - started_at,
                error_code = ?, detail = ?
            WHERE singleton = 1 AND generation = ? AND status = 'RUNNING'
            """,
            (completed_at, error_code.value, normalized_detail, generation),
        )
    return cursor.rowcount > 0


_PRICE_QUANTUM = Decimal("0.01")


def _selection_price(
    selection: RouteItemSelection,
    products_by_id: dict[int, OptimizationProduct],
) -> float | None:
    if selection.product is None:
        return None
    product = products_by_id.get(selection.product)
    if product is None:
        raise ValueError(f"route product {selection.product} is missing from catalog")
    price = (
        Decimal(str(product.price))
        / Decimal(str(product.price_quantity))
        * Decimal(str(selection.quantity))
    ).quantize(_PRICE_QUANTUM, rounding=ROUND_HALF_UP)
    return float(price)


def publish_route_calculation(
    connection: sqlite3.Connection,
    generation: int,
    result: RouteOptimizationResponse,
    catalog: OptimizationCatalog,
    *,
    completed_at: float,
) -> bool:
    products_by_id = {product.id: product for product in catalog.products}
    with transaction(connection, immediate=True):
        current = connection.execute(
            """
            SELECT 1 FROM route_calculation_state
            WHERE singleton = 1 AND generation = ? AND status = 'RUNNING'
            """,
            (generation,),
        ).fetchone()
        if current is None:
            return False

        for route_position, candidate in enumerate(result.candidates):
            cursor = connection.execute(
                """
                INSERT INTO routes (
                    position, distance, time, score, product_price,
                    matched_item_count, distance_cost, time_cost, store_cost,
                    modifier_penalty, error_code
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    route_position,
                    candidate.distance,
                    candidate.time,
                    candidate.score,
                    candidate.product_price,
                    candidate.matched_item_count,
                    candidate.score_components.distance_cost,
                    candidate.score_components.time_cost,
                    candidate.score_components.store_cost,
                    candidate.score_components.modifier_penalty,
                    candidate.error_code.value if candidate.error_code else None,
                ),
            )
            route_id = cursor.lastrowid
            if route_id is None:
                raise RuntimeError("persisted route did not receive an ID")
            connection.executemany(
                """
                INSERT INTO route_stores (route_id, store_id, position)
                VALUES (?, ?, ?)
                """,
                (
                    (route_id, store_id, position)
                    for position, store_id in enumerate(candidate.stores)
                ),
            )
            for selection_position, selection in enumerate(candidate.selections):
                selection_price = _selection_price(selection, products_by_id)
                connection.execute(
                    """
                    INSERT INTO route_item_selections (
                        route_id, position, requested_tag, requested_unit,
                        requested_quantity, product_id, selection_price
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        route_id,
                        selection_position,
                        selection.tag,
                        selection.unit,
                        selection.quantity,
                        selection.product,
                        selection_price,
                    ),
                )
                connection.executemany(
                    """
                    INSERT INTO route_item_selection_modifiers (
                        route_id, selection_position, modifier
                    ) VALUES (?, ?, ?)
                    """,
                    (
                        (route_id, selection_position, modifier)
                        for modifier in selection.modifiers
                    ),
                )
                if selection.product is not None:
                    product = products_by_id.get(selection.product)
                    if product is None:
                        raise ValueError(
                            f"route product {selection.product} is missing from catalog"
                        )
                    connection.executemany(
                        """
                        INSERT INTO route_item_product_modifiers (
                            route_id, selection_position, modifier
                        ) VALUES (?, ?, ?)
                        """,
                        (
                            (route_id, selection_position, modifier)
                            for modifier in product.modifiers
                        ),
                    )

        cursor = connection.execute(
            """
            UPDATE route_calculation_state
            SET status = 'SUCCEEDED', result_count = ?,
                optimizer_status = ?, completed_at = ?,
                elapsed_seconds = ?, timeout_seconds = ?
            WHERE singleton = 1 AND generation = ? AND status = 'RUNNING'
            """,
            (
                len(result.candidates),
                result.status.value,
                completed_at,
                result.elapsed_seconds,
                result.timeout_seconds,
                generation,
            ),
        )
        if cursor.rowcount == 0:
            raise RuntimeError("route calculation generation changed during publish")
    return True


def get_route_candidates(connection: sqlite3.Connection) -> RouteCandidatesResponse:
    with transaction(connection):
        calculation = get_route_calculation(connection)
        route_rows = connection.execute(
            "SELECT * FROM routes ORDER BY position"
        ).fetchall()
        candidates: list[RouteCandidateResult] = []
        for route in route_rows:
            stores = [
                RouteStoreSummary(
                    id=row["id"],
                    name=row["name"],
                    address=row["address"],
                    latitude=row["latitude"],
                    longitude=row["longitude"],
                )
                for row in connection.execute(
                    """
                    SELECT store.id, store.name, store.address,
                           store.latitude, store.longitude
                    FROM route_stores AS route_store
                    JOIN stores AS store ON store.id = route_store.store_id
                    WHERE route_store.route_id = ?
                    ORDER BY route_store.position
                    """,
                    (route["id"],),
                )
            ]
            selection_rows = connection.execute(
                """
                SELECT selection.position, selection.requested_tag,
                       selection.requested_unit, selection.requested_quantity,
                       selection.product_id, selection.selection_price,
                       product.name AS product_name,
                       product.store_id AS product_store_id,
                       product.unit AS product_unit,
                       route_store.position AS store_position
                FROM route_item_selections AS selection
                LEFT JOIN products AS product ON product.id = selection.product_id
                LEFT JOIN route_stores AS route_store
                    ON route_store.route_id = selection.route_id
                    AND route_store.store_id = product.store_id
                WHERE selection.route_id = ?
                ORDER BY selection.position
                """,
                (route["id"],),
            ).fetchall()
            modifiers_by_position: dict[int, list[str]] = {}
            for modifier_row in connection.execute(
                """
                SELECT selection_position, modifier
                FROM route_item_selection_modifiers
                WHERE route_id = ?
                ORDER BY selection_position, modifier
                """,
                (route["id"],),
            ):
                modifiers_by_position.setdefault(
                    modifier_row["selection_position"], []
                ).append(modifier_row["modifier"])
            product_modifiers_by_position: dict[int, list[str]] = {}
            for modifier_row in connection.execute(
                """
                SELECT selection_position, modifier
                FROM route_item_product_modifiers
                WHERE route_id = ?
                ORDER BY selection_position, modifier
                """,
                (route["id"],),
            ):
                product_modifiers_by_position.setdefault(
                    modifier_row["selection_position"], []
                ).append(modifier_row["modifier"])

            selections = [
                RouteItemSelection(
                    tag=row["requested_tag"],
                    modifiers=modifiers_by_position.get(row["position"], []),
                    unit=row["requested_unit"],
                    quantity=row["requested_quantity"],
                    product=row["product_id"],
                )
                for row in selection_rows
            ]
            products = [
                RouteProductSummary(
                    id=row["product_id"],
                    name=row["product_name"],
                    store=row["product_store_id"],
                    unit=row["product_unit"],
                    modifiers=product_modifiers_by_position.get(
                        row["position"], []
                    ),
                    selectionPrice=row["selection_price"],
                )
                for row in sorted(
                    (row for row in selection_rows if row["product_id"] is not None),
                    key=lambda row: (row["store_position"], row["position"]),
                )
            ]
            candidates.append(
                RouteCandidateResult(
                    id=route["id"],
                    stores=stores,
                    products=products,
                    selections=selections,
                    distance=route["distance"],
                    time=route["time"],
                    score=route["score"],
                    productPrice=route["product_price"],
                    matchedItemCount=route["matched_item_count"],
                    scoreComponents=RouteScoreComponents(
                        productPrice=route["product_price"],
                        distanceCost=route["distance_cost"],
                        timeCost=route["time_cost"],
                        storeCost=route["store_cost"],
                        modifierPenalty=route["modifier_penalty"],
                    ),
                    errorCode=route["error_code"],
                )
            )
    return RouteCandidatesResponse(
        generation=calculation.generation,
        candidates=candidates,
    )


def load_optimization_catalog(
    connection: sqlite3.Connection,
    requested_items: Sequence[ShoppingListItem],
) -> OptimizationCatalog:
    items = tuple(requested_items)
    if not items:
        raise ValueError("requested items must not be empty")
    if len(items) > 50:
        raise ValueError("route optimization supports at most 50 items")

    tags = tuple(item.tag for item in items)
    placeholders = ", ".join("?" for _ in tags)
    rows = connection.execute(
        f"""
        SELECT
            store.id AS store_id,
            store.name AS store_name,
            store.address AS store_address,
            store.latitude AS store_latitude,
            store.longitude AS store_longitude,
            product.id AS product_id,
            product.name AS product_name,
            product.unit AS product_unit,
            product.current_price AS product_price,
            product.current_price_quantity AS product_price_quantity,
            tag_product.tag AS matching_tag,
            modifier.modifier AS product_modifier
        FROM tag_products AS tag_product
        JOIN products AS product
            ON product.id = tag_product.product_id
        JOIN stores AS store
            ON store.id = product.store_id
        LEFT JOIN product_modifiers AS modifier
            ON modifier.product_id = product.id
        WHERE tag_product.tag IN ({placeholders})
            AND product.current_price_date IS NOT NULL
            AND product.current_price IS NOT NULL
            AND product.current_price_quantity IS NOT NULL
            AND product.current_price_sale IS NOT NULL
        ORDER BY store.id, product.id, tag_product.tag, modifier.modifier
        """,
        tags,
    ).fetchall()

    product_rows: dict[int, sqlite3.Row] = {}
    matching_tags_by_product: dict[int, list[str]] = {}
    modifiers_by_product: dict[int, list[str]] = {}
    for row in rows:
        product_id = row["product_id"]
        product_rows[product_id] = row
        matching_tags = matching_tags_by_product.setdefault(product_id, [])
        if row["matching_tag"] not in matching_tags:
            matching_tags.append(row["matching_tag"])
        modifiers = modifiers_by_product.setdefault(product_id, [])
        if (
            row["product_modifier"] is not None
            and row["product_modifier"] not in modifiers
        ):
            modifiers.append(row["product_modifier"])

    eligible_products: list[OptimizationProduct] = []
    eligible_rows: dict[int, sqlite3.Row] = {}
    for product_id, row in sorted(product_rows.items()):
        product_modifiers = tuple(sorted(modifiers_by_product[product_id]))
        matching_item_indices = tuple(
            item_index
            for item_index, item in enumerate(items)
            if item.tag in matching_tags_by_product[product_id]
            and item.unit == row["product_unit"]
        )
        if not matching_item_indices:
            continue
        eligible_rows[product_id] = row
        eligible_products.append(
            OptimizationProduct(
            id=product_id,
            name=row["product_name"],
            store_id=row["store_id"],
            unit=row["product_unit"],
            price=row["product_price"],
                price_quantity=row["product_price_quantity"],
                modifiers=product_modifiers,
                matching_item_indices=matching_item_indices,
            )
        )

    products = tuple(eligible_products)
    store_rows: dict[int, sqlite3.Row] = {}
    store_products: dict[int, list[int]] = {}
    for product in products:
        row = eligible_rows[product.id]
        store_rows[product.store_id] = row
        store_products.setdefault(product.store_id, []).append(product.id)
    stores = tuple(
        Store(
            id=store_id,
            name=row["store_name"],
            address=row["store_address"],
            latitude=row["store_latitude"],
            longitude=row["store_longitude"],
            products=store_products[store_id],
        )
        for store_id, row in sorted(store_rows.items())
    )
    return OptimizationCatalog(
        requested_items=items,
        stores=stores,
        products=products,
    )


class ProductSelectionResolver(Protocol):
    """Select only products whose current_price is not None."""

    async def resolve(
        self, requested_items: Sequence[ShoppingListItem]
    ) -> list[RouteItemSelection]: ...


@dataclass(frozen=True, slots=True)
class ResolvedRouteMetrics:
    stores: list[int]
    distance: float
    time: float


class RouteMetricsResolver(Protocol):
    async def resolve(
        self, stores: Sequence[Store], products: Sequence[Product]
    ) -> ResolvedRouteMetrics: ...


class RouteScorer(Protocol):
    def score(
        self,
        stores: Sequence[Store],
        products: Sequence[Product],
        distance: float,
        time: float,
    ) -> float: ...