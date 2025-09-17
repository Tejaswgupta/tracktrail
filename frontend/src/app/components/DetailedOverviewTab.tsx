"use client";

import { useEffect, useState } from "react";
import { counterpartyService, entitiesService, transactionsService } from "@/services/database";
import type { Entity, Transaction } from "@/types/database";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface NxNMatrixData {
  counterparty: string;
  totalAmount: number;
  transactionCount: number;
  netFlow: number;
  [key: string]: number | string; // Dynamic keys for each entity
}

interface DetailedOverviewTabProps {
  caseId: string;
}

export default function DetailedOverviewTab({ caseId }: DetailedOverviewTabProps) {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [matrixData, setMatrixData] = useState<NxNMatrixData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"totalAmount" | "transactionCount" | "netFlow">("totalAmount");
  const [showTopN, setShowTopN] = useState(10);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch entities for the case
        const caseEntities = await entitiesService.getByCaseId(caseId);
        setEntities(caseEntities);
        
        // Fetch transactions for the case
        let transactions: Transaction[] = [];
        if (selectedEntityId) {
          transactions = await transactionsService.getByEntityId(selectedEntityId);
        } else {
          transactions = await transactionsService.getByCaseId(caseId);
        }
        
        // Get counterparties with stats
        const counterparties = await counterpartyService.getCaseCounterpartyStatsWithDetails(caseId);
        
        // Process transactions to create NxN matrix
        // Group transactions by counterparty and entity
        const matrixMap: Record<string, Record<string, { amount: number; count: number; netFlow: number }>> = {};
        
        // Initialize matrixMap with all counterparties
        counterparties.forEach(cp => {
          matrixMap[cp.counterparty_name] = {};
          caseEntities.forEach(entity => {
            matrixMap[cp.counterparty_name][entity.entity_name] = { amount: 0, count: 0, netFlow: 0 };
          });
        });
        
        // Process transactions
        transactions.forEach(tx => {
          if (tx.counterparty_merged) {
            const counterparty = tx.counterparty_merged;
            const entity = caseEntities.find(e => e.entity_id === tx.entity_id);
            
            if (entity && matrixMap[counterparty]) {
              const entityName = entity.entity_name;
              if (!matrixMap[counterparty][entityName]) {
                matrixMap[counterparty][entityName] = { amount: 0, count: 0, netFlow: 0 };
              }
              
              matrixMap[counterparty][entityName].amount += tx.amount;
              matrixMap[counterparty][entityName].count += 1;
              matrixMap[counterparty][entityName].netFlow += tx.direction === "CR" ? tx.amount : -tx.amount;
            }
          }
        });
        
        // Convert to array format for display
        const matrix: NxNMatrixData[] = Object.entries(matrixMap)
          .map(([counterparty, entityData]) => {
            const totalAmount = Object.values(entityData).reduce((sum, data) => sum + data.amount, 0);
            const transactionCount = Object.values(entityData).reduce((sum, data) => sum + data.count, 0);
            const netFlow = Object.values(entityData).reduce((sum, data) => sum + data.netFlow, 0);
            
            return {
              counterparty,
              totalAmount,
              transactionCount,
              netFlow,
              ...Object.fromEntries(
                Object.entries(entityData).map(([entityName, data]) => [entityName, data.amount])
              )
            };
          })
          .sort((a, b) => {
            if (sortBy === "totalAmount") return b.totalAmount - a.totalAmount;
            if (sortBy === "transactionCount") return b.transactionCount - a.transactionCount;
            return b.netFlow - a.netFlow;
          })
          .slice(0, showTopN);
        
        setMatrixData(matrix);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load detailed overview data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId, selectedEntityId, sortBy, showTopN]);

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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <h3 className="text-lg font-medium text-gray-900">
          Detailed Counterparty Flow Analysis
        </h3>
        <div className="flex flex-wrap gap-4">
          {/* Entity Filter */}
          <div className="flex items-center space-x-2">
            <select
              value={selectedEntityId || ""}
              onChange={(e) => setSelectedEntityId(e.target.value || null)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Entities</option>
              {entities.map((entity) => (
                <option key={entity.entity_id} value={entity.entity_id}>
                  {entity.entity_name}
                </option>
              ))}
            </select>
            {selectedEntityId && (
              <button
                onClick={() => setSelectedEntityId(null)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                Clear
              </button>
            )}
          </div>
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value="totalAmount">Total Volume</option>
            <option value="transactionCount">Transaction Count</option>
            <option value="netFlow">Net Flow</option>
          </select>
          
          <select
            value={showTopN}
            onChange={(e) => setShowTopN(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-3 py-2 text-sm"
          >
            <option value={5}>Top 5</option>
            <option value={10}>Top 10</option>
            <option value={20}>Top 20</option>
            <option value={50}>Top 50</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <div className="mb-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            Counterparty Transaction Flow Matrix
          </h4>
          <p className="text-sm text-gray-600 mb-4">
            This matrix shows the flow of money between counterparties and entities. Each cell represents the total transaction volume between a counterparty (row) and an entity (column).
          </p>
        </div>

        {/* Matrix Visualization */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr>
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-50">
                  Counterparty
                </th>
                {entities.map((entity) => (
                  <th key={entity.entity_id} className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="max-w-[120px] truncate" title={entity.entity_name}>
                      {entity.entity_name}
                    </div>
                  </th>
                ))}
                <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {matrixData.map((row, rowIndex) => (
                <tr key={rowIndex} className={rowIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 sticky left-0 bg-inherit">
                    <div className="max-w-[150px] truncate" title={row.counterparty}>
                      {row.counterparty}
                    </div>
                  </td>
                  {entities.map((entity, colIndex) => {
                    const amount = row[entity.entity_name] as number || 0;
                    return (
                      <td key={`${rowIndex}-${colIndex}`} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <div className="flex items-center">
                          <span className={amount > 0 ? "text-green-600" : "text-gray-500"}>
                            {amount > 0 ? formatCurrency(amount) : "-"}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {formatCurrency(row.totalAmount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Additional Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Counterparties by Volume */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            Top Counterparties by Transaction Volume
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={matrixData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="counterparty"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Total Volume"]}
                  labelFormatter={(value) => `Counterparty: ${value}`}
                />
                <Bar dataKey="totalAmount" name="Total Volume">
                  {matrixData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={"#3B82F6"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Net Flow Analysis */}
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-medium text-gray-900 mb-4">
            Net Flow Analysis
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={matrixData}
                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="counterparty"
                  angle={-45}
                  textAnchor="end"
                  height={60}
                  tick={{ fontSize: 12 }}
                />
                <YAxis />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Net Flow"]}
                  labelFormatter={(value) => `Counterparty: ${value}`}
                />
                <Bar dataKey="netFlow" name="Net Flow">
                  {matrixData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.netFlow >= 0 ? "#10B981" : "#EF4444"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">How to Use This Analysis</h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                This visualization shows the flow of money between counterparties and entities in your case. 
                Darker green cells indicate higher transaction volumes. Use the filters to focus on specific entities 
                and sort by different metrics to identify key counterparties.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}