import type { Entity } from "@/types/database";
import { createClient } from "@/utils/supabase/client";
import Fuse, { IFuseOptions } from "fuse.js";

const supabase = createClient();

export interface EntityStandardizationMatch {
  counterpartyName: string;
  entityId: string;
  entityName: string;
  entityType: string;
  pan?: string;
  gstin?: string;
  confidenceScore: number;
  matchMethod: "exact" | "fuzzy" | "partial" | "similarity";
  transactionCount: number;
  totalAmount: number;
}

export interface EntityStandardizationGroup {
  counterpartyName: string;
  transactionCount: number;
  totalAmount: number;
  suggestedMatches: EntityStandardizationMatch[];
  isStandardized: boolean;
  standardizedAt?: string;
  standardizedBy?: string;
}

export interface EntityStandardizationResult {
  groups: EntityStandardizationGroup[];
  totalCounterparties: number;
  standardizedCounterparties: number;
  unstandardizedCounterparties: number;
  completeness: number;
}

export class EntityStandardizer {
  private similarityThreshold: number;
  private fuse: Fuse<Entity> | null = null;

  constructor(similarityThreshold: number = 75) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Initialize fuzzy search with known entities
   */
  private initializeFuse(entities: Entity[]): void {
    const fuseOptions: IFuseOptions<Entity> = {
      keys: [
        { name: "entity_name", weight: 0.8 },
        { name: "pan", weight: 0.15 },
        { name: "gstin", weight: 0.05 },
      ],
      threshold: (100 - this.similarityThreshold) / 100,
      includeScore: true,
      minMatchCharLength: 3,
      ignoreLocation: true,
    };

    this.fuse = new Fuse(entities, fuseOptions);
  }

