/**
 * TypeScript types for AML Backend API integration
 *
 * This file contains all the request and response types for the backend AML analysis endpoints.
 * These types ensure type safety when communicating with the backend API.
 */

// Base types
export interface BackendAnalysisRequest {
  entity_ids: string[];
  date_from?: string; // ISO string
  date_to?: string; // ISO string
}

export interface BackendAnalysisResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  metadata: {
    analysis_type: string;
    entity_count: number;
    transaction_count: number;
    processing_time_ms: number;
    parameters: Record<string, any>;
    date_range?: {
      from: string;
      to: string;
    };
  };
  timestamp: string;
}

export interface BackendErrorResponse {
  success: false;
  error_code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Request types for each analysis endpoint
export interface CashFlowRequest extends BackendAnalysisRequest {
  cash_keywords?: string[];
  threshold?: number;
  granularity?: "daily" | "weekly" | "monthly";
}

export interface CounterpartyTrendsRequest extends BackendAnalysisRequest {
  min_transaction_count?: number;
  trend_window_days?: number;
}

export interface MuleAccountRequest extends BackendAnalysisRequest {
  velocity_threshold?: number;
  pattern_sensitivity?: "low" | "medium" | "high";
}

export interface CycleDetectionRequest extends BackendAnalysisRequest {
  max_cycle_length?: number;
  min_amount_threshold?: number;
  time_window_hours?: number;
}

export interface RapidMovementRequest extends BackendAnalysisRequest {
  time_threshold_minutes?: number;
  amount_threshold?: number;
  tolerance_percentage?: number;
}

export interface TimeTrendsRequest extends BackendAnalysisRequest {
  aggregation_period?: "hourly" | "daily" | "weekly" | "monthly";
  include_seasonality?: boolean;
  trend_detection_method?: "linear" | "polynomial" | "seasonal";
}

export interface TransferPatternRequest extends BackendAnalysisRequest {
  pattern_types?: string[];
  network_depth?: number;
  min_pattern_strength?: number;
}

// Response data types for each analysis
export interface BackendTransaction {
  id: string;
  date: string;
  amount: number;
  description: string;
  counterparty: string;
  type: "credit" | "debit";
  entity_id: string;
}

export interface CashFlowResult {
  results: {
    cash_transactions_found: boolean;
    total_cash_transactions: number;
    total_cash_inflow: number;
    total_cash_outflow: number;
    cash_patterns: Array<{
      pattern_type: string;
      frequency: number;
      total_amount: number;
      risk_score: number;
    }>;
    temporal_analysis: {
      monthly_trends: Record<string, number>;
      daily_patterns: Record<string, number>;
    };
    risk_indicators: string[];
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface CounterpartyTrendsResult {
  results: {
    counterparties: Array<{
      counterparty_name: string;
      transaction_count: number;
      total_amount: number;
      risk_score: number;
      velocity_score: number;
      relationship_strength: number;
      trend_direction: "increasing" | "decreasing" | "stable";
      seasonal_patterns: Record<string, number>;
    }>;
    summary: {
      total_counterparties_analyzed: number;
      high_risk_count: number;
      average_risk_score: number;
      most_active_counterparty: string;
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface MuleAccountResult {
  results: {
    alerts_count: number;
    mule_patterns: Array<{
      pattern_type: string;
      confidence_score: number;
      risk_factors: string[];
      transaction_velocity: number;
      inflow_outflow_ratio: number;
      transactions: BackendTransaction[];
    }>;
    summary: {
      overall_risk_score: number;
      high_confidence_alerts: number;
      primary_risk_factors: string[];
      recommendations: string[];
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface CycleDetectionResult {
  results: {
    cycles_found: number;
    high_confidence_cycles: number;
    round_trips_found?: boolean; // For single entity analysis
    total_round_trips?: number; // For single entity analysis
    cycles?: Array<{
      cycle_id: string;
      entities: string[];
      transactions: BackendTransaction[];
      cycle_length: number;
      total_amount: number;
      confidence_score: number;
      cycle_type: string;
    }>;
    round_trips?: Array<{
      counterparty: string;
      outbound_transaction: BackendTransaction;
      return_transaction: BackendTransaction;
      amount_difference: number;
      time_span_hours: number;
      return_ratio: number;
    }>;
    network_metrics?: {
      centrality_scores: Record<string, number>;
      hub_entities: string[];
      network_density: number;
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface RapidMovementResult {
  results: {
    rapid_movements_found: boolean;
    total_rapid_movements: number;
    rapid_movements: Array<{
      in_date: string;
      in_amount: number;
      in_counterparty: string;
      in_description: string;
      out_date: string;
      out_amount: number;
      out_counterparty: string;
      out_description: string;
      hours_gap: number;
      amount_difference_percent: number;
    }>;
    repeated_pairs: Array<any>;
    repeated_pairs_count: number;
    analysis_parameters: {
      time_window_hours: number;
      amount_tolerance_percent: number;
      min_amount: number;
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface TimeTrendsResult {
  results: {
    trend_analysis: {
      overall_trend: "increasing" | "decreasing" | "stable";
      trend_strength: number;
      seasonal_patterns: Array<{
        period: string;
        pattern_strength: number;
        peak_periods: string[];
      }>;
    };
    time_series_data: Array<{
      period: string;
      transaction_count: number;
      total_amount: number;
      average_amount: number;
    }>;
    anomalies: Array<{
      date: string;
      anomaly_type: string;
      severity: "low" | "medium" | "high";
      description: string;
    }>;
    forecasting?: {
      next_period_prediction: number;
      confidence_interval: [number, number];
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

export interface TransferPatternResult {
  results: {
    patterns_detected: Array<{
      pattern_id: string;
      pattern_type:
        | "layering"
        | "structuring"
        | "round_robin"
        | "fan_out"
        | "fan_in";
      entities: string[];
      transactions: BackendTransaction[];
      pattern_strength: number;
      network_depth: number;
      total_amount: number;
      confidence_score: number;
    }>;
    network_analysis: {
      entity_roles: Record<string, "source" | "intermediary" | "destination">;
      network_metrics: {
        density: number;
        centralization: number;
        clustering_coefficient: number;
      };
    };
    summary: {
      total_patterns: number;
      high_confidence_patterns: number;
      most_common_pattern: string;
      network_complexity_score: number;
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}

// Union types for responses
export type AMLAnalysisResult =
  | CashFlowResult
  | CounterpartyTrendsResult
  | MuleAccountResult
  | CycleDetectionResult
  | RapidMovementResult
  | TimeTrendsResult
  | TransferPatternResult;

export type AMLAnalysisResponse = BackendAnalysisResponse<AMLAnalysisResult>;

// Error types
export type AMLErrorCode =
  | "VALIDATION_ERROR"
  | "ENTITY_NOT_FOUND"
  | "DATABASE_ERROR"
  | "ANALYSIS_ERROR"
  | "INTERNAL_ERROR";

export interface AMLError extends Error {
  code: AMLErrorCode;
  details?: Record<string, any>;
}
