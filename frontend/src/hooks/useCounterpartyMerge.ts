import { useAuth } from "@/contexts/AuthContext";
import { CounterpartyStandardizer } from "@/services/counterpartyStandardizer";
import { counterpartyService } from "@/services/database";
import { Transaction } from "@/types/database";
import { useCallback, useState } from "react";

export interface CounterpartyMergeGroup {
  representative: string;
  aliases: string[];
  totalCount: number;
  confidence: number;
  transactions: Transaction[];
}

export interface CounterpartyMergeHookReturn {
  // State
  loading: boolean;
  processing: boolean;
  error: string | null;
  successMessage: string | null;
  groups: CounterpartyMergeGroup[];
  selectedGroups: Set<string>;
  selectedAliases: Map<string, Set<string>>;

  // Actions
  loadAndAnalyze: (
    transactions: Transaction[],
    threshold?: number
  ) => Promise<void>;
  toggleGroupSelection: (representative: string) => void;
  toggleAliasSelection: (representative: string, alias: string) => void;
  selectAllGroups: () => void;
  clearSelection: () => void;
  applyMerges: () => Promise<void>;
  clearMessages: () => void;

  // Computed
  totalMergeCount: number;
  totalTransactionImpact: number;
}

export function useCounterpartyMerge(): CounterpartyMergeHookReturn {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [groups, setGroups] = useState<CounterpartyMergeGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [selectedAliases, setSelectedAliases] = useState<
    Map<string, Set<string>>
  >(new Map());

  const loadAndAnalyze = useCallback(
    async (transactions: Transaction[], threshold: number = 85) => {
      try {
        setLoading(true);
        setError(null);

        const standardizer = new CounterpartyStandardizer(threshold);

        // Extract counterparty names
        const counterpartyNames = transactions
          .map((t) => t.counterparty_merged)
          .filter((name): name is string => Boolean(name));

        if (counterpartyNames.length === 0) {
          setGroups([]);
          return;
        }

        // Find similar names
        const result = standardizer.findSimilarNames(counterpartyNames);

        // Group transactions by counterparty
        const transactionsByCounterparty = new Map<string, Transaction[]>();
        transactions.forEach((tx) => {
          if (tx.counterparty_merged) {
            const existing =
              transactionsByCounterparty.get(tx.counterparty_merged) || [];
            existing.push(tx);
            transactionsByCounterparty.set(tx.counterparty_merged, existing);
          }
        });

        // Convert clusters to groups with transaction data
        const mergeGroups: CounterpartyMergeGroup[] = result.clusters
          .filter((cluster) => cluster.aliases.length > 0) // Only show clusters with merges
          .map((cluster) => {
            const allNames = [cluster.representative, ...cluster.aliases];
            const allTransactions = allNames.flatMap(
              (name) => transactionsByCounterparty.get(name) || []
            );

            return {
              representative: cluster.representative,
              aliases: cluster.aliases,
              totalCount: cluster.totalCount,
              confidence: cluster.confidence,
              transactions: allTransactions,
            };
          })
          .sort((a, b) => b.totalCount - a.totalCount);

        setGroups(mergeGroups);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Failed to analyze counterparties"
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const toggleGroupSelection = useCallback((representative: string) => {
    setSelectedGroups((prev) => {
      const newSelected = new Set(prev);
      if (newSelected.has(representative)) {
        newSelected.delete(representative);
        // Also clear individual alias selections for this group
        setSelectedAliases((prevAliases) => {
          const newAliases = new Map(prevAliases);
          newAliases.delete(representative);
          return newAliases;
        });
      } else {
        newSelected.add(representative);
        // Also clear individual alias selections for this group since we're selecting the whole group
        setSelectedAliases((prevAliases) => {
          const newAliases = new Map(prevAliases);
          newAliases.delete(representative);
          return newAliases;
        });
      }
      return newSelected;
    });
  }, []);

  const toggleAliasSelection = useCallback(
    (representative: string, alias: string) => {
      setSelectedAliases((prev) => {
        const newAliases = new Map(prev);
        const currentAliases = newAliases.get(representative) || new Set();
        const updatedAliases = new Set(currentAliases);

        if (updatedAliases.has(alias)) {
          updatedAliases.delete(alias);
        } else {
          updatedAliases.add(alias);
        }

        if (updatedAliases.size === 0) {
          newAliases.delete(representative);
        } else {
          newAliases.set(representative, updatedAliases);
        }

        return newAliases;
      });

      // Remove from full group selection if we're doing individual selection
      setSelectedGroups((prev) => {
        const newSelected = new Set(prev);
        newSelected.delete(representative);
        return newSelected;
      });
    },
    []
  );

  const selectAllGroups = useCallback(() => {
    setSelectedGroups(new Set(groups.map((g) => g.representative)));
    setSelectedAliases(new Map()); // Clear individual selections
  }, [groups]);

  const clearSelection = useCallback(() => {
    setSelectedGroups(new Set());
    setSelectedAliases(new Map());
  }, []);

  const applyMerges = useCallback(async () => {
    if (!user?.id) {
      setError("User not authenticated");
      return;
    }

    if (selectedGroups.size === 0 && selectedAliases.size === 0) {
      setError("No groups or individual names selected for merging");
      return;
    }

    try {
      setProcessing(true);
      setError(null);
      setSuccessMessage(null);

      // Prepare merge operations
      const merges: Array<{ from: string; to: string }> = [];

      // Handle full group selections
      groups.forEach((group) => {
        if (selectedGroups.has(group.representative)) {
          group.aliases.forEach((alias) => {
            merges.push({
              from: alias,
              to: group.representative,
            });
          });
        }
      });

      // Handle individual alias selections
      selectedAliases.forEach((aliases, representative) => {
        aliases.forEach((alias) => {
          merges.push({
            from: alias,
            to: representative,
          });
        });
      });

      if (merges.length === 0) {
        setError("No merge operations to perform");
        return;
      }

      // Apply merges using the service
      const result = await counterpartyService.batchMergeCounterparties(
        merges,
        user.id
      );

      if (result.errors.length > 0) {
        setError(`Some merges failed: ${result.errors.join(", ")}`);
      }

      if (result.totalAffected > 0) {
        setSuccessMessage(
          `Successfully merged ${merges.length} counterparty names affecting ${result.totalAffected} transactions`
        );
      }

      // Clear selection after successful merge
      setSelectedGroups(new Set());
      setSelectedAliases(new Map());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply merges");
    } finally {
      setProcessing(false);
    }
  }, [selectedGroups, selectedAliases, groups, user?.id]);

  const clearMessages = useCallback(() => {
    setError(null);
    setSuccessMessage(null);
  }, []);

  // Computed values
  const totalMergeCount = groups.reduce((sum, group) => {
    if (selectedGroups.has(group.representative)) {
      return sum + group.aliases.length;
    }
    const individualAliases = selectedAliases.get(group.representative);
    if (individualAliases) {
      return sum + individualAliases.size;
    }
    return sum;
  }, 0);

  const totalTransactionImpact = groups.reduce((sum, group) => {
    if (selectedGroups.has(group.representative)) {
      return sum + group.totalCount;
    }
    const individualAliases = selectedAliases.get(group.representative);
    if (individualAliases && individualAliases.size > 0) {
      // For individual selections, we need to estimate impact
      // This is approximate since we don't track per-alias transaction counts
      const ratio = individualAliases.size / group.aliases.length;
      return sum + Math.round(group.totalCount * ratio);
    }
    return sum;
  }, 0);

  return {
    // State
    loading,
    processing,
    error,
    successMessage,
    groups,
    selectedGroups,
    selectedAliases,

    // Actions
    loadAndAnalyze,
    toggleGroupSelection,
    toggleAliasSelection,
    selectAllGroups,
    clearSelection,
    applyMerges,
    clearMessages,

    // Computed
    totalMergeCount,
    totalTransactionImpact,
  };
}
