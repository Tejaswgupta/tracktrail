// Types for Entity Mapping feature

export interface EntityMatch {
  counterpartyName: string;
  entityId: string;
  entityName: string;
  entityType: string;
  pan?: string;
  gstin?: string;
  confidenceScore: number;
  matchMethod: "exact" | "fuzzy" | "partial" | "phonetic";
  isVerified: boolean;
}

export interface EntityMappingGroup {
  counterpartyName: string;
  transactionCount: number;
  totalAmount: number;
  suggestedMatches: EntityMatch[];
  currentMapping?: EntityMatch;
}

export interface EntityMappingResult {
  mappingGroups: EntityMappingGroup[];
  unmappedCounterparties: string[];
  totalCounterparties: number;
  mappedCounterparties: number;
}

export interface CounterpartyEntityMapping {
  id: string;
  caseId: string;
  counterpartyName: string;
  entityId: string;
  confidenceScore: number;
  verifiedByUser: boolean;
  createdAt: string;
  createdBy: string;
}

export interface EntityMappingStats {
  totalCounterparties: number;
  mappedCounterparties: number;
  unmappedCounterparties: number;
  highConfidenceMatches: number;
  mediumConfidenceMatches: number;
  lowConfidenceMatches: number;
  mappingCompleteness: number; // percentage
}
