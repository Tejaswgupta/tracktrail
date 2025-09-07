import type { MuleAnalysisResult, MuleAlert } from '@/types/mule';

const API_URL = `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/v1/analyze/mule-accounts`;

export async function analyzeMuleAccounts(payload: any): Promise<MuleAnalysisResult> {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return transformBackendResponse(data);
  } catch (error) {
    console.error('API call failed:', error);
    throw new Error('Failed to analyze mule accounts');
  }
}

function transformBackendResponse(apiResp: any): MuleAnalysisResult {
  console.log('Raw API response:', apiResp);
  
  const rawAlerts = apiResp.data?.alerts || [];

  const alerts: MuleAlert[] = rawAlerts.map((alert: any) => ({
    account_id: alert.account_id,
    confidence_score: alert.confidence_score,
    pattern_type: alert.pattern_type,
    risk_indicators: alert.risk_indicators || [],
    detection_period: {
      start_date: alert.detection_period?.start_date || new Date().toISOString().split('T')[0],
      end_date: alert.detection_period?.end_date || new Date().toISOString().split('T')[0],
      total_days: alert.detection_period?.total_days || 365,
    },
    disbursement_phase: {
      total_credits: alert.pass_through_analysis?.total_inflow || alert.pass_through_analysis?.total_credits || 0,
      total_debits: alert.pass_through_analysis?.total_outflow || alert.pass_through_analysis?.total_debits || 0,
      net_flow: alert.pass_through_analysis?.net_flow || 0,
      flow_balance_score: alert.pass_through_analysis?.flow_balance_percentage || alert.pass_through_analysis?.flow_balance_score || 0,
    },
    recommended_actions: alert.recommended_actions || [],
  }));

  return {
    alerts,
    summary: {
      total_alerts: apiResp.data?.summary?.total_alerts || alerts.length,
      high_confidence_alerts: apiResp.data?.summary?.high_confidence_alerts || alerts.filter(a => a.confidence_score >= 0.7).length,
      entities_analyzed: apiResp.data?.entities_analyzed || 1,
      alerts_generated: alerts.length,
    },
  };
}
