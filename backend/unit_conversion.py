"""Context-aware unit conversion for shopping-list quantities."""

from decimal import Decimal, InvalidOperation

from pint import UnitRegistry
from pint.errors import DimensionalityError, UndefinedUnitError


QuantityValue = int | float | Decimal


class UnitConversionError(ValueError):
    """A unit conversion failure with shopping-item context."""

    def __init__(
        self,
        *,
        tag: str,
        source_unit: str,
        target_unit: str,
        reason: str,
    ) -> None:
        self.tag = tag
        self.source_unit = source_unit
        self.target_unit = target_unit
        self.reason = reason
        super().__init__(
            f"Cannot convert tag {tag!r} from {source_unit!r} "
            f"to {target_unit!r}: {reason}"
        )


_UNIT_REGISTRY = UnitRegistry(non_int_type=Decimal)
_UNIT_REGISTRY.define("cartograph_count = [cartograph_count]")
_UNIT_REGISTRY.define("cartograph_loaf = [cartograph_loaf]")
_UNIT_REGISTRY.define("cartograph_bunch = [cartograph_bunch]")

_UNIT_ALIASES = {
    "lb": "lbs",
    "lbs": "lbs",
    "pound": "lbs",
    "pounds": "lbs",
    "each": "count",
    "count": "count",
}

_PINT_UNIT_NAMES = {
    "lbs": "pound",
    "count": "cartograph_count",
    "loaf": "cartograph_loaf",
    "bunch": "cartograph_bunch",
}


def normalize_unit(unit: str) -> str:
    """Normalize supported aliases while preserving other Pint unit names."""

    normalized = unit.strip().lower()
    if not normalized:
        raise ValueError("unit must not be blank")
    return _UNIT_ALIASES.get(normalized, normalized)


def _context_unit(unit: str) -> str:
    return unit.strip().lower() if isinstance(unit, str) else str(unit)


def _pint_unit_name(unit: str, counterpart: str) -> str:
    if unit == "oz":
        return "fluid_ounce" if counterpart == "gallon" else "ounce"
    return _PINT_UNIT_NAMES.get(unit, unit)


def _parse_unit(
    unit_name: str,
    *,
    role: str,
    tag: str,
    source_unit: str,
    target_unit: str,
):
    try:
        return _UNIT_REGISTRY.parse_units(unit_name)
    except (UndefinedUnitError, ValueError) as error:
        raise UnitConversionError(
            tag=tag,
            source_unit=source_unit,
            target_unit=target_unit,
            reason=f"unknown {role} unit",
        ) from error


def convert_quantity(
    quantity: QuantityValue,
    source_unit: str,
    target_unit: str,
    *,
    tag: str,
) -> Decimal:
    """Convert one quantity, resolving ``oz`` from the paired unit context."""

    source_context = _context_unit(source_unit)
    target_context = _context_unit(target_unit)
    try:
        normalized_source = normalize_unit(source_unit)
        normalized_target = normalize_unit(target_unit)
    except (AttributeError, ValueError) as error:
        raise UnitConversionError(
            tag=tag,
            source_unit=source_context,
            target_unit=target_context,
            reason="unit must be a non-blank string",
        ) from error

    source = _parse_unit(
        _pint_unit_name(normalized_source, normalized_target),
        role="source",
        tag=tag,
        source_unit=source_context,
        target_unit=target_context,
    )
    target = _parse_unit(
        _pint_unit_name(normalized_target, normalized_source),
        role="target",
        tag=tag,
        source_unit=source_context,
        target_unit=target_context,
    )

    try:
        decimal_quantity = Decimal(str(quantity))
    except (InvalidOperation, ValueError) as error:
        raise UnitConversionError(
            tag=tag,
            source_unit=source_context,
            target_unit=target_context,
            reason="quantity is not a valid decimal",
        ) from error
    if not decimal_quantity.is_finite():
        raise UnitConversionError(
            tag=tag,
            source_unit=source_context,
            target_unit=target_context,
            reason="quantity must be finite",
        )

    try:
        converted = _UNIT_REGISTRY.Quantity(decimal_quantity, source).to(target)
    except DimensionalityError as error:
        raise UnitConversionError(
            tag=tag,
            source_unit=source_context,
            target_unit=target_context,
            reason="units have incompatible dimensions",
        ) from error

    magnitude = converted.magnitude
    return magnitude if isinstance(magnitude, Decimal) else Decimal(str(magnitude))


__all__ = ["UnitConversionError", "convert_quantity", "normalize_unit"]