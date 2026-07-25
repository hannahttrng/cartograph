"""Pure domain inputs and deterministic heuristic ranking for shopping routes."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from math import isfinite
from time import monotonic

from backend.arcgis_connector import RouteTravelMatrices, TravelMetric
from backend.types import (
    RouteCandidate,
    RouteErrorCode,
    RouteItemSelection,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    RouteScoreComponents,
    ShoppingListItem,
    Store,
)


PRICE_QUANTUM = Decimal("0.01")
DISTANCE_QUANTUM = Decimal("0.001")
TIME_QUANTUM = Decimal("0.01")
SCORE_QUANTUM = Decimal("0.000001")
SCORE_UNITS_PER_DOLLAR = 3_000_000
PRICE_SCORE_UNITS_PER_CENT = 30_000


class NoEligibleProductsError(ValueError):
    pass


class NoFeasibleRouteError(ValueError):
    pass


class OptimizationFailedError(RuntimeError):
    pass


def _decimal(value: Decimal | float | str) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _quantized_units(value: Decimal | float, quantum: Decimal) -> int:
    quantized = _decimal(value).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(quantized / quantum)


def _score_units_to_decimal(units: int) -> Decimal:
    return (Decimal(units) / SCORE_UNITS_PER_DOLLAR).quantize(
        SCORE_QUANTUM, rounding=ROUND_HALF_UP
    )


@dataclass(frozen=True, slots=True)
class RouteScorePolicy:
    distance_dollars_per_mile: Decimal = Decimal("0.70")
    time_dollars_per_hour: Decimal = Decimal("20.00")
    store_dollars: Decimal = Decimal("2.50")

    def __post_init__(self) -> None:
        for field_name in (
            "distance_dollars_per_mile",
            "time_dollars_per_hour",
            "store_dollars",
        ):
            value = _decimal(getattr(self, field_name))
            if not value.is_finite() or value < 0:
                raise ValueError(f"{field_name} must be nonnegative and finite")
            object.__setattr__(self, field_name, value)

        for value, denominator, field_name in (
            (self.distance_dollars_per_mile, 1_000, "distance rate"),
            (self.time_dollars_per_hour, 6_000, "time rate"),
            (self.store_dollars, 1, "store cost"),
        ):
            scaled = value * SCORE_UNITS_PER_DOLLAR / denominator
            if scaled != scaled.to_integral_value():
                raise ValueError(f"{field_name} cannot be represented exactly")

    @property
    def distance_units_per_milli_mile(self) -> int:
        return int(
            self.distance_dollars_per_mile * SCORE_UNITS_PER_DOLLAR / 1_000
        )

    @property
    def time_units_per_centi_minute(self) -> int:
        return int(self.time_dollars_per_hour * SCORE_UNITS_PER_DOLLAR / 6_000)

    @property
    def store_score_units(self) -> int:
        return int(self.store_dollars * SCORE_UNITS_PER_DOLLAR)


@dataclass(frozen=True, slots=True)
class SolverSettings:
    timeout_seconds: float = 10.0
    max_candidates_per_store_sequence: int = 3
    assignment_beam_width: int = 64
    sequence_beam_width: int = 16
    max_product_choices_per_item: int = 8

    def __post_init__(self) -> None:
        if not isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive and finite")
        for field_name in (
            "max_candidates_per_store_sequence",
            "assignment_beam_width",
            "sequence_beam_width",
            "max_product_choices_per_item",
        ):
            if getattr(self, field_name) <= 0:
                raise ValueError(f"{field_name} must be positive")


@dataclass(frozen=True, slots=True)
class OptimizationProduct:
    id: int
    name: str
    store_id: int
    unit: str
    price: float
    price_quantity: float
    modifiers: tuple[str, ...]
    matching_item_indices: tuple[int, ...]

    def __post_init__(self) -> None:
        if self.id <= 0 or self.store_id <= 0:
            raise ValueError("product and store IDs must be positive")
        if not isfinite(self.price) or self.price < 0:
            raise ValueError("product price must be nonnegative and finite")
        if not isfinite(self.price_quantity) or self.price_quantity <= 0:
            raise ValueError("product price quantity must be positive and finite")
        if (
            self.modifiers != tuple(sorted(set(self.modifiers)))
        ):
            raise ValueError("product modifiers must be unique and sorted")
        if (
            not self.matching_item_indices
            or self.matching_item_indices
            != tuple(sorted(set(self.matching_item_indices)))
            or any(index < 0 for index in self.matching_item_indices)
        ):
            raise ValueError(
                "matching item indices must be nonempty, unique, and sorted"
            )


@dataclass(frozen=True, slots=True)
class OptimizationCatalog:
    requested_items: tuple[ShoppingListItem, ...]
    stores: tuple[Store, ...]
    products: tuple[OptimizationProduct, ...]

    def __post_init__(self) -> None:
        requested_tags = tuple(item.tag for item in self.requested_items)
        if not requested_tags or len(set(requested_tags)) != len(requested_tags):
            raise ValueError("requested items must be nonempty with unique tags")
        if len(self.requested_items) > 50:
            raise ValueError("route optimization supports at most 50 items")
        store_ids = tuple(store.id for store in self.stores)
        if store_ids != tuple(sorted(set(store_ids))):
            raise ValueError("stores must be unique and sorted by ID")
        if len(store_ids) > 10:
            raise ValueError("route optimization supports at most 10 stores")
        product_ids = tuple(product.id for product in self.products)
        if product_ids != tuple(sorted(set(product_ids))):
            raise ValueError("products must be unique and sorted by ID")
        if any(product.store_id not in store_ids for product in self.products):
            raise ValueError("every product must reference a catalog store")
        if any(
            any(index >= len(self.requested_items) for index in product.matching_item_indices)
            for product in self.products
        ):
            raise ValueError("product matching item indices must be requested")


@dataclass(frozen=True, slots=True)
class DirectedTravelMatrix:
    store_ids: tuple[int, ...]
    arcs: dict[tuple[int | None, int | None], TravelMetric | None]

    @classmethod
    def compose(cls, matrices: RouteTravelMatrices) -> "DirectedTravelMatrix":
        store_ids = tuple(matrices.store_matrix.store_ids)
        arcs: dict[tuple[int | None, int | None], TravelMetric | None] = {}
        for row_index, origin_store_id in enumerate(store_ids):
            for column_index, destination_store_id in enumerate(store_ids):
                arcs[(origin_store_id, destination_store_id)] = (
                    matrices.store_matrix.matrix[row_index][column_index]
                )
        for store_index, store_id in enumerate(store_ids):
            arcs[(None, store_id)] = matrices.current_location_matrix.matrix[0][
                store_index
            ]
            arcs[(store_id, None)] = matrices.current_location_matrix.matrix[1][
                store_index
            ]
        return cls(store_ids=store_ids, arcs=arcs)

    def get(
        self, origin_store_id: int | None, destination_store_id: int | None
    ) -> TravelMetric | None:
        if origin_store_id is None and destination_store_id is None:
            raise ValueError("origin-to-origin is not a route arc")
        try:
            return self.arcs[(origin_store_id, destination_store_id)]
        except KeyError as error:
            raise KeyError("travel arc references an unknown store") from error


@dataclass(frozen=True, slots=True)
class _AssignmentState:
    assignments: tuple[int | None, ...]
    used_product_ids: frozenset[int]
    store_ids: frozenset[int]
    price_cents: int
    matched_count: int


@dataclass(frozen=True, slots=True)
class _RoutePlan:
    store_sequence: tuple[int, ...]
    distance_milli_miles: int
    time_centi_minutes: int
    travel_score_units: int


@dataclass(frozen=True, slots=True)
class _RankedCandidate:
    candidate: RouteCandidate
    score_units: int
    assignment_ranks: tuple[int, ...]


def _maximum_product_matching(
    catalog: OptimizationCatalog,
    allowed_product_ids: frozenset[int] | None = None,
) -> dict[int, int]:
    candidates = {
        item_index: tuple(
            product.id
            for product in catalog.products
            if item_index in product.matching_item_indices
            and (allowed_product_ids is None or product.id in allowed_product_ids)
        )
        for item_index in range(len(catalog.requested_items))
    }
    product_item: dict[int, int] = {}

    def assign(item_index: int, seen_products: set[int]) -> bool:
        for product_id in candidates[item_index]:
            if product_id in seen_products:
                continue
            seen_products.add(product_id)
            previous_item = product_item.get(product_id)
            if previous_item is None or assign(previous_item, seen_products):
                product_item[product_id] = item_index
                return True
        return False

    ordered_items = sorted(
        candidates,
        key=lambda item_index: (len(candidates[item_index]), item_index),
    )
    for item_index in ordered_items:
        assign(item_index, set())
    return {
        item_index: product_id for product_id, item_index in product_item.items()
    }


def _state_from_assignments(
    catalog: OptimizationCatalog,
    assignment_by_item: dict[int, int],
    products_by_id: dict[int, OptimizationProduct],
    edge_price_cents: dict[tuple[int, int], int],
) -> _AssignmentState:
    assignments = tuple(
        assignment_by_item.get(item_index)
        for item_index in range(len(catalog.requested_items))
    )
    selected_product_ids = tuple(
        product_id for product_id in assignments if product_id is not None
    )
    if len(selected_product_ids) != len(set(selected_product_ids)):
        raise ValueError("an optimization Product may satisfy at most one item")
    return _AssignmentState(
        assignments=assignments,
        used_product_ids=frozenset(selected_product_ids),
        store_ids=frozenset(
            products_by_id[product_id].store_id
            for product_id in selected_product_ids
        ),
        price_cents=sum(
            edge_price_cents[(item_index, product_id)]
            for item_index, product_id in enumerate(assignments)
            if product_id is not None
        ),
        matched_count=len(selected_product_ids),
    )


def _assignment_rank_tuple(
    state: _AssignmentState,
    product_ranks: dict[int, int],
) -> tuple[int, ...]:
    unmatched_rank = len(product_ranks) + 1
    return tuple(
        product_ranks[product_id] if product_id is not None else unmatched_rank
        for product_id in state.assignments
    )


def _assignment_state_key(
    state: _AssignmentState,
    policy: RouteScorePolicy,
    product_ranks: dict[int, int],
) -> tuple[object, ...]:
    provisional_score = (
        state.price_cents * PRICE_SCORE_UNITS_PER_CENT
        + len(state.store_ids) * policy.store_score_units
    )
    return (
        -state.matched_count,
        provisional_score,
        len(state.store_ids),
        tuple(sorted(state.store_ids)),
        _assignment_rank_tuple(state, product_ranks),
    )


def _product_choice_key(
    product: OptimizationProduct,
    item_index: int,
    state: _AssignmentState,
    edge_price_cents: dict[tuple[int, int], int],
    policy: RouteScorePolicy,
) -> tuple[int, int, int, int]:
    adds_store = product.store_id not in state.store_ids
    incremental_score = (
        edge_price_cents[(item_index, product.id)] * PRICE_SCORE_UNITS_PER_CENT
        + (policy.store_score_units if adds_store else 0)
    )
    return (incremental_score, int(adds_store), product.store_id, product.id)


def _assignment_choices(
    item_index: int,
    state: _AssignmentState,
    products_by_item: dict[int, tuple[OptimizationProduct, ...]],
    witness_product_id: int | None,
    edge_price_cents: dict[tuple[int, int], int],
    policy: RouteScorePolicy,
    settings: SolverSettings,
) -> tuple[int | None, ...]:
    eligible = sorted(
        (
            product
            for product in products_by_item[item_index]
            if product.id not in state.used_product_ids
        ),
        key=lambda product: _product_choice_key(
            product, item_index, state, edge_price_cents, policy
        ),
    )
    selected: list[int | None] = []
    if witness_product_id is not None and any(
        product.id == witness_product_id for product in eligible
    ):
        selected.append(witness_product_id)

    seen_stores: set[int] = set()
    for product in eligible:
        if product.store_id not in seen_stores:
            seen_stores.add(product.store_id)
            selected.append(product.id)
    selected.extend(
        product.id for product in eligible[: settings.max_product_choices_per_item]
    )
    selected.append(None)
    return tuple(dict.fromkeys(selected))


def _extend_assignment(
    state: _AssignmentState,
    item_index: int,
    product_id: int | None,
    products_by_id: dict[int, OptimizationProduct],
    edge_price_cents: dict[tuple[int, int], int],
) -> _AssignmentState:
    assignments = list(state.assignments)
    assignments[item_index] = product_id
    if product_id is None:
        return _AssignmentState(
            assignments=tuple(assignments),
            used_product_ids=state.used_product_ids,
            store_ids=state.store_ids,
            price_cents=state.price_cents,
            matched_count=state.matched_count,
        )
    product = products_by_id[product_id]
    return _AssignmentState(
        assignments=tuple(assignments),
        used_product_ids=state.used_product_ids | {product_id},
        store_ids=state.store_ids | {product.store_id},
        price_cents=state.price_cents + edge_price_cents[(item_index, product_id)],
        matched_count=state.matched_count + 1,
    )


def _prune_assignment_beam(
    states: list[_AssignmentState],
    policy: RouteScorePolicy,
    product_ranks: dict[int, int],
    width: int,
) -> list[_AssignmentState]:
    ordered = sorted(
        states,
        key=lambda state: _assignment_state_key(state, policy, product_ranks),
    )
    if len(ordered) <= width:
        return ordered

    selected: list[_AssignmentState] = []
    selected_assignments: set[tuple[int | None, ...]] = set()
    seen_store_sets: set[frozenset[int]] = set()
    diversity_slots = max(1, width // 4)
    for state in ordered:
        if state.store_ids in seen_store_sets:
            continue
        selected.append(state)
        selected_assignments.add(state.assignments)
        seen_store_sets.add(state.store_ids)
        if len(selected) == diversity_slots:
            break

    for state in ordered:
        if state.assignments in selected_assignments:
            continue
        selected.append(state)
        if len(selected) == width:
            break
    return sorted(
        selected,
        key=lambda state: _assignment_state_key(state, policy, product_ranks),
    )


def _seed_assignment_states(
    catalog: OptimizationCatalog,
    products_by_id: dict[int, OptimizationProduct],
    edge_price_cents: dict[tuple[int, int], int],
) -> tuple[list[_AssignmentState], dict[int, int]]:
    global_witness = _maximum_product_matching(catalog)
    witnesses = [global_witness]
    for store in catalog.stores:
        store_product_ids = frozenset(
            product.id
            for product in catalog.products
            if product.store_id == store.id
        )
        witnesses.append(_maximum_product_matching(catalog, store_product_ids))

    unique: dict[tuple[int | None, ...], _AssignmentState] = {}
    for witness in witnesses:
        if not witness:
            continue
        state = _state_from_assignments(
            catalog, witness, products_by_id, edge_price_cents
        )
        unique[state.assignments] = state
    return list(unique.values()), global_witness


def _enumerate_assignments(
    catalog: OptimizationCatalog,
    products_by_id: dict[int, OptimizationProduct],
    edge_price_cents: dict[tuple[int, int], int],
    policy: RouteScorePolicy,
    settings: SolverSettings,
    deadline: float,
) -> tuple[list[_AssignmentState], bool]:
    seed_states, global_witness = _seed_assignment_states(
        catalog, products_by_id, edge_price_cents
    )
    products_by_item = {
        item_index: tuple(
            product
            for product in catalog.products
            if item_index in product.matching_item_indices
        )
        for item_index in range(len(catalog.requested_items))
    }
    product_ranks = {
        product.id: rank
        for rank, product in enumerate(catalog.products, start=1)
    }
    item_order = sorted(
        products_by_item,
        key=lambda item_index: (len(products_by_item[item_index]), item_index),
    )
    beam = [
        _AssignmentState(
            assignments=(None,) * len(catalog.requested_items),
            used_product_ids=frozenset(),
            store_ids=frozenset(),
            price_cents=0,
            matched_count=0,
        )
    ]

    for item_index in item_order:
        if monotonic() >= deadline:
            unique = {
                state.assignments: state for state in [*seed_states, *beam]
            }
            return list(unique.values()), True
        expanded: dict[tuple[int | None, ...], _AssignmentState] = {}
        for state in beam:
            for product_id in _assignment_choices(
                item_index,
                state,
                products_by_item,
                global_witness.get(item_index),
                edge_price_cents,
                policy,
                settings,
            ):
                next_state = _extend_assignment(
                    state,
                    item_index,
                    product_id,
                    products_by_id,
                    edge_price_cents,
                )
                expanded[next_state.assignments] = next_state
        beam = _prune_assignment_beam(
            list(expanded.values()),
            policy,
            product_ranks,
            settings.assignment_beam_width,
        )

    unique = {state.assignments: state for state in [*seed_states, *beam]}
    return list(unique.values()), False


def _metric_units(metric: TravelMetric) -> tuple[int, int]:
    return (
        _quantized_units(metric.distance_miles, DISTANCE_QUANTUM),
        _quantized_units(metric.travel_time_minutes, TIME_QUANTUM),
    )


def _travel_score_units(
    distance_milli_miles: int,
    time_centi_minutes: int,
    policy: RouteScorePolicy,
) -> int:
    return (
        distance_milli_miles * policy.distance_units_per_milli_mile
        + time_centi_minutes * policy.time_units_per_centi_minute
    )


def _arc_score_units(metric: TravelMetric, policy: RouteScorePolicy) -> int:
    distance, travel_time = _metric_units(metric)
    return _travel_score_units(distance, travel_time, policy)


def _measure_store_sequence(
    store_sequence: tuple[int, ...],
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
) -> _RoutePlan | None:
    route_nodes: tuple[int | None, ...] = (None, *store_sequence, None)
    distance_milli_miles = 0
    time_centi_minutes = 0
    for origin, destination in zip(route_nodes, route_nodes[1:]):
        metric = travel.get(origin, destination)
        if metric is None:
            return None
        distance, travel_time = _metric_units(metric)
        distance_milli_miles += distance
        time_centi_minutes += travel_time
    return _RoutePlan(
        store_sequence=store_sequence,
        distance_milli_miles=distance_milli_miles,
        time_centi_minutes=time_centi_minutes,
        travel_score_units=_travel_score_units(
            distance_milli_miles, time_centi_minutes, policy
        ),
    )


def _best_store_sequence(
    store_ids: tuple[int, ...],
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
) -> tuple[int, ...] | None:
    state_count = 1 << len(store_ids)
    paths: dict[tuple[int, int], tuple[int, tuple[int, ...]]] = {}
    for index, store_id in enumerate(store_ids):
        metric = travel.get(None, store_id)
        if metric is not None:
            paths[(1 << index, index)] = (
                _arc_score_units(metric, policy),
                (store_id,),
            )

    for mask in range(1, state_count):
        for last_index in range(len(store_ids)):
            current = paths.get((mask, last_index))
            if current is None:
                continue
            current_cost, current_path = current
            for next_index, next_store_id in enumerate(store_ids):
                if mask & (1 << next_index):
                    continue
                metric = travel.get(store_ids[last_index], next_store_id)
                if metric is None:
                    continue
                next_key = (mask | (1 << next_index), next_index)
                next_value = (
                    current_cost + _arc_score_units(metric, policy),
                    (*current_path, next_store_id),
                )
                previous = paths.get(next_key)
                if previous is None or next_value < previous:
                    paths[next_key] = next_value

    full_mask = state_count - 1
    complete: list[tuple[int, tuple[int, ...]]] = []
    for last_index, last_store_id in enumerate(store_ids):
        current = paths.get((full_mask, last_index))
        return_metric = travel.get(last_store_id, None)
        if current is None or return_metric is None:
            continue
        complete.append(
            (
                current[0] + _arc_score_units(return_metric, policy),
                current[1],
            )
        )
    return min(complete)[1] if complete else None


def _beam_store_sequences(
    store_ids: tuple[int, ...],
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
    width: int,
) -> list[tuple[int, ...]]:
    prefixes: list[tuple[int, tuple[int, ...], tuple[int, ...]]] = []
    for store_id in store_ids:
        metric = travel.get(None, store_id)
        if metric is None:
            continue
        prefixes.append(
            (
                _arc_score_units(metric, policy),
                (store_id,),
                tuple(candidate for candidate in store_ids if candidate != store_id),
            )
        )
    prefixes.sort(key=lambda item: (item[0], item[1]))
    prefixes = prefixes[:width]

    while prefixes and prefixes[0][2]:
        expanded: list[tuple[int, tuple[int, ...], tuple[int, ...]]] = []
        for score_units, prefix, remaining in prefixes:
            for store_id in remaining:
                metric = travel.get(prefix[-1], store_id)
                if metric is None:
                    continue
                expanded.append(
                    (
                        score_units + _arc_score_units(metric, policy),
                        (*prefix, store_id),
                        tuple(
                            candidate
                            for candidate in remaining
                            if candidate != store_id
                        ),
                    )
                )
        expanded.sort(key=lambda item: (item[0], item[1]))
        prefixes = expanded[:width]

    complete: list[tuple[int, tuple[int, ...]]] = []
    for score_units, prefix, remaining in prefixes:
        if remaining:
            continue
        metric = travel.get(prefix[-1], None)
        if metric is not None:
            complete.append(
                (score_units + _arc_score_units(metric, policy), prefix)
            )
    complete.sort()
    return [sequence for _, sequence in complete]


def _store_sequence_plans(
    store_ids: frozenset[int],
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
    settings: SolverSettings,
) -> tuple[_RoutePlan, ...]:
    ordered_store_ids = tuple(sorted(store_ids))
    sequences = _beam_store_sequences(
        ordered_store_ids,
        travel,
        policy,
        settings.sequence_beam_width,
    )
    exact_witness = _best_store_sequence(ordered_store_ids, travel, policy)
    if exact_witness is not None:
        sequences.append(exact_witness)

    plans = {
        sequence: plan
        for sequence in dict.fromkeys(sequences)
        if (plan := _measure_store_sequence(sequence, travel, policy)) is not None
    }
    return tuple(
        sorted(
            plans.values(),
            key=lambda plan: (plan.travel_score_units, plan.store_sequence),
        )[: settings.sequence_beam_width]
    )


def _build_candidate(
    state: _AssignmentState,
    route_plan: _RoutePlan,
    catalog: OptimizationCatalog,
    products_by_id: dict[int, OptimizationProduct],
    product_ranks: dict[int, int],
    policy: RouteScorePolicy,
) -> _RankedCandidate:
    selections = [
        RouteItemSelection(
            **item.model_dump(),
            product=product_id,
        )
        for item, product_id in zip(
            catalog.requested_items, state.assignments, strict=True
        )
    ]
    products = [
        product_id
        for store_id in route_plan.store_sequence
        for product_id in state.assignments
        if product_id is not None
        and products_by_id[product_id].store_id == store_id
    ]
    product_price_units = state.price_cents * PRICE_SCORE_UNITS_PER_CENT
    distance_score_units = (
        route_plan.distance_milli_miles * policy.distance_units_per_milli_mile
    )
    time_score_units = (
        route_plan.time_centi_minutes * policy.time_units_per_centi_minute
    )
    store_score_units = len(route_plan.store_sequence) * policy.store_score_units
    score_units = (
        product_price_units
        + distance_score_units
        + time_score_units
        + store_score_units
    )
    components = RouteScoreComponents(
        productPrice=float(_score_units_to_decimal(product_price_units)),
        distanceCost=float(_score_units_to_decimal(distance_score_units)),
        timeCost=float(_score_units_to_decimal(time_score_units)),
        storeCost=float(_score_units_to_decimal(store_score_units)),
    )
    candidate = RouteCandidate(
        stores=list(route_plan.store_sequence),
        products=products,
        selections=selections,
        distance=float(
            Decimal(route_plan.distance_milli_miles) * DISTANCE_QUANTUM
        ),
        time=float(Decimal(route_plan.time_centi_minutes) * TIME_QUANTUM),
        productPrice=float(Decimal(state.price_cents) * PRICE_QUANTUM),
        matchedItemCount=state.matched_count,
        score=float(components.total()),
        scoreComponents=components,
        errorCode=(
            RouteErrorCode.PARTIAL_ITEM_MATCH
            if state.matched_count != len(catalog.requested_items)
            else None
        ),
    )
    return _RankedCandidate(
        candidate=candidate,
        score_units=score_units,
        assignment_ranks=_assignment_rank_tuple(state, product_ranks),
    )


def _rank_and_limit_candidates(
    candidates: list[_RankedCandidate],
    limit: int,
    max_candidates_per_store_sequence: int,
) -> list[RouteCandidate]:
    ordered = sorted(
        candidates,
        key=lambda item: (
            -item.candidate.matched_item_count,
            item.score_units,
            tuple(item.candidate.stores),
            item.assignment_ranks,
        ),
    )
    result: list[RouteCandidate] = []
    sequence_counts: dict[tuple[int, ...], int] = {}
    seen: set[tuple[tuple[int | None, ...], tuple[int, ...]]] = set()
    for item in ordered:
        assignment = tuple(
            selection.product for selection in item.candidate.selections
        )
        sequence = tuple(item.candidate.stores)
        identity = (assignment, sequence)
        if identity in seen:
            continue
        seen.add(identity)
        if sequence_counts.get(sequence, 0) >= max_candidates_per_store_sequence:
            continue
        sequence_counts[sequence] = sequence_counts.get(sequence, 0) + 1
        result.append(item.candidate)
        if len(result) == limit:
            break
    return result


def optimize_routes(
    catalog: OptimizationCatalog,
    travel: DirectedTravelMatrix,
    *,
    limit: int = 10,
    policy: RouteScorePolicy | None = None,
    settings: SolverSettings | None = None,
) -> RouteOptimizationResponse:
    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    if not catalog.products:
        raise NoEligibleProductsError("no requested item has an eligible product")
    catalog_store_ids = tuple(store.id for store in catalog.stores)
    if travel.store_ids != catalog_store_ids:
        raise ValueError("travel matrix store IDs must match the optimization catalog")

    effective_policy = policy or RouteScorePolicy()
    effective_settings = settings or SolverSettings()
    started_at = monotonic()
    deadline = started_at + effective_settings.timeout_seconds
    products_by_id = {product.id: product for product in catalog.products}
    edge_price_cents = {
        (item_index, product.id): _quantized_units(
            _decimal(product.price)
            / _decimal(product.price_quantity)
            * _decimal(catalog.requested_items[item_index].quantity),
            PRICE_QUANTUM,
        )
        for product in catalog.products
        for item_index in product.matching_item_indices
    }
    product_ranks = {
        product.id: rank
        for rank, product in enumerate(catalog.products, start=1)
    }

    assignment_states, timed_out = _enumerate_assignments(
        catalog,
        products_by_id,
        edge_price_cents,
        effective_policy,
        effective_settings,
        deadline,
    )
    assignment_states.sort(
        key=lambda state: _assignment_state_key(
            state, effective_policy, product_ranks
        )
    )
    route_cache: dict[frozenset[int], tuple[_RoutePlan, ...]] = {}
    generated: list[_RankedCandidate] = []
    for state in assignment_states:
        if not state.matched_count:
            continue
        if generated and monotonic() >= deadline:
            timed_out = True
            break
        plans = route_cache.get(state.store_ids)
        if plans is None:
            plans = _store_sequence_plans(
                state.store_ids,
                travel,
                effective_policy,
                effective_settings,
            )
            route_cache[state.store_ids] = plans
        generated.extend(
            _build_candidate(
                state,
                plan,
                catalog,
                products_by_id,
                product_ranks,
                effective_policy,
            )
            for plan in plans
        )

    candidates = _rank_and_limit_candidates(
        generated,
        limit,
        effective_settings.max_candidates_per_store_sequence,
    )
    if not candidates:
        if timed_out:
            raise OptimizationFailedError("optimization timed out without a solution")
        raise NoFeasibleRouteError("no selected product can form a round trip")

    elapsed = monotonic() - started_at
    timed_out = timed_out or elapsed >= effective_settings.timeout_seconds
    return RouteOptimizationResponse(
        candidates=candidates,
        status=(
            RouteOptimizationStatus.FEASIBLE_TIMEOUT
            if timed_out
            else RouteOptimizationStatus.HEURISTIC
        ),
        requestedLimit=limit,
        provenPrefixCount=0,
        elapsedSeconds=elapsed,
        timeoutSeconds=effective_settings.timeout_seconds,
    )