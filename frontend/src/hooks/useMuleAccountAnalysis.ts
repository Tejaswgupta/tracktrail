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
  dateFrom?: string;
  dateTo?: string;
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

      if (entityIds.length > 1) {
        throw new Error('Mule account detection only works with single entity');
      }

      const defaultDateFrom = new Date();
      defaultDateFrom.setFullYear(defaultDateFrom.getFullYear() - 1);
      
      const defaultDateTo = new Date();

      const payload = {
        entity_ids: entityIds,
        date_from: parameters.dateFrom || defaultDateFrom.toISOString(),
        date_to: parameters.dateTo || defaultDateTo.toISOString(),
        min_collection_transactions: parameters.minCollectionTransactions,
        min_disbursement_amount_ratio: parameters.minDisbursementAmountRatio,
        max_collection_period_days: parameters.maxCollectionPeriodDays,
        velocity_threshold: parameters.velocityThreshold,
        periodicity_tolerance: parameters.periodicityTolerance,
        sensitivity_multiplier: parameters.sensitivityMultiplier,
        pattern_sensitivity: parameters.patternSensitivity,
      };

      console.log('Sending mule analysis payload:', payload);

      const response = await analyzeMuleAccounts(payload);
      setResult(response);

    } catch (err: unknown) {
      console.error('Mule account analysis error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to analyze mule accounts';
      setError(errorMessage);
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
