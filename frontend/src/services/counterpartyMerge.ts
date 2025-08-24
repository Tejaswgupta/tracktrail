import { Transaction } from "@/types/database";
import { createClient } from "@/utils/supabase/client";
import {
  CounterpartyCluster,
  CounterpartyStandardizer,
} from "./counterpartyStandardizer";

const supabase = createClient();

export interface CounterpartyMergeResult {
  mergedCount: number;
  affectedTransactions: number;
  errors: string[];
}

export interface CounterpartyAnalysis {
  totalCounterparties: number;
  uniqueCounterparties: number;
  mergeCandidates: CounterpartyCluster[];
  potentialSavings: number;
}

export class CounterpartyMergeService {
  private standardizer: CounterpartyStandardizer;

  constructor(similarityThreshold: number = 85) {
    this.standardizer = new CounterpartyStandardizer(similarityThreshold);
  }

  /**
   * Analyze counterparties for a specific case
   */
  async analyzeCounterpartiesForCase(
    caseId: string
  ): Promise<CounterpartyAnalysis> {
    // Get all transactions for entities in this case
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        accounts!inner (
          entity_id,
          entities!inner (
            case_entities!inner (
              case_id
            )
          )
        )
      `
      )
      .eq("accounts.entities.case_entities.case_id", caseId)
      .not("counterparty_merged", "is", null);

    if (error) throw error;

    return this.analyzeTransactions(transactions || []);
  }

  /**
   * Analyze counterparties for a specific entity
   */
  async analyzeCounterpartiesForEntity(
    entityId: string
  ): Promise<CounterpartyAnalysis> {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("entity_id", entityId)
      .not("counterparty_merged", "is", null);

    if (error) throw error;

    return this.analyzeTransactions(transactions || []);
  }

  /**
   * Analyze all counterparties in the system
   */
  async analyzeAllCounterparties(): Promise<CounterpartyAnalysis> {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .not("counterparty_merged", "is", null);

    if (error) throw error;

    return this.analyzeTransactions(transactions || []);
  }

  /**
   * Analyze transactions for counterparty merge opportunities
   */
  private analyzeTransactions(
    transactions: Transaction[]
  ): CounterpartyAnalysis {
    const counterpartyNames = transactions
      .map((t) => t.counterparty_merged)
      .filter((name): name is string => Boolean(name));

    const uniqueCounterparties = new Set(counterpartyNames).size;
    const result = this.standardizer.findSimilarNames(counterpartyNames);

    // Calculate potential savings (number of names that could be merged)
    const potentialSavings = result.clusters.reduce(
      (sum, cluster) => sum + cluster.aliases.length,
      0
    );

    return {
      totalCounterparties: counterpartyNames.length,
      uniqueCounterparties,
      mergeCandidates: result.clusters.filter((c) => c.aliases.length > 0),
      potentialSavings,
    };
  }

  /**
   * Apply counterparty merges to the database
   */
  async applyMerges(
    merges: Array<{ from: string; to: string }>,
    userId: string
  ): Promise<CounterpartyMergeResult> {
    const result: CounterpartyMergeResult = {
      mergedCount: 0,
      affectedTransactions: 0,
      errors: [],
    };

    for (const merge of merges) {
      try {
        // Count affected transactions first
        const { count } = await supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("counterparty_merged", merge.from);

        if (count && count > 0) {
          // Apply the merge
          const { error } = await supabase
            .from("transactions")
            .update({
              counterparty_merged: merge.to,
              updated_at: new Date().toISOString(),
              updated_by: userId,
            })
            .eq("counterparty_merged", merge.from);

          if (error) {
            result.errors.push(
              `Failed to merge "${merge.from}" to "${merge.to}": ${error.message}`
            );
          } else {
            result.mergedCount++;
            result.affectedTransactions += count;
          }
        }
      } catch (error) {
        result.errors.push(
          `Error processing merge "${merge.from}" to "${merge.to}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return result;
  }

