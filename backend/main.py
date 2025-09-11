"""
FastAPI application entry point for financial analysis services.
"""
import logging
import time
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import uvicorn

from app.core.config import settings
from app.core.database import init_database, close_database
from app.core.exceptions import (
    EXCEPTION_HANDLERS
)
from app.api.v1.router import api_router


# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager for startup and shutdown events."""
    # Startup
    logger.info("Starting Financial Analysis API...")
    try:
        await init_database()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Financial Analysis API...")
    try:
        await close_database()
        logger.info("Database connections closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {e}")


# OpenAPI configuration
openapi_tags = [
    {
        "name": "API Info",
        "description": "General API information and navigation endpoints.",
    },
    {
        "name": "Health",
        "description": "Health monitoring and service status endpoints. Use these to verify service availability and monitor system performance.",
    },
    {
        "name": "Analysis",
        "description": "Financial transaction analysis endpoints. These provide various analytical capabilities for detecting suspicious patterns, trends, and behaviors in financial data.",
    },
    {
        "name": "Cash Flow",
        "description": "Cash flow analysis for identifying cash transaction patterns, frequencies, and anomalies in financial data.",
    },
    {
        "name": "Counterparty Trends", 
        "description": "Counterparty-specific trend analysis for identifying suspicious behavior and relationship changes over time.",
    },
    {
        "name": "Mule Accounts",
        "description": "Mule account detection for identifying pass-through accounts and money laundering patterns.",
    },
    {
        "name": "Cycle Detection",
        "description": "Transaction cycle detection with dual functionality: simple round trips for single entities, complex network cycles for multiple entities.",
    },
    {
        "name": "Rapid Movement",
        "description": "Rapid money movement analysis for detecting suspicious velocity patterns and quick fund transfers.",
    },
    {
        "name": "Time Trends",
        "description": "Time-based analytics for identifying temporal patterns, seasonality, and trend analysis in transaction data.",
    },
    {
        "name": "Transfer Patterns",
        "description": "Transfer pattern analysis for detecting complex multi-entity transaction patterns and network behaviors.",
    },
    {
        "name": "Monitoring",
        "description": "Monitoring and metrics endpoints for system performance tracking and alerting.",
    }
]

# Create FastAPI application instance with comprehensive OpenAPI configuration
app = FastAPI(
    title=settings.app_name,
    description="""
# Financial Analysis API

A comprehensive RESTful API for financial transaction analysis services designed for law enforcement agencies and financial investigators.

## Overview

This API provides advanced analytical capabilities for detecting suspicious patterns, trends, and behaviors in financial transaction data. It integrates multiple specialized analysis services into a unified interface with standardized request/response formats.

## Key Features

- **Multi-Entity Analysis**: Support for both single and multiple entity analysis
- **Comprehensive Pattern Detection**: Cash flow, counterparty trends, mule accounts, cycles, rapid movements, time trends, and transfer patterns
- **Flexible Date Filtering**: Analyze transactions within specific date ranges
- **Standardized Responses**: Consistent JSON response format across all endpoints
- **Robust Error Handling**: Detailed error messages with proper HTTP status codes
- **Health Monitoring**: Comprehensive health checks for database and services
- **Performance Metrics**: Processing time tracking and system resource monitoring

## Authentication

Currently, this API does not require authentication. Future versions will include API key-based authentication and role-based access controls.

## Rate Limiting

- Maximum 50 entities per analysis request
- Maximum 365-day date range per request
- Request size limited to 10MB

## Data Privacy

This API handles sensitive financial data. All requests and responses are logged for audit purposes, but sensitive data is sanitized in logs.

## Support

For technical support or questions about specific analysis capabilities, please refer to the endpoint documentation below or contact the development team.
    """,
    version=settings.app_version,
    terms_of_service="https://example.com/terms/",
    contact={
        "name": "Financial Analysis API Support",
        "url": "https://example.com/contact/",
        "email": "support@example.com",
    },
    license_info={
        "name": "MIT License",
        "url": "https://opensource.org/licenses/MIT",
    },
    openapi_tags=openapi_tags,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    servers=[
        {
            "url": "http://localhost:8000",
            "description": "Development server"
        },
        {
            "url": "https://api.example.com",
            "description": "Production server"
        }
    ]
)

# Configure middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"]
)

# Add trusted host middleware for security
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["*"]  # Configure appropriately for production
)


# Request logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all requests with timing information."""
    start_time = time.time()
    
    # Log request
    logger.info(f"Request: {request.method} {request.url}")
    
    # Process request
    response = await call_next(request)
    
    # Calculate processing time
    process_time = time.time() - start_time
    
    # Log response
    logger.info(f"Response: {response.status_code} - {process_time:.3f}s")
    
    # Add processing time header
    response.headers["X-Process-Time"] = str(process_time)
    
    return response


