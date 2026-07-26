import sqlite3
from datetime import date

import pandas as pd

from backend.tools.grocery_prices import (
    IN_SEASON_MODIFIER,
    _classify_seasonality,
    tag_in_season_products,
)
from backend.tools.seed import SPECIALTY_PRODUCTS, generate_price_history


def test_seasonality_classifier_detects_generated_summer_low() -> None:
    peaches = next(
        product for product in SPECIALTY_PRODUCTS if product.name == "Yellow Peaches"
    )
    history = generate_price_history(
        peaches,
        store_index=3,
        as_of=date(2026, 7, 24),
        seed=1234,
    )
    price_history = pd.DataFrame(
        {
            "product_id": [1] * len(history),
            "date": pd.to_datetime(
                [entry.date for entry in history], unit="s", utc=True
            ).tz_localize(None),
            "price": [entry.price for entry in history],
        }
    )

    result = _classify_seasonality(price_history, 1, "date")

    assert result is not None
    assert result["has_seasonality"] is True
    assert 7 in result["seasonal_months"]


def test_tag_in_season_products_synchronizes_derived_modifier() -> None:
    connection = sqlite3.connect(":memory:")
    connection.execute(
        """
        CREATE TABLE product_modifiers (
            product_id INTEGER NOT NULL,
            modifier TEXT NOT NULL,
            position INTEGER NOT NULL,
            PRIMARY KEY (product_id, modifier),
            UNIQUE (product_id, position)
        )
        """
    )
    connection.executemany(
        """
        INSERT INTO product_modifiers (product_id, modifier, position)
        VALUES (?, ?, ?)
        """,
        (
            (1, "organic", 0),
            (2, "on sale", 0),
            (3, "origin: washington", 0),
            (3, IN_SEASON_MODIFIER, 1),
        ),
    )
    results = [
        {"product_id": 1, "has_seasonality": True, "seasonal_months": [7]},
        {"product_id": 1, "has_seasonality": True, "seasonal_months": [7]},
        {"product_id": 2, "has_seasonality": True, "seasonal_months": [8]},
        {"product_id": 3, "has_seasonality": False, "seasonal_months": []},
    ]

    assert tag_in_season_products(connection, results, current_month=7) == (1,)
    assert tag_in_season_products(connection, results, current_month=7) == (1,)

    assert connection.execute(
        """
        SELECT product_id, modifier, position
        FROM product_modifiers
        ORDER BY product_id, position
        """
    ).fetchall() == [
        (1, "organic", 0),
        (1, IN_SEASON_MODIFIER, 1),
        (2, "on sale", 0),
        (3, "origin: washington", 0),
    ]
    connection.close()