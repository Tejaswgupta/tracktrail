"""
Response models for the FastAPI financial analysis service.

This module contains Pydantic models for standardizing API responses.
All successful responses use AnalysisResponse, while errors use ErrorResponse.
"""

from datetime import datetime
from typing import Dict, Any, Optional, List, Union
from pydantic import BaseModel, Field


class AnalysisResponse(BaseModel):
    """Standard response model for successful analysis requests."""

    success: bool = Field(True, description="Indicates successful processing")
    message: str = Field(..., description="Human-readable response message")
    data: Optional[Dict[str, Any]] = Field(None, description="Analysis results data")
    metadata: Optional[Dict[str, Any]] = Field(
        None, description="Request and processing metadata"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Response timestamp"
    )

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        schema_extra = {
            "example": {
                "success": True,
                "message": "Analysis completed successfully",
                "data": {
                    "analysis_type": "cash_flow",
                    "entity_count": 1,
                    "transaction_count": 150,
                    "results": {},
                },
                "metadata": {"processing_time_ms": 1250, "request_id": "req_123456789"},
                "timestamp": "2024-01-15T10:30:00Z",
            }
        }


class ErrorResponse(BaseModel):
    """Standard response model for error conditions."""

    success: bool = Field(False, description="Indicates processing failure")
    error_code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error message")
    details: Optional[Dict[str, Any]] = Field(
        None, description="Additional error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Error timestamp"
    )

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        schema_extra = {
            "example": {
                "success": False,
                "error_code": "VALIDATION_ERROR",
                "message": "Invalid entity ID format",
                "details": {
                    "field": "entity_ids",
                    "invalid_value": "invalid-id",
                    "expected_format": "UUID v4",
                },
                "timestamp": "2024-01-15T10:30:00Z",
            }
        }


class ValidationErrorResponse(ErrorResponse):
    """Specialized error response for validation failures."""

    error_code: str = Field("VALIDATION_ERROR", description="Validation error code")
    validation_errors: Optional[List[Dict[str, Any]]] = Field(
        None, description="Detailed validation error information"
    )

    class Config:
        schema_extra = {
            "example": {
                "success": False,
                "error_code": "VALIDATION_ERROR",
                "message": "Request validation failed",
                "details": {"total_errors": 2},
                "validation_errors": [
                    {
                        "field": "entity_ids",
                        "message": "Invalid UUID format",
                        "invalid_value": "invalid-id",
                    },
                    {
                        "field": "date_from",
                        "message": "Date must be in ISO format",
                        "invalid_value": "2024-13-01",
                    },
                ],
                "timestamp": "2024-01-15T10:30:00Z",
            }
        }


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""

    status: str = Field(..., description="Overall service status")
    version: str = Field(..., description="Service version")
    timestamp: datetime = Field(
        default_factory=datetime.utcnow, description="Health check timestamp"
    )
    services: Dict[str, Dict[str, Any]] = Field(
        ..., description="Individual service statuses"
    )
    system_info: Optional[Dict[str, Any]] = Field(
        None, description="System information"
    )

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        schema_extra = {
            "example": {
                "status": "healthy",
                "version": "0.1.0",
                "timestamp": "2024-01-15T10:30:00Z",
                "services": {
                    "database": {
                        "status": "healthy",
                        "response_time_ms": 45,
                        "last_check": "2024-01-15T10:29:55Z",
                    },
                    "analysis_services": {"status": "healthy", "available_services": 8},
                },
                "system_info": {
                    "python_version": "3.11.0",
                    "memory_usage_mb": 256,
                    "uptime_seconds": 3600,
                },
            }
        }


class AnalysisMetadata(BaseModel):
    """Metadata structure for analysis responses."""

    analysis_type: str = Field(..., description="Type of analysis performed")
    entity_count: int = Field(..., description="Number of entities analyzed")
    transaction_count: int = Field(..., description="Total transactions processed")
    date_range: Optional[Dict[str, datetime]] = Field(
        None, description="Analysis date range"
    )
    processing_time_ms: Optional[int] = Field(
        None, description="Processing time in milliseconds"
    )
    request_id: Optional[str] = Field(None, description="Unique request identifier")
    parameters: Optional[Dict[str, Any]] = Field(
        None, description="Analysis parameters used"
    )

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}


