import type { Entity } from "@/types/database";
import type {
  CounterpartyEntityMapping,
  EntityMappingGroup,
  EntityMappingResult,
  EntityMatch,
} from "@/types/entityMapping";
import { createClient } from "@/utils/supabase/client";
import Fuse, { IFuseOptions } from "fuse.js";

const supabase = createClient();

export class EntityMapper {
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
        { name: "entity_name", weight: 0.7 },
        { name: "pan", weight: 0.2 },
        { name: "gstin", weight: 0.1 },
      ],
      threshold: (100 - this.similarityThreshold) / 100,
      includeScore: true,
      minMatchCharLength: 3,
      ignoreLocation: true,
    };

    this.fuse = new Fuse(entities, fuseOptions);
  }

  /**
   * Find entity matches for counterparty names
   */
  async findEntityMatches(
    caseId: string,
    counterpartyNames: string[],
    knownEntities: Entity[]
  ): Promise<EntityMappingResult> {
    this.initializeFuse(knownEntities);

    // Get existing mappings
    const existingMappings = await this.getExistingMappings(caseId);
    const mappingMap = new Map(
      existingMappings.map((m) => [m.counterpartyName, m])
    );

    // Get transaction stats for each counterparty
    const counterpartyStats = await this.getCounterpartyStats(
      caseId,
      counterpartyNames
    );

    const mappingGroups: EntityMappingGroup[] = [];
    const unmappedCounterparties: string[] = [];

    for (const counterpartyName of counterpartyNames) {
      const stats = counterpartyStats.get(counterpartyName) || {
        count: 0,
        amount: 0,
      };
      const existingMapping = mappingMap.get(counterpartyName);

      if (existingMapping) {
        // Already mapped
        const entity = knownEntities.find(
          (e) => e.entity_id === existingMapping.entityId
        );
        if (entity) {
          mappingGroups.push({
            counterpartyName,
            transactionCount: stats.count,
            totalAmount: stats.amount,
            suggestedMatches: [],
            currentMapping: {
              counterpartyName,
              entityId: entity.entity_id,
              entityName: entity.entity_name,
              entityType: entity.entity_type,
              pan: entity.pan,
              gstin: entity.gstin,
              confidenceScore: existingMapping.confidenceScore,
              matchMethod: "exact",
              isVerified: existingMapping.verifiedByUser,
            },
          });
        }
      } else {
        // Find potential matches
        const matches = this.findMatches(counterpartyName, knownEntities);

        if (matches.length > 0) {
          mappingGroups.push({
            counterpartyName,
            transactionCount: stats.count,
            totalAmount: stats.amount,
            suggestedMatches: matches,
            currentMapping: undefined,
          });
        } else {
          unmappedCounterparties.push(counterpartyName);
        }
      }
    }

    return {
      mappingGroups,
      unmappedCounterparties,
      totalCounterparties: counterpartyNames.length,
      mappedCounterparties: mappingGroups.filter((g) => g.currentMapping)
        .length,
    };
  }

  /**
   * Find matches for a single counterparty name
   */
  private findMatches(
    counterpartyName: string,
    entities: Entity[]
  ): EntityMatch[] {
    const matches: EntityMatch[] = [];

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
        isVerified: false,
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
            isVerified: false,
          });
        }
      }
    }

    // 3. Partial name matching
    const normalizedCounterparty = this.normalizeName(counterpartyName);
    for (const entity of entities) {
      const normalizedEntity = this.normalizeName(entity.entity_name);

      if (this.isPartialMatch(normalizedCounterparty, normalizedEntity)) {
        const score = this.calculatePartialMatchScore(
          normalizedCounterparty,
          normalizedEntity
        );

        if (
          score >= this.similarityThreshold &&
          !matches.find((m) => m.entityId === entity.entity_id)
        ) {
          matches.push({
            counterpartyName,
            entityId: entity.entity_id,
            entityName: entity.entity_name,
            entityType: entity.entity_type,
            pan: entity.pan,
            gstin: entity.gstin,
            confidenceScore: score,
            matchMethod: "partial",
            isVerified: false,
          });
        }
      }
    }

    return matches.sort((a, b) => b.confidenceScore - a.confidenceScore);
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
   * Check if names have partial match
   */
  private isPartialMatch(name1: string, name2: string): boolean {
    const words1 = name1.split(" ").filter((w) => w.length > 2);
    const words2 = name2.split(" ").filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return false;

    let matchCount = 0;
    for (const word1 of words1) {
      for (const word2 of words2) {
        if (
          word1.includes(word2) ||
          word2.includes(word1) ||
          this.calculateSimilarity(word1, word2) > 0.8
        ) {
          matchCount++;
          break;
        }
      }
    }

    return matchCount >= Math.min(words1.length, words2.length) * 0.6;
  }

  /**
   * Calculate partial match score
   */
  private calculatePartialMatchScore(name1: string, name2: string): number {
    const words1 = name1.split(" ").filter((w) => w.length > 2);
    const words2 = name2.split(" ").filter((w) => w.length > 2);

    if (words1.length === 0 || words2.length === 0) return 0;

    let totalScore = 0;
    let matchedWords = 0;

    for (const word1 of words1) {
      let bestScore = 0;
      for (const word2 of words2) {
        const similarity = this.calculateSimilarity(word1, word2);
        bestScore = Math.max(bestScore, similarity);
      }
      if (bestScore > 0.6) {
        totalScore += bestScore;
        matchedWords++;
      }
    }

    if (matchedWords === 0) return 0;

    const avgScore = totalScore / matchedWords;
    const coverageScore = matchedWords / Math.max(words1.length, words2.length);

    return Math.round(avgScore * coverageScore * 100);
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
   * Get existing mappings for a case from transactions table
   */
  private async getExistingMappings(
    caseId: string
  ): Promise<CounterpartyEntityMapping[]> {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        counterparty_merged,
        mapped_entity_id,
        mapping_confidence,
        mapping_verified,
        mapped_at,
        mapped_by,
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
      .not("mapped_entity_id", "is", null)
      .not("counterparty_merged", "is", null);

    if (error) throw error;

    // Group by counterparty name and take the first mapping for each
    const mappingMap = new Map<string, CounterpartyEntityMapping>();

    for (const row of data || []) {
      if (!mappingMap.has(row.counterparty_merged)) {
        mappingMap.set(row.counterparty_merged, {
          id: `${caseId}-${row.counterparty_merged}`, // Generate a unique ID
          caseId,
          counterpartyName: row.counterparty_merged,
          entityId: row.mapped_entity_id,
          confidenceScore: row.mapping_confidence || 0,
          verifiedByUser: row.mapping_verified || false,
          createdAt: row.mapped_at || "",
          createdBy: row.mapped_by || "",
        });
      }
    }

    return Array.from(mappingMap.values());
  }

  /**
   * Get transaction statistics for counterparties
   */
  private async getCounterpartyStats(
    caseId: string,
    counterpartyNames: string[]
  ): Promise<Map<string, { count: number; amount: number }>> {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        counterparty_merged,
        amount,
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
      .in("counterparty_merged", counterpartyNames);

    if (error) throw error;

    const stats = new Map<string, { count: number; amount: number }>();

    for (const row of data || []) {
      if (row.counterparty_merged) {
        const current = stats.get(row.counterparty_merged) || {
          count: 0,
          amount: 0,
        };
        stats.set(row.counterparty_merged, {
          count: current.count + 1,
          amount: current.amount + row.amount,
        });
      }
    }

    return stats;
  }

  /**
   * Save entity mapping by updating transactions directly
   */
  async saveMapping(
    caseId: string,
    counterpartyName: string,
    entityId: string,
    confidenceScore: number,
    userId: string
  ): Promise<{ updatedCount: number }> {
    const { data, error } = await supabase.rpc("batch_update_entity_mappings", {
      p_case_id: caseId,
      p_counterparty_name: counterpartyName,
      p_entity_id: entityId,
      p_confidence: confidenceScore,
      p_user_id: userId,
    });

    if (error) throw error;

    return { updatedCount: data?.[0]?.updated_count || 0 };
  }

  /**
   * Remove entity mapping by updating transactions
   */
  async removeMapping(
    caseId: string,
    counterpartyName: string
  ): Promise<{ updatedCount: number }> {
    const { data, error } = await supabase.rpc("remove_entity_mapping", {
      p_case_id: caseId,
      p_counterparty_name: counterpartyName,
    });

    if (error) throw error;

    return { updatedCount: data?.[0]?.updated_count || 0 };
  }

  /**
   * Batch save mappings
   */
  async batchSaveMappings(
    mappings: Array<{
      caseId: string;
      counterpartyName: string;
      entityId: string;
      confidenceScore: number;
    }>,
    userId: string
  ): Promise<{ saved: number; errors: string[] }> {
    let saved = 0;
    const errors: string[] = [];

    for (const mapping of mappings) {
      try {
        const result = await this.saveMapping(
          mapping.caseId,
          mapping.counterpartyName,
          mapping.entityId,
          mapping.confidenceScore,
          userId
        );
        saved += result.updatedCount;
      } catch (error) {
        errors.push(
          `Failed to save mapping for "${mapping.counterpartyName}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return { saved, errors };
  }
}
