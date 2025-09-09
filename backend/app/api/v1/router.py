"""
API v1 router for organizing all analysis endpoints.

This module provides a centralized router that organizes all analysis endpoints
and provides proper API versioning and endpoint organization.
"""

from fastapi import APIRouter

from app.api.v1.endpoints import (
    analysis,
    health,
    pdf,
    bogus_itc,
)

api_router = APIRouter(
    prefix="/api/v1",
    responses={
        404: {"description": "Not found"},
        422: {"description": "Validation Error"},
        500: {"description": "Internal Server Error"},
        503: {"description": "Service Unavailable"},
    },
)

api_router.include_router(
    health.router,
    tags=["Health"],
    responses={
        200: {"description": "Service is healthy"},
        503: {"description": "Service is unhealthy"},
    },
)

api_router.include_router(
    analysis.router,
    tags=["Analysis"],
    responses={
        200: {"description": "Analysis completed successfully"},
        404: {"description": "Entity not found"},
        422: {"description": "Request validation failed"},
        500: {"description": "Analysis processing failed"},
        503: {"description": "Database service unavailable"},
    },
)

api_router.include_router(
    pdf.router,
    tags=["PDF Extraction"],
    responses={
        200: {"description": "PDF extracted successfully"},
        415: {"description": "Unsupported Media Type"},
        500: {"description": "Extraction failed"},
    },
)

api_router.include_router(
    bogus_itc.router,
    tags=["Bogus ITC"],
    responses={
        200: {"description": "Bogus ITC analysis completed successfully"},
        400: {"description": "Invalid file format or missing GSTIN"},
        422: {"description": "Request validation failed"},
        500: {"description": "Bogus ITC analysis failed"},
    },
)

router_info = {
    "version": "1.0",
    "description": "Financial Analysis API v1 - Comprehensive transaction analysis services",
    "endpoints": {
        "health": {"description": "Health monitoring endpoints", "count": 3},
        "analysis": {"description": "Financial analysis endpoints", "count": 7},
        "pdf": {"description": "PDF extraction endpoints", "count": 1},
        "entity_merging": {"description": "Entity merging endpoints", "count": 1},
        "bogus_itc": {"description": "Bogus ITC detection endpoints", "count": 1},
    },
    "features": [
        "Single and multi-entity analysis",
        "Comprehensive pattern detection",
        "Standardized response formats",
        "Robust error handling",
        "Performance monitoring",
        "Bogus ITC detection with GEXF visualization",
    ],
}
