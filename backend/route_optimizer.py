"""Pure domain inputs and optimization logic for ranked shopping routes."""

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from math import isfinite
from time import monotonic

from ortools.sat.python import cp_model

from backend.arcgis_connector import RouteTravelMatrices, TravelMetric
from backend.types import (
    RouteCandidate,
    RouteErrorCode,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    RouteScoreComponents,
    RouteTagSelection,
    Store,
)


PRICE_QUANTUM = Decimal("0.01")
DISTANCE_QUANTUM = Decimal("0.001")
TIME_QUANTUM = Decimal("0.01")
SCORE_QUANTUM = Decimal("0.000001")
SCORE_UNITS_PER_DOLLAR = 3_000_000
PRICE_SCORE_UNITS_PER_CENT = 30_000
MAX_CP_INTEGER = (1 << 62) - 1


class NoEligibleProductsError(ValueError):
    pass


class NoFeasibleRouteError(ValueError):
    pass


class OptimizationFailedError(RuntimeError):
    pass


def _decimal(value: Decimal | float | str) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _quantized_units(value: float, quantum: Decimal) -> int:
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
    random_seed: int = 0
    max_candidates_per_store_sequence: int = 3

    def __post_init__(self) -> None:
        if not isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive and finite")
        if self.max_candidates_per_store_sequence <= 0:
            raise ValueError("max_candidates_per_store_sequence must be positive")


@dataclass(frozen=True, slots=True)
class OptimizationProduct:
    id: int
    name: str
    store_id: int
    unit: str
    price: float
    matching_tags: tuple[str, ...]

    def __post_init__(self) -> None:
        if self.id <= 0 or self.store_id <= 0:
            raise ValueError("product and store IDs must be positive")
        if not isfinite(self.price) or self.price < 0:
            raise ValueError("product price must be nonnegative and finite")
        if self.matching_tags != tuple(sorted(set(self.matching_tags))):
            raise ValueError("matching tags must be nonempty, unique, and sorted")


@dataclass(frozen=True, slots=True)
class OptimizationCatalog:
    requested_tags: tuple[str, ...]
    stores: tuple[Store, ...]
    products: tuple[OptimizationProduct, ...]

    def __post_init__(self) -> None:
        if not self.requested_tags or self.requested_tags != tuple(
            sorted(set(self.requested_tags))
        ):
            raise ValueError("requested tags must be nonempty, unique, and sorted")
        if len(self.requested_tags) > 50:
            raise ValueError("route optimization supports at most 50 tags")
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
        requested_tag_set = set(self.requested_tags)
        if any(
            not set(product.matching_tags).issubset(requested_tag_set)
            for product in self.products
        ):
            raise ValueError("product matching tags must be requested")


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


@dataclass(slots=True)
class _Problem:
    model: cp_model.CpModel
    catalog: OptimizationCatalog
    policy: RouteScorePolicy
    assignments: dict[tuple[str, int], cp_model.IntVar]
    matched: dict[str, cp_model.IntVar]
    selected_products: dict[int, cp_model.IntVar]
    visited_stores: dict[int, cp_model.IntVar]
    route_arcs: dict[tuple[int, int], cp_model.IntVar]
    positions: dict[int, cp_model.IntVar]
    match_count: cp_model.LinearExpr
    price_cents: cp_model.LinearExpr
    distance_milli_miles: cp_model.LinearExpr
    time_centi_minutes: cp_model.LinearExpr
    score_units: cp_model.LinearExpr
    sequence_code: cp_model.LinearExpr
    assignment_ranks: dict[str, cp_model.IntVar]
    solution_literals: tuple[cp_model.IntVar, ...]


@dataclass(frozen=True, slots=True)
class _SolvedCandidate:
    candidate: RouteCandidate
    sequence_code: int
    literal_values: tuple[bool, ...]


def _maximum_product_matching(catalog: OptimizationCatalog) -> int:
    candidates = {
        tag: [
            product.id
            for product in catalog.products
            if tag in product.matching_tags
        ]
        for tag in catalog.requested_tags
    }
    product_tag: dict[int, str] = {}

    def assign(tag: str, seen_products: set[int]) -> bool:
        for product_id in candidates[tag]:
            if product_id in seen_products:
                continue
            seen_products.add(product_id)
            previous_tag = product_tag.get(product_id)
            if previous_tag is None or assign(previous_tag, seen_products):
                product_tag[product_id] = tag
                return True
        return False

    return sum(assign(tag, set()) for tag in catalog.requested_tags)


