import axios from 'axios';
import type { MuleAnalysisResult, MuleAlert } from '@/types/mule';

const API_URL = process.env.NEXT_PUBLIC_AML_API_URL || 'http://localhost:8000/api/v1/analysis/mule-accounts';

export async function analyzeMuleAccounts(payload: any): Promise<MuleAnalysisResult> {
  try {
    const { data } = await axios.post(API_URL, payload);
    return transformBackendResponse(data);
  } catch (error) {
    console.error('API call failed:', error);
    throw new Error('Failed to analyze mule accounts');
  }
}

function transformBackendResponse(apiResp: any): MuleAnalysisResult {
  console.log('Raw API response:', apiResp);
  
  // Handle different response structures
  const rawAlerts = apiResp.data?.results?.mule_alerts || 
                   apiResp.data?.results?.mule_patterns || 
                   [];

  const alerts: MuleAlert[] = rawAlerts.map((alert: any) => ({
    account_id: alert.account_id,
    confidence_score: alert.confidence_score,
    pattern_type: alert.pattern_type,
    risk_indicators: alert.risk_indicators || alert.risk_factors || [],
    detection_period: {
      start_date: alert.detection_period?.start_date || apiResp.data?.date_range?.from || "2023-01-01",
      end_date: alert.detection_period?.end_date || apiResp.data?.date_range?.to || "2023-12-31", 
      total_days: alert.detection_period?.total_days || 365,
    },
    disbursement_phase: {
      total_credits: alert.disbursement_phase?.total_credits || 0,
      total_debits: alert.disbursement_phase?.total_debits || 0,
      net_flow: alert.disbursement_phase?.net_flow || 0,
      flow_balance_score: alert.disbursement_phase?.flow_balance_score || 0,
    },
    recommended_actions: alert.recommended_actions || [],
  }));

  return {
    alerts,
    summary: {
      total_alerts: apiResp.data?.results?.summary?.alerts_generated || alerts.length,
      high_confidence_alerts: apiResp.data?.results?.summary?.high_confidence_alerts || 
                             alerts.filter(a => a.confidence_score >= 0.7).length,
      entities_analyzed: apiResp.data?.entity_count || 1,
      alerts_generated: apiResp.data?.results?.summary?.alerts_generated || alerts.length,
    },
  };
}
