"""Test-only CP-SAT reference restored from the pre-heuristic optimizer."""

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal
from math import isfinite
from time import monotonic

from ortools.sat.python import cp_model

from backend.route_optimizer import (
    DISTANCE_QUANTUM,
    PRICE_QUANTUM,
    PRICE_SCORE_UNITS_PER_CENT,
    SCORE_QUANTUM,
    SCORE_UNITS_PER_DOLLAR,
    TIME_QUANTUM,
    DirectedTravelMatrix,
    NoEligibleProductsError,
    NoFeasibleRouteError,
    OptimizationCatalog,
    OptimizationFailedError,
    RouteScorePolicy,
)
from backend.types import (
    RouteCandidate,
    RouteErrorCode,
    RouteItemSelection,
    RouteOptimizationResponse,
    RouteOptimizationStatus,
    RouteScoreComponents,
)


MAX_CP_INTEGER = (1 << 62) - 1


def _decimal(value: Decimal | float | str) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def _quantized_units(value: Decimal | float, quantum: Decimal) -> int:
    quantized = _decimal(value).quantize(quantum, rounding=ROUND_HALF_UP)
    return int(quantized / quantum)


def _score_units_to_decimal(units: int) -> Decimal:
    return (Decimal(units) / SCORE_UNITS_PER_DOLLAR).quantize(
        SCORE_QUANTUM,
        rounding=ROUND_HALF_UP,
    )


@dataclass(frozen=True, slots=True)
class ExactSolverSettings:
    timeout_seconds: float = 120.0
    random_seed: int = 0

    def __post_init__(self) -> None:
        if not isfinite(self.timeout_seconds) or self.timeout_seconds <= 0:
            raise ValueError("timeout_seconds must be positive and finite")


@dataclass(slots=True)
class _Problem:
    model: cp_model.CpModel
    catalog: OptimizationCatalog
    policy: RouteScorePolicy
    assignments: dict[tuple[int, int], cp_model.IntVar]
    matched: dict[int, cp_model.IntVar]
    visited_stores: dict[int, cp_model.IntVar]
    route_arcs: dict[tuple[int, int], cp_model.IntVar]
    positions: dict[int, cp_model.IntVar]
    match_count: cp_model.LinearExpr
    price_cents: cp_model.LinearExpr
    distance_milli_miles: cp_model.LinearExpr
    time_centi_minutes: cp_model.LinearExpr
    modifier_penalty_units: cp_model.LinearExpr
    score_units: cp_model.LinearExpr
    sequence_code: cp_model.LinearExpr
    assignment_ranks: dict[int, cp_model.IntVar]
    solution_literals: tuple[cp_model.IntVar, ...]


@dataclass(frozen=True, slots=True)
class _SolvedCandidate:
    candidate: RouteCandidate
    sequence_code: int
    store_ids: frozenset[int]
    literal_values: tuple[bool, ...]


def _edge_price_cents(catalog: OptimizationCatalog) -> dict[tuple[int, int], int]:
    return {
        (item_index, product.id): _quantized_units(
            _decimal(product.price)
            / _decimal(product.price_quantity)
            * _decimal(catalog.requested_items[item_index].quantity),
            PRICE_QUANTUM,
        )
        for product in catalog.products
        for item_index in product.matching_item_indices
    }


def _edge_modifier_misses(
    catalog: OptimizationCatalog,
) -> dict[tuple[int, int], int]:
    return {
        (item_index, product.id): len(
            set(catalog.requested_items[item_index].modifiers)
            - set(product.modifiers)
        )
        for product in catalog.products
        for item_index in product.matching_item_indices
    }