def _build_problem(
    catalog: OptimizationCatalog,
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
) -> _Problem:
    if not catalog.products:
        raise NoEligibleProductsError("no requested tag has an eligible product")
    catalog_store_ids = tuple(store.id for store in catalog.stores)
    if travel.store_ids != catalog_store_ids:
        raise ValueError("travel matrix store IDs must match the optimization catalog")

    model = cp_model.CpModel()
    products_by_id = {product.id: product for product in catalog.products}
    product_ranks = {
        product_id: rank
        for rank, product_id in enumerate(sorted(products_by_id), start=1)
    }
    assignments = {
        (tag, product.id): model.new_bool_var(f"assign_{tag}_{product.id}")
        for tag in catalog.requested_tags
        for product in catalog.products
        if tag in product.matching_tags
    }
    matched = {
        tag: model.new_bool_var(f"matched_{tag}") for tag in catalog.requested_tags
    }
    for tag in catalog.requested_tags:
        tag_assignments = [
            variable
            for (assignment_tag, _), variable in assignments.items()
            if assignment_tag == tag
        ]
        model.add(matched[tag] == sum(tag_assignments))

    selected_products = {
        product.id: model.new_bool_var(f"selected_product_{product.id}")
        for product in catalog.products
    }
    for product in catalog.products:
        product_assignments = [
            variable
            for (tag, product_id), variable in assignments.items()
            if product_id == product.id
        ]
        model.add(selected_products[product.id] == sum(product_assignments))

    visited_stores = {
        store.id: model.new_bool_var(f"visited_store_{store.id}")
        for store in catalog.stores
    }
    for store in catalog.stores:
        store_products = [
            selected_products[product.id]
            for product in catalog.products
            if product.store_id == store.id
        ]
        model.add(sum(store_products) >= visited_stores[store.id])
        model.add(sum(store_products) <= len(store_products) * visited_stores[store.id])

    store_node = {
        store.id: node for node, store in enumerate(catalog.stores, start=1)
    }
    node_store = {node: store_id for store_id, node in store_node.items()}
    route_arcs: dict[tuple[int, int], cp_model.IntVar] = {}
    route_metrics: dict[tuple[int, int], TravelMetric] = {}
    circuit_arcs: list[tuple[int, int, cp_model.IntVar]] = []
    for store_id, node in store_node.items():
        self_loop = model.new_bool_var(f"route_{node}_{node}")
        route_arcs[(node, node)] = self_loop
        circuit_arcs.append((node, node, self_loop))
        model.add(self_loop + visited_stores[store_id] == 1)

    nodes = range(len(catalog.stores) + 1)
    for origin_node in nodes:
        for destination_node in nodes:
            if origin_node == destination_node:
                continue
            origin_store = node_store.get(origin_node)
            destination_store = node_store.get(destination_node)
            metric = travel.get(origin_store, destination_store)
            if metric is None:
                continue
            variable = model.new_bool_var(f"route_{origin_node}_{destination_node}")
            route_arcs[(origin_node, destination_node)] = variable
            route_metrics[(origin_node, destination_node)] = metric
            circuit_arcs.append((origin_node, destination_node, variable))
    model.add_circuit(circuit_arcs)

    store_count = len(catalog.stores)
    positions = {
        store.id: model.new_int_var(0, store_count, f"position_{store.id}")
        for store in catalog.stores
    }
    for store in catalog.stores:
        visit = visited_stores[store.id]
        position = positions[store.id]
        model.add(position == 0).only_enforce_if(visit.Not())
        model.add(position >= 1).only_enforce_if(visit)

    for (origin_node, destination_node), variable in route_arcs.items():
        if origin_node == destination_node or destination_node == 0:
            continue
        destination_store = node_store[destination_node]
        if origin_node == 0:
            model.add(positions[destination_store] == 1).only_enforce_if(variable)
        else:
            origin_store = node_store[origin_node]
            model.add(
                positions[destination_store] == positions[origin_store] + 1
            ).only_enforce_if(variable)

    at_position: dict[tuple[int, int], cp_model.IntVar] = {}
    for store in catalog.stores:
        position_literals: list[cp_model.IntVar] = []
        for position in range(1, store_count + 1):
            literal = model.new_bool_var(f"store_{store.id}_at_{position}")
            at_position[(position, store.id)] = literal
            position_literals.append(literal)
            model.add(positions[store.id] == position).only_enforce_if(literal)
        model.add(sum(position_literals) == visited_stores[store.id])
    for position in range(1, store_count + 1):
        model.add(
            sum(at_position[(position, store.id)] for store in catalog.stores) <= 1
        )

    sequence_base = store_count + 1
    sequence_code = cp_model.LinearExpr.sum(
        [
            at_position[(position, store.id)]
            * store_node[store.id]
            * sequence_base ** (store_count - position)
            for position in range(1, store_count + 1)
            for store in catalog.stores
        ]
    )

    product_price_cents = {
        product.id: _quantized_units(product.price, PRICE_QUANTUM)
        for product in catalog.products
    }
    price_cents = cp_model.LinearExpr.sum(
        [
            product_price_cents[product.id] * selected_products[product.id]
            for product in catalog.products
        ]
    )
    distance_milli_miles = cp_model.LinearExpr.sum(
        [
            _quantized_units(metric.distance_miles, DISTANCE_QUANTUM)
            * route_arcs[arc]
            for arc, metric in route_metrics.items()
        ]
    )
    time_centi_minutes = cp_model.LinearExpr.sum(
        [
            _quantized_units(metric.travel_time_minutes, TIME_QUANTUM)
            * route_arcs[arc]
            for arc, metric in route_metrics.items()
        ]
    )
    match_count = cp_model.LinearExpr.sum(list(matched.values()))
    visited_count = cp_model.LinearExpr.sum(list(visited_stores.values()))
    score_units = (
        price_cents * PRICE_SCORE_UNITS_PER_CENT
        + distance_milli_miles * policy.distance_units_per_milli_mile
        + time_centi_minutes * policy.time_units_per_centi_minute
        + visited_count * policy.store_score_units
    )

    unmatched_rank = len(product_ranks) + 1
    assignment_ranks: dict[str, cp_model.IntVar] = {}
    for tag in catalog.requested_tags:
        rank = model.new_int_var(1, unmatched_rank, f"assignment_rank_{tag}")
        model.add(
            rank
            == cp_model.LinearExpr.sum(
                [
                    product_ranks[product_id] * variable
                    for (assignment_tag, product_id), variable in assignments.items()
                    if assignment_tag == tag
                ]
            )
            + unmatched_rank * (1 - matched[tag])
        )
        assignment_ranks[tag] = rank
    model.add(match_count >= 1)
    model.add(match_count <= _maximum_product_matching(catalog))
    solution_literals = tuple(assignments.values()) + tuple(route_arcs.values())
    return _Problem(
        model=model,
        catalog=catalog,
        policy=policy,
        assignments=assignments,
        matched=matched,
        selected_products=selected_products,
        visited_stores=visited_stores,
        route_arcs=route_arcs,
        positions=positions,
        match_count=match_count,
        price_cents=price_cents,
        distance_milli_miles=distance_milli_miles,
        time_centi_minutes=time_centi_minutes,
        score_units=score_units,
        sequence_code=sequence_code,
        assignment_ranks=assignment_ranks,
        solution_literals=solution_literals,
    )


