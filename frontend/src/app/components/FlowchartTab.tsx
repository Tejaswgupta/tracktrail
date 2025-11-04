"use client";

import {
  counterpartyService,
  entitiesService,
  transactionsService,
} from "@/services/database";
import type { Entity } from "@/types/database";
import { useEffect, useMemo, useState } from "react";
import FlowchartControls from "./FlowchartControls";
import FlowchartLegend from "./FlowchartLegend";
import FlowchartVisualization from "./FlowchartVisualization";

interface FlowchartNode {
  id: string;
  label: string;
  type: "entity" | "counterparty";
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
  riskScore?: number;
  entityId?: string; // Only for entity nodes
}

interface FlowchartEdge {
  source: string | FlowchartNode;
  target: string | FlowchartNode;
  amount: number;
  transactionCount: number;
  direction: "inflow" | "outflow";
}

type NormalizedFlowchartEdge = Omit<FlowchartEdge, "source" | "target"> & {
  source: string;
  target: string;
};

interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  summary: {
    totalEntities: number;
    totalCounterparties: number;
    totalVolume: number;
    totalTransactions: number;
  };
}

interface FlowchartTabProps {
  caseId: string;
}

export default function FlowchartTab({ caseId }: FlowchartTabProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [flowchartData, setFlowchartData] = useState<FlowchartData | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Control states
  const [selectedEntityFilter, setSelectedEntityFilter] =
    useState<string>("all");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [minAmountThreshold, setMinAmountThreshold] = useState(0);
  const [showInflow, setShowInflow] = useState(true);
  const [showOutflow, setShowOutflow] = useState(true);
  const [nodeSizing, setNodeSizing] = useState<"count" | "volume">("volume");

  // D3 rewrites link endpoints to node objects; keep comparisons stable by normalizing to IDs.
  const normalizeEdgeEndpoint = (endpoint: FlowchartEdge["source"]): string =>
    typeof endpoint === "string" ? endpoint : endpoint?.id ?? "";

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const [entitiesData, counterpartiesData] = await Promise.all([
          entitiesService.getByCaseId(caseId),
          counterpartyService.getCaseCounterpartyStatsWithDetails(caseId),
        ]);

        setEntities(entitiesData);

        // Build nodes
        const nodes: FlowchartNode[] = [];

        // Add entity nodes
        entitiesData.forEach((entity) => {
          nodes.push({
            id: `entity-${entity.entity_id}`,
            label: entity.entity_name,
            type: "entity",
            totalInflow: 0,
            totalOutflow: 0,
            netFlow: 0,
            transactionCount: 0,
            riskScore: entity.risk_score,
            entityId: entity.entity_id,
          });
        });

        // Add counterparty nodes
        const seenCounterparties = new Set<string>();
        counterpartiesData.forEach((cp) => {
          const counterpartyName = cp.counterparty_name;
          if (!seenCounterparties.has(counterpartyName)) {
            seenCounterparties.add(counterpartyName);
            nodes.push({
              id: `counterparty-${counterpartyName}`,
              label: counterpartyName,
              type: "counterparty",
              totalInflow: 0,
              totalOutflow: 0,
              netFlow: 0,
              transactionCount: 0,
            });
          }
        });

        // Build edges by aggregating transactions
        const edgesMap = new Map<string, FlowchartEdge>();

        // Get all transactions for the case
        const transactions =
          await transactionsService.getCaseTransactionsForAnalysis(caseId, [
            "transaction_id",
            "amount",
            "direction",
            "entity_id",
            "counterparty_merged",
          ]);

        // First pass: collect all counterparties from transactions
        transactions.forEach((tx) => {
          const counterpartyName = tx.counterparty_merged || "Unknown";
          const counterpartyNodeId = `counterparty-${counterpartyName}`;

          // Create node if it doesn't exist
          if (!seenCounterparties.has(counterpartyName)) {
            seenCounterparties.add(counterpartyName);
            nodes.push({
              id: counterpartyNodeId,
              label: counterpartyName,
              type: "counterparty",
              totalInflow: 0,
              totalOutflow: 0,
              netFlow: 0,
              transactionCount: 0,
            });
          }
        });

        // Second pass: aggregate transactions
        transactions.forEach((tx) => {
          const entityId = tx.entity_id;
          const counterpartyName = tx.counterparty_merged || "Unknown";
          const isDebit = tx.direction === "DR";

          // Create edge key (entity -> counterparty for debits, counterparty -> entity for credits)
          const sourceId = isDebit
            ? `entity-${entityId}`
            : `counterparty-${counterpartyName}`;
          const targetId = isDebit
            ? `counterparty-${counterpartyName}`
            : `entity-${entityId}`;

          const edgeKey = `${sourceId}-${targetId}`;

          if (!edgesMap.has(edgeKey)) {
            edgesMap.set(edgeKey, {
              source: sourceId,
              target: targetId,
              amount: 0,
              transactionCount: 0,
              direction: isDebit ? "outflow" : "inflow",
            });
          }

          const edge = edgesMap.get(edgeKey)!;
          edge.amount += tx.amount;
          edge.transactionCount += 1;

          // Update node stats
          const sourceNode = nodes.find((n) => n.id === sourceId);
          const targetNode = nodes.find((n) => n.id === targetId);

          if (sourceNode) {
            if (isDebit) {
              sourceNode.totalOutflow += tx.amount;
            } else {
              sourceNode.totalInflow += tx.amount;
            }
            sourceNode.transactionCount += 1;
          }

          if (targetNode) {
            if (isDebit) {
              targetNode.totalInflow += tx.amount;
            } else {
              targetNode.totalOutflow += tx.amount;
            }
            targetNode.transactionCount += 1;
          }
        });

        // Calculate net flow for nodes
        nodes.forEach((node) => {
          node.netFlow = node.totalInflow - node.totalOutflow;
        });

        // Get all edges
        const edges = Array.from(edgesMap.values());

        // Create summary
        const summary = {
          totalEntities: entitiesData.length,
          totalCounterparties: seenCounterparties.size,
          totalVolume: edges.reduce((sum, e) => sum + e.amount, 0),
          totalTransactions: edges.reduce(
            (sum, e) => sum + e.transactionCount,
            0
          ),
        };

        setFlowchartData({
          nodes,
          edges,
          summary,
        });
      } catch (err) {
        console.error("Error fetching flowchart data:", err);
        setError(
          `Failed to load flowchart data: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId]);

  // Apply filters to flowchart data
  const filteredData = useMemo(() => {
    if (!flowchartData) return null;

    const normalizedNodes = flowchartData.nodes.map((node) => ({ ...node }));
    const normalizedEdges: NormalizedFlowchartEdge[] = flowchartData.edges
      .map((edge) => ({
        ...edge,
        source: normalizeEdgeEndpoint(edge.source),
        target: normalizeEdgeEndpoint(edge.target),
      }))
      .filter(
        (edge) => edge.source && edge.target
      ) as NormalizedFlowchartEdge[];

    let filteredNodes = normalizedNodes;
    let filteredEdges = normalizedEdges;

    // Filter by selected entities FIRST (this is a hard filter)
    if (selectedEntityFilter !== "all") {
      const entityNodeIds = selectedEntities.map(id => `entity-${id}`);
      filteredNodes = filteredNodes.filter(
        (node) => entityNodeIds.includes(node.id) || node.type === "counterparty"
      );

      filteredEdges = filteredEdges.filter(
        (edge) => entityNodeIds.includes(edge.source) || entityNodeIds.includes(edge.target)
      );
    }

    // Filter edges by amount and direction (these are soft filters)
    filteredEdges = filteredEdges.filter(
      (edge) => edge.amount >= minAmountThreshold
    );

    if (!showInflow) {
      filteredEdges = filteredEdges.filter(
        (edge) => edge.direction !== "inflow"
      );
    }
    if (!showOutflow) {
      filteredEdges = filteredEdges.filter(
        (edge) => edge.direction !== "outflow"
      );
    }

    // Only filter nodes after ALL edge filtering is complete
    // This prevents the "graph disappears and won't come back" bug
    const connectedNodes = new Set<string>();
    filteredEdges.forEach((edge) => {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    });

    // If entity filter is active, keep those entities even if they have no edges
    if (selectedEntityFilter !== "all") {
      selectedEntities.forEach(id => {
        const entityNodeId = `entity-${id}`;
        connectedNodes.add(entityNodeId);
      });
    }

    filteredNodes = filteredNodes.filter((node) => connectedNodes.has(node.id));

    return {
      nodes: filteredNodes,
      edges: filteredEdges,
      summary: {
        ...flowchartData.summary,
        totalVolume: filteredEdges.reduce((sum, e) => sum + e.amount, 0),
        totalTransactions: filteredEdges.reduce(
          (sum, e) => sum + e.transactionCount,
          0
        ),
      },
    };
  }, [
    flowchartData,
    selectedEntityFilter,
    selectedEntities,
    minAmountThreshold,
    showInflow,
    showOutflow,
  ]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!filteredData) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p className="text-sm">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Entities</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredData.summary.totalEntities}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-purple-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Counterparties
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredData.summary.totalCounterparties}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Volume</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(filteredData.summary.totalVolume)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-orange-100 rounded-md flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Transactions</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredData.summary.totalTransactions.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <FlowchartControls
        entities={entities}
        selectedEntityFilter={selectedEntityFilter}
        onEntityFilterChange={setSelectedEntityFilter}
        selectedEntities={selectedEntities}
        onSelectedEntitiesChange={setSelectedEntities}
        minAmountThreshold={minAmountThreshold}
        onMinAmountThresholdChange={setMinAmountThreshold}
        showInflow={showInflow}
        onShowInflowChange={setShowInflow}
        showOutflow={showOutflow}
        onShowOutflowChange={setShowOutflow}
        nodeSizing={nodeSizing}
        onNodeSizingChange={setNodeSizing}
      />

      {/* Legend */}
      <FlowchartLegend />

      {/* Visualization */}
      <div className="bg-white rounded-lg shadow p-6">
        <FlowchartVisualization data={filteredData} nodeSizing={nodeSizing} />
      </div>
    </div>
  );
}
