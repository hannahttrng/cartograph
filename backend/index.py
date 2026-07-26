"""FastAPI application entry point."""

import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import FastAPI
from backend.controllers import router
from backend.demo_travel_matrix import DemoTravelMatrixProvider
from backend.recipe_import import AzureOpenAIRecipeProvider, RecipeImportProvider
from backend.route_calculation import RouteCalculationManager
from backend.resolvers import initialize_database
from backend.route_optimizer import RouteScorePolicy, SolverSettings

if TYPE_CHECKING:
    from backend.arcgis_connector import TravelMatrixProvider


DEFAULT_DATABASE_PATH = Path(__file__).resolve().parent.parent / "cartograph.db"


def create_app(
    database_path: str | Path | None = None,
    *,
    travel_matrix_provider: "TravelMatrixProvider | None" = None,
    route_score_policy: RouteScorePolicy | None = None,
    solver_settings: SolverSettings | None = None,
    recipe_import_provider: RecipeImportProvider | None = None,
) -> FastAPI:
    configured_path = database_path or os.getenv("CARTOGRAPH_DB_PATH")
    resolved_path = Path(configured_path) if configured_path else DEFAULT_DATABASE_PATH

    @asynccontextmanager
    async def lifespan(application: FastAPI) -> AsyncIterator[None]:
        initialize_database(resolved_path)
        application.state.database_path = resolved_path
        application.state.travel_matrix_provider = (
            travel_matrix_provider or DemoTravelMatrixProvider()
        )
        application.state.route_score_policy = route_score_policy or RouteScorePolicy()
        application.state.solver_settings = solver_settings or SolverSettings()
        application.state.route_calculation_manager = RouteCalculationManager(
            resolved_path,
            application.state.travel_matrix_provider,
            application.state.route_score_policy,
            application.state.solver_settings,
        )
        application.state.recipe_import_provider = (
            recipe_import_provider or AzureOpenAIRecipeProvider.from_environment()
        )
        await application.state.route_calculation_manager.recover()
        try:
            yield
        finally:
            await application.state.route_calculation_manager.shutdown()

    application = FastAPI(
        title="Cartograph API",
        version="0.1.0",
        lifespan=lifespan,
    )

    application.include_router(router)
    return application


app = create_app()