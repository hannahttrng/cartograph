import pytest

from backend.shopping_list_aggregation import combine_active_shopping_list_items
from backend.types import ShoppingListItem, Tag
from backend.unit_conversion import UnitConversionError


def test_combine_items_converts_sums_unions_and_orders_by_tag() -> None:
    tag_defaults = (
        Tag(tag="milk", defaultUnit="gallon", defaultQuantity=1),
        Tag(tag="apple", defaultUnit="lbs", defaultQuantity=1),
        Tag(tag="egg", defaultUnit="count", defaultQuantity=12),
    )
    items = (
        ShoppingListItem(
            tag="milk", modifiers=["Organic"], unit="oz", quantity=64
        ),
        ShoppingListItem(
            tag="apple", modifiers=["Local"], unit="oz", quantity=8
        ),
        ShoppingListItem(
            tag="egg", modifiers=["Free Range"], unit="each", quantity=2
        ),
        ShoppingListItem(
            tag="apple", modifiers=["Organic"], unit="pound", quantity=1
        ),
        ShoppingListItem(
            tag="milk", modifiers=["Local"], unit="gallon", quantity=0.5
        ),
        ShoppingListItem(
            tag="egg", modifiers=["Large"], unit="count", quantity=6
        ),
    )

    combined = combine_active_shopping_list_items(items, tag_defaults)

    assert isinstance(combined, tuple)
    assert combined == (
        ShoppingListItem(
            tag="apple",
            modifiers=["local", "organic"],
            unit="lbs",
            quantity=1.5,
        ),
        ShoppingListItem(
            tag="egg",
            modifiers=["free range", "large"],
            unit="count",
            quantity=8,
        ),
        ShoppingListItem(
            tag="milk",
            modifiers=["local", "organic"],
            unit="gallon",
            quantity=1,
        ),
    )


def test_combine_items_accepts_tag_defaults_mapping() -> None:
    default = Tag(tag="apple", defaultUnit="lbs", defaultQuantity=1)

    combined = combine_active_shopping_list_items(
        [ShoppingListItem(tag="apple", unit="lb", quantity=2)],
        {default.tag: default},
    )

    assert combined == (
        ShoppingListItem(tag="apple", unit="lbs", quantity=2),
    )


def test_combine_items_rejects_the_whole_result_on_conversion_failure() -> None:
    tag_defaults = (
        Tag(tag="apple", defaultUnit="lbs", defaultQuantity=1),
        Tag(tag="milk", defaultUnit="gallon", defaultQuantity=1),
    )
    items = (
        ShoppingListItem(tag="milk", unit="gallon", quantity=1),
        ShoppingListItem(tag="apple", unit="count", quantity=2),
    )

    with pytest.raises(UnitConversionError) as raised:
        combine_active_shopping_list_items(items, tag_defaults)

    assert raised.value.tag == "apple"
    assert raised.value.source_unit == "count"
    assert raised.value.target_unit == "lbs"