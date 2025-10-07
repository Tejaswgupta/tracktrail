import {
  CounterpartyAnalyzer,
  type CounterpartyAnalysisResult,
} from "@/services/counterpartyAnalyzer";
import { Transaction } from "@/types/database";
import { useCallback, useMemo, useState } from "react";

export interface UseCounterpartyAnalysisOptions {
  similarityThreshold?: number;
  bankPreset?: string;
  autoRecommendPreset?: boolean;
  useAdvancedAnalysis?: boolean;
}

export interface UseCounterpartyAnalysisReturn {
  // State
  analysisResult: CounterpartyAnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;

  // Actions
  analyzeTransactions: (transactions: Transaction[]) => Promise<void>;
  applyStandardization: (transactions: Transaction[]) => Transaction[];
  setBankPreset: (preset: string) => void;
  clearAnalysis: () => void;

  // Computed values
  bankPreset: string;
  availablePresets: Array<{ value: string; label: string }>;
  extractionRate: number;
  totalClusters: number;
  totalMappings: number;
}

export function useCounterpartyAnalysis(
  options: UseCounterpartyAnalysisOptions = {}
) {
  const {
    similarityThreshold = 85,
    bankPreset: initialBankPreset = "generic",
    autoRecommendPreset = true,
    useAdvancedAnalysis = false,
  } = options;

  // Create analyzer instance
  const analyzer = useMemo(
    () => new CounterpartyAnalyzer(similarityThreshold, initialBankPreset),
    [similarityThreshold, initialBankPreset]
  );

  // State
  const [analysisResult, setAnalysisResult] =
    useState<CounterpartyAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentBankPreset, setCurrentBankPreset] = useState(initialBankPreset);

  // Actions
  const analyzeTransactions = useCallback(
    async (transactions: Transaction[], useAdvanced?: boolean) => {
      if (!transactions || transactions.length === 0) {
        setError("No transactions provided for analysis");
        return;
      }

      setIsAnalyzing(true);
      setError(null);

      try {
        // Auto-recommend bank preset if enabled
        if (autoRecommendPreset) {
          const recommendedPreset =
            CounterpartyAnalyzer.recommendBankPreset(transactions);
          if (recommendedPreset !== currentBankPreset) {
            analyzer.setBankPreset(recommendedPreset);
            setCurrentBankPreset(recommendedPreset);
          }
        }

        // Perform analysis with advanced option
        const shouldUseAdvanced = useAdvanced ?? useAdvancedAnalysis;
        const result = analyzer.analyzeCounterparties(
          transactions,
          shouldUseAdvanced
        );
        setAnalysisResult(result);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error occurred";
        setError(`Analysis failed: ${errorMessage}`);
        console.error("Counterparty analysis error:", err);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [analyzer, autoRecommendPreset, currentBankPreset, useAdvancedAnalysis]
  );

  const applyStandardization = useCallback(
    (transactions: Transaction[]): Transaction[] => {
      if (!analysisResult) {
        console.warn("No analysis result available for standardization");
        return transactions;
      }

      try {
        return analyzer.applyStandardization(
          transactions,
          analysisResult.standardization.mappings
        );
      } catch (err) {
        console.error("Standardization failed:", err);
        return transactions;
      }
    },
    [analyzer, analysisResult]
  );

  const setBankPreset = useCallback(
    (preset: string) => {
      analyzer.setBankPreset(preset);
      setCurrentBankPreset(preset);
      // Clear previous analysis since it was done with different preset
      setAnalysisResult(null);
      setError(null);
    },
    [analyzer]
  );

  const clearAnalysis = useCallback(() => {
    setAnalysisResult(null);
    setError(null);
  }, []);

  const findSimilarCounterparties = useCallback(
    (query: string, transactions: Transaction[], limit: number = 10) => {
      return analyzer.findSimilarCounterparties(query, transactions, limit);
    },
    [analyzer]
  );

  // Computed values
  const availablePresets = useMemo(
    () =>
      Object.entries(CounterpartyAnalyzer.getAvailableBankPresets()).map(([value, label]) => ({
        value,
        label,
      })),
    []
  );

  const extractionRate = analysisResult?.extractionStats.extractionRate || 0;
  const totalClusters = analysisResult?.standardization.clusters.length || 0;
  const totalMappings = Object.keys(
    analysisResult?.standardization.mappings || {}
  ).length;

  return {
    // State
    analysisResult,
    isAnalyzing,
    error,

    // Actions
    analyzeTransactions,
    applyStandardization,
    setBankPreset,
    clearAnalysis,
    findSimilarCounterparties,

    // Computed values
    bankPreset: currentBankPreset,
    availablePresets,
    extractionRate,
    totalClusters,
    totalMappings,
  };
}