  /**
   * Find entity standardization opportunities for a case
   */
  async findStandardizationOpportunities(
    caseId: string,
    knownEntities: Entity[]
  ): Promise<EntityStandardizationResult> {
    this.initializeFuse(knownEntities);

    // Get case counterparties with transaction stats
    const { data: counterpartyData, error: counterpartyError } = await supabase
      .from("transactions")
      .select(
        `
        counterparty_merged,
        amount,
        counterparty_mapped_at,
        counterparty_mapped_by,
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

    if (counterpartyError) throw counterpartyError;

    // Group counterparties and calculate stats
    const counterpartyStats = new Map<
      string,
      {
        transactionCount: number;
        totalAmount: number;
        isStandardized: boolean;
        standardizedAt?: string;
        standardizedBy?: string;
      }
    >();

    let totalCounterparties = 0;
    let standardizedCounterparties = 0;

    for (const row of counterpartyData || []) {
      const name = row.counterparty_merged;
      const isStandardized = !!row.counterparty_mapped_at;

      if (!counterpartyStats.has(name)) {
        counterpartyStats.set(name, {
          transactionCount: 0,
          totalAmount: 0,
          isStandardized,
          standardizedAt: row.counterparty_mapped_at,
          standardizedBy: row.counterparty_mapped_by,
        });
        totalCounterparties++;
        if (isStandardized) standardizedCounterparties++;
      }

      const stats = counterpartyStats.get(name)!;
      stats.transactionCount++;
      stats.totalAmount += row.amount;
    }

    const unstandardizedCounterparties =
      totalCounterparties - standardizedCounterparties;
    const completeness =
      totalCounterparties > 0
        ? Math.round((standardizedCounterparties / totalCounterparties) * 100)
        : 0;

    // Find potential matches for unstandardized counterparties
    const groupMap = new Map<string, EntityStandardizationGroup>();

    for (const [counterpartyName, stats] of counterpartyStats) {
      if (!stats.isStandardized) {
        // Find potential entity matches using fuzzy matching
        const matches = this.findEntityMatches(
          counterpartyName,
          knownEntities,
          stats.transactionCount,
          stats.totalAmount
        );

        if (matches.length > 0) {
          groupMap.set(counterpartyName, {
            counterpartyName,
            transactionCount: stats.transactionCount,
            totalAmount: stats.totalAmount,
            suggestedMatches: matches,
            isStandardized: false,
          });
        }
      } else {
        // Already standardized counterparty
        groupMap.set(counterpartyName, {
          counterpartyName,
          transactionCount: stats.transactionCount,
          totalAmount: stats.totalAmount,
          suggestedMatches: [],
          isStandardized: true,
          standardizedAt: stats.standardizedAt,
          standardizedBy: stats.standardizedBy,
        });
      }
    }

    return {
      groups: Array.from(groupMap.values()),
      totalCounterparties,
      standardizedCounterparties,
      unstandardizedCounterparties,
      completeness,
    };
  }

  /**
   * Find entity matches for a counterparty name
   */
  private findEntityMatches(
    counterpartyName: string,
    entities: Entity[],
    transactionCount: number,
    totalAmount: number
  ): EntityStandardizationMatch[] {
    const matches: EntityStandardizationMatch[] = [];

    // 1. Exact match (case insensitive)
    const exactMatch = entities.find(
      (e) => e.entity_name.toLowerCase() === counterpartyName.toLowerCase()
    );
    if (exactMatch) {
      matches.push({
        counterpartyName,
        entityId: exactMatch.entity_id,
        entityName: exactMatch.entity_name,
        entityType: exactMatch.entity_type,
        pan: exactMatch.pan,
        gstin: exactMatch.gstin,
        confidenceScore: 100,
        matchMethod: "exact",
        transactionCount,
        totalAmount,
      });
      return matches; // Return early for exact matches
    }

    // 2. Fuzzy matching using Fuse.js
    if (this.fuse) {
      const fuseResults = this.fuse.search(counterpartyName);

      for (const result of fuseResults.slice(0, 5)) {
        // Top 5 matches
        const entity = result.item;
        const score = result.score ? Math.round((1 - result.score) * 100) : 0;

        if (score >= this.similarityThreshold) {
          matches.push({
            counterpartyName,
            entityId: entity.entity_id,
            entityName: entity.entity_name,
            entityType: entity.entity_type,
            pan: entity.pan,
            gstin: entity.gstin,
            confidenceScore: score,
            matchMethod: "fuzzy",
            transactionCount,
            totalAmount,
          });
        }
      }
    }

    // 3. Additional similarity checks for entities not caught by Fuse
    for (const entity of entities) {
      // Skip if already matched
      if (matches.find((m) => m.entityId === entity.entity_id)) continue;

      const confidenceScore = this.calculateConfidenceScore(
        counterpartyName,
        entity.entity_name
      );

      if (confidenceScore >= this.similarityThreshold) {
        matches.push({
          counterpartyName,
          entityId: entity.entity_id,
          entityName: entity.entity_name,
          entityType: entity.entity_type,
          pan: entity.pan,
          gstin: entity.gstin,
          confidenceScore,
          matchMethod: this.getMatchMethod(
            counterpartyName,
            entity.entity_name
          ),
          transactionCount,
          totalAmount,
        });
      }
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Calculate confidence score for a match
   */
  private calculateConfidenceScore(
    counterpartyName: string,
    entityName: string
  ): number {
    const normalized1 = this.normalizeName(counterpartyName);
    const normalized2 = this.normalizeName(entityName);

    // Exact match
    if (normalized1 === normalized2) {
      return 100;
    }

    // Fuzzy similarity
    const similarity = this.calculateSimilarity(normalized1, normalized2);

    // Partial word matching bonus
    const partialBonus = this.getPartialMatchBonus(normalized1, normalized2);

    // Length difference penalty
    const lengthPenalty =
      (Math.abs(normalized1.length - normalized2.length) /
        Math.max(normalized1.length, normalized2.length)) *
      10;

    const score = Math.round(similarity * 100 + partialBonus - lengthPenalty);
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get match method based on how the match was found
   */
  private getMatchMethod(
    counterpartyName: string,
    entityName: string
  ): "exact" | "fuzzy" | "partial" | "similarity" {
    const normalized1 = this.normalizeName(counterpartyName);
    const normalized2 = this.normalizeName(entityName);

    if (normalized1 === normalized2) return "exact";
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1))
      return "partial";

    const similarity = this.calculateSimilarity(normalized1, normalized2);
    if (similarity > 0.8) return "fuzzy";

    return "similarity";
  }

  /**
   * Normalize name for better matching
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, "") // Remove special characters
      .replace(/\s+/g, " ") // Normalize spaces
      .trim()
      .replace(
        /\b(pvt|ltd|limited|private|company|corp|corporation|inc|llp|llc)\b/g,
        ""
      ) // Remove common suffixes
      .replace(/\b(mr|mrs|ms|dr|prof|shri|smt)\b/g, "") // Remove titles
      .trim();
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    return maxLength === 0
      ? 1
      : (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  /**
   * Get bonus score for partial word matches
   */
  private getPartialMatchBonus(name1: string, name2: string): number {
    const words1 = name1.split(" ").filter((w) => w.length > 2);
    const words2 = name2.split(" ").filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    let matchCount = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (word1.includes(word2) || word2.includes(word1)) {
          matchCount++;
          break;
        }
      }
    }

    const matchRatio = matchCount / Math.max(words1.length, words2.length);
    return matchRatio * 15; // Up to 15 point bonus
  }

  /**
   * Standardize counterparty name to entity name
   */
  async standardizeCounterparty(
    caseId: string,
    oldCounterpartyName: string,
    newEntityName: string,
    userId: string
  ): Promise<{ updatedCount: number }> {
    // First, get the entity IDs for this case
    const { data: caseEntities, error: entityError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (entityError) throw entityError;

    const entityIds = caseEntities?.map((ce) => ce.entity_id) || [];

    if (entityIds.length === 0) {
      return { updatedCount: 0 };
    }

    // Then get the account IDs for these entities
    const { data: caseAccounts, error: accountError } = await supabase
      .from("accounts")
      .select("account_id")
      .in("entity_id", entityIds);

    if (accountError) throw accountError;

    const accountIds = caseAccounts?.map((acc) => acc.account_id) || [];

    if (accountIds.length === 0) {
      return { updatedCount: 0 };
    }

    // Now update transactions for these accounts
    const { data, error } = await supabase
      .from("transactions")
      .update({
        counterparty_merged: newEntityName,
        counterparty_mapped_at: new Date().toISOString(),
        counterparty_mapped_by: userId,
      })
      .eq("counterparty_merged", oldCounterpartyName)
      .in("account_id", accountIds)
      .select("*");

    if (error) throw error;

    return { updatedCount: data?.length || 0 };
  }

  /**
   * Batch standardize multiple counterparties
   */
  async batchStandardize(
    standardizations: Array<{
      caseId: string;
      oldCounterpartyName: string;
      newEntityName: string;
    }>,
    userId: string
  ): Promise<{ totalUpdated: number; errors: string[] }> {
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const std of standardizations) {
      try {
        const result = await this.standardizeCounterparty(
          std.caseId,
          std.oldCounterpartyName,
          std.newEntityName,
          userId
        );
        totalUpdated += result.updatedCount;
      } catch (error) {
        errors.push(
          `Failed to standardize "${std.oldCounterpartyName}" to "${
            std.newEntityName
          }": ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    }

    return { totalUpdated, errors };
  }

