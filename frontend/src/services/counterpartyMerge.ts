export interface CounterpartyMergeResult {
  mergedCount: number;
  affectedTransactions: number;
  errors: string[];
}

export interface CounterpartyAnalysis {
  totalCounterparties: number;
  uniqueCounterparties: number;
  potentialSavings: number;
}


