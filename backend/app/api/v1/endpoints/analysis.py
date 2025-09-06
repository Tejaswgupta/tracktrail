"""
Analysis endpoints for the FastAPI financial analysis service.

This module provides REST API endpoints for various financial analysis services including:
- Cash flow analysis
- Counterparty trends analysis  
- Mule account detection
- Cycle detection
- Rapid movement analysis
- Time trends analysis
- Transfer pattern analysis
"""

"""
Analysis endpoints for the FastAPI financial analysis service.
"""
import logging
import pandas as pd
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import (
    APIRouter,
    HTTPException,
    Depends,
    status,
    BackgroundTasks,
)
from fastapi.responses import JSONResponse

from services.ai_llm_analysis import analyze_transactions
from app.models.requests import (
    CashFlowRequest,
    CounterpartyTrendsRequest,
    MuleAccountRequest,
    CycleDetectionRequest,
    RapidMovementRequest,
    TimeTrendsRequest,
    TransferPatternRequest,
    AnalysisRequest,
)
from app.models.responses import AnalysisResponse, ErrorResponse
from app.services.analysis_service import AnalysisService
from app.services.database_service import get_database_service, DatabaseService
from app.core.exceptions import (
    ValidationError,
    EntityNotFoundError,
    AnalysisError,
    DatabaseError,
)
from services.mule_account_detector import MuleAccountDetector

logger = logging.getLogger(__name__)
router = APIRouter()


async def get_analysis_service(
    database_service: DatabaseService = Depends(get_database_service),
) -> AnalysisService:
    return AnalysisService(database_service=database_service)


async def get_entity_transactions(
    entity_ids: List[str], db: DatabaseService
) -> pd.DataFrame:
    return await db.get_entity_transactions(entity_ids, convert_to_polars=False)


@router.post(
    "/analyze/ai-llm",
    response_model=AnalysisResponse,
    summary="AI LLM Analysis", 
    description="Perform AI LLM analysis for specified entities to identify patterns, frequencies, and anomalies",
    responses={
        200: {
            "description": "AI LLM analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed", 
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse 
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_ai_llm(
    request: AnalysisRequest,
    database_service: DatabaseService = Depends(get_database_service)
) -> JSONResponse:
    start_time = datetime.now(timezone.utc)
    try:
        logger.info(f"Starting AI LLM analysis for {len(request.entity_ids)} entities")
        if len(request.entity_ids) > 1:
            raise ValidationError("AI LLM analysis currently supports single entity analysis only")
        transactions = await database_service.get_entity_transactions(
            request.entity_ids, convert_to_polars=False
        )
        if transactions.empty:
            raise EntityNotFoundError(f"No transactions found for entities: {request.entity_ids}")
        results = analyze_transactions(transactions=transactions)
        end_time = datetime.now(timezone.utc)
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        response_data = {
            "success": True,
            "data": {
                "results": results,
                "metadata": {
                    "entities_analyzed": len(request.entity_ids),
                    "transactions_analyzed": len(transactions),
                    "processing_time_ms": processing_time_ms,
                    "analysis_timestamp": end_time.isoformat()
                }
            },
            "message": "AI LLM analysis completed successfully"
        }
        return JSONResponse(content=response_data)
    except ValidationError as e:
        logger.error(f"AI LLM analysis validation error: {str(e)}")
        raise HTTPException(status_code=422, detail=str(e))
    except EntityNotFoundError as e:
        logger.error(f"AI LLM analysis entity error: {str(e)}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"AI LLM analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@router.post("/analyze/mule-accounts", response_model=Dict[str, Any])
async def analyze_mule_accounts(
    request: MuleAccountRequest,
    background_tasks: BackgroundTasks,
    database_service: DatabaseService = Depends(get_database_service)
):
    try:
        entity_ids = request.entity_ids
        if not entity_ids:
            raise HTTPException(status_code=400, detail="Entity IDs are required")
        if len(entity_ids) > 1:
            raise HTTPException(status_code=400, detail="Mule account detection only works with single entity")
        detector_config = {
            'min_collection_transactions': request.min_collection_transactions or 5,
            'min_disbursement_amount_ratio': request.min_disbursement_amount_ratio or 3.0,
            'max_collection_period_days': request.max_collection_period_days or 30,
            'velocity_threshold': request.velocity_threshold or 0.5,
            'periodicity_tolerance': request.periodicity_tolerance or 2,
            'sensitivity_multiplier': request.sensitivity_multiplier or 1.0,
            'pattern_sensitivity': request.pattern_sensitivity or "medium",
        }
        detector = MuleAccountDetector()
        detector.config.update(detector_config)
        transactions_df = await get_entity_transactions(entity_ids, database_service)
        if transactions_df.empty:
            raise HTTPException(status_code=404, detail="No transactions found for the specified entity")
        alerts = detector.detect_mule_patterns(transactions_df)
        formatted_alerts = []
        for alert in alerts:
            formatted_alert = {
                "account_id": alert.account_id,
                "confidence_score": alert.confidence_score,
                "pattern_type": alert.pattern_type,
                "risk_indicators": alert.risk_indicators,
                "detection_period": alert.detection_period,
                "pass_through_analysis": {
                    "total_inflow": alert.disbursement_phase.get('total_credits', 0),
                    "total_outflow": alert.disbursement_phase.get('total_debits', 0),
                    "net_flow": alert.disbursement_phase.get('net_flow', 0),
                    "flow_balance_percentage": alert.disbursement_phase.get('flow_balance_score', 0) * 100
                },
                "multi_interval_analysis": {
                    "daily_balancing": {
                        "balanced_days": alert.disbursement_phase.get('balanced_periods', 0),
                        "total_days": alert.disbursement_phase.get('periods_analyzed', 1),
                        "ratio": alert.disbursement_phase.get('suspicion_score', 0)
                    },
                    "suspicion_metrics": {
                        "lifetime_ratio": alert.disbursement_phase.get('net_flow_ratio', 0),
                        "daily_ratio": 0.001,
                        "monthly_ratio": 0.001
                    }
                }
            }
            formatted_alerts.append(formatted_alert)
        result = {
            "alerts": formatted_alerts,
            "summary": {
                "total_alerts": len(formatted_alerts),
                "analysis_period": f"{transactions_df['DATE'].min()} to {transactions_df['DATE'].max()}" if not transactions_df.empty else "No data",
                "entity_analyzed": entity_ids[0],
                "transactions_analyzed": len(transactions_df)
            }
        }
        return {
            "success": True,
            "data": result,
            "message": "Mule account analysis completed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Mule account analysis failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.post(
    "/analyze/cash-flow",
    response_model=AnalysisResponse,
    summary="Cash Flow Analysis",
    description="Perform cash flow analysis for specified entities to identify cash transaction patterns, frequencies, and anomalies",
    responses={
        200: {
            "description": "Cash flow analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_cash_flow(
    request: CashFlowRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform cash flow analysis for specified entities.
    
    This endpoint analyzes transaction data to identify:
    - Cash transaction patterns and frequencies
    - Large cash transactions above threshold
    - Temporal patterns (monthly, daily trends)
    - Amount patterns and statistics
    - Risk indicators for suspicious cash activity
    
    Args:
        request: Cash flow analysis request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Cash flow analysis results with patterns and insights
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting cash flow analysis for {len(request.entity_ids)} entities")
        
       
        if len(request.entity_ids) > 1:
            raise ValidationError("Cash flow analysis currently supports single entity analysis only")
        
    
        analysis_params = {
            'cash_keywords': request.cash_keywords or ['CASH', 'ATM', 'WITHDRAWAL', 'CHQ'],  
            'threshold': request.threshold or 50000,  
            'granularity': request.granularity
        }
        
        
        results = await analysis_service.analyze_cash_flow(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
       
        metadata = {
            "analysis_type": "cash_flow",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
        
        if results.get("results", {}).get("cash_transactions_found", False):
            message = f"Cash flow analysis completed successfully. Found {results['results']['total_cash_transactions']} cash transactions."
        else:
            message = "Cash flow analysis completed. No cash transactions found with specified criteria."
        
       
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Cash flow analysis completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Cash flow analysis validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Cash flow analysis entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "cash_flow"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Cash flow analysis database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "cash_flow",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Cash flow analysis processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "cash_flow",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Cash flow analysis unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "cash_flow"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )

@router.post(
    "/analyze/counterparty-trends",
    response_model=AnalysisResponse,
    summary="Counterparty Trends Analysis",
    description="Perform counterparty-specific trend analysis for specified entities to identify suspicious behavior, relationship changes, and entity-specific trends",
    responses={
        200: {
            "description": "Counterparty trends analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_counterparty_trends(
    request: CounterpartyTrendsRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform counterparty trends analysis for specified entities.
    
    This endpoint analyzes transaction data to identify:
    - Individual counterparty transaction patterns and trends
    - Behavioral changes over time for each counterparty
    - Risk scoring based on transaction velocity, amount volatility, and timing patterns
    - Seasonal patterns and frequency analysis
    - Velocity metrics and relationship strength indicators
    
    Args:
        request: Counterparty trends analysis request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Counterparty trends analysis results with risk scores and insights
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting counterparty trends analysis for {len(request.entity_ids)} entities")
        
       
        if len(request.entity_ids) > 1:
            raise ValidationError("Counterparty trends analysis currently supports single entity analysis only")
        
       
        analysis_params = {
            'min_transactions': request.min_transaction_count,
            'risk_threshold': 0.6,  
        }
        
        
        results = await analysis_service.analyze_counterparty_trends(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        
        metadata = {
            "analysis_type": "counterparty_trends",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
        
        counterparty_count = results.get("results", {}).get("summary", {}).get("total_counterparties_analyzed", 0)
        high_risk_count = results.get("results", {}).get("summary", {}).get("high_risk_count", 0)
        
        if counterparty_count > 0:
            message = f"Counterparty trends analysis completed successfully. Analyzed {counterparty_count} counterparties, {high_risk_count} flagged as high-risk."
        else:
            message = "Counterparty trends analysis completed. No counterparties found with sufficient transaction history."
        
        
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Counterparty trends analysis completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Counterparty trends analysis validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Counterparty trends analysis entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "counterparty_trends"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Counterparty trends analysis database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "counterparty_trends",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Counterparty trends analysis processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "counterparty_trends",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Counterparty trends analysis unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "counterparty_trends"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )

async def detect_mule_accounts(
    request: MuleAccountRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform mule account detection for specified entities.
    
    This endpoint analyzes transaction data to identify:
    - Pass-through accounts where inflow ≈ outflow
    - Classic mule patterns (many small credits → few large debits)
    - Periodic disbursement patterns
    - Threshold avoidance behaviors
    - Complex mule detection patterns with confidence scoring
    
    Args:
        request: Mule account detection request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Mule account detection results with alerts and risk indicators
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting mule account detection for {len(request.entity_ids)} entities")
        
       
        if len(request.entity_ids) > 1:
            raise ValidationError("Mule account detection currently supports single entity analysis only")
        
        
        analysis_params = {
            'account_identifier': request.entity_ids[0],
            'velocity_threshold': request.velocity_threshold,
            'pattern_sensitivity': request.pattern_sensitivity
        }
        
        
        sensitivity_multipliers = {
            'low': 0.8,
            'medium': 1.0,
            'high': 1.2
        }
        analysis_params['sensitivity_multiplier'] = sensitivity_multipliers.get(
            request.pattern_sensitivity, 1.0
        )
        
       
        results = await analysis_service.detect_mule_accounts(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        
        metadata = {
            "analysis_type": "mule_accounts",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
      
        alerts_count = results.get("results", {}).get("alerts_count", 0)
        high_confidence_alerts = results.get("results", {}).get("summary", {}).get("high_confidence_alerts", 0)
        
        if alerts_count > 0:
            message = f"Mule account detection completed successfully. Generated {alerts_count} alerts, {high_confidence_alerts} high-confidence."
        else:
            message = "Mule account detection completed. No mule account patterns detected."
        
        
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Mule account detection completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Mule account detection validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Mule account detection entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "mule_accounts"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Mule account detection database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "mule_accounts",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Mule account detection processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "mule_accounts",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Mule account detection unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "mule_accounts"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )


@router.post(
    "/analyze/cycles",
    response_model=AnalysisResponse,
    summary="Cycle Detection Analysis",
    description="Perform cycle detection analysis with dual functionality: simple round trip detection for single entities, network cycle detection for multiple entities",
    responses={
        200: {
            "description": "Cycle detection analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def detect_cycles(
    request: CycleDetectionRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform cycle detection analysis with dual functionality.
    
    This endpoint provides different analysis based on the number of entities:
    
    **Single Entity (Round Trip Detection):**
    - Uses services/round_trip.py for simple round trip detection
    - Identifies transactions that go out and come back from the same counterparty
    - Analyzes amount differences, timing patterns, and tolerance matching
    
    **Multiple Entities (Network Cycle Detection):**
    - Uses services/network_cycle_detector.py for complex network analysis
    - Identifies cycles across multiple entities in transaction networks
    - Provides centrality metrics, hub identification, and network statistics
    - Detects sophisticated layering and structuring patterns
    
    Args:
        request: Cycle detection request with entity IDs and analysis parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Cycle detection results with identified patterns and network metrics
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        entity_count = len(request.entity_ids)
        logger.info(f"Starting cycle detection for {entity_count} entities")
        
       
        if not request.entity_ids or len(request.entity_ids) == 0:
            raise ValidationError("At least one entity ID required")
        
      
        if request.max_cycle_length > 20:
            logger.warning("Max cycle length limited to 20 for performance")
            request.max_cycle_length = 20
        
        if request.min_amount_threshold < 0:
            raise ValidationError("Minimum amount threshold must be non-negative")
        
        
        logger.info(f"Analysis request: {len(request.entity_ids)} entities")
        logger.info(f"Parameters: max_length={request.max_cycle_length}, min_amount={request.min_amount_threshold}")
        
       
        analysis_type = "network_cycles"
        logger.info("Performing network cycle detection (≥ 3-node cycles)")
        
        
        entity_mappings = {}
        logger.info("Entity mappings disabled - using original counterparty names")            
        
        analysis_params = {
            'max_cycle_length': min(request.max_cycle_length, 20), 
            'min_amount_threshold': request.min_amount_threshold,
            'time_window_hours': request.time_window_hours,
            'entity_mappings': entity_mappings,
            'apply_entity_merging': True
        }
        
        
        if entity_count == 1:
            
            analysis_params.update({
                'tolerance': 5.0,  
                'days': min(30, request.time_window_hours // 24 if request.time_window_hours else 30),  
                'min_amount': request.min_amount_threshold
            })
        else:
            
            analysis_params.update({
                'min_length': 2,
                'max_length': min(request.max_cycle_length, 10), 
                'min_amount': request.min_amount_threshold,
                'max_duration_days': min(365, request.time_window_hours // 24 if request.time_window_hours else 365),
                'net_flow_threshold': 0.1,
                'detect_multi_entity_cycles': True,
                'use_merged_entities': True
            })
        
        logger.info("Starting cycle detection analysis...")
        
       
        results = await analysis_service.detect_cycles(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        
        metadata = {
            "analysis_type": analysis_type,
            "entity_count": entity_count,
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range"),
            "entity_mappings_applied": len(entity_mappings)  
        }
        
        
        if entity_count == 1:
            
            round_trips_found = results.get("results", {}).get("round_trips_found", False)
            total_round_trips = results.get("results", {}).get("total_round_trips", 0)
            
            if round_trips_found:
                message = f"Round trip detection completed successfully. Found {total_round_trips} potential round trip transactions."
            else:
                message = "Round trip detection completed. No round trip patterns detected with current parameters."
        else:
            
            cycles_found = results.get("results", {}).get("cycles_found", 0)
            multi_entity_cycles = results.get("results", {}).get("multi_entity_cycles_found", 0)
            high_confidence_cycles = results.get("results", {}).get("high_confidence_cycles", 0)
            
            if cycles_found > 0 or multi_entity_cycles > 0:
                total_patterns = cycles_found + multi_entity_cycles
                message = f"Network cycle detection completed successfully. Found {total_patterns} patterns ({cycles_found} simple cycles, {multi_entity_cycles} multi-entity flows), {high_confidence_cycles} high-confidence."
                if len(entity_mappings) > 0:
                    message += f" Applied {len(entity_mappings)} entity merging rules."
            else:
                message = "Network cycle detection completed. No suspicious cycles detected in the transaction network."
                if len(entity_mappings) > 0:
                    message += f" Applied {len(entity_mappings)} entity merging rules."
        
        
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Cycle detection completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Cycle detection validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Cycle detection entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": analysis_type if 'analysis_type' in locals() else "cycles"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Cycle detection database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": analysis_type if 'analysis_type' in locals() else "cycles",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Cycle detection processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": analysis_type if 'analysis_type' in locals() else "cycles",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Cycle detection unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": analysis_type if 'analysis_type' in locals() else "cycles"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )


@router.post(
    "/analyze/rapid-movements",
    response_model=AnalysisResponse,
    summary="Rapid Movement Analysis",
    description="Perform rapid movement detection for specified entities to identify quick money movements with matching amounts and tight time windows",
    responses={
        200: {
            "description": "Rapid movement analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_rapid_movements(
    request: RapidMovementRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform rapid movement analysis for specified entities.
    
    This endpoint analyzes transaction data to identify:
    - Quick money movements where funds come in and go out within a short time window
    - Amount matching patterns with configurable tolerance
    - Repeated rapid movement patterns between counterparties
    - Time gap analysis and velocity metrics
    - Risk indicators for potential money laundering through rapid transfers
    
    Args:
        request: Rapid movement analysis request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Rapid movement analysis results with detected patterns and insights
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting rapid movement analysis for {len(request.entity_ids)} entities")
        
        
        if len(request.entity_ids) > 1:
            raise ValidationError("Rapid movement analysis currently supports single entity analysis only")
        
        
        analysis_params = {
            'hours': request.time_threshold_minutes / 60.0,  
            'tolerance': request.tolerance_percentage,
            'min_amount': request.amount_threshold,
            'show_visualization': False  
        }
        
        
        results = await analysis_service.analyze_rapid_movements(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        
        metadata = {
            "analysis_type": "rapid_movements",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
        
        rapid_movements_found = results.get("results", {}).get("rapid_movements_found", False)
        total_movements = results.get("results", {}).get("total_rapid_movements", 0)
        repeated_pairs = results.get("results", {}).get("repeated_pairs_count", 0)
        
        if rapid_movements_found:
            if repeated_pairs > 0:
                message = f"Rapid movement analysis completed successfully. Found {total_movements} rapid movements, {repeated_pairs} repeated party pairs detected."
            else:
                message = f"Rapid movement analysis completed successfully. Found {total_movements} rapid movements, no repeated patterns detected."
        else:
            message = "Rapid movement analysis completed. No rapid money movements detected with current parameters."
        
       
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Rapid movement analysis completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Rapid movement analysis validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Rapid movement analysis entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "rapid_movements"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Rapid movement analysis database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "rapid_movements",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Rapid movement analysis processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "rapid_movements",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Rapid movement analysis unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "rapid_movements"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )


@router.post(
    "/analyze/time-trends",
    response_model=AnalysisResponse,
    summary="Time Trends Analysis",
    description="Perform time-based trend analysis for specified entities to identify temporal patterns, seasonal trends, and transaction velocity changes over time",
    responses={
        200: {
            "description": "Time trends analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_time_trends(
    request: TimeTrendsRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform time-based trend analysis for specified entities.
    
    This endpoint analyzes transaction data to identify:
    - Temporal patterns and trends in debit/credit transactions
    - Seasonal patterns and cyclical behaviors
    - Transaction velocity and frequency changes over time
    - Anomaly detection in time-based patterns
    - Correlation analysis between debit and credit flows
    - Volatility analysis and cash flow patterns
    - Various time granularity options (hourly, daily, weekly, monthly)
    
    Args:
        request: Time trends analysis request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Time trends analysis results with temporal insights and patterns
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting time trends analysis for {len(request.entity_ids)} entities")
        
        
        if len(request.entity_ids) > 1:
            raise ValidationError("Time trends analysis currently supports single entity analysis only")
        
       
        analysis_params = {
            'time_granularity': request.aggregation_period,
            'include_seasonality': request.include_seasonality,
            'trend_method': request.trend_detection_method
        }
        
        
        results = await analysis_service.analyze_time_trends(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
       
        metadata = {
            "analysis_type": "time_trends",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
        
        analysis_data = results.get("results", {})
        data_summary = analysis_data.get("data_summary", {})
        trend_analysis = analysis_data.get("trend_analysis", {})
        
        total_periods = data_summary.get("total_periods", 0)
        trends_detected = bool(trend_analysis.get("overall_assessment", {}).get("debit_trend_strength", 0) > 0.3 or 
                              trend_analysis.get("overall_assessment", {}).get("credit_trend_strength", 0) > 0.3)
        
        if total_periods > 0:
            if trends_detected:
                message = f"Time trends analysis completed successfully. Analyzed {total_periods} time periods with significant trends detected."
            else:
                message = f"Time trends analysis completed successfully. Analyzed {total_periods} time periods with stable patterns."
        else:
            message = "Time trends analysis completed. Insufficient data for temporal pattern analysis."
        
       
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Time trends analysis completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Time trends analysis validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Time trends analysis entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "time_trends"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Time trends analysis database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "time_trends",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Time trends analysis processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "time_trends",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Time trends analysis unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "time_trends"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )


@router.post(
    "/analyze/transfer-patterns",
    response_model=AnalysisResponse,
    summary="Transfer Pattern Analysis",
    description="Perform transfer pattern analysis for multiple entities to identify network-level transaction flows and repeated transfer patterns",
    responses={
        200: {
            "description": "Transfer pattern analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "One or more entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_transfer_patterns(
    request: TransferPatternRequest,
    analysis_service: AnalysisService = Depends(get_analysis_service)
) -> JSONResponse:
    """
    Perform transfer pattern analysis for multiple entities.
    
    This endpoint analyzes transaction data to identify:
    - Network-level transaction flows between multiple entities
    - Repeated transfer patterns and layering schemes
    - Structuring patterns across entity networks
    - Round-robin and fan-out/fan-in patterns
    - Complex money movement schemes involving multiple counterparties
    
    Args:
        request: Transfer pattern analysis request with entity IDs and parameters
        analysis_service: Analysis service dependency
        
    Returns:
        JSONResponse: Transfer pattern analysis results with identified patterns and network flows
        
    Raises:
        HTTPException: For validation errors, entity not found, or analysis failures
    """
    start_time = datetime.utcnow()
    
    try:
        logger.info(f"Starting transfer pattern analysis for {len(request.entity_ids)} entities")
        
        
        if len(request.entity_ids) < 2:
            raise ValidationError("Transfer pattern analysis requires multiple entities (minimum 2)")
        
        
        analysis_params = {
            'time_window': 7,  
            'percentage_match': 90,  
            'deviance': 10, 
            'min_amount': 1000,  
            'min_occurrences': 2,  
            'pattern_types': request.pattern_types,
            'network_depth': request.network_depth,
            'min_pattern_strength': request.min_pattern_strength
        }
        
        
        results = await analysis_service.analyze_transfer_patterns(
            entity_ids=request.entity_ids,
            date_from=request.date_from,
            date_to=request.date_to,
            **analysis_params
        )
        
        
        end_time = datetime.utcnow()
        processing_time_ms = int((end_time - start_time).total_seconds() * 1000)
        
        
        metadata = {
            "analysis_type": "transfer_patterns",
            "entity_count": len(request.entity_ids),
            "transaction_count": results.get("transaction_count", 0),
            "processing_time_ms": processing_time_ms,
            "parameters": analysis_params,
            "date_range": results.get("date_range")
        }
        
        
        patterns_found = results.get("results", {}).get("transfer_patterns_found", False)
        total_patterns = results.get("results", {}).get("total_patterns", 0)
        
        if patterns_found:
            message = f"Transfer pattern analysis completed successfully. Found {total_patterns} repeated transfer patterns across {len(request.entity_ids)} entities."
        else:
            message = "Transfer pattern analysis completed. No repeated transfer patterns detected with current parameters."
        
        
        response = AnalysisResponse(
            success=True,
            message=message,
            data=results,
            metadata=metadata,
            timestamp=end_time
        )
        
        logger.info(f"Transfer pattern analysis completed successfully in {processing_time_ms}ms")
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=response.model_dump(mode='json')
        )
        
    except ValidationError as e:
        logger.warning(f"Transfer pattern analysis validation error: {str(e)}")
        error_response = ErrorResponse(
            error_code="VALIDATION_ERROR",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "validation_type": "request_validation"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(mode='json')
        )
        
    except EntityNotFoundError as e:
        logger.warning(f"Transfer pattern analysis entity not found: {str(e)}")
        error_response = ErrorResponse(
            error_code="ENTITY_NOT_FOUND",
            message=str(e),
            details={
                "entity_ids": request.entity_ids,
                "analysis_type": "transfer_patterns"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content=error_response.model_dump(mode='json')
        )
        
    except DatabaseError as e:
        logger.error(f"Transfer pattern analysis database error: {str(e)}")
        error_response = ErrorResponse(
            error_code="DATABASE_ERROR",
            message="Database operation failed. Please try again later.",
            details={
                "analysis_type": "transfer_patterns",
                "entity_count": len(request.entity_ids)
            }
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=error_response.model_dump(mode='json')
        )
        
    except AnalysisError as e:
        logger.error(f"Transfer pattern analysis processing error: {str(e)}")
        error_response = ErrorResponse(
            error_code="ANALYSIS_ERROR",
            message="Analysis processing failed. Please check your request and try again.",
            details={
                "analysis_type": "transfer_patterns",
                "entity_ids": request.entity_ids
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
        
    except Exception as e:
        logger.error(f"Transfer pattern analysis unexpected error: {str(e)}")
        error_response = ErrorResponse(
            error_code="INTERNAL_ERROR",
            message="An unexpected error occurred during analysis.",
            details={
                "analysis_type": "transfer_patterns"
            }
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(mode='json')
        )