  /**
   * Revert counterparty standardization
   */
  async revertStandardization(
    caseId: string,
    currentName: string,
    originalName: string,
    userId: string
  ): Promise<{ updatedCount: number }> {
    // First, get the entity IDs for this case
    const { data: caseEntities, error: entityError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (entityError) throw entityError;

    const entityIds = caseEntities?.map((ce) => ce.entity_id) || [];

    if (entityIds.length === 0) {
      return { updatedCount: 0 };
    }

    // Then get the account IDs for these entities
    const { data: caseAccounts, error: accountError } = await supabase
      .from("accounts")
      .select("account_id")
      .in("entity_id", entityIds);

    if (accountError) throw accountError;

    const accountIds = caseAccounts?.map((acc) => acc.account_id) || [];

    if (accountIds.length === 0) {
      return { updatedCount: 0 };
    }

    // Now update transactions for these accounts
    const { data, error } = await supabase
      .from("transactions")
      .update({
        counterparty_merged: originalName,
        counterparty_mapped_at: null,
        counterparty_mapped_by: null,
      })
      .eq("counterparty_merged", currentName)
      .not("counterparty_mapped_by", "is", null) // Only revert mapped ones
      .in("account_id", accountIds)
      .select("*");

    if (error) throw error;

    return { updatedCount: data?.length || 0 };
  }
}