  /**
   * Get counterparty usage statistics
   */
  async getCounterpartyStats(counterpartyName: string): Promise<{
    transactionCount: number;
    totalAmount: number;
    dateRange: { from: string; to: string } | null;
    entities: Array<{ entity_id: string; entity_name: string; count: number }>;
  }> {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        entities (
          entity_id,
          entity_name
        )
      `
      )
      .eq("counterparty_merged", counterpartyName)
      .order("tx_date", { ascending: true });

    if (error) throw error;

    if (!transactions || transactions.length === 0) {
      return {
        transactionCount: 0,
        totalAmount: 0,
        dateRange: null,
        entities: [],
      };
    }

    const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const dateRange = {
      from: transactions[0].tx_date,
      to: transactions[transactions.length - 1].tx_date,
    };

    // Group by entity
    const entityMap = new Map<
      string,
      { entity_id: string; entity_name: string; count: number }
    >();
    transactions.forEach((tx) => {
      if (tx.entities) {
        const key = tx.entities.entity_id;
        const existing = entityMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          entityMap.set(key, {
            entity_id: tx.entities.entity_id,
            entity_name: tx.entities.entity_name,
            count: 1,
          });
        }
      }
    });

    return {
      transactionCount: transactions.length,
      totalAmount,
      dateRange,
      entities: Array.from(entityMap.values()).sort(
        (a, b) => b.count - a.count
      ),
    };
  }

  /**
   * Preview merge impact before applying
   */
  async previewMerge(
    from: string,
    to: string
  ): Promise<{
    affectedTransactions: number;
    entities: string[];
    dateRange: { from: string; to: string } | null;
    sampleTransactions: Transaction[];
  }> {
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select(
        `
        *,
        entities (
          entity_name
        )
      `
      )
      .eq("counterparty_merged", from)
      .order("tx_date", { ascending: false })
      .limit(10);

    if (error) throw error;

    if (!transactions || transactions.length === 0) {
      return {
        affectedTransactions: 0,
        entities: [],
        dateRange: null,
        sampleTransactions: [],
      };
    }

    // Get total count
    const { count } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("counterparty_merged", from);

    // Get unique entities
    const entities = Array.from(
      new Set(
        transactions
          .map((tx) => tx.entities?.entity_name)
          .filter((name): name is string => Boolean(name))
      )
    );

    // Get date range
    const { data: dateData } = await supabase
      .from("transactions")
      .select("tx_date")
      .eq("counterparty_merged", from)
      .order("tx_date", { ascending: true })
      .limit(1);

    const dateRange =
      dateData && dateData.length > 0
        ? {
            from: dateData[0].tx_date,
            to: transactions[0].tx_date,
          }
        : null;

    return {
      affectedTransactions: count || 0,
      entities,
      dateRange,
      sampleTransactions: transactions,
    };
  }

  /**
   * Undo a merge operation (if possible)
   */
  async undoMerge(
    mergedName: string,
    originalNames: string[],
    userId: string
  ): Promise<CounterpartyMergeResult> {
    // This is complex as we need to determine which transactions belonged to which original name
    // For now, we'll return an error indicating this feature needs more sophisticated tracking
    return {
      mergedCount: 0,
      affectedTransactions: 0,
      errors: [
        "Undo functionality requires transaction history tracking - not yet implemented",
      ],
    };
  }

  /**
   * Get merge suggestions based on advanced analysis
   */
  async getMergeSuggestions(
    transactions: Transaction[],
    options: {
      minConfidence?: number;
      maxSuggestions?: number;
      excludePatterns?: string[];
    } = {}
  ): Promise<
    Array<{
      representative: string;
      aliases: string[];
      confidence: number;
      impact: number;
      reason: string;
    }>
  > {
    const {
      minConfidence = 80,
      maxSuggestions = 20,
      excludePatterns = [],
    } = options;

    const result = this.standardizer.findSimilarNamesAdvanced(
      transactions.map((t) => t.counterparty_merged).filter(Boolean) as string[]
    );

    return result.clusters
      .filter(
        (cluster) =>
          cluster.confidence >= minConfidence &&
          cluster.aliases.length > 0 &&
          !excludePatterns.some((pattern) =>
            cluster.representative.toLowerCase().includes(pattern.toLowerCase())
          )
      )
      .slice(0, maxSuggestions)
      .map((cluster) => ({
        representative: cluster.representative,
        aliases: cluster.aliases,
        confidence: cluster.confidence,
        impact: cluster.totalCount,
        reason: this.generateMergeReason(cluster),
      }));
  }

  private generateMergeReason(cluster: CounterpartyCluster): string {
    if (cluster.confidence >= 95) {
      return "Very high similarity - likely the same entity with minor variations";
    } else if (cluster.confidence >= 90) {
      return "High similarity - probable same entity with formatting differences";
    } else if (cluster.confidence >= 85) {
      return "Good similarity - likely same entity with abbreviations or typos";
    } else {
      return "Moderate similarity - review recommended before merging";
    }
  }
}
