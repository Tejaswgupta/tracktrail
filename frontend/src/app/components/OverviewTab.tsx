"use client";

import { entitiesService, transactionsService, counterpartyService } from "@/services/database";
import type { Entity, Transaction } from "@/types/database";
import { useEffect, useState, useMemo } from "react";
// Import Recharts components
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface CounterpartyStats {
  name: string;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  totalVolume: number;
  netFlow: number;
  avgTransactionSize: number;
  maxTransactionSize: number;
  firstTransactionDate: string;
  lastTransactionDate: string;
  daysActive: number;
  frequency: number;
}

type NumericCounterpartyStatsKeys =
  | "transactionCount"
  | "totalDebit"
  | "totalCredit"
  | "totalVolume"
  | "netFlow"
  | "avgTransactionSize"
  | "maxTransactionSize"
  | "daysActive"
  | "frequency";

interface OverviewTabProps {
  caseId: string;
}

export default function OverviewTab({ caseId }: OverviewTabProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [counterpartyStats, setCounterpartyStats] = useState<CounterpartyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] =
    useState<NumericCounterpartyStatsKeys>("totalVolume");
  const [showTopN, setShowTopN] = useState(10);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const caseEntities = await entitiesService.getByCaseId(caseId);
        console.log(caseEntities);
        setEntities(caseEntities);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch transactions (for summary metrics only)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let data: Transaction[] = [];
        if (selectedEntityId) {
          data = await transactionsService.getByEntityId(selectedEntityId);
        } else {
          // For large datasets, we'll only fetch a sample or use optimized queries
          data = await transactionsService.getCaseTransactionsForAnalysis(caseId, [
            "transaction_id",
            "amount",
            "direction"
          ]);
        }
        setTransactions(data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId, selectedEntityId]);

  // Fetch counterparty stats from backend
  useEffect(() => {
    const fetchCounterpartyStats = async () => {
      try {
        setLoading(true);
        // Try to get detailed stats first, fallback to basic stats
        let stats;
        try {
          stats = await counterpartyService.getCaseCounterpartyStatsWithDetails(caseId);
        } catch (error) {
          console.warn("Detailed counterparty stats not available, using basic stats");
          const basicStats = await counterpartyService.getCaseCounterpartyStats(caseId);
          // Transform basic stats to match detailed format
          stats = basicStats.map(stat => ({
            counterparty_name: stat.counterparty_name,
            transaction_count: stat.transaction_count,
            total_debits: 0,
            total_credits: Number(stat.total_amount),
            total_amount: Number(stat.total_amount),
            net_flow: Number(stat.total_amount),
            avg_transaction_size: Number(stat.total_amount) / stat.transaction_count,
            max_transaction_size: 0,
            first_seen: stat.first_seen,
            last_seen: stat.last_seen
          }));
        }
        
        // Transform backend data to match our CounterpartyStats interface
        const transformedStats: CounterpartyStats[] = stats.map(stat => {
          const daysActive = Math.max(
            1,
            Math.ceil(
              (new Date(stat.last_seen).getTime() - new Date(stat.first_seen).getTime()) / (1000 * 60 * 60 * 24)
            ) + 1
          );
          
          return {
            name: stat.counterparty_name,
            transactionCount: stat.transaction_count,
            totalDebit: Number(stat.total_debits),
            totalCredit: Number(stat.total_credits),
            totalVolume: Number(stat.total_amount),
            netFlow: Number(stat.net_flow),
            avgTransactionSize: Number(stat.avg_transaction_size),
            maxTransactionSize: Number(stat.max_transaction_size),
            firstTransactionDate: stat.first_seen,
            lastTransactionDate: stat.last_seen,
            daysActive: daysActive,
            frequency: stat.transaction_count / daysActive
          };
        });
        
        setCounterpartyStats(transformedStats);
      } catch (error) {
        console.error("Error fetching counterparty stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounterpartyStats();
  }, [caseId, selectedEntityId]);

  // Calculate summary metrics
  const summaryMetrics = {
    totalTransactions: transactions.length,
    totalDebits: transactions.reduce(
      (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
      0
    ),
    totalCredits: transactions.reduce(
      (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
      0
    ),
    netFlow: transactions.reduce(
      (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
      0
    ),
  };

  // Categorize transactions as cash vs bank
  const categorizeTransaction = (description: string): "cash" | "bank" => {
    if (!description) return "bank";
    const desc = description.toUpperCase();
    const cashKeywords = ["CASH", "ATM", "WITHDRAWAL", "CHQ"];

    if (cashKeywords.some((keyword) => desc.includes(keyword))) return "cash";
    return "bank"; // Default to bank
  };

  const cashTransactions = transactions.filter(
    (t) => categorizeTransaction(t.description || "") === "cash"
  );
  const bankTransactions = transactions.filter(
    (t) => categorizeTransaction(t.description || "") === "bank"
  );

  const cashVsBankMetrics = {
    cash: {
      count: cashTransactions.length,
      debits: cashTransactions.reduce(
        (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
        0
      ),
      credits: cashTransactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
        0
      ),
      netFlow: cashTransactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
        0
      ),
    },
    bank: {
      count: bankTransactions.length,
      debits: bankTransactions.reduce(
        (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
        0
      ),
      credits: bankTransactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
        0
      ),
      netFlow: bankTransactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
        0
      ),
    },
  };

    // Use backend counterparty stats instead of client-side calculation
  const sortedCounterparties = [...counterpartyStats]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, showTopN);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary Metrics */}
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
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">
                Total Transactions
              </p>
              <p className="text-2xl font-semibold text-gray-900">
                {summaryMetrics.totalTransactions.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 14l-7 7m0 0l-7-7m7 7V3"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Debits</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(summaryMetrics.totalDebits)}
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
                    d="M5 10l7-7m0 0l7 7m-7-7v18"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Total Credits</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(summaryMetrics.totalCredits)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div
                className={`w-8 h-8 ${
                  summaryMetrics.netFlow >= 0 ? "bg-green-100" : "bg-red-100"
                } rounded-md flex items-center justify-center`}
              >
                <svg
                  className={`w-5 h-5 ${
                    summaryMetrics.netFlow >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Net Flow</p>
              <p
                className={`text-2xl font-semibold ${
                  summaryMetrics.netFlow >= 0
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {formatCurrency(summaryMetrics.netFlow)}
              </p>
              <p className="text-xs text-gray-500">
                {summaryMetrics.netFlow >= 0 ? "Inflow" : "Outflow"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cash vs Bank Breakdown */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">
          Cash vs Bank Breakdown
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-700 flex items-center">
              <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
              Cash Transactions
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Count</p>
                <p className="text-xl font-semibold text-gray-900">
                  {cashVsBankMetrics.cash.count.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Net Flow</p>
                <p
                  className={`text-xl font-semibold ${
                    cashVsBankMetrics.cash.netFlow >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(cashVsBankMetrics.cash.netFlow)}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Debits</p>
                <p className="text-xl font-semibold text-red-600">
                  {formatCurrency(cashVsBankMetrics.cash.debits)}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Credits</p>
                <p className="text-xl font-semibold text-green-600">
                  {formatCurrency(cashVsBankMetrics.cash.credits)}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="text-md font-medium text-gray-700 flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              Bank Transactions
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Count</p>
                <p className="text-xl font-semibold text-gray-900">
                  {cashVsBankMetrics.bank.count.toLocaleString()}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Net Flow</p>
                <p
                  className={`text-xl font-semibold ${
                    cashVsBankMetrics.bank.netFlow >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(cashVsBankMetrics.bank.netFlow)}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Debits</p>
                <p className="text-xl font-semibold text-red-600">
                  {formatCurrency(cashVsBankMetrics.bank.debits)}
                </p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600">Total Credits</p>
                <p className="text-xl font-semibold text-green-600">
                  {formatCurrency(cashVsBankMetrics.bank.credits)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Counterparty Analysis */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Counterparty Analysis
            </h3>
            {selectedEntityId && (
              <p className="text-sm text-blue-600 mt-1">
                Showing data for:{" "}
                {entities.find((e) => e.entity_id === selectedEntityId)
                  ?.entity_name || selectedEntityId}
              </p>
            )}
          </div>
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
              onChange={(e) =>
                setSortBy(e.target.value as NumericCounterpartyStatsKeys)
              }
              className="border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="totalVolume">Total Volume</option>
              <option value="transactionCount">Transaction Count</option>
              <option value="netFlow">Net Flow</option>
              <option value="frequency">Frequency</option>
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

        {sortedCounterparties.length > 0 ? (
          <>
            {/* Bar Chart */}
            <div className="mb-10 h-100">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={sortedCounterparties}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="name"
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    tick={{ fontSize: 12 }}
                  />
                  <YAxis
                    domain={[
                      0,
                      Math.max(...sortedCounterparties.map((c) => c[sortBy])) *
                        1.1,
                    ]}
                  />
                  <Tooltip
                    formatter={(value) => [
                      sortBy === "totalVolume" ||
                      sortBy === "netFlow" ||
                      sortBy === "avgTransactionSize" ||
                      sortBy === "maxTransactionSize"
                        ? formatCurrency(Number(value))
                        : sortBy === "frequency"
                        ? `${Number(value).toFixed(2)}/day`
                        : Number(value).toLocaleString(),
                      sortBy,
                    ]}
                    labelFormatter={(value) => `${value}`}
                  />
                  {/* <Legend /> */}
                  <Bar
                    dataKey={sortBy}
                    name={
                      sortBy === "totalVolume"
                        ? "Total Volume"
                        : sortBy === "transactionCount"
                        ? "Transaction Count"
                        : sortBy === "netFlow"
                        ? "Net Flow"
                        : sortBy === "frequency"
                        ? "Frequency (per day)"
                        : sortBy
                    }
                  >
                    {sortedCounterparties.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          sortBy === "netFlow"
                            ? entry[sortBy] >= 0
                              ? "#10B981"
                              : "#EF4444"
                            : "#3B82F6"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Detailed Stats Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Counterparty
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Transactions
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Debits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Credits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total Volume
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Net Flow
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Max Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      First Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days Active
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Frequency
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sortedCounterparties.map((cp) => (
                    <tr key={cp.name} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {cp.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cp.transactionCount.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                        {formatCurrency(cp.totalDebit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                        {formatCurrency(cp.totalCredit)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(cp.totalVolume)}
                      </td>
                      <td
                        className={`px-6 py-4 whitespace-nowrap text-sm ${
                          cp.netFlow >= 0 ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {formatCurrency(cp.netFlow)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(cp.avgTransactionSize)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatCurrency(cp.maxTransactionSize)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(cp.firstTransactionDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(cp.lastTransactionDate)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cp.daysActive}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {cp.frequency.toFixed(2)}/day
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p className="text-sm">No counterparty data available</p>
            <p className="text-xs mt-1">
              Upload bank statements to see counterparty analysis
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
