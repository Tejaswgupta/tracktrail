"""
Request models for the FastAPI financial analysis service.

This module contains Pydantic models for validating incoming API requests.
All models inherit from the base AnalysisRequest model to ensure consistency.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from app.utils.validators import validate_entity_id
from pydantic import BaseModel, Field, field_validator


class AnalysisRequest(BaseModel):
    """Request model for analysis."""

    entity_ids: List[str] = Field(
        ...,
        min_items=1,
        max_items=50,
        description="List of entity IDs to analyze (1-50 entities)",
    )
    date_from: Optional[datetime] = Field(
        None, description="Start date for analysis (ISO format)"
    )
    date_to: Optional[datetime] = Field(
        None, description="End date for analysis (ISO format)"
    )

    class Config:
        json_encoders = {datetime: lambda v: v.isoformat()}
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
            },
            "examples": {
                "single_entity": {
                    "summary": "Single entity analysis",
                    "description": "Analyze transactions for a single entity within a specific date range",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-03-31T23:59:59Z",
                    },
                },
                "multiple_entities": {
                    "summary": "Multiple entity analysis",
                    "description": "Analyze transactions across multiple entities for network analysis",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                            "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                    },
                },
                "no_date_filter": {
                    "summary": "All-time analysis",
                    "description": "Analyze all available transactions for the specified entities",
                    "value": {"entity_ids": ["550e8400-e29b-41d4-a716-446655440000"]},
                },
            },
        }


class CashFlowRequest(AnalysisRequest):
    """Request model for cash flow analysis."""

    include_patterns: Optional[bool] = Field(
        True, description="Include transaction patterns in analysis"
    )
    granularity: Optional[str] = Field(
        "daily", description="Time granularity for analysis (daily, weekly, monthly)"
    )
    cash_keywords: Optional[List[str]] = Field(
        None, description="List of keywords to filter cash flow transactions"
    )
    threshold: Optional[int] = Field(
        None, description="Minimum transaction amount to include in analysis"
    )

    @field_validator("granularity")
    @classmethod
    def validate_granularity(cls, v):
        allowed_values = ["daily", "weekly", "monthly", "all"]
        if v not in allowed_values:
            raise ValueError(f"granularity must be one of {allowed_values}")
        return v

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-03-31T23:59:59Z",
                "include_patterns": True,
                "granularity": "daily",
            },
            "examples": {
                "basic_cash_flow": {
                    "summary": "Basic cash flow analysis",
                    "description": "Standard cash flow analysis with daily granularity",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-03-31T23:59:59Z",
                        "include_patterns": True,
                        "granularity": "daily",
                    },
                },
                "monthly_analysis": {
                    "summary": "Monthly cash flow trends",
                    "description": "Cash flow analysis with monthly aggregation for long-term trends",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2023-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "include_patterns": False,
                        "granularity": "monthly",
                    },
                },
            },
        }


class CounterpartyTrendsRequest(AnalysisRequest):
    """Request model for counterparty trends analysis."""

    min_transaction_count: Optional[int] = Field(
        5, ge=1, description="Minimum number of transactions to consider a counterparty"
    )
    trend_window_days: Optional[int] = Field(
        30, ge=1, le=365, description="Window size in days for trend analysis"
    )

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "min_transaction_count": 5,
                "trend_window_days": 30,
            },
            "examples": {
                "standard_analysis": {
                    "summary": "Standard counterparty analysis",
                    "description": "Standard analysis with default parameters",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "min_transaction_count": 5,
                        "trend_window_days": 30,
                    },
                },
                "frequent_counterparties": {
                    "summary": "Frequent counterparty analysis",
                    "description": "Focus on counterparties with many transactions",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "min_transaction_count": 20,
                        "trend_window_days": 14,
                    },
                },
                "long_term_trends": {
                    "summary": "Long-term trend analysis",
                    "description": "Analyze long-term counterparty relationship trends",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2023-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "min_transaction_count": 3,
                        "trend_window_days": 90,
                    },
                },
            },
        }


class MuleAccountRequest(AnalysisRequest):
    """Request model for mule account detection."""

    velocity_threshold: Optional[float] = Field(
        10000.0, ge=0, description="Minimum transaction velocity to flag as suspicious"
    )
    pattern_sensitivity: Optional[str] = Field(
        "medium", description="Detection sensitivity level (low, medium, high)"
    )

    min_collection_transactions: int = Field(
        5,
        alias="minCollectionTransactions",
        ge=1,
        description="Minimum number of collection transactions to consider",
    )
    min_disbursement_amount_ratio: float = Field(
        3.0,
        alias="minDisbursementAmountRatio",
        ge=0.5,
        description="Minimum ratio of disbursement amount to collection amount",
    )
    max_collection_period_days: int = Field(
        30,
        alias="maxCollectionPeriodDays",
        ge=7,
        le=365,
        description="Maximum period (days) for collection transactions",
    )
    periodicity_tolerance: int = Field(
        2,
        alias="periodicityTolerance",
        ge=1,
        le=7,
        description="Tolerance for periodicity in days",
    )
    sensitivity_multiplier: float = Field(
        1.0,
        alias="sensitivityMultiplier",
        ge=0.5,
        le=2.0,
        description="Multiplier to adjust detection sensitivity",
    )

    @field_validator("pattern_sensitivity")
    @classmethod
    def validate_sensitivity(cls, v):
        allowed_values = ["low", "medium", "high"]
        if v not in allowed_values:
            raise ValueError(f"pattern_sensitivity must be one of {allowed_values}")
        return v

    class Config:
        allow_population_by_field_name = True
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "velocity_threshold": 0.5,
                "pattern_sensitivity": "medium",
                "minCollectionTransactions": 5,
                "minDisbursementAmountRatio": 3.0,
                "maxCollectionPeriodDays": 30,
                "periodicityTolerance": 2,
                "sensitivityMultiplier": 1.0,
            }
        }


class BogusITCRequest(AnalysisRequest):
    """Request model for bogus ITC analysis."""

    gstin: str = Field(..., description="GSTIN of the entity")
    include_cess: Optional[bool] = Field(False, description="Include CESS in analysis")
    min_origin: Optional[float] = Field(
        1000.0, ge=0, description="Minimum origin amount"
    )
    max_hops: Optional[int] = Field(
        4, ge=1, le=10, description="Maximum hops in ITC chain"
    )
    min_flow: Optional[float] = Field(500.0, ge=0, description="Minimum flow amount")

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "gstin": "07AABCU9603R1ZX",
                "include_cess": False,
                "min_origin": 1000.0,
                "max_hops": 4,
                "min_flow": 500.0,
            },
            "examples": {
                "basic_analysis": {
                    "summary": "Basic bogus ITC analysis",
                    "description": "Standard bogus ITC detection with default parameters",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "gstin": "07AABCU9603R1ZX",
                        "include_cess": False,
                        "min_origin": 1000.0,
                        "max_hops": 4,
                        "min_flow": 500.0,
                    },
                },
                "detailed_analysis": {
                    "summary": "Detailed bogus ITC analysis",
                    "description": "Comprehensive analysis with extended parameters",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "gstin": "27AABCU9603R1ZX",
                        "include_cess": True,
                        "min_origin": 500.0,
                        "max_hops": 6,
                        "min_flow": 250.0,
                    },
                },
            },
        }


class CycleDetectionRequest(AnalysisRequest):
    """Request model for cycle detection analysis."""

    max_cycle_length: Optional[int] = Field(
        10, ge=2, le=20, description="Maximum number of hops in a cycle"
    )
    min_amount_threshold: Optional[float] = Field(
        1000.0,
        ge=0,
        description="Minimum transaction amount to include in cycle detection",
    )
    time_window_hours: Optional[int] = Field(
        24,
        ge=1,
        le=168,
        description="Time window for cycle detection in hours",
    )

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": [
                    "550e8400-e29b-41d4-a716-446655440000",
                    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                ],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "max_cycle_length": 5,
                "min_amount_threshold": 1000.0,
                "time_window_hours": 24,
            },
            "examples": {
                "round_trip_detection": {
                    "summary": "Round trip detection (single entity)",
                    "description": "Detect simple round trips for a single entity",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-03-31T23:59:59Z",
                        "max_cycle_length": 3,
                        "min_amount_threshold": 5000.0,
                        "time_window_hours": 48,
                    },
                },
                "network_cycles": {
                    "summary": "Network cycle detection (multiple entities)",
                    "description": "Detect complex cycles across multiple entities",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                            "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "max_cycle_length": 8,
                        "min_amount_threshold": 1000.0,
                        "time_window_hours": 72,
                    },
                },
                "quick_cycles": {
                    "summary": "Quick cycle detection",
                    "description": "Detect rapid cycles within short time windows",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "max_cycle_length": 4,
                        "min_amount_threshold": 10000.0,
                        "time_window_hours": 6,
                    },
                },
            },
        }


class RapidMovementRequest(AnalysisRequest):
    """Request model for rapid movement analysis."""

    time_threshold_minutes: Optional[int] = Field(
        60,
        ge=1,
        le=1440,
        description="Time threshold for rapid movement detection in minutes",
    )
    amount_threshold: Optional[float] = Field(
        5000.0, ge=0, description="Minimum amount threshold for rapid movement"
    )
    tolerance_percentage: Optional[float] = Field(
        5.0, ge=0, le=100, description="Tolerance percentage for amount matching"
    )

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "time_threshold_minutes": 60,
                "amount_threshold": 5000.0,
                "tolerance_percentage": 5.0,
            },
            "examples": {
                "quick_movements": {
                    "summary": "Quick movement detection (1 hour)",
                    "description": "Detect rapid movements within 1 hour with tight tolerance",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-03-31T23:59:59Z",
                        "time_threshold_minutes": 60,
                        "amount_threshold": 10000.0,
                        "tolerance_percentage": 2.0,
                    },
                },
                "daily_movements": {
                    "summary": "Same-day movement detection",
                    "description": "Detect movements within the same business day",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "time_threshold_minutes": 480,
                        "amount_threshold": 5000.0,
                        "tolerance_percentage": 10.0,
                    },
                },
                "large_amounts": {
                    "summary": "Large amount rapid movements",
                    "description": "Focus on high-value rapid movements",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-06-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "time_threshold_minutes": 120,
                        "amount_threshold": 50000.0,
                        "tolerance_percentage": 5.0,
                    },
                },
            },
        }


class TimeTrendsRequest(AnalysisRequest):
    """Request model for time trends analysis."""

    aggregation_period: Optional[str] = Field(
        "daily", description="Time aggregation period (hourly, daily, weekly, monthly)"
    )
    include_seasonality: Optional[bool] = Field(
        True, description="Include seasonality analysis"
    )
    trend_detection_method: Optional[str] = Field(
        "linear",
        description="Method for trend detection (linear, polynomial, seasonal)",
    )

    @field_validator("aggregation_period")
    @classmethod
    def validate_aggregation_period(cls, v):
        allowed_values = ["hourly", "daily", "weekly", "monthly"]
        if v not in allowed_values:
            raise ValueError(f"aggregation_period must be one of {allowed_values}")
        return v

    @field_validator("trend_detection_method")
    @classmethod
    def validate_trend_method(cls, v):
        allowed_values = ["linear", "polynomial", "seasonal"]
        if v not in allowed_values:
            raise ValueError(f"trend_detection_method must be one of {allowed_values}")
        return v

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "aggregation_period": "daily",
                "include_seasonality": True,
                "trend_detection_method": "linear",
            },
            "examples": {
                "daily_trends": {
                    "summary": "Daily trend analysis",
                    "description": "Analyze daily transaction trends with seasonality",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "aggregation_period": "daily",
                        "include_seasonality": True,
                        "trend_detection_method": "seasonal",
                    },
                },
                "monthly_overview": {
                    "summary": "Monthly trend overview",
                    "description": "High-level monthly trends for long-term analysis",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2023-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "aggregation_period": "monthly",
                        "include_seasonality": False,
                        "trend_detection_method": "linear",
                    },
                },
                "hourly_patterns": {
                    "summary": "Hourly pattern analysis",
                    "description": "Detailed hourly patterns for short-term analysis",
                    "value": {
                        "entity_ids": ["550e8400-e29b-41d4-a716-446655440000"],
                        "date_from": "2024-11-01T00:00:00Z",
                        "date_to": "2024-11-30T23:59:59Z",
                        "aggregation_period": "hourly",
                        "include_seasonality": True,
                        "trend_detection_method": "polynomial",
                    },
                },
            },
        }


class TransferPatternRequest(AnalysisRequest):
    """Request model for transfer pattern analysis."""

    pattern_types: Optional[List[str]] = Field(
        ["layering", "structuring", "round_robin"],
        description="Types of patterns to detect",
    )
    network_depth: Optional[int] = Field(
        3, ge=1, le=5, description="Maximum network depth for pattern analysis"
    )
    min_pattern_strength: Optional[float] = Field(
        0.7, ge=0.1, le=1.0, description="Minimum pattern strength threshold (0.1-1.0)"
    )

    @field_validator("pattern_types")
    @classmethod
    def validate_pattern_types(cls, v):
        allowed_patterns = [
            "layering",
            "structuring",
            "round_robin",
            "fan_out",
            "fan_in",
        ]
        if isinstance(v, list):
            for pattern in v:
                if pattern not in allowed_patterns:
                    raise ValueError(f"pattern_type must be one of {allowed_patterns}")
        else:
            if v not in allowed_patterns:
                raise ValueError(f"pattern_type must be one of {allowed_patterns}")
        return v

    class Config:
        schema_extra = {
            "example": {
                "entity_ids": [
                    "550e8400-e29b-41d4-a716-446655440000",
                    "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                    "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                ],
                "date_from": "2024-01-01T00:00:00Z",
                "date_to": "2024-12-31T23:59:59Z",
                "pattern_types": ["layering", "structuring"],
                "network_depth": 3,
                "min_pattern_strength": 0.7,
            },
            "examples": {
                "layering_detection": {
                    "summary": "Layering pattern detection",
                    "description": "Detect layering patterns across multiple entities",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                            "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "date_from": "2024-01-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "pattern_types": ["layering"],
                        "network_depth": 4,
                        "min_pattern_strength": 0.8,
                    },
                },
                "comprehensive_analysis": {
                    "summary": "Comprehensive pattern analysis",
                    "description": "Detect all pattern types with moderate sensitivity",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                            "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
                            "6ba7b812-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "pattern_types": [
                            "layering",
                            "structuring",
                            "round_robin",
                            "fan_out",
                            "fan_in",
                        ],
                        "network_depth": 3,
                        "min_pattern_strength": 0.6,
                    },
                },
                "high_confidence": {
                    "summary": "High confidence patterns only",
                    "description": "Detect only high-confidence patterns to reduce false positives",
                    "value": {
                        "entity_ids": [
                            "550e8400-e29b-41d4-a716-446655440000",
                            "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
                        ],
                        "date_from": "2024-06-01T00:00:00Z",
                        "date_to": "2024-12-31T23:59:59Z",
                        "pattern_types": ["structuring", "round_robin"],
                        "network_depth": 2,
                        "min_pattern_strength": 0.9,
                    },
                },
            },
        }
