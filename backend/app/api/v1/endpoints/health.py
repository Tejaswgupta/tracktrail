"""
Health check endpoint for the FastAPI financial analysis service.

This module provides comprehensive health monitoring including:
- Database connectivity checks
- Service status monitoring  
- System metrics collection
- Dependency health verification
"""

import asyncio
import logging
import psutil
import sys
from datetime import datetime
from typing import Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import get_database, DatabaseManager
from app.models.responses import HealthResponse


logger = logging.getLogger(__name__)
router = APIRouter()


async def check_database_health(db_manager: DatabaseManager) -> Dict[str, Any]:
    """
    Check database connectivity and performance.
    
    Args:
        db_manager: Database manager instance
        
    Returns:
        Dictionary containing database health information
    """
    try:
        start_time = datetime.utcnow()
        health_info = await db_manager.health_check()
        end_time = datetime.utcnow()
        
        response_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        return {
            "status": health_info.get("status", "unknown"),
            "response_time_ms": response_time_ms,
            "connection_pool_size": health_info.get("connection_pool_size", 0),
            "active_connections": health_info.get("active_connections", 0),
            "last_check": health_info.get("timestamp"),
            "error": health_info.get("error")
        }
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": None,
            "last_check": datetime.utcnow().isoformat()
        }


async def check_analysis_services_health() -> Dict[str, Any]:
    """
    Check the availability and status of analysis services.
    
    Returns:
        Dictionary containing analysis services health information
    """
    try:
        # Import analysis services to verify they're available
        analysis_services = []
        
        try:
            from services.cash_flow import analyze_cash_flow
            analysis_services.append("cash_flow")
        except ImportError as e:
            logger.warning(f"Cash flow service unavailable: {e}")
        
        try:
            from services.counterparty_trend_analyzer import analyze_counterparty_trends
            analysis_services.append("counterparty_trends")
        except ImportError as e:
            logger.warning(f"Counterparty trends service unavailable: {e}")
        
        try:
            from services.mule_account_detector import detect_mule_accounts
            analysis_services.append("mule_account_detector")
        except ImportError as e:
            logger.warning(f"Mule account detector service unavailable: {e}")
        
        try:
            from services.network_cycle_detector import detect_network_cycles
            analysis_services.append("network_cycle_detector")
        except ImportError as e:
            logger.warning(f"Network cycle detector service unavailable: {e}")
        
        try:
            from services.rapid_movement import analyze_rapid_movement
            analysis_services.append("rapid_movement")
        except ImportError as e:
            logger.warning(f"Rapid movement service unavailable: {e}")
        
        try:
            from services.round_trip import detect_round_trips
            analysis_services.append("round_trip")
        except ImportError as e:
            logger.warning(f"Round trip service unavailable: {e}")
        
        try:
            from services.time_based_analytics import analyze_time_trends
            analysis_services.append("time_based_analytics")
        except ImportError as e:
            logger.warning(f"Time based analytics service unavailable: {e}")
        
        try:
            from services.transfer_pattern import analyze_transfer_patterns
            analysis_services.append("transfer_pattern")
        except ImportError as e:
            logger.warning(f"Transfer pattern service unavailable: {e}")
        
        total_services = 8  # Expected number of analysis services
        available_services = len(analysis_services)
        
        status = "healthy" if available_services == total_services else "degraded"
        if available_services == 0:
            status = "unhealthy"
        
        return {
            "status": status,
            "available_services": available_services,
            "total_services": total_services,
            "service_list": analysis_services,
            "last_check": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Analysis services health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "available_services": 0,
            "last_check": datetime.utcnow().isoformat()
        }


