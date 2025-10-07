import { useCallback, useEffect, useState } from "react";
import { transactionsService } from "@/services/database";
import { findSimilarCounterparties } from "@/utils/fuzzyMatch";

interface Counterparty {
  name: string;
  count: number;
  entity_ids?: string[]; // Added for cross-entity tracking
}

interface CounterpartyMergeCandidate {
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
  entity_ids?: string[]; // Added for cross-entity tracking
}

export function useFrontendCounterpartyMerge(caseId: string) {
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [candidates, setCandidates] = useState<CounterpartyMergeCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all counterparties for the case
  const loadCounterparties = useCallback(async (entityIds?: string[]) => {
    try {
      setLoading(true);
      setError(null);

      let transactions;
      if (entityIds && entityIds.length > 0) {
        // If specific entity IDs are provided, filter transactions for those entities
        transactions = await transactionsService.getCaseTransactionsForAnalysis(
          caseId,
          ["counterparty_merged", "entity_id"]
        );
        
        // Filter transactions to only include those from the selected entities
        transactions = transactions.filter(tx => 
          entityIds.includes(tx.entity_id)
        );
      } else {
        // Get all transactions for the case to extract counterparties
        transactions = await transactionsService.getCaseTransactionsForAnalysis(
          caseId,
          ["counterparty_merged", "entity_id"]
        );
      }

      // Extract and count counterparties
      const counterpartyMap = new Map<string, { count: number; entity_ids: Set<string> }>();
      
      transactions.forEach(tx => {
        if (tx.counterparty_merged) {
          if (!counterpartyMap.has(tx.counterparty_merged)) {
            counterpartyMap.set(tx.counterparty_merged, { 
              count: 0, 
              entity_ids: new Set<string>() 
            });
          }
          
          const entry = counterpartyMap.get(tx.counterparty_merged)!;
          entry.count += 1;
          entry.entity_ids.add(tx.entity_id);
        }
      });

      // Convert to array and sort by count (descending)
      const counterpartyList = Array.from(counterpartyMap.entries())
        .map(([name, { count, entity_ids }]) => ({ 
          name, 
          count,
          entity_ids: Array.from(entity_ids)
        }))
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
      // Create a copy of counterparties without the entity_ids for the existing algorithm
      const simplifiedCounterparties = counterparties.map(cp => ({
        name: cp.name,
        count: cp.count
      }));
      
      const results = findSimilarCounterparties(
        simplifiedCounterparties,
        minSimilarity,
        maxResults
      );
      
      // Enhance results with entity information
      const enhancedResults = results.map(result => {
        return {
          ...result,
          // Include the entity_ids from the original counterparties for each similar name
          entity_ids: result.similar_names.reduce((allEntityIds, similarName) => {
            const cp = counterparties.find(c => c.name === similarName);
            if (cp && cp.entity_ids) {
              return [...new Set([...allEntityIds, ...cp.entity_ids])];
            }
            return allEntityIds;
          }, [] as string[])
        };
      });
      
      return enhancedResults;
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
    refresh: loadCounterparties // This function is now exposed to allow external refresh with entity filters
  };
}