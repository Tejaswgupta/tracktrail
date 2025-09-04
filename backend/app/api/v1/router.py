"""
API v1 router for organizing all analysis endpoints.

This module provides a centralized router that organizes all analysis endpoints
and provides proper API versioning and endpoint organization.
"""

from fastapi import APIRouter

from app.api.v1.endpoints.health import router as health_router
from app.api.v1.endpoints.analysis import router as analysis_router
from app.api.v1.endpoints.pdf import router as pdf_router

# Remove this line since we're not using entity merging endpoints anymore
# from app.api.v1.endpoints.entity_merging import router as entity_merging_router

# Create the main API v1 router with version prefix
api_router = APIRouter(
    prefix="",  # No prefix here since we handle it in main.py
    responses={
        404: {"description": "Not found"},
        422: {"description": "Validation Error"},
        500: {"description": "Internal Server Error"},
        503: {"description": "Service Unavailable"},
    },
)

# Include PDF extraction endpoints under v1
api_router.include_router(
    pdf_router,
    prefix="/api/v1",
    tags=["PDF Extraction"],
    responses={
        200: {"description": "PDF extracted successfully"},
        415: {"description": "Unsupported Media Type"},
        500: {"description": "Extraction failed"},
    },
)

# Include health endpoints (at root level for system monitoring)
api_router.include_router(
    health_router,
    tags=["Health"],
    responses={
        200: {"description": "Service is healthy"},
        503: {"description": "Service is unhealthy"},
    },
)

# Include analysis endpoints with v1 prefix for proper API versioning
api_router.include_router(
    analysis_router,
    prefix="/api/v1",
    tags=["Analysis"],
    responses={
        200: {"description": "Analysis completed successfully"},
        404: {"description": "Entity not found"},
        422: {"description": "Request validation failed"},
        500: {"description": "Analysis processing failed"},
        503: {"description": "Database service unavailable"},
    },
)

# Remove entity merging router inclusion since we removed the mock API
# api_router.include_router(
#     entity_merging_router,
#     prefix="/api/v1",
#     tags=["Entity Merging"],
#     responses={
#         200: {"description": "Entity mappings retrieved successfully"},
#         404: {"description": "Entity not found"},
#         500: {"description": "Entity merging service unavailable"}
#     }
# )

# Router metadata for documentation
router_info = {
    "version": "1.0",
    "description": "Financial Analysis API v1 - Comprehensive transaction analysis services",
    "endpoints": {
        "health": {"description": "Health monitoring endpoints", "count": 3},
        "analysis": {"description": "Financial analysis endpoints", "count": 7},
        "pdf_extraction": {"description": "PDF extraction endpoints", "count": 1},
        # Removed entity_merging section since we no longer use the mock API
    },
    "features": [
        "Single and multi-entity analysis",
        "Comprehensive pattern detection",
        "Standardized response formats",
        "Robust error handling",
        "Entity name merging via database integration",  # Updated description
        "Performance monitoring",
    ],
}