def get_system_info() -> Dict[str, Any]:
    """
    Collect system information and metrics.
    
    Returns:
        Dictionary containing system information
    """
    try:
        # Get memory usage
        memory = psutil.virtual_memory()
        
        # Get CPU usage (quick sample)
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # Get disk usage for current directory
        disk = psutil.disk_usage('.')
        
        return {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "memory_usage_mb": round(memory.used / 1024 / 1024, 2),
            "memory_total_mb": round(memory.total / 1024 / 1024, 2),
            "memory_percent": memory.percent,
            "cpu_percent": cpu_percent,
            "disk_usage_gb": round(disk.used / 1024 / 1024 / 1024, 2),
            "disk_total_gb": round(disk.total / 1024 / 1024 / 1024, 2),
            "disk_percent": round((disk.used / disk.total) * 100, 2),
            "process_id": psutil.Process().pid,
            "uptime_seconds": int((datetime.utcnow() - datetime.fromtimestamp(psutil.Process().create_time())).total_seconds())
        }
    except Exception as e:
        logger.warning(f"Failed to collect system info: {str(e)}")
        return {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "error": str(e)
        }


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health Check",
    description="Comprehensive health check endpoint that verifies database connectivity, service availability, and system metrics",
    responses={
        200: {
            "description": "Service is healthy",
            "model": HealthResponse
        },
        503: {
            "description": "Service is unhealthy",
            "model": HealthResponse
        }
    }
)
async def health_check(db_manager: DatabaseManager = Depends(get_database)) -> JSONResponse:
    """
    Perform comprehensive health check of the financial analysis service.
    
    This endpoint checks:
    - Database connectivity and performance
    - Analysis services availability
    - System resource usage
    - Overall service status
    
    Returns:
        JSONResponse: Health status with detailed service information
    """
    try:
        # Perform all health checks concurrently
        database_health_task = check_database_health(db_manager)
        analysis_services_health_task = check_analysis_services_health()
        
        # Wait for all checks to complete
        database_health, analysis_services_health = await asyncio.gather(
            database_health_task,
            analysis_services_health_task,
            return_exceptions=True
        )
        
        # Handle exceptions from health checks
        if isinstance(database_health, Exception):
            logger.error(f"Database health check exception: {database_health}")
            database_health = {
                "status": "unhealthy",
                "error": str(database_health),
                "last_check": datetime.utcnow().isoformat()
            }
        
        if isinstance(analysis_services_health, Exception):
            logger.error(f"Analysis services health check exception: {analysis_services_health}")
            analysis_services_health = {
                "status": "unhealthy",
                "error": str(analysis_services_health),
                "last_check": datetime.utcnow().isoformat()
            }
        
        # Get system information
        system_info = get_system_info()
        
        # Determine overall service status
        service_statuses = [
            database_health.get("status", "unknown"),
            analysis_services_health.get("status", "unknown")
        ]
        
        if "unhealthy" in service_statuses:
            overall_status = "unhealthy"
            status_code = 503
        elif "degraded" in service_statuses:
            overall_status = "degraded"
            status_code = 200
        elif all(status == "healthy" for status in service_statuses):
            overall_status = "healthy"
            status_code = 200
        else:
            overall_status = "unknown"
            status_code = 503
        
        # Build response
        health_response = HealthResponse(
            status=overall_status,
            version=settings.app_version,
            timestamp=datetime.utcnow(),
            services={
                "database": database_health,
                "analysis_services": analysis_services_health
            },
            system_info=system_info
        )
        
        # Log health check result
        logger.info(f"Health check completed: {overall_status}")
        
        return JSONResponse(
            status_code=status_code,
            content=health_response.dict()
        )
        
    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {str(e)}")
        
        # Return unhealthy status for unexpected errors
        error_response = HealthResponse(
            status="unhealthy",
            version=settings.app_version,
            timestamp=datetime.utcnow(),
            services={
                "database": {
                    "status": "unknown",
                    "error": "Health check failed"
                },
                "analysis_services": {
                    "status": "unknown", 
                    "error": "Health check failed"
                }
            },
            system_info={"error": "System info unavailable"}
        )
        
        return JSONResponse(
            status_code=503,
            content=error_response.dict()
        )


@router.get(
    "/health/database",
    summary="Database Health Check",
    description="Specific health check for database connectivity and performance"
)
async def database_health_check(db_manager: DatabaseManager = Depends(get_database)) -> JSONResponse:
    """
    Perform database-specific health check.
    
    Returns:
        JSONResponse: Database health status and metrics
    """
    try:
        health_info = await check_database_health(db_manager)
        
        status_code = 200 if health_info.get("status") == "healthy" else 503
        
        return JSONResponse(
            status_code=status_code,
            content={
                "service": "database",
                "timestamp": datetime.utcnow().isoformat(),
                **health_info
            }
        )
        
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "service": "database",
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )


@router.get(
    "/health/services",
    summary="Analysis Services Health Check", 
    description="Specific health check for analysis services availability"
)
async def services_health_check() -> JSONResponse:
    """
    Perform analysis services-specific health check.
    
    Returns:
        JSONResponse: Analysis services health status and availability
    """
    try:
        health_info = await check_analysis_services_health()
        
        status_code = 200 if health_info.get("status") in ["healthy", "degraded"] else 503
        
        return JSONResponse(
            status_code=status_code,
            content={
                "service": "analysis_services",
                "timestamp": datetime.utcnow().isoformat(),
                **health_info
            }
        )
        
    except Exception as e:
        logger.error(f"Analysis services health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "service": "analysis_services",
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        )