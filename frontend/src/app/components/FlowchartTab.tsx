"use client";

import { entitiesService, transactionsService } from "@/services/database";
import type { Entity, Transaction } from "@/types/database";
import { useCallback, useEffect, useMemo, useState } from "react";

import FlowchartChronologicalView from "./FlowchartChronologicalView";
import { FLOWCHAIN_TIME_WINDOW_OPTIONS } from "./FlowchartConstants";
import FlowchartControls, { FlowDateRange } from "./FlowchartControls";
import FlowchartLegend from "./FlowchartLegend";
import type {
  EdgeTransactionSummary,
  FlowchartData,
  FlowchartEdge,
  FlowchartNode,
} from "./FlowchartTypes";
import FlowchartVisualization from "./FlowchartVisualization";

interface FlowchartTabProps {
  caseId: string;
}

export default function FlowchartTab({ caseId }: FlowchartTabProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [dateRange, setDateRange] = useState<FlowDateRange>({
    from: null,
    to: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Control states
  const [selectedEntityFilter, setSelectedEntityFilter] =
    useState<string>("all");
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]);
  const [minAmountThreshold, setMinAmountThreshold] = useState(100000);
  const [showInflow, setShowInflow] = useState(true);
  const [showOutflow, setShowOutflow] = useState(true);
  const [nodeSizing, setNodeSizing] = useState<"count" | "volume">("volume");
  const [visualizationMode, setVisualizationMode] = useState<
    "network" | "chronological"
  >("network");
  const [timelineEventLimit, setTimelineEventLimit] = useState<number>(500);
  const [chainTimeWindowMs, setChainTimeWindowMs] = useState<number>(
    FLOWCHAIN_TIME_WINDOW_OPTIONS.find(
      (option) => option.value === 7 * 24 * 60 * 60 * 1000
    )?.value ?? 7 * 24 * 60 * 60 * 1000
  );

  const availableDateRange = useMemo<FlowDateRange>(() => {
    if (transactions.length === 0) {
      return { from: null, to: null };
    }

    const dateKeys = transactions
      .map((transaction) => transaction.tx_date?.slice(0, 10) ?? null)
      .filter((value): value is string => Boolean(value));

    if (dateKeys.length === 0) {
      return { from: null, to: null };
    }

    const minDate = dateKeys.reduce((min, current) =>
      current < min ? current : min
    );
    const maxDate = dateKeys.reduce((max, current) =>
      current > max ? current : max
    );

    return { from: minDate, to: maxDate };
  }, [transactions]);

  const handleDateRangeChange = useCallback((value: Partial<FlowDateRange>) => {
    setDateRange((previous) => {
      const next = { ...previous, ...value };

      if (next.from && next.to && next.from > next.to) {
        if (value.from !== undefined) {
          next.to = next.from;
        } else if (value.to !== undefined) {
          next.from = next.to;
        }
      }

      return next;
    });
  }, []);

  const handleResetDateRange = useCallback(() => {
    if (availableDateRange.from && availableDateRange.to) {
      setDateRange({
        from: availableDateRange.from,
        to: availableDateRange.to,
      });
    }
  }, [availableDateRange]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const [entitiesData, transactionsData] = await Promise.all([
          entitiesService.getByCaseId(caseId),
          transactionsService.getCaseTransactionsForAnalysis(caseId, [
            "transaction_id",
            "tx_date",
            "amount",
            "direction",
            "entity_id",
            "counterparty_merged",
          ]),
        ]);

        setEntities(entitiesData);
        setTransactions(transactionsData);

        const dateKeys = transactionsData
          .map((tx) => tx.tx_date?.slice(0, 10) ?? null)
          .filter((value): value is string => Boolean(value));

        if (dateKeys.length > 0) {
          const minDate = dateKeys.reduce((min, current) =>
            current < min ? current : min
          );
          const maxDate = dateKeys.reduce((max, current) =>
            current > max ? current : max
          );
          setDateRange({ from: minDate, to: maxDate });
        } else {
          setDateRange({ from: null, to: null });
        }
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
  const filteredData = useMemo<FlowchartData | null>(() => {
    if (loading) {
      return null;
    }

    const normalizeName = (name: string) =>
      name.trim().replace(/\s+/g, " ").toLowerCase();

    const entityFilterActive = selectedEntityFilter !== "all";
    const allowedEntities = new Set(selectedEntities);
    const entityLookup = new Map(
      entities.map((entity) => [entity.entity_id, entity])
    );
    const entityNameLookup = new Map<string, Entity>();

    entities.forEach((entity) => {
      const normalizedName = normalizeName(entity.entity_name);

      if (!normalizedName || entityNameLookup.has(normalizedName)) {
        return;
      }

      entityNameLookup.set(normalizedName, entity);
    });

    const filteredTransactions = transactions.filter((transaction) => {
      const dateKey = transaction.tx_date?.slice(0, 10) ?? "";

      if (dateRange.from && dateKey < dateRange.from) {
        return false;
      }

      if (dateRange.to && dateKey > dateRange.to) {
        return false;
      }

      if (entityFilterActive && !allowedEntities.has(transaction.entity_id)) {
        return false;
      }

      if (!showOutflow && transaction.direction === "DR") {
        return false;
      }

      if (!showInflow && transaction.direction === "CR") {
        return false;
      }

      return true;
    });

    if (filteredTransactions.length === 0) {
      return {
        nodes: [],
        edges: [],
        summary: {
          totalEntities: entityFilterActive
            ? allowedEntities.size
            : entities.length,
          totalCounterparties: 0,
          totalVolume: 0,
          totalTransactions: 0,
        },
      };
    }

    const nodesMap = new Map<string, FlowchartNode>();
    const edgesMap = new Map<
      string,
      FlowchartEdge & { transactions: EdgeTransactionSummary[] }
    >();

    const ensureEntityNode = (entityId: string) => {
      const nodeId = `entity-${entityId}`;

      if (!nodesMap.has(nodeId)) {
        const entity = entityLookup.get(entityId);
        nodesMap.set(nodeId, {
          id: nodeId,
          label: entity?.entity_name ?? `Entity ${entityId}`,
          type: "entity",
          totalInflow: 0,
          totalOutflow: 0,
          netFlow: 0,
          transactionCount: 0,
          riskScore: entity?.risk_score,
          entityId,
        });
      }
    };

    const ensureCounterpartyNode = (rawName: string) => {
      const trimmedName = rawName.trim();
      const name = trimmedName || "Unknown";
      const normalizedName = trimmedName ? normalizeName(trimmedName) : "";

      if (normalizedName) {
        const matchingEntity = entityNameLookup.get(normalizedName);

        if (matchingEntity) {
          ensureEntityNode(matchingEntity.entity_id);
          return `entity-${matchingEntity.entity_id}`;
        }
      }

      const nodeId = `counterparty-${name}`;

      if (!nodesMap.has(nodeId)) {
        nodesMap.set(nodeId, {
          id: nodeId,
          label: name,
          type: "counterparty",
          totalInflow: 0,
          totalOutflow: 0,
          netFlow: 0,
          transactionCount: 0,
        });
      }

      return nodeId;
    };

    filteredTransactions.forEach((transaction) => {
      const entityId = transaction.entity_id;
      const counterpartyName = transaction.counterparty_merged ?? "Unknown";
      const isDebit = transaction.direction === "DR";

      ensureEntityNode(entityId);
      const counterpartyNodeId = ensureCounterpartyNode(counterpartyName);

      const sourceId = isDebit ? `entity-${entityId}` : counterpartyNodeId;
      const targetId = isDebit ? counterpartyNodeId : `entity-${entityId}`;

      const edgeKey = `${sourceId}->${targetId}`;

      if (!edgesMap.has(edgeKey)) {
        edgesMap.set(edgeKey, {
          source: sourceId,
          target: targetId,
          amount: 0,
          transactionCount: 0,
          direction: isDebit ? "outflow" : "inflow",
          transactions: [],
          firstTransactionDate: transaction.tx_date,
          lastTransactionDate: transaction.tx_date,
        });
      }

      const edge = edgesMap.get(edgeKey)!;
      edge.amount += transaction.amount;
      edge.transactionCount += 1;
      edge.transactions?.push({
        transactionId: transaction.transaction_id,
        txDate: transaction.tx_date,
        amount: transaction.amount,
        direction: transaction.direction,
      });

      if (
        !edge.firstTransactionDate ||
        transaction.tx_date < edge.firstTransactionDate
      ) {
        edge.firstTransactionDate = transaction.tx_date;
      }

      if (
        !edge.lastTransactionDate ||
        transaction.tx_date > edge.lastTransactionDate
      ) {
        edge.lastTransactionDate = transaction.tx_date;
      }
    });

    let edges = Array.from(edgesMap.values()).map((edge) => ({
      ...edge,
      transactions: edge.transactions?.sort((a, b) =>
        a.txDate.localeCompare(b.txDate)
      ),
    }));

    if (minAmountThreshold > 0) {
      edges = edges.filter((edge) => edge.amount >= minAmountThreshold);
    }

    const connectedNodeIds = new Set<string>();
    edges.forEach((edge) => {
      connectedNodeIds.add(edge.source as string);
      connectedNodeIds.add(edge.target as string);
    });

    if (entityFilterActive) {
      allowedEntities.forEach((entityId) => {
        ensureEntityNode(entityId);
        connectedNodeIds.add(`entity-${entityId}`);
      });
    }

    const nodeStats = new Map<
      string,
      { totalInflow: number; totalOutflow: number; transactionCount: number }
    >();

    connectedNodeIds.forEach((id) => {
      nodeStats.set(id, {
        totalInflow: 0,
        totalOutflow: 0,
        transactionCount: 0,
      });
    });

    edges.forEach((edge) => {
      const sourceId = edge.source as string;
      const targetId = edge.target as string;
      const sourceStats = nodeStats.get(sourceId);
      const targetStats = nodeStats.get(targetId);

      if (sourceStats) {
        sourceStats.totalOutflow += edge.amount;
        sourceStats.transactionCount += edge.transactionCount;
      }

      if (targetStats) {
        targetStats.totalInflow += edge.amount;
        targetStats.transactionCount += edge.transactionCount;
      }
    });

    const nodes = Array.from(nodesMap.entries())
      .filter(([nodeId]) => connectedNodeIds.has(nodeId))
      .map(([, node]) => {
        const stats = nodeStats.get(node.id);
        const totalInflow = stats?.totalInflow ?? 0;
        const totalOutflow = stats?.totalOutflow ?? 0;
        const transactionCount = stats?.transactionCount ?? 0;

        return {
          ...node,
          totalInflow,
          totalOutflow,
          netFlow: totalInflow - totalOutflow,
          transactionCount,
        };
      });

    const summary = {
      totalEntities: nodes.filter((node) => node.type === "entity").length,
      totalCounterparties: nodes.filter((node) => node.type === "counterparty")
        .length,
      totalVolume: edges.reduce((sum, edge) => sum + edge.amount, 0),
      totalTransactions: edges.reduce(
        (sum, edge) => sum + edge.transactionCount,
        0
      ),
    };

    return {
      nodes,
      edges,
      summary,
    };
  }, [
    loading,
    entities,
    transactions,
    dateRange,
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
        timelineEventLimit={timelineEventLimit}
        onTimelineEventLimitChange={(value) => setTimelineEventLimit(value)}
        chainTimeWindowMs={chainTimeWindowMs}
        onChainTimeWindowChange={setChainTimeWindowMs}
        dateRange={dateRange}
        availableDateRange={availableDateRange}
        onDateRangeChange={handleDateRangeChange}
        onResetDateRange={handleResetDateRange}
      />

      {/* Legend */}
      <FlowchartLegend />

      {/* Visualization */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-base font-semibold text-gray-900">
              Visualization
            </h4>
            <div className="inline-flex overflow-hidden rounded-md border border-gray-200 bg-white text-sm font-medium">
              <button
                type="button"
                onClick={() => setVisualizationMode("network")}
                className={`px-3 py-2 transition ${
                  visualizationMode === "network"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Network Graph
              </button>
              <button
                type="button"
                onClick={() => setVisualizationMode("chronological")}
                className={`px-3 py-2 transition border-l border-gray-200 ${
                  visualizationMode === "chronological"
                    ? "bg-blue-600 text-white"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                Chronological Flow
              </button>
            </div>
          </div>
          {visualizationMode === "network" ? (
            <FlowchartVisualization
              data={filteredData}
              nodeSizing={nodeSizing}
            />
          ) : (
            <FlowchartChronologicalView
              caseId={caseId}
              data={filteredData}
              selectedEntities={selectedEntities}
              dateRange={dateRange}
              showInflow={showInflow}
              showOutflow={showOutflow}
              timelineEventLimit={timelineEventLimit}
              onTimelineEventLimitChange={(value) =>
                setTimelineEventLimit(value)
              }
              minAmountThreshold={minAmountThreshold}
              chainTimeWindowMs={chainTimeWindowMs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
