import { useState, useCallback } from 'react';
import { analyzeMuleAccounts } from '@/lib/muleAccountClient';
import type { MuleAnalysisResult } from '@/types/mule';

interface MuleAnalysisParameters {
  minCollectionTransactions: number;
  minDisbursementAmountRatio: number;
  maxCollectionPeriodDays: number;
  velocityThreshold: number;
  periodicityTolerance: number;
  sensitivityMultiplier: number;
  patternSensitivity: 'low' | 'medium' | 'high';
}

export function useMuleAccountAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MuleAnalysisResult | null>(null);

  const analyzeMuleAccountsWrapper = useCallback(async (
    entityIds: string[],
    parameters: MuleAnalysisParameters
  ) => {
    try {
      setLoading(true);
      setError(null);

      if (!entityIds || entityIds.length === 0) {
        throw new Error('At least one entity ID is required');
      }

      const payload = {
        entity_ids: entityIds,
        date_from: "2023-01-01T00:00:00Z",
        date_to: "2023-12-31T23:59:59Z",
        velocity_threshold: parameters.velocityThreshold,
        pattern_sensitivity: parameters.patternSensitivity,
      };

      console.log('Sending mule analysis payload:', payload);

      // Use the new API client instead of amlBackendClient
      const response = await analyzeMuleAccounts(payload);
      setResult(response);

    } catch (err: any) {
      console.error('Mule account analysis error:', err);
      setError(err.message || 'Failed to analyze mule accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    loading,
    error,
    result,
    analyzeMuleAccounts: analyzeMuleAccountsWrapper,
    clearResult,
    clearError,
  };
}