class CashFlowAnalysisData(BaseModel):
    """Specific data structure for cash flow analysis results."""

    total_inflow: float = Field(..., description="Total money flowing in")
    total_outflow: float = Field(..., description="Total money flowing out")
    net_flow: float = Field(..., description="Net cash flow")
    transaction_patterns: List[Dict[str, Any]] = Field(
        ..., description="Identified transaction patterns"
    )
    time_series_data: List[Dict[str, Any]] = Field(
        ..., description="Time-based flow data"
    )
    risk_indicators: List[str] = Field(
        default_factory=list, description="Risk flags identified"
    )


class CounterpartyTrendsData(BaseModel):
    """Specific data structure for counterparty trends analysis results."""

    top_counterparties: List[Dict[str, Any]] = Field(
        ..., description="Most active counterparties"
    )
    trend_analysis: Dict[str, Any] = Field(..., description="Trend analysis results")
    relationship_strength: Dict[str, float] = Field(
        ..., description="Counterparty relationship strengths"
    )
    anomalous_relationships: List[Dict[str, Any]] = Field(
        ..., description="Unusual counterparty patterns"
    )


class MuleAccountData(BaseModel):
    """Specific data structure for mule account detection results."""

    risk_score: float = Field(
        ..., ge=0, le=1, description="Overall mule account risk score"
    )
    risk_factors: List[Dict[str, Any]] = Field(
        ..., description="Identified risk factors"
    )
    transaction_velocity: float = Field(..., description="Transaction velocity metric")
    pattern_matches: List[str] = Field(..., description="Matched suspicious patterns")
    recommendations: List[str] = Field(..., description="Investigation recommendations")


class CycleDetectionData(BaseModel):
    """Specific data structure for cycle detection results."""

    cycles_found: List[Dict[str, Any]] = Field(
        ..., description="Detected transaction cycles"
    )
    cycle_statistics: Dict[str, Any] = Field(
        ..., description="Cycle analysis statistics"
    )
    network_metrics: Dict[str, float] = Field(
        ..., description="Network analysis metrics"
    )
    suspicious_cycles: List[Dict[str, Any]] = Field(
        ..., description="High-risk cycles identified"
    )


class RapidMovementData(BaseModel):
    """Specific data structure for rapid movement analysis results."""

    rapid_sequences: List[Dict[str, Any]] = Field(
        ..., description="Detected rapid movement sequences"
    )
    velocity_metrics: Dict[str, float] = Field(
        ..., description="Movement velocity statistics"
    )
    time_analysis: Dict[str, Any] = Field(..., description="Temporal pattern analysis")
    risk_assessment: Dict[str, Any] = Field(..., description="Risk assessment results")


class TimeTrendsData(BaseModel):
    """Specific data structure for time trends analysis results."""

    trend_direction: str = Field(..., description="Overall trend direction")
    seasonal_patterns: List[Dict[str, Any]] = Field(
        ..., description="Identified seasonal patterns"
    )
    anomalies: List[Dict[str, Any]] = Field(
        ..., description="Temporal anomalies detected"
    )
    forecasting: Optional[Dict[str, Any]] = Field(
        None, description="Trend forecasting results"
    )


class TransferPatternData(BaseModel):
    """Specific data structure for transfer pattern analysis results."""

    detected_patterns: List[Dict[str, Any]] = Field(
        ..., description="Identified transfer patterns"
    )
    network_analysis: Dict[str, Any] = Field(
        ..., description="Network structure analysis"
    )
    pattern_strength: Dict[str, float] = Field(
        ..., description="Pattern strength scores"
    )
    entity_roles: Dict[str, str] = Field(..., description="Entity roles in patterns")


AnalysisDataType = Union[
    CashFlowAnalysisData,
    CounterpartyTrendsData,
    MuleAccountData,
    CycleDetectionData,
    RapidMovementData,
    TimeTrendsData,
    TransferPatternData,
    Dict[str, Any],
]