def _new_solver(settings: SolverSettings, remaining_seconds: float) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.001, remaining_seconds)
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = settings.random_seed
    return solver


def _raise_for_invalid_status(
    model: cp_model.CpModel, status: cp_model.CpSolverStatus
) -> None:
    if status == cp_model.MODEL_INVALID:
        validation_error = model.validate().splitlines()[0]
        detail = validation_error or "unknown validation error"
        raise OptimizationFailedError(f"CP-SAT model is invalid: {detail}")


def _add_solution_hints(
    model: cp_model.CpModel, problem: _Problem, solver: cp_model.CpSolver
) -> None:
    model.clear_hints()
    for variable in (*problem.solution_literals, *problem.positions.values()):
        model.add_hint(variable, solver.value(variable))


def _assignment_tie_expressions(problem: _Problem) -> list[cp_model.LinearExpr]:
    base = len(problem.catalog.products) + 2
    chunk_size = 1
    while base ** (chunk_size + 1) - 1 <= MAX_CP_INTEGER:
        chunk_size += 1

    ranks = [
        problem.assignment_ranks[tag] for tag in problem.catalog.requested_tags
    ]
    expressions: list[cp_model.LinearExpr] = []
    for start in range(0, len(ranks), chunk_size):
        chunk = ranks[start : start + chunk_size]
        expressions.append(
            cp_model.LinearExpr.sum(
                [
                    rank * base ** (len(chunk) - index - 1)
                    for index, rank in enumerate(chunk)
                ]
            )
        )
    return expressions


