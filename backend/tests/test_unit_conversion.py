from decimal import Decimal

import pytest

from backend.unit_conversion import (
    UnitConversionError,
    convert_quantity,
    normalize_unit,
)


@pytest.mark.parametrize(
    ("source_unit", "expected"),
    [
        ("lb", "lbs"),
        ("lbs", "lbs"),
        ("pound", "lbs"),
        ("each", "count"),
        ("count", "count"),
    ],
)
def test_normalize_unit_aliases(source_unit: str, expected: str) -> None:
    assert normalize_unit(source_unit) == expected


@pytest.mark.parametrize(
    ("quantity", "source_unit", "target_unit", "expected"),
    [
        (1, "gallon", "oz", Decimal("128")),
        (64, "oz", "gallon", Decimal("0.5")),
        (1, "lbs", "oz", Decimal("16")),
        (8, "oz", "pound", Decimal("0.5")),
        (3, "each", "count", Decimal("3")),
        (2, "count", "each", Decimal("2")),
    ],
)
def test_convert_quantity_uses_unit_context_and_aliases(
    quantity: int,
    source_unit: str,
    target_unit: str,
    expected: Decimal,
) -> None:
    assert (
        convert_quantity(quantity, source_unit, target_unit, tag="test item")
        == expected
    )


def test_convert_quantity_uses_decimal_string_input() -> None:
    assert convert_quantity(0.1, "lbs", "oz", tag="flour") == Decimal("1.6")


@pytest.mark.parametrize(
    ("source_unit", "target_unit"),
    [
        ("lbs", "gallon"),
        ("count", "lbs"),
        ("count", "loaf"),
        ("loaf", "bunch"),
    ],
)
def test_convert_quantity_rejects_incompatible_dimensions(
    source_unit: str,
    target_unit: str,
) -> None:
    with pytest.raises(UnitConversionError, match="incompatible dimensions"):
        convert_quantity(1, source_unit, target_unit, tag="bread")


@pytest.mark.parametrize(
    ("source_unit", "target_unit", "reason"),
    [
        ("mystery", "lbs", "unknown source unit"),
        ("lbs", "mystery", "unknown target unit"),
    ],
)
def test_convert_quantity_rejects_unknown_units(
    source_unit: str,
    target_unit: str,
    reason: str,
) -> None:
    with pytest.raises(UnitConversionError, match=reason):
        convert_quantity(1, source_unit, target_unit, tag="apples")


def test_conversion_error_exposes_item_and_unit_context() -> None:
    with pytest.raises(UnitConversionError) as raised:
        convert_quantity(1, "count", "lbs", tag="apples")

    error = raised.value
    assert error.tag == "apples"
    assert error.source_unit == "count"
    assert error.target_unit == "lbs"
    assert "apples" in str(error)
    assert "count" in str(error)
    assert "lbs" in str(error)