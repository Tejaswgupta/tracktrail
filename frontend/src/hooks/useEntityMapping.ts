import { counterpartyService, entitiesService } from "@/services/database";
import { EntityMapper } from "@/services/entityMapper";
import type { Entity } from "@/types/database";
import type {
  EntityMappingResult,
  EntityMappingStats,
} from "@/types/entityMapping";
import { useEffect, useState } from "react";

export function useEntityMapping(
  caseId: string,
  similarityThreshold: number = 75
) {
  const [loading, setLoading] = useState(true);
  const [mappingResult, setMappingResult] =
    useState<EntityMappingResult | null>(null);
  const [knownEntities, setKnownEntities] = useState<Entity[]>([]);
  const [stats, setStats] = useState<EntityMappingStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntityMappingData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all entities in the system
      const allEntities = await entitiesService.getAll();
      setKnownEntities(allEntities);

      // Get counterparties for this case
      const counterparties = await counterpartyService.getCounterpartiesByCase(
        caseId
      );
      const counterpartyNames = counterparties.map((c) => c.name);

      if (counterpartyNames.length === 0) {
        setMappingResult({
          mappingGroups: [],
          unmappedCounterparties: [],
          totalCounterparties: 0,
          mappedCounterparties: 0,
        });
        setStats({
          totalCounterparties: 0,
          mappedCounterparties: 0,
          unmappedCounterparties: 0,
          highConfidenceMatches: 0,
          mediumConfidenceMatches: 0,
          lowConfidenceMatches: 0,
          mappingCompleteness: 0,
        });
        return;
      }

      // Find entity matches
      const mapper = new EntityMapper(similarityThreshold);
      const result = await mapper.findEntityMatches(
        caseId,
        counterpartyNames,
        allEntities
      );
      setMappingResult(result);

      // Calculate stats
      const mappingStats: EntityMappingStats = {
        totalCounterparties: result.totalCounterparties,
        mappedCounterparties: result.mappedCounterparties,
        unmappedCounterparties: result.unmappedCounterparties.length,
        highConfidenceMatches: result.mappingGroups.filter((g) =>
          g.suggestedMatches.some((m) => m.confidenceScore >= 90)
        ).length,
        mediumConfidenceMatches: result.mappingGroups.filter((g) =>
          g.suggestedMatches.some(
            (m) => m.confidenceScore >= 70 && m.confidenceScore < 90
          )
        ).length,
        lowConfidenceMatches: result.mappingGroups.filter((g) =>
          g.suggestedMatches.some((m) => m.confidenceScore < 70)
        ).length,
        mappingCompleteness:
          result.totalCounterparties > 0
            ? Math.round(
                (result.mappedCounterparties / result.totalCounterparties) * 100
              )
            : 0,
      };
      setStats(mappingStats);
    } catch (err) {
      console.error("Error loading entity mapping data:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load entity mapping data"
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (caseId) {
      loadEntityMappingData();
    }
  }, [caseId, similarityThreshold]);

  const refresh = () => {
    loadEntityMappingData();
  };

  return {
    loading,
    mappingResult,
    knownEntities,
    stats,
    error,
    refresh,
  };
}