def _extract_candidate(problem: _Problem, solver: cp_model.CpSolver) -> _SolvedCandidate:
    products_by_id = {product.id: product for product in problem.catalog.products}
    assignments = {
        tag: product_id
        for (tag, product_id), variable in problem.assignments.items()
        if solver.value(variable)
    }
    stores = [
        store.id
        for store in sorted(
            problem.catalog.stores,
            key=lambda item: solver.value(problem.positions[item.id]),
        )
        if solver.value(problem.visited_stores[store.id])
    ]
    selections = [
        RouteTagSelection(tag=tag, product=assignments.get(tag))
        for tag in problem.catalog.requested_tags
    ]
    products = [
        assignments[tag]
        for store_id in stores
        for tag in problem.catalog.requested_tags
        if tag in assignments and products_by_id[assignments[tag]].store_id == store_id
    ]
    product_tags = {product_id: [tag] for tag, product_id in assignments.items()}

    price_cents = solver.value(problem.price_cents)
    distance_milli_miles = solver.value(problem.distance_milli_miles)
    time_centi_minutes = solver.value(problem.time_centi_minutes)
    product_price_units = price_cents * PRICE_SCORE_UNITS_PER_CENT
    distance_score_units = (
        distance_milli_miles * problem.policy.distance_units_per_milli_mile
    )
    time_score_units = (
        time_centi_minutes * problem.policy.time_units_per_centi_minute
    )
    store_score_units = len(stores) * problem.policy.store_score_units
    components = RouteScoreComponents(
        productPrice=float(_score_units_to_decimal(product_price_units)),
        distanceCost=float(_score_units_to_decimal(distance_score_units)),
        timeCost=float(_score_units_to_decimal(time_score_units)),
        storeCost=float(_score_units_to_decimal(store_score_units)),
    )
    score = components.total()
    matched_count = len(assignments)
    candidate = RouteCandidate(
        stores=stores,
        products=products,
        productTags=product_tags,
        selections=selections,
        distance=float(Decimal(distance_milli_miles) * DISTANCE_QUANTUM),
        time=float(Decimal(time_centi_minutes) * TIME_QUANTUM),
        productPrice=float(Decimal(price_cents) * PRICE_QUANTUM),
        matchedTagCount=matched_count,
        score=float(score),
        scoreComponents=components,
        errorCode=(
            RouteErrorCode.PARTIAL_TAG_MATCH
            if matched_count != len(problem.catalog.requested_tags)
            else None
        ),
    )
    return _SolvedCandidate(
        candidate=candidate,
        sequence_code=solver.value(problem.sequence_code),
        literal_values=tuple(
            bool(solver.value(literal)) for literal in problem.solution_literals
        ),
    )