def _maximum_product_matching(catalog: OptimizationCatalog) -> int:
    candidates = {
        item_index: [
            product.id
            for product in catalog.products
            if item_index in product.matching_item_indices
        ]
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

    return sum(
        assign(item_index, set())
        for item_index in range(len(catalog.requested_items))
    )


def _build_problem(
    catalog: OptimizationCatalog,
    travel: DirectedTravelMatrix,
    policy: RouteScorePolicy,
) -> _Problem:
    if not catalog.products:
        raise NoEligibleProductsError("no requested item has an eligible product")
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
        (item_index, product.id): model.new_bool_var(
            f"assign_{item_index}_{product.id}"
        )
        for item_index in range(len(catalog.requested_items))
        for product in catalog.products
        if item_index in product.matching_item_indices
    }
    matched = {
        item_index: model.new_bool_var(f"matched_{item_index}")
        for item_index in range(len(catalog.requested_items))
    }
    for item_index in range(len(catalog.requested_items)):
        item_assignments = [
            variable
            for (assignment_item, _), variable in assignments.items()
            if assignment_item == item_index
        ]
        model.add(matched[item_index] == sum(item_assignments))

    selected_products = {
        product.id: model.new_bool_var(f"selected_product_{product.id}")
        for product in catalog.products
    }
    for product in catalog.products:
        product_assignments = [
            variable
            for (_, product_id), variable in assignments.items()
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
        model.add(
            sum(store_products)
            <= len(store_products) * visited_stores[store.id]
        )

    store_node = {
        store.id: node for node, store in enumerate(catalog.stores, start=1)
    }
    node_store = {node: store_id for store_id, node in store_node.items()}
    route_arcs: dict[tuple[int, int], cp_model.IntVar] = {}
    route_metrics: dict[tuple[int, int], object] = {}
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
            variable = model.new_bool_var(
                f"route_{origin_node}_{destination_node}"
            )
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
            sum(
                at_position[(position, store.id)] for store in catalog.stores
            )
            <= 1
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

    edge_price_cents = _edge_price_cents(catalog)
    edge_modifier_misses = _edge_modifier_misses(catalog)
    price_cents = cp_model.LinearExpr.sum(
        [
            edge_price_cents[(item_index, product_id)] * variable
            for (item_index, product_id), variable in assignments.items()
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
    modifier_penalty_units = cp_model.LinearExpr.sum(
        [
            edge_modifier_misses[(item_index, product_id)]
            * policy.modifier_miss_score_units
            * variable
            for (item_index, product_id), variable in assignments.items()
        ]
    )
    score_units = (
        price_cents * PRICE_SCORE_UNITS_PER_CENT
        + distance_milli_miles * policy.distance_units_per_milli_mile
        + time_centi_minutes * policy.time_units_per_centi_minute
        + visited_count * policy.store_score_units
        + modifier_penalty_units
    )

    unmatched_rank = len(product_ranks) + 1
    assignment_ranks: dict[int, cp_model.IntVar] = {}
    for item_index in range(len(catalog.requested_items)):
        rank = model.new_int_var(
            1,
            unmatched_rank,
            f"assignment_rank_{item_index}",
        )
        model.add(
            rank
            == cp_model.LinearExpr.sum(
                [
                    product_ranks[product_id] * variable
                    for (assignment_item, product_id), variable in assignments.items()
                    if assignment_item == item_index
                ]
            )
            + unmatched_rank * (1 - matched[item_index])
        )
        assignment_ranks[item_index] = rank
    model.add(match_count >= 1)
    model.add(match_count <= _maximum_product_matching(catalog))
    solution_literals = tuple(assignments.values()) + tuple(route_arcs.values())
    return _Problem(
        model=model,
        catalog=catalog,
        policy=policy,
        assignments=assignments,
        matched=matched,
        visited_stores=visited_stores,
        route_arcs=route_arcs,
        positions=positions,
        match_count=match_count,
        price_cents=price_cents,
        distance_milli_miles=distance_milli_miles,
        time_centi_minutes=time_centi_minutes,
        modifier_penalty_units=modifier_penalty_units,
        score_units=score_units,
        sequence_code=sequence_code,
        assignment_ranks=assignment_ranks,
        solution_literals=solution_literals,
    )


def _new_solver(
    settings: ExactSolverSettings,
    remaining_seconds: float,
) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.001, remaining_seconds)
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = settings.random_seed
    return solver


def _raise_for_invalid_status(
    model: cp_model.CpModel,
    status: cp_model.CpSolverStatus,
) -> None:
    if status == cp_model.MODEL_INVALID:
        validation_error = model.validate().splitlines()[0]
        detail = validation_error or "unknown validation error"
        raise OptimizationFailedError(f"CP-SAT model is invalid: {detail}")


def _add_solution_hints(
    model: cp_model.CpModel,
    problem: _Problem,
    solver: cp_model.CpSolver,
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
        problem.assignment_ranks[item_index]
        for item_index in range(len(problem.catalog.requested_items))
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


def _extract_candidate(
    problem: _Problem,
    solver: cp_model.CpSolver,
) -> _SolvedCandidate:
    products_by_id = {product.id: product for product in problem.catalog.products}
    assignments = {
        item_index: product_id
        for (item_index, product_id), variable in problem.assignments.items()
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
        RouteItemSelection(
            **item.model_dump(),
            product=assignments.get(item_index),
        )
        for item_index, item in enumerate(problem.catalog.requested_items)
    ]
    products = [
        assignments[item_index]
        for store_id in stores
        for item_index in range(len(problem.catalog.requested_items))
        if item_index in assignments
        and products_by_id[assignments[item_index]].store_id == store_id
    ]

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
    modifier_penalty_units = solver.value(problem.modifier_penalty_units)
    components = RouteScoreComponents(
        productPrice=float(_score_units_to_decimal(product_price_units)),
        distanceCost=float(_score_units_to_decimal(distance_score_units)),
        timeCost=float(_score_units_to_decimal(time_score_units)),
        storeCost=float(_score_units_to_decimal(store_score_units)),
        modifierPenalty=float(_score_units_to_decimal(modifier_penalty_units)),
    )
    matched_count = len(assignments)
    candidate = RouteCandidate(
        stores=stores,
        products=products,
        selections=selections,
        distance=float(Decimal(distance_milli_miles) * DISTANCE_QUANTUM),
        time=float(Decimal(time_centi_minutes) * TIME_QUANTUM),
        productPrice=float(Decimal(price_cents) * PRICE_QUANTUM),
        matchedItemCount=matched_count,
        score=float(components.total()),
        scoreComponents=components,
        errorCode=(
            RouteErrorCode.PARTIAL_ITEM_MATCH
            if matched_count != len(problem.catalog.requested_items)
            else None
        ),
    )
    return _SolvedCandidate(
        candidate=candidate,
        sequence_code=solver.value(problem.sequence_code),
        store_ids=frozenset(stores),
        literal_values=tuple(
            bool(solver.value(literal)) for literal in problem.solution_literals
        ),
    )


def _solve_next_candidate(
    problem: _Problem,
    settings: ExactSolverSettings,
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
            problem.solution_literals,
            solution.literal_values,
            strict=True,
        )
    )


def _exclude_store_set(problem: _Problem, store_ids: frozenset[int]) -> None:
    problem.model.add_bool_or(
        variable.Not() if store_id in store_ids else variable
        for store_id, variable in problem.visited_stores.items()
    )


def optimize_routes_exact(
    catalog: OptimizationCatalog,
    travel: DirectedTravelMatrix,
    *,
    limit: int = 20,
    policy: RouteScorePolicy | None = None,
    settings: ExactSolverSettings | None = None,
) -> RouteOptimizationResponse:
    """Return a proven prefix using the former multi-stage CP-SAT search."""

    if not 1 <= limit <= 20:
        raise ValueError("limit must be between 1 and 20")
    effective_policy = policy or RouteScorePolicy()
    effective_settings = settings or ExactSolverSettings()
    problem = _build_problem(catalog, travel, effective_policy)
    started_at = monotonic()
    deadline = started_at + effective_settings.timeout_seconds
    candidates: list[RouteCandidate] = []
    proven_prefix_count = 0
    timed_out = False
    exhausted = False

    while len(candidates) < limit:
        solution, proven, iteration_timed_out = _solve_next_candidate(
            problem,
            effective_settings,
            deadline,
        )
        if solution is None:
            timed_out = iteration_timed_out
            exhausted = not iteration_timed_out
            break

        candidates.append(solution.candidate)
        if proven and proven_prefix_count == len(candidates) - 1:
            proven_prefix_count += 1
        _exclude_solution(problem, solution)
        _exclude_store_set(problem, solution.store_ids)
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