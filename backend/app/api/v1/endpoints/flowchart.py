"""
Flowchart endpoints for the FastAPI financial analysis service.

This module provides REST API endpoints for flowchart chain analysis,
computing transaction chains, hub detection, and branching patterns server-side.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

import polars as pl
from app.core.exceptions import (AnalysisError, DatabaseError,
                                 EntityNotFoundError, ValidationError)
from app.models.requests import FlowchartChainRequest
from app.models.responses import AnalysisResponse, ErrorResponse
from app.services.database_service import DatabaseService, get_database_service
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from services.flowchart_chain_analyzer import FlowchartChainAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/analyze/flowchart-chains",
    response_model=AnalysisResponse,
    summary="Flowchart Chain Analysis",
    description="Compute transaction flow chains, hub detection, and branching patterns for a case",
    responses={
        200: {
            "description": "Flowchart chain analysis completed successfully",
            "model": AnalysisResponse
        },
        422: {
            "description": "Request validation failed",
            "model": ErrorResponse
        },
        404: {
            "description": "Case or entities not found",
            "model": ErrorResponse
        },
        500: {
            "description": "Analysis processing failed",
            "model": ErrorResponse
        }
    }
)
async def analyze_flowchart_chains(
    request: FlowchartChainRequest,
    database_service: DatabaseService = Depends(get_database_service)
) -> JSONResponse:
    """
    Analyze transaction flows to identify chains, hubs, and patterns.
    
    This endpoint performs server-side computation of:
    - Chronological transaction chains
    - Hub/intermediary detection
    - Branching and merging patterns
    - Sequential transaction runs
    
    Args:
        request: FlowchartChainRequest with case_id and filter parameters
        database_service: Database service dependency
    
    Returns:
        JSONResponse with chain analysis results
    """
    start_time = datetime.now(timezone.utc)
    
    try:
        async with database_service.db_manager.get_connection() as client:
            # Step 1: Get entity_ids from case_entities junction table
            case_entities_result = (
                client.table("case_entities")
                .select("entity_id")
                .eq("case_id", request.case_id)
                .execute()
            )
            
            if not case_entities_result.data:
                raise HTTPException(status_code=404, detail="No entities found for this case")
            
            entity_ids_from_case = [row["entity_id"] for row in case_entities_result.data]
            
            # Step 2: Fetch entities using the entity_ids
            entities_query = (
                client.table("entities")
                .select("entity_id, entity_name, risk_score")
                .in_("entity_id", entity_ids_from_case)
            )
            entities_result = entities_query.execute()
            
            # Convert to Polars DataFrame
            entities_df = pl.DataFrame(entities_result.data)
            entity_ids = entities_df["entity_id"].to_list()
            
            logger.info(f"Found {len(entity_ids)} entities for analysis")
            
            # Build transaction query with filters
            tx_query = client.table("transactions").select(
                "transaction_id, tx_date, amount, direction, entity_id, counterparty_merged, description"
            ).in_("entity_id", entity_ids)
            
            # Add date filters
            if request.date_from:
                tx_query = tx_query.gte("tx_date", request.date_from)
            
            if request.date_to:
                tx_query = tx_query.lte("tx_date", request.date_to)
            
            # Add direction filters
            if not request.include_inflow and request.include_outflow:
                tx_query = tx_query.eq("direction", "DR")
            elif request.include_inflow and not request.include_outflow:
                tx_query = tx_query.eq("direction", "CR")
            elif not request.include_inflow and not request.include_outflow:
                raise ValidationError(
                    "At least one of include_inflow or include_outflow must be True",
                    {"include_inflow": False, "include_outflow": False}
                )
            
            tx_query = tx_query.order("tx_date")
            
            # Fetch transactions with pagination
            logger.info(f"Fetching transactions with filters: date_from={request.date_from}, date_to={request.date_to}")
            
            all_transactions = []
            PAGE_SIZE = 1000
            offset = 0
            
            while True:
                paginated_query = tx_query.limit(PAGE_SIZE).offset(offset)
                transactions_result = paginated_query.execute()
                
                if transactions_result.data:
                    all_transactions.extend(transactions_result.data)
                
                if not transactions_result.data or len(transactions_result.data) < PAGE_SIZE:
                    break
                
                offset += PAGE_SIZE
            
            if not all_transactions:
                logger.warning("No transactions found matching the filters")
                return JSONResponse(
                    status_code=status.HTTP_200_OK,
                    content=AnalysisResponse(
                        success=True,
                        message="No transactions found matching the filters",
                        data={
                            "events": [],
                            "chains": [],
                            "sequential_runs": [],
                            "branch_meta": {},
                            "branch_nodes": [],
                            "hub_candidates": [],
                            "highlighted_hub_node_ids": [],
                            "metadata": {
                                "total_events": 0,
                                "total_chains": 0,
                                "displayed_chains": 0,
                                "sequential_runs": 0,
                                "hub_candidates": 0,
                                "chain_time_window_ms": request.chain_time_window_ms,
                                "min_amount_threshold": request.min_amount_threshold,
                            }
                        },
                        metadata={
                            "case_id": request.case_id,
                            "entity_count": len(entity_ids),
                            "transaction_count": 0,
                            "processing_time_ms": int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000),
                        },
                        timestamp=datetime.now(timezone.utc)
                    ).model_dump(mode='json')
                )
            
            # Convert to Polars DataFrame
            # Ensure tx_date is converted to string to avoid datetime serialization issues
            for tx in all_transactions:
                if tx.get("tx_date") and hasattr(tx["tx_date"], "isoformat"):
                    tx["tx_date"] = tx["tx_date"].isoformat()
            
            transactions_df = pl.DataFrame(all_transactions)
            
            logger.info(f"Analyzing {len(transactions_df)} transactions")
            
            # Initialize analyzer
            analyzer = FlowchartChainAnalyzer(
                max_paths_per_node=8,
                max_display_chains=10,
                max_sequential_runs=12,
            )
            
            # Perform analysis
            analysis_results = analyzer.analyze_flows(
                transactions_df=transactions_df,
                entities_df=entities_df,
                min_amount_threshold=request.min_amount_threshold,
                chain_time_window_ms=request.chain_time_window_ms,
            )
            
            processing_time = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            
            logger.info(
                f"Flowchart chain analysis completed: "
                f"{analysis_results['metadata']['total_chains']} chains found in {processing_time}ms"
            )
            
            return JSONResponse(
                status_code=status.HTTP_200_OK,
                content=AnalysisResponse(
                    success=True,
                    message="Flowchart chain analysis completed successfully",
                    data=analysis_results,
                    metadata={
                        "case_id": request.case_id,
                        "entity_count": len(entity_ids),
                        "transaction_count": len(transactions_df),
                        "processing_time_ms": processing_time,
                        "filters": {
                            "date_from": request.date_from,
                            "date_to": request.date_to,
                            "min_amount_threshold": request.min_amount_threshold,
                            "chain_time_window_ms": request.chain_time_window_ms,
                            "include_inflow": request.include_inflow,
                            "include_outflow": request.include_outflow,
                        }
                    },
                    timestamp=datetime.now(timezone.utc)
                ).model_dump(mode='json')
            )
    
    except ValidationError as e:
        logger.error(f"Validation error in flowchart chain analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "success": False,
                "error_code": "VALIDATION_ERROR",
                "message": str(e),
                "details": e.details if hasattr(e, 'details') else None,
            }
        )
    
    except EntityNotFoundError as e:
        logger.error(f"Entity not found in flowchart chain analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "success": False,
                "error_code": "ENTITY_NOT_FOUND",
                "message": str(e),
                "details": e.details if hasattr(e, 'details') else None,
            }
        )
    
    except DatabaseError as e:
        logger.error(f"Database error in flowchart chain analysis: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error_code": "DATABASE_ERROR",
                "message": "Failed to query database",
                "details": str(e),
            }
        )
    
    except Exception as e:
        logger.error(f"Unexpected error in flowchart chain analysis: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "success": False,
                "error_code": "ANALYSIS_ERROR",
                "message": "Flowchart chain analysis failed",
                "details": str(e),
            }
        )
