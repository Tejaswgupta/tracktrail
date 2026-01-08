export interface MuleAlert {
  account_id: string;
  confidence_score: number;
  pattern_type: string;
  risk_indicators: string[];
  detection_period: {
    start_date: string;
    end_date: string;
    total_days: number;
  };
  disbursement_phase: {
    total_credits: number;
    total_debits: number;
    net_flow: number;
    flow_balance_score: number;
  };
  multi_interval_analysis?: {
    all_intervals_analyzed: number;
    intervals_summary: Array<{
      type: string;
      ratio: number;
      suspicion: number;
      description: string;
      periods_analyzed: number;
      balanced_periods: number;
    }>;
    lifetime_ratio: number;
  };
  recommended_actions?: string[];
  // Add these optional fields if your API returns them
  detection_interval?: string;
  interval_analysis?: string;
}

export interface MuleAnalysisResult {
  alerts: MuleAlert[];
  summary: {
    total_alerts: number;
    high_confidence_alerts: number;
    entities_analyzed: number;
    alerts_generated: number;
  };
}

// Backend API response structure (for reference)
export interface BackendMulePattern {
  pattern_type: string;
  confidence_score: number;
  risk_factors: string[];
  transaction_velocity: number;
  inflow_outflow_ratio: number;
  transactions: any[];
  total_inflow?: number;
  total_outflow?: number;
}

interface BackendMuleResponse {
  alerts_count: number;
  mule_patterns: BackendMulePattern[];
  summary: {
    overall_risk_score: number;
    high_confidence_alerts: number;
    primary_risk_factors: string[];
    recommendations: string[];
  };
}