def _solve_next_candidate(
    problem: _Problem,
    settings: SolverSettings,
    deadline: float,
) -> tuple[_SolvedCandidate | None, bool, bool]:
    model = problem.model.clone()
    remaining = deadline - monotonic()
    if remaining <= 0:
        return None, False, True

    model.maximize(problem.match_count)
    solver = _new_solver(settings, remaining)
    status = solver.solve(model)
    _raise_for_invalid_status(model, status)
    if status == cp_model.INFEASIBLE:
        return None, True, False
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None, False, True
    latest_solver = solver
    if status != cp_model.OPTIMAL:
        return _extract_candidate(problem, solver), False, True

    model.add(problem.match_count == solver.value(problem.match_count))
    _add_solution_hints(model, problem, latest_solver)
    remaining = deadline - monotonic()
    if remaining <= 0:
        return _extract_candidate(problem, latest_solver), False, True

    model.minimize(problem.score_units)
    score_solver = _new_solver(settings, remaining)
    score_status = score_solver.solve(model)
    _raise_for_invalid_status(model, score_status)
    if score_status == cp_model.OPTIMAL:
        latest_solver = score_solver
        model.add(problem.score_units == score_solver.value(problem.score_units))
    elif score_status == cp_model.FEASIBLE:
        return _extract_candidate(problem, score_solver), False, True
    elif score_status == cp_model.INFEASIBLE:
        raise OptimizationFailedError("score optimization became infeasible")
    else:
        return _extract_candidate(problem, latest_solver), False, True

    tie_expressions = [problem.sequence_code, *_assignment_tie_expressions(problem)]
    for expression in tie_expressions:
        _add_solution_hints(model, problem, latest_solver)
        remaining = deadline - monotonic()
        if remaining <= 0:
            return _extract_candidate(problem, latest_solver), False, True
        model.minimize(expression)
        tie_solver = _new_solver(settings, remaining)
        tie_status = tie_solver.solve(model)
        _raise_for_invalid_status(model, tie_status)
        if tie_status == cp_model.OPTIMAL:
            latest_solver = tie_solver
            model.add(expression == tie_solver.value(expression))
            continue
        if tie_status == cp_model.FEASIBLE:
            return _extract_candidate(problem, tie_solver), False, True
        if tie_status == cp_model.INFEASIBLE:
            raise OptimizationFailedError("tie-break optimization became infeasible")
        return _extract_candidate(problem, latest_solver), False, True

    return _extract_candidate(problem, latest_solver), True, False


def _exclude_solution(problem: _Problem, solution: _SolvedCandidate) -> None:
    problem.model.add_bool_or(
        literal.Not() if value else literal
        for literal, value in zip(
            problem.solution_literals, solution.literal_values, strict=True
        )
    )


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
    effective_policy = policy or RouteScorePolicy()
    effective_settings = settings or SolverSettings()
    problem = _build_problem(catalog, travel, effective_policy)
    started_at = monotonic()
    deadline = started_at + effective_settings.timeout_seconds
    candidates: list[RouteCandidate] = []
    sequence_counts: dict[int, int] = {}
    proven_prefix_count = 0
    timed_out = False
    exhausted = False

    while len(candidates) < limit:
        solution, proven, iteration_timed_out = _solve_next_candidate(
            problem, effective_settings, deadline
        )
        if solution is None:
            timed_out = iteration_timed_out
            exhausted = not iteration_timed_out
            break

        candidates.append(solution.candidate)
        if proven and proven_prefix_count == len(candidates) - 1:
            proven_prefix_count += 1
        _exclude_solution(problem, solution)
        sequence_count = sequence_counts.get(solution.sequence_code, 0) + 1
        sequence_counts[solution.sequence_code] = sequence_count
        if sequence_count >= effective_settings.max_candidates_per_store_sequence:
            problem.model.add(problem.sequence_code != solution.sequence_code)
        if iteration_timed_out:
            timed_out = True
            break

    if not candidates:
        if timed_out:
            raise OptimizationFailedError("optimization timed out without a solution")
        if exhausted:
            raise NoFeasibleRouteError("no selected product can form a round trip")
        raise OptimizationFailedError("optimization did not produce a route")

    elapsed = monotonic() - started_at
    status = (
        RouteOptimizationStatus.FEASIBLE_TIMEOUT
        if timed_out
        else RouteOptimizationStatus.OPTIMAL
    )
    if status == RouteOptimizationStatus.OPTIMAL:
        proven_prefix_count = len(candidates)
    return RouteOptimizationResponse(
        candidates=candidates,
        status=status,
        requestedLimit=limit,
        provenPrefixCount=proven_prefix_count,
        elapsedSeconds=elapsed,
        timeoutSeconds=effective_settings.timeout_seconds,
    )