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
            "error": health_info.get("error"),
        }
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "response_time_ms": None,
            "last_check": datetime.utcnow().isoformat(),
        }


async def check_analysis_services_health() -> Dict[str, Any]:
    try:
        analysis_services = []
        service_modules = [
            ("services.cash_flow", "analyze_cash_flow", "cash_flow"),
            (
                "services.counterparty_trend_analyzer",
                "analyze_counterparty_trends",
                "counterparty_trends",
            ),
            (
                "services.mule_account_detector",
                "detect_mule_accounts",
                "mule_account_detector",
            ),
            (
                "services.network_cycle_detector",
                "detect_network_cycles",
                "network_cycle_detector",
            ),
            ("services.rapid_movement", "analyze_rapid_movement", "rapid_movement"),
            ("services.round_trip", "detect_round_trips", "round_trip"),
            (
                "services.time_based_analytics",
                "analyze_time_trends",
                "time_based_analytics",
            ),
            (
                "services.transfer_pattern",
                "analyze_transfer_patterns",
                "transfer_pattern",
            ),
        ]

        for module_name, func_name, service_name in service_modules:
            try:
                module = __import__(module_name, fromlist=[func_name])
                getattr(module, func_name)
                analysis_services.append(service_name)
            except (ImportError, AttributeError):
                logger.warning(f"{service_name} service unavailable")

        total_services = len(service_modules)
        available_services = len(analysis_services)

        if available_services == total_services:
            status = "healthy"
        elif available_services > 0:
            status = "degraded"
        else:
            status = "unhealthy"

        return {
            "status": status,
            "available_services": available_services,
            "total_services": total_services,
            "service_list": analysis_services,
            "last_check": datetime.utcnow().isoformat(),
        }

    except Exception as e:
        logger.error(f"Analysis services health check failed: {str(e)}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "available_services": 0,
            "last_check": datetime.utcnow().isoformat(),
        }


def get_system_info() -> Dict[str, Any]:
    try:
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=0.1)
        disk = psutil.disk_usage(".")

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
            "uptime_seconds": int(
                (
                    datetime.utcnow()
                    - datetime.fromtimestamp(psutil.Process().create_time())
                ).total_seconds()
            ),
        }
    except Exception as e:
        logger.warning(f"Failed to collect system info: {str(e)}")
        return {
            "python_version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
            "error": str(e),
        }


@router.get("/health", response_model=HealthResponse)
async def health_check(
    db_manager: DatabaseManager = Depends(get_database),
) -> JSONResponse:
    try:
        database_health_task = check_database_health(db_manager)
        analysis_services_health_task = check_analysis_services_health()

        database_health, analysis_services_health = await asyncio.gather(
            database_health_task, analysis_services_health_task, return_exceptions=True
        )

        if isinstance(database_health, Exception):
            logger.error(f"Database health check exception: {database_health}")
            database_health = {
                "status": "unhealthy",
                "error": str(database_health),
                "last_check": datetime.utcnow().isoformat(),
            }

        if isinstance(analysis_services_health, Exception):
            logger.error(
                f"Analysis services health check exception: {analysis_services_health}"
            )
            analysis_services_health = {
                "status": "unhealthy",
                "error": str(analysis_services_health),
                "last_check": datetime.utcnow().isoformat(),
            }

        system_info = get_system_info()

        service_statuses = [
            database_health.get("status", "unknown"),
            analysis_services_health.get("status", "unknown"),
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

        health_response = HealthResponse(
            status=overall_status,
            version=settings.app_version,
            timestamp=datetime.utcnow(),
            services={
                "database": database_health,
                "analysis_services": analysis_services_health,
            },
            system_info=system_info,
        )

        logger.info(f"Health check completed: {overall_status}")

        return JSONResponse(status_code=status_code, content=health_response.dict())

    except Exception as e:
        logger.error(f"Health check failed with unexpected error: {str(e)}")

        error_response = HealthResponse(
            status="unhealthy",
            version=settings.app_version,
            timestamp=datetime.utcnow(),
            services={
                "database": {"status": "unknown", "error": "Health check failed"},
                "analysis_services": {
                    "status": "unknown",
                    "error": "Health check failed",
                },
            },
            system_info={"error": "System info unavailable"},
        )

        return JSONResponse(status_code=503, content=error_response.dict())


@router.get("/health/database")
async def database_health_check(
    db_manager: DatabaseManager = Depends(get_database),
) -> JSONResponse:
    try:
        health_info = await check_database_health(db_manager)
        status_code = 200 if health_info.get("status") == "healthy" else 503

        return JSONResponse(
            status_code=status_code,
            content={
                "service": "database",
                "timestamp": datetime.utcnow().isoformat(),
                **health_info,
            },
        )

    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "service": "database",
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )


@router.get("/health/services")
async def services_health_check() -> JSONResponse:
    try:
        health_info = await check_analysis_services_health()
        status_code = (
            200 if health_info.get("status") in ["healthy", "degraded"] else 503
        )

        return JSONResponse(
            status_code=status_code,
            content={
                "service": "analysis_services",
                "timestamp": datetime.utcnow().isoformat(),
                **health_info,
            },
        )

    except Exception as e:
        logger.error(f"Analysis services health check failed: {str(e)}")
        return JSONResponse(
            status_code=503,
            content={
                "service": "analysis_services",
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
