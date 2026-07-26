from __future__ import annotations

import sqlite3
from datetime import date
from typing import TypedDict

import pandas as pd
from prophet import Prophet


IN_SEASON_MODIFIER = "in season"


class SeasonalityResult(TypedDict):
    product_id: int
    has_seasonality: bool
    seasonal_months: list[int]


def predict_product(
    price_history, # price history data
    date_var, # where date is stored
    product_id, # product id to predict price for
    product_var='product_id', # specify where product id is
    price_var = 'price', # specify where price var is
    forecast_days=30, # number of forecast days
    min_history = 30 # need at least a month of data to predict
):
    # get product to predict
    prod = (
        price_history[price_history[product_var] == product_id]
        .sort_values(date_var)
    )

    # 
    if len(prod) < min_history:
        return None

    # create data frame for prophet
    df = pd.DataFrame({
        'ds': pd.to_datetime(prod[date_var]),
        'y': prod[price_var]
    })

    # fit prophet model
    model = Prophet(
        changepoint_prior_scale=0.05,
        weekly_seasonality=True,  # pyright: ignore[reportArgumentType]
        yearly_seasonality=True,  # pyright: ignore[reportArgumentType]
    )
    model.fit(df)
    
    # get future days from forecast_days
    future = model.make_future_dataframe(
        periods=forecast_days
    )
    
    # make prediction
    forecast = model.predict(future)
    
    # return future predictions
    result = forecast[
        ['ds', 'yhat', 'yhat_lower', 'yhat_upper']
    ].tail(forecast_days)

    result.rename(
        columns = {'ds' : 'date', 'yhat' : 'predicted_price', 'yhat_lower' : 'predicted_price_lowerbound', 'yhat_upper' : 'predicted_price_upperbound'}, 
        inplace = True)
    
    return result

def _classify_seasonality(
    price_history: pd.DataFrame,
    product_id: int,
    date_var: str,
    product_var: str = "product_id",
    price_var: str = "price",
    min_history: int = 30,
    season_month_quantile: float = 0.10,
    price_reduction_threshold: float = 0.10,
) -> SeasonalityResult | None:
    # get product
    prod = (
        price_history[price_history[product_var] == product_id]
        .sort_values(date_var)
        .copy()
    )
    
    if len(prod) < min_history:
        return None
    
    df = pd.DataFrame({
        'ds': pd.to_datetime(prod[date_var]),
        'y': prod[price_var]
    })

    # time series model to identify yearly seasonality
    model = Prophet(
        yearly_seasonality=True,  # pyright: ignore[reportArgumentType]
        weekly_seasonality=False,  # pyright: ignore[reportArgumentType]
        daily_seasonality=False,  # pyright: ignore[reportArgumentType]
    )

    # fit forecast
    model.fit(df)
    forecast = model.predict(df)

    # get monthly seasonal effect
    forecast['month'] = forecast['ds'].dt.month
    monthly_effect = (
        forecast
        .groupby('month')['yearly']
        .mean()
        .sort_index()
    )

    threshold = monthly_effect.quantile(season_month_quantile)
    
    # seasonal if there is any monthly effect is greater than threshold
    seasonal_months = [
        int(month)
        for month in monthly_effect[monthly_effect <= threshold].index
    ]
  
    prod['month'] = pd.to_datetime(
        prod[date_var]
    ).dt.month

    seasonal_prices = prod.loc[
        prod['month'].isin(seasonal_months),
        price_var
    ]

    non_seasonal_prices = prod.loc[
        ~prod['month'].isin(seasonal_months),
        price_var
    ]

    if len(seasonal_prices) == 0 or len(non_seasonal_prices) == 0:
        return None
    
    seasonal_price = seasonal_prices.mean()
    non_seasonal_price = non_seasonal_prices.mean()
    
    # percent reduction
    price_reduction_pct = (
        (non_seasonal_price - seasonal_price)
        / non_seasonal_price
    )

    # seasonal if seasonal months are at least % cheaper
    has_seasonality = bool(
        price_reduction_pct >= price_reduction_threshold
    )
    
    # remove seasonal months for nonseasonal products
    if not has_seasonality:
        seasonal_months = []
    
    return SeasonalityResult(
        product_id=product_id,
        has_seasonality=has_seasonality,
        seasonal_months=seasonal_months,
    )


def _load_price_history(connection: sqlite3.Connection) -> pd.DataFrame:
    price_history = pd.read_sql_query(
        """
        SELECT product_id, date, price
        FROM price_history
        UNION ALL
        SELECT id AS product_id, current_price_date AS date,
               current_price AS price
        FROM products
        WHERE current_price_date IS NOT NULL
        ORDER BY product_id, date
        """,
        connection,
    )
    if not price_history.empty:
        price_history["date"] = pd.to_datetime(
            price_history["date"], unit="s", utc=True
        ).dt.tz_localize(None)
    return price_history


def tag_in_season_products(
    connection: sqlite3.Connection,
    seasonality_results: list[SeasonalityResult],
    *,
    current_month: int,
) -> tuple[int, ...]:
    if not 1 <= current_month <= 12:
        raise ValueError("current_month must be between 1 and 12")

    tagged_product_ids = tuple(
        sorted({
            result["product_id"]
            for result in seasonality_results
            if result["has_seasonality"]
            and current_month in result["seasonal_months"]
        })
    )
    existing_modifiers = connection.execute(
        """
        SELECT product_id, modifier, position
        FROM product_modifiers
        ORDER BY product_id, position
        """
    ).fetchall()

    modifiers_by_product: dict[int, list[str]] = {}
    previously_tagged_product_ids: set[int] = set()
    for row in existing_modifiers:
        product_id = int(row[0])
        modifier = str(row[1])
        if modifier == IN_SEASON_MODIFIER:
            previously_tagged_product_ids.add(product_id)
        else:
            modifiers_by_product.setdefault(product_id, []).append(modifier)

    for product_id in tagged_product_ids:
        modifiers_by_product.setdefault(product_id, []).append(IN_SEASON_MODIFIER)

    affected_product_ids = previously_tagged_product_ids | set(tagged_product_ids)
    connection.execute("SAVEPOINT tag_in_season_products")
    try:
        for product_id in sorted(affected_product_ids):
            connection.execute(
                "DELETE FROM product_modifiers WHERE product_id = ?",
                (product_id,),
            )
            connection.executemany(
                """
                INSERT INTO product_modifiers (product_id, modifier, position)
                VALUES (?, ?, ?)
                """,
                (
                    (product_id, modifier, position)
                    for position, modifier in enumerate(
                        modifiers_by_product.get(product_id, ())
                    )
                ),
            )
    except BaseException:
        connection.execute("ROLLBACK TO SAVEPOINT tag_in_season_products")
        connection.execute("RELEASE SAVEPOINT tag_in_season_products")
        raise
    connection.execute("RELEASE SAVEPOINT tag_in_season_products")
    return tagged_product_ids


def seasonal(
    connection: sqlite3.Connection,
    *,
    as_of: date | None = None,
    min_history: int = 30,
    season_month_quantile: float = 0.10,
    price_reduction_threshold: float = 0.10,
) -> list[SeasonalityResult]:
    price_history = _load_price_history(connection)
    results = [
        result
        for product_id in price_history["product_id"].drop_duplicates()
        if (
            result := _classify_seasonality(
                price_history,
                int(product_id),
                "date",
                min_history=min_history,
                season_month_quantile=season_month_quantile,
                price_reduction_threshold=price_reduction_threshold,
            )
        )
        is not None
    ]
    tag_in_season_products(
        connection,
        results,
        current_month=(as_of or date.today()).month,
    )
    return results