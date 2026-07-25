"""Database bootstrap and extension contracts for backend resolvers."""

import sqlite3
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from backend.types import (
    Price,
    Product,
    RouteTagSelection,
    ShoppingList,
    ShoppingListCreate,
    ShoppingListNameUpdate,
    ShoppingListReplace,
    ShoppingListStatus,
    Store,
)

from backend.route_optimizer import OptimizationCatalog, OptimizationProduct


SCHEMA_STATEMENTS = (
    """
    CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL CHECK (length(trim(name)) > 0),
        address TEXT NOT NULL CHECK (length(trim(address)) > 0)
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
    CREATE TABLE IF NOT EXISTS product_tags (
        product_id INTEGER NOT NULL,
        tag TEXT NOT NULL CHECK (length(trim(tag)) > 0),
        position INTEGER NOT NULL CHECK (position >= 0),
        PRIMARY KEY (product_id, tag),
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
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
            status IN ('PENDING', 'COMPUTING', 'READY', 'FAILED')
        ),
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shopping_list_tags (
        shopping_list_id INTEGER NOT NULL,
        tag TEXT NOT NULL CHECK (
            length(trim(tag)) > 0
            AND tag = trim(tag)
            AND tag = lower(tag)
        ),
        PRIMARY KEY (shopping_list_id, tag),
        FOREIGN KEY (shopping_list_id)
            REFERENCES shopping_lists(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        distance REAL NOT NULL CHECK (distance >= 0),
        time REAL NOT NULL CHECK (time >= 0),
        score REAL NOT NULL,
        error_code TEXT CHECK (
            error_code IS NULL OR error_code IN ('PARTIAL_TAG_MATCH')
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
    CREATE TABLE IF NOT EXISTS route_tag_selections (
        route_id INTEGER NOT NULL,
        requested_tag TEXT NOT NULL CHECK (length(trim(requested_tag)) > 0),
        position INTEGER NOT NULL CHECK (position >= 0),
        product_id INTEGER,
        PRIMARY KEY (route_id, requested_tag),
        UNIQUE (route_id, position),
        UNIQUE (route_id, product_id),
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS shopping_list_routes (
        shopping_list_id INTEGER NOT NULL,
        route_id INTEGER PRIMARY KEY,
        position INTEGER NOT NULL CHECK (position >= 0),
        UNIQUE (shopping_list_id, position),
        FOREIGN KEY (shopping_list_id)
            REFERENCES shopping_lists(id) ON DELETE CASCADE,
        FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id)",
    "CREATE INDEX IF NOT EXISTS idx_product_tags_tag ON product_tags(tag)",
    """
    CREATE INDEX IF NOT EXISTS idx_price_history_latest
    ON price_history(product_id, date DESC)
    """,
    "CREATE INDEX IF NOT EXISTS idx_route_stores_store ON route_stores(store_id)",
    """
    CREATE INDEX IF NOT EXISTS idx_route_tag_selections_product
    ON route_tag_selections(product_id)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_shopping_list_tags_tag
    ON shopping_list_tags(tag)
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_shopping_list_routes_owner
    ON shopping_list_routes(shopping_list_id, position)
    """,
)

TRIGGER_STATEMENTS = (
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
    CREATE TRIGGER IF NOT EXISTS validate_route_product_insert
    BEFORE INSERT ON route_tag_selections
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
    CREATE TRIGGER IF NOT EXISTS validate_route_product_update
    BEFORE UPDATE OF product_id ON route_tag_selections
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
    CREATE TRIGGER IF NOT EXISTS validate_shopping_list_route_insert
    BEFORE INSERT ON shopping_list_routes
    BEGIN
        SELECT RAISE(ABORT, 'shopping list routes require READY status')
        WHERE NOT EXISTS (
            SELECT 1 FROM shopping_lists
            WHERE id = NEW.shopping_list_id AND status = 'READY'
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS validate_shopping_list_route_update
    BEFORE UPDATE OF shopping_list_id ON shopping_list_routes
    BEGIN
        SELECT RAISE(ABORT, 'shopping list routes require READY status')
        WHERE NOT EXISTS (
            SELECT 1 FROM shopping_lists
            WHERE id = NEW.shopping_list_id AND status = 'READY'
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS protect_shopping_list_route_status
    BEFORE UPDATE OF status ON shopping_lists
    WHEN NEW.status != 'READY'
    BEGIN
        SELECT RAISE(ABORT, 'shopping list routes require READY status')
        WHERE EXISTS (
            SELECT 1 FROM shopping_list_routes
            WHERE shopping_list_id = OLD.id
        );
    END
    """,
    """
    CREATE TRIGGER IF NOT EXISTS delete_owned_shopping_list_routes
    BEFORE DELETE ON shopping_lists
    BEGIN
        DELETE FROM routes
        WHERE id IN (
            SELECT route_id FROM shopping_list_routes
            WHERE shopping_list_id = OLD.id
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
            for statement in TRIGGER_STATEMENTS:
                connection.execute(statement)
    finally:
        connection.close()


def is_product_route_eligible(product: Product) -> bool:
    return product.current_price is not None


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


def get_shopping_list(
    connection: sqlite3.Connection, shopping_list_id: int
) -> ShoppingList | None:
    row = connection.execute(
        "SELECT id, name, active, status FROM shopping_lists WHERE id = ?",
        (shopping_list_id,),
    ).fetchone()
    if row is None:
        return None

    tags = {
        tag_row["tag"]
        for tag_row in connection.execute(
            """
            SELECT tag FROM shopping_list_tags
            WHERE shopping_list_id = ?
            """,
            (shopping_list_id,),
        )
    }
    routes = [
        route_row["route_id"]
        for route_row in connection.execute(
            """
            SELECT route_id FROM shopping_list_routes
            WHERE shopping_list_id = ?
            ORDER BY position
            """,
            (shopping_list_id,),
        )
    ]
    return ShoppingList(
        id=row["id"],
        name=row["name"],
        active=bool(row["active"]),
        tags=tags,
        routes=routes,
        status=row["status"],
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
        name = request.name or _next_shopping_list_name(connection)
        cursor = connection.execute(
            "INSERT INTO shopping_lists (name, active) VALUES (?, ?)",
            (name, request.active),
        )
        shopping_list_id = cursor.lastrowid
        if shopping_list_id is None:
            raise RuntimeError("created shopping list did not receive an ID")
        connection.executemany(
            """
            INSERT INTO shopping_list_tags (shopping_list_id, tag)
            VALUES (?, ?)
            """,
            ((shopping_list_id, tag) for tag in sorted(request.tags)),
        )

    shopping_list = get_shopping_list(connection, shopping_list_id)
    if shopping_list is None:
        raise RuntimeError("created shopping list could not be loaded")
    return shopping_list


def replace_shopping_list(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    request: ShoppingListReplace,
) -> ShoppingList | None:
    with transaction(connection, immediate=True):
        row = connection.execute(
            "SELECT revision FROM shopping_lists WHERE id = ?",
            (shopping_list_id,),
        ).fetchone()
        if row is None:
            return None

        existing_tags = {
            tag_row["tag"]
            for tag_row in connection.execute(
                """
                SELECT tag FROM shopping_list_tags
                WHERE shopping_list_id = ?
                """,
                (shopping_list_id,),
            )
        }
        if existing_tags == request.tags:
            connection.execute(
                "UPDATE shopping_lists SET name = ?, active = ? WHERE id = ?",
                (request.name, request.active, shopping_list_id),
            )
        else:
            connection.execute(
                """
                DELETE FROM routes
                WHERE id IN (
                    SELECT route_id FROM shopping_list_routes
                    WHERE shopping_list_id = ?
                )
                """,
                (shopping_list_id,),
            )
            connection.execute(
                """
                UPDATE shopping_lists
                SET name = ?, active = ?, status = 'PENDING', revision = revision + 1
                WHERE id = ?
                """,
                (request.name, request.active, shopping_list_id),
            )
            connection.execute(
                "DELETE FROM shopping_list_tags WHERE shopping_list_id = ?",
                (shopping_list_id,),
            )
            connection.executemany(
                """
                INSERT INTO shopping_list_tags (shopping_list_id, tag)
                VALUES (?, ?)
                """,
                ((shopping_list_id, tag) for tag in sorted(request.tags)),
            )

    return get_shopping_list(connection, shopping_list_id)


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


def delete_shopping_list(
    connection: sqlite3.Connection, shopping_list_id: int
) -> bool:
    with transaction(connection):
        cursor = connection.execute(
            "DELETE FROM shopping_lists WHERE id = ?",
            (shopping_list_id,),
        )
    return cursor.rowcount > 0


@dataclass(frozen=True, slots=True)
class ShoppingListComputation:
    id: int
    revision: int
    tags: set[str]


def claim_pending_shopping_list(
    connection: sqlite3.Connection,
) -> ShoppingListComputation | None:
    with transaction(connection):
        row = connection.execute(
            """
            UPDATE shopping_lists
            SET status = 'COMPUTING'
            WHERE id = (
                SELECT id FROM shopping_lists
                WHERE status = 'PENDING'
                ORDER BY id
                LIMIT 1
            )
            RETURNING id, revision
            """
        ).fetchone()
        if row is None:
            return None
        tags = {
            tag_row["tag"]
            for tag_row in connection.execute(
                """
                SELECT tag FROM shopping_list_tags
                WHERE shopping_list_id = ?
                """,
                (row["id"],),
            )
        }
    return ShoppingListComputation(id=row["id"], revision=row["revision"], tags=tags)


def publish_shopping_list_routes(
    connection: sqlite3.Connection,
    shopping_list_id: int,
    revision: int,
    route_ids: Sequence[int],
) -> bool:
    ranked_route_ids = tuple(route_ids)
    if any(route_id <= 0 for route_id in ranked_route_ids):
        raise ValueError("route IDs must be positive")
    if len(ranked_route_ids) != len(set(ranked_route_ids)):
        raise ValueError("route IDs must not contain duplicates")

    with transaction(connection, immediate=True):
        cursor = connection.execute(
            """
            UPDATE shopping_lists
            SET status = 'READY'
            WHERE id = ? AND revision = ? AND status = 'COMPUTING'
            """,
            (shopping_list_id, revision),
        )
        if cursor.rowcount == 0:
            return False
        if ranked_route_ids:
            placeholders = ", ".join("?" for _ in ranked_route_ids)
            existing_route_ids = {
                row["id"]
                for row in connection.execute(
                    f"SELECT id FROM routes WHERE id IN ({placeholders})",
                    ranked_route_ids,
                )
            }
            missing_route_ids = set(ranked_route_ids) - existing_route_ids
            if missing_route_ids:
                raise ValueError(
                    f"route IDs do not exist: {sorted(missing_route_ids)}"
                )
        connection.executemany(
            """
            INSERT INTO shopping_list_routes (shopping_list_id, route_id, position)
            VALUES (?, ?, ?)
            """,
            (
                (shopping_list_id, route_id, position)
                for position, route_id in enumerate(ranked_route_ids)
            ),
        )
    return True


def fail_shopping_list_computation(
    connection: sqlite3.Connection, shopping_list_id: int, revision: int
) -> bool:
    with transaction(connection):
        cursor = connection.execute(
            """
            UPDATE shopping_lists
            SET status = 'FAILED'
            WHERE id = ? AND revision = ? AND status = 'COMPUTING'
            """,
            (shopping_list_id, revision),
        )
    return cursor.rowcount > 0


def requeue_shopping_list(
    connection: sqlite3.Connection, shopping_list_id: int
) -> bool:
    with transaction(connection):
        cursor = connection.execute(
            """
            UPDATE shopping_lists
            SET status = 'PENDING'
            WHERE id = ? AND status = 'FAILED'
            """,
            (shopping_list_id,),
        )
    return cursor.rowcount > 0


def load_optimization_catalog(
    connection: sqlite3.Connection, requested_tags: Sequence[str]
) -> OptimizationCatalog:
    tags = tuple(sorted(set(requested_tags)))
    if not tags:
        raise ValueError("requested tags must not be empty")
    if len(tags) > 50:
        raise ValueError("route optimization supports at most 50 tags")

    placeholders = ", ".join("?" for _ in tags)
    rows = connection.execute(
        f"""
        SELECT
            store.id AS store_id,
            store.name AS store_name,
            store.address AS store_address,
            product.id AS product_id,
            product.name AS product_name,
            product.unit AS product_unit,
            product.current_price AS product_price,
            product_tag.tag AS matching_tag
        FROM product_tags AS product_tag
        JOIN products AS product
            ON product.id = product_tag.product_id
        JOIN stores AS store
            ON store.id = product.store_id
        WHERE product_tag.tag IN ({placeholders})
            AND product.current_price_date IS NOT NULL
            AND product.current_price IS NOT NULL
            AND product.current_price_quantity IS NOT NULL
            AND product.current_price_sale IS NOT NULL
        ORDER BY store.id, product.id, product_tag.tag
        """,
        tags,
    ).fetchall()

    product_rows: dict[int, sqlite3.Row] = {}
    product_tags: dict[int, list[str]] = {}
    store_rows: dict[int, sqlite3.Row] = {}
    store_products: dict[int, list[int]] = {}
    for row in rows:
        product_id = row["product_id"]
        store_id = row["store_id"]
        product_rows[product_id] = row
        product_tags.setdefault(product_id, []).append(row["matching_tag"])
        store_rows[store_id] = row
        products = store_products.setdefault(store_id, [])
        if not products or products[-1] != product_id:
            products.append(product_id)

    products = tuple(
        OptimizationProduct(
            id=product_id,
            name=row["product_name"],
            store_id=row["store_id"],
            unit=row["product_unit"],
            price=row["product_price"],
            matching_tags=tuple(product_tags[product_id]),
        )
        for product_id, row in sorted(product_rows.items())
    )
    stores = tuple(
        Store(
            id=store_id,
            name=row["store_name"],
            address=row["store_address"],
            products=store_products[store_id],
        )
        for store_id, row in sorted(store_rows.items())
    )
    return OptimizationCatalog(
        requested_tags=tags,
        stores=stores,
        products=products,
    )


class ProductSelectionResolver(Protocol):
    """Select only products whose current_price is not None."""

    async def resolve(self, requested_tags: Sequence[str]) -> list[RouteTagSelection]: ...


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