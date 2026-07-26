"""Pure aggregation of active shopping-list items."""

from collections.abc import Iterable, Mapping
from decimal import Decimal

from backend.types import ShoppingListItem, Tag
from backend.unit_conversion import convert_quantity


TagDefaults = Iterable[Tag] | Mapping[str, Tag]


def _index_tag_defaults(tag_defaults: TagDefaults) -> dict[str, Tag]:
    values = tag_defaults.values() if isinstance(tag_defaults, Mapping) else tag_defaults
    indexed: dict[str, Tag] = {}
    for default in values:
        if default.tag in indexed:
            raise ValueError(f"Duplicate Tag default for {default.tag!r}")
        indexed[default.tag] = default
    return indexed


def combine_active_shopping_list_items(
    items: Iterable[ShoppingListItem],
    tag_defaults: TagDefaults,
) -> tuple[ShoppingListItem, ...]:
    """Combine items by tag using each Tag's default unit."""

    defaults_by_tag = _index_tag_defaults(tag_defaults)
    quantities: dict[str, Decimal] = {}
    modifiers: dict[str, set[str]] = {}

    for item in items:
        default = defaults_by_tag.get(item.tag)
        if default is None:
            raise ValueError(f"Missing Tag default for {item.tag!r}")

        converted = convert_quantity(
            item.quantity,
            item.unit,
            default.default_unit,
            tag=item.tag,
        )
        quantities[item.tag] = quantities.get(item.tag, Decimal("0")) + converted
        modifiers.setdefault(item.tag, set()).update(item.modifiers)

    return tuple(
        ShoppingListItem(
            tag=tag,
            modifiers=sorted(modifiers[tag]),
            unit=defaults_by_tag[tag].default_unit,
            quantity=float(quantities[tag]),
        )
        for tag in sorted(quantities)
    )


__all__ = ["combine_active_shopping_list_items"]