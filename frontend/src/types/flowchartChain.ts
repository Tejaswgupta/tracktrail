/**
 * Type definitions for Flowchart Chain Analysis
 */

export interface FlowchartChainRequest {
  case_id: string;
  entity_ids?: string[];
  date_from?: string; // YYYY-MM-DD format
  date_to?: string; // YYYY-MM-DD format
  min_amount_threshold?: number;
  chain_time_window_ms?: number;
  include_inflow?: boolean;
  include_outflow?: boolean;
}

export interface FlowEvent {
  id: string;
  txDate: string;
  timestamp: number;
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  amount: number;
  direction: "DR" | "CR";
}

export interface FlowChain {
  id: string;
  events: FlowEvent[];
  startDate: string;
  endDate: string;
  totalAmount: number;
  signature: string;
  isCycle: boolean;
}

export interface HubCandidate {
  nodeId: string;
  label: string;
  chainCount: number;
  passThroughCount: number;
  inboundConnections: number;
  outboundConnections: number;
  totalInflow: number;
  totalOutflow: number;
}

export interface BranchNodeSummary {
  nodeId: string;
  label: string;
  splitPaths: number;
  splitEvents: number;
  mergePaths: number;
  mergeEvents: number;
}

export interface EventBranchMeta {
  splitCount: number;
  splitTargetCount: number;
  mergeCount: number;
  mergeSourceCount: number;
}

export interface FlowchartChainMetadata {
  total_events: number;
  total_chains: number;
  displayed_chains: number;
  sequential_runs: number;
  hub_candidates: number;
  chain_time_window_ms?: number;
  min_amount_threshold?: number;
}

export interface FlowchartChainData {
  events: FlowEvent[];
  chains: FlowChain[];
  sequential_runs: FlowChain[];
  branch_meta: Record<string, EventBranchMeta>;
  branch_nodes: BranchNodeSummary[];
  hub_candidates: HubCandidate[];
  highlighted_hub_node_ids: string[];
  metadata: FlowchartChainMetadata;
}

export interface FlowchartChainResponse {
  success: boolean;
  message: string;
  data: FlowchartChainData;
  metadata?: {
    case_id: string;
    entity_count: number;
    transaction_count: number;
    processing_time_ms: number;
    filters?: {
      date_from?: string;
      date_to?: string;
      min_amount_threshold?: number;
      chain_time_window_ms?: number;
      include_inflow?: boolean;
      include_outflow?: boolean;
    };
  };
  timestamp: string;
}