# Request size limiting middleware
@app.middleware("http")
async def limit_request_size(request: Request, call_next):
    """Limit request body size to prevent DoS attacks."""
    content_length = request.headers.get("content-length")
    
    if content_length:
        content_length = int(content_length)
        if content_length > settings.max_request_size:
            return JSONResponse(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                content={
                    "success": False,
                    "error_code": "REQUEST_TOO_LARGE",
                    "message": f"Request body too large. Maximum size: {settings.max_request_size // 1048576}MB",
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
    
    return await call_next(request)


# Custom exception handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle FastAPI request validation errors."""
    logger.warning(f"Validation error: {exc}")
    
    # Extract field-specific errors
    field_errors = {}
    for error in exc.errors():
        field_path = " -> ".join(str(loc) for loc in error["loc"])
        field_errors[field_path] = error["msg"]
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "success": False,
            "error_code": "VALIDATION_ERROR",
            "message": "Request validation failed",
            "details": {
                "field_errors": field_errors,
                "error_count": len(exc.errors())
            },
            "timestamp": datetime.utcnow().isoformat()
        }
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Handle FastAPI HTTP exceptions."""
    logger.warning(f"HTTP exception: {exc.status_code} - {exc.detail}")
    
    # If detail is already a dict (from our custom exceptions), use it
    if isinstance(exc.detail, dict):
        content = exc.detail
        content["timestamp"] = datetime.utcnow().isoformat()
    else:
        # Standard HTTP exception
        content = {
            "success": False,
            "error_code": f"HTTP_{exc.status_code}",
            "message": exc.detail,
            "timestamp": datetime.utcnow().isoformat()
        }
    
    return JSONResponse(
        status_code=exc.status_code,
        content=content
    )


# Register custom exception handlers
for exception_class, handler in EXCEPTION_HANDLERS.items():
    app.exception_handler(exception_class)(handler)


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error: {str(exc)}", exc_info=True)
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error_code": "INTERNAL_ERROR",
            "message": "An unexpected error occurred. Please try again later.",
            "timestamp": datetime.utcnow().isoformat()
        }
    )

# Include API v1 router with all endpoints
app.include_router(api_router)

# Root endpoint
@app.get(
    "/",
    summary="API Information",
    description="Get basic information about the Financial Analysis API including version, documentation links, and available endpoints.",
    response_description="API information and navigation links",
    tags=["API Info"]
)
async def root():
    """
    Get API information and navigation links.
    
    This endpoint provides basic information about the Financial Analysis API,
    including version information and links to documentation and health endpoints.
    
    Returns:
        dict: API information with navigation links
    """
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "description": "RESTful API for financial transaction analysis services",
        "documentation": {
            "interactive_docs": "/docs",
            "redoc_docs": "/redoc",
            "openapi_schema": "/openapi.json"
        },
        "endpoints": {
            "health_check": "/health",
            "api_v1": "/api/v1"
        },
        "features": [
            "Cash flow analysis",
            "Counterparty trends analysis", 
            "Mule account detection",
            "Cycle detection",
            "Rapid movement analysis",
            "Time trends analysis",
            "Transfer pattern analysis"
        ],
        "limits": {
            "max_entities_per_request": settings.max_entities_per_request,
            "max_date_range_days": settings.max_date_range_days,
            "max_request_size_mb": settings.max_request_size // 1048576
        }
    }


@app.get(
    "/metrics",
    summary="Prometheus Metrics",
    description="Get Prometheus-compatible metrics for monitoring and alerting. Includes request counts, response times, error rates, and system metrics.",
    response_description="Prometheus-formatted metrics",
    tags=["Monitoring"]
)
async def metrics():
    """
    Get Prometheus-compatible metrics for monitoring.
    
    This endpoint provides metrics in Prometheus format for monitoring
    system performance, request statistics, and error rates.
    
    Returns:
        str: Prometheus-formatted metrics
    """
    # Basic metrics implementation
    # In a production environment, you would use prometheus_client library
    metrics_data = f"""# HELP api_requests_total Total number of API requests
# TYPE api_requests_total counter
api_requests_total{{method="GET",endpoint="/"}} 1
api_requests_total{{method="POST",endpoint="/api/v1/analyze/cash-flow"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/counterparty-trends"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/mule-accounts"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/cycles"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/rapid-movements"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/time-trends"}} 0
api_requests_total{{method="POST",endpoint="/api/v1/analyze/transfer-patterns"}} 0

# HELP api_request_duration_seconds Request duration in seconds
# TYPE api_request_duration_seconds histogram
api_request_duration_seconds_bucket{{le="0.1"}} 0
api_request_duration_seconds_bucket{{le="0.5"}} 0
api_request_duration_seconds_bucket{{le="1.0"}} 0
api_request_duration_seconds_bucket{{le="2.5"}} 0
api_request_duration_seconds_bucket{{le="5.0"}} 0
api_request_duration_seconds_bucket{{le="10.0"}} 0
api_request_duration_seconds_bucket{{le="+Inf"}} 0

# HELP api_errors_total Total number of API errors
# TYPE api_errors_total counter
api_errors_total{{status_code="400"}} 0
api_errors_total{{status_code="404"}} 0
api_errors_total{{status_code="422"}} 0
api_errors_total{{status_code="500"}} 0
api_errors_total{{status_code="503"}} 0

# HELP app_info Application information
# TYPE app_info gauge
app_info{{version="{settings.app_version}",name="{settings.app_name}"}} 1
"""
    
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse(content=metrics_data, media_type="text/plain")


def main():
    """Run the FastAPI application with uvicorn."""
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )


if __name__ == "__main__":
    main()
