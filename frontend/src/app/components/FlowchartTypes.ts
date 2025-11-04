export interface FlowchartNode {
  id: string;
  label: string;
  type: "entity" | "counterparty";
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
  riskScore?: number;
  entityId?: string;
}

export interface EdgeTransactionSummary {
  transactionId: string;
  txDate: string;
  amount: number;
  direction: "DR" | "CR";
}

export interface FlowchartEdge {
  source: string | FlowchartNode;
  target: string | FlowchartNode;
  amount: number;
  transactionCount: number;
  direction: "inflow" | "outflow";
  firstTransactionDate?: string;
  lastTransactionDate?: string;
  transactions?: EdgeTransactionSummary[];
}

export interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  summary: {
    totalEntities: number;
    totalCounterparties: number;
    totalVolume: number;
    totalTransactions: number;
  };
}
