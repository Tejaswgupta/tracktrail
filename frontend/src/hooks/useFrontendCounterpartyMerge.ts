import { useCallback, useEffect, useState } from "react";
import { transactionsService } from "@/services/database";
import { findSimilarCounterparties } from "@/utils/fuzzyMatch";

interface Counterparty {
  name: string;
  count: number;
}

interface CounterpartyMergeCandidate {
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
}

export function useFrontendCounterpartyMerge(caseId: string) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [candidates, setCandidates] = useState<CounterpartyMergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all counterparties for the case
  const loadCounterparties = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Get all transactions for the case to extract counterparties
      const transactions = await transactionsService.getCaseTransactionsForAnalysis(
        caseId,
        ["counterparty_merged"]
      );

      // Extract and count counterparties
      const counterpartyMap = new Map<string, number>();
      
      transactions.forEach(tx => {
        if (tx.counterparty_merged) {
          counterpartyMap.set(
            tx.counterparty_merged,
            (counterpartyMap.get(tx.counterparty_merged) || 0) + 1
          );
        }
      });

      // Convert to array and sort by count (descending)
      const counterpartyList = Array.from(counterpartyMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      setCounterparties(counterpartyList);
    } catch (err) {
      console.error("Failed to load counterparties:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load counterparties"
      );
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  // Find merge candidates using frontend fuzzy matching
  const findMergeCandidates = useCallback((
    minSimilarity: number = 0.8,
    maxResults: number = 100
  ) => {
    try {
      const results = findSimilarCounterparties(
        counterparties,
        minSimilarity,
        maxResults
      );
      
      return results;
    } catch (err) {
      console.error("Failed to find merge candidates:", err);
      setError(
        err instanceof Error ? err.message : "Failed to find merge candidates"
      );
      return [];
    }
  }, [counterparties]);

  useEffect(() => {
    loadCounterparties();
  }, [loadCounterparties]);

  return {
    counterparties,
    candidates,
    loading,
    error,
    findMergeCandidates,
    refresh: loadCounterparties
  };
}