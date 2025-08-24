"use client";

import {
  amlDetectionService,
  type RoundTrippingConfig,
  type RoundTrippingResult,
} from "@/services/amlDetection";
import { transactionsService } from "@/services/database";
import type { Transaction } from "@/types/database";
import { useEffect, useState } from "react";

interface AMLMetadata {
  entityIds: string[];
  dateRange: { from: string; to: string };
  transactionCount: number;
  totalVolume: number;
}

interface RoundTrippingDetectionTabProps {
  caseId: string;
  amlMetadata: AMLMetadata;
  selectedEntityIds: string[];
}

export default function RoundTrippingDetectionTab({
  caseId,
  amlMetadata,
  selectedEntityIds,
}: RoundTrippingDetectionTabProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);
  const [config, setConfig] = useState<RoundTrippingConfig>({
    maxTimeSpanHours: 72,
    minReturnRatio: 0.7,
    minAmount: 10000,
  });

  const [results, setResults] = useState<RoundTrippingResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<
    RoundTrippingResult["patterns"][0] | null
  >(null);

  const fetchTransactionsForAnalysis = async () => {
    if (amlMetadata.transactionCount === 0 || selectedEntityIds.length === 0)
      return;

    setLoadingTransactions(true);
    try {
      // Only fetch required fields for round tripping analysis
      const data = await transactionsService.getCaseTransactionsForAnalysis(
        caseId,
        [
          "transaction_id",
          "tx_date",
          "amount",
          "direction",
          "counterparty_merged",
          "entity_id",
          "description",
        ]
      );

      // Filter transactions by selected entities
      const filteredTransactions = data.filter((tx) =>
        selectedEntityIds.includes(tx.entity_id)
      );

      setTransactions(filteredTransactions);
    } catch (error) {
      console.error("Error fetching transactions for analysis:", error);
      setError("Failed to load transaction data for analysis");
    } finally {
      setLoadingTransactions(false);
    }
  };

  const runDetection = async () => {
    if (transactions.length === 0) {
      setError("No transactions available for analysis");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await amlDetectionService.detectRoundTripping(
        transactions,
        selectedEntityIds
      );
      setResults(result);
      setError(null);
    } catch (error) {
      console.error("Error running round tripping detection:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to analyze round tripping patterns. Please try again.";
      setError(errorMessage);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactionsForAnalysis();
  }, [caseId, amlMetadata, selectedEntityIds]);

  useEffect(() => {
    if (transactions.length > 0) {
      runDetection();
    }
  }, [transactions, config]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getSeverityColor = (score: number) => {
    if (score >= 0.9) return "bg-red-100 text-red-800 border-red-200";
    if (score >= 0.7) return "bg-orange-100 text-orange-800 border-orange-200";
    if (score >= 0.5) return "bg-yellow-100 text-yellow-800 border-yellow-200";
    return "bg-blue-100 text-blue-800 border-blue-200";
  };

  return (
    <div className="space-y-6 relative">
      {/* Configuration Panel */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Round Tripping Detection Configuration
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Detects both simple bilateral patterns (A→B→A) and complex
              multi-entity circular patterns (A→B→C→A)
            </p>
            <div className="flex items-center mt-2">
              <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
              <span className="text-xs text-gray-500">
                Powered by Backend Cycle Detection API
              </span>
            </div>
          </div>
          <button
            onClick={runDetection}
            disabled={
              loading ||
              loadingTransactions ||
              amlMetadata.transactionCount === 0 ||
              selectedEntityIds.length === 0
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading || loadingTransactions ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                {loadingTransactions
                  ? "Loading Data..."
                  : "Analyzing via Backend..."}
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {error ? "Retry Analysis" : "Run Detection"}
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Max Time Span (Hours)
            </label>
            <input
              type="number"
              value={config.maxTimeSpanHours}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  maxTimeSpanHours: Number(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="72"
            />
            <p className="text-xs text-gray-500 mt-1">
              Maximum time for money to return
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Return Ratio (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              value={config.minReturnRatio}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  minReturnRatio: Number(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="0.7"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum percentage of money that returns
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Amount (₹)
            </label>
            <input
              type="number"
              value={config.minAmount}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  minAmount: Number(e.target.value),
                }))
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              placeholder="100000"
            />
            <p className="text-xs text-gray-500 mt-1">
              Minimum transaction amount to consider
            </p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg
                className="w-5 h-5 text-red-400"
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
              <h3 className="text-sm font-medium text-red-800">
                Analysis Error
              </h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
            <div className="ml-auto">
              <button
                onClick={runDetection}
                className="text-sm text-red-600 hover:text-red-500 font-medium"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {results && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                </div>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Total Patterns
                </p>
                <p className="text-2xl font-semibold text-gray-900">
                  {results.summary.totalPatterns}
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
                <p className="text-sm font-medium text-gray-600">
                  Avg Return Ratio
                </p>
                <p className="text-2xl font-semibold text-orange-600">
                  {(results.summary.avgReturnRatio * 100).toFixed(1)}%
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
                <p className="text-sm font-medium text-gray-600">
                  Total Amount
                </p>
                <p className="text-2xl font-semibold text-green-600">
                  {formatCurrency(results.summary.totalAmount)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Patterns List */}
      {results && results.patterns.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Detected Patterns ({results.patterns.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {results.patterns
              .sort((a, b) => b.suspiciousScore - a.suspiciousScore)
              .map((pattern, index) => (
                <div
                  key={`${pattern.entities.join("_")}_${index}`}
                  className="p-6 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setSelectedPattern(pattern)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2 mb-2">
                        <h4 className="text-sm font-medium text-gray-900">
                          {pattern.entities.join(" → ")}
                        </h4>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(
                            pattern.suspiciousScore
                          )}`}
                        >
                          Score: {(pattern.suspiciousScore * 100).toFixed(0)}%
                        </span>
                        {pattern.entities.length > 2 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                            Multi-Entity ({pattern.entities.length})
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Bilateral
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                        <div>
                          <span className="font-medium">Transactions:</span>{" "}
                          {pattern.transactions.length}
                        </div>
                        <div>
                          <span className="font-medium">Total Amount:</span>{" "}
                          {formatCurrency(pattern.totalAmount)}
                        </div>
                        <div>
                          <span className="font-medium">Return Ratio:</span>{" "}
                          {(pattern.returnRatio * 100).toFixed(1)}%
                        </div>
                        <div>
                          <span className="font-medium">Time Span:</span>{" "}
                          {pattern.timeSpan.toFixed(1)} hours
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Pattern Detail Modal */}
      {selectedPattern && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {selectedPattern.entities.length > 2
                    ? "Multi-Entity Circular"
                    : "Bilateral"}{" "}
                  Round Tripping Pattern
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  Flow Path: {selectedPattern.entities.join(" → ")}
                  {selectedPattern.entities.length > 2 &&
                    " → " + selectedPattern.entities[0]}
                </p>
                <div className="flex items-center space-x-2 mt-1">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(
                      selectedPattern.suspiciousScore
                    )}`}
                  >
                    Suspicion Score:{" "}
                    {(selectedPattern.suspiciousScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPattern(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Total Transactions</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedPattern.transactions.length}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Total Amount</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(selectedPattern.totalAmount)}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Return Ratio</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {(selectedPattern.returnRatio * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-lg">
                  <p className="text-sm text-gray-600">Time Span</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedPattern.timeSpan.toFixed(1)} hours
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Transaction Flow
                </h4>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Date
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Description
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Amount
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Direction
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Counterparty
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {selectedPattern.transactions
                        .sort(
                          (a, b) =>
                            new Date(a.tx_date).getTime() -
                            new Date(b.tx_date).getTime()
                        )
                        .map((transaction) => (
                          <tr
                            key={transaction.transaction_id}
                            className="hover:bg-gray-50"
                          >
                            <td className="px-4 py-2 text-xs text-gray-900">
                              {new Date(transaction.tx_date).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900 max-w-xs truncate">
                              {transaction.description}
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900">
                              {formatCurrency(transaction.amount)}
                            </td>
                            <td className="px-4 py-2 text-xs">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                  transaction.direction === "CR"
                                    ? "bg-green-100 text-green-800"
                                    : "bg-red-100 text-red-800"
                                }`}
                              >
                                {transaction.direction === "CR"
                                  ? "← IN"
                                  : "OUT →"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900">
                              {transaction.counterparty_merged || "Unknown"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-blue-800 mb-2">
                  Pattern Analysis
                </h4>
                <div className="text-sm text-blue-700">
                  <p>
                    This{" "}
                    {selectedPattern.entities.length > 2
                      ? "multi-entity circular"
                      : "bilateral"}{" "}
                    pattern shows money flowing through{" "}
                    {selectedPattern.entities.length} entities
                    {selectedPattern.timeSpan > 0 &&
                      ` and returning within ${selectedPattern.timeSpan.toFixed(
                        1
                      )} hours`}
                    .
                  </p>
                  <p className="mt-1">
                    <strong>Flow path:</strong>{" "}
                    {selectedPattern.entities.join(" → ")}
                    {selectedPattern.entities.length > 2 &&
                      " → " + selectedPattern.entities[0]}
                  </p>
                  <p className="mt-1">
                    <strong>
                      {(selectedPattern.returnRatio * 100).toFixed(1)}%
                    </strong>{" "}
                    of the outgoing amount returned, which{" "}
                    {selectedPattern.returnRatio >= 0.9
                      ? "strongly suggests"
                      : selectedPattern.returnRatio >= 0.7
                      ? "indicates potential"
                      : "may indicate"}{" "}
                    round tripping activity.
                  </p>
                  {selectedPattern.entities.length > 2 && (
                    <p className="mt-1 font-medium">
                      The use of {selectedPattern.entities.length - 2}{" "}
                      intermediary entities may indicate an attempt to obscure
                      the money trail and create artificial transaction
                      complexity.
                    </p>
                  )}
                  {selectedPattern.entities.length === 2 && (
                    <p className="mt-1">
                      This bilateral pattern represents a direct round trip
                      between two entities, which is a classic indicator of
                      potential money laundering or tax evasion schemes.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {results && results.patterns.length === 0 && !loading && !error && (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Round Tripping Patterns Detected
          </h3>
          <p className="text-gray-500 mb-4">
            Based on the current configuration, no suspicious round tripping
            patterns were found in the transaction data.
          </p>
          <div className="text-sm text-gray-400">
            <p>Analysis completed using backend cycle detection</p>
            <p>Processed {transactions.length} transactions</p>
          </div>
        </div>
      )}

      {/* No Transactions */}
      {amlMetadata.transactionCount === 0 && (
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            No Transaction Data Available
          </h3>
          <p className="text-gray-500">
            Please upload transaction data to perform round tripping analysis.
          </p>
        </div>
      )}

      {/* Loading Overlay */}
      {(loading || loadingTransactions) && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">
              {loadingTransactions
                ? "Loading transaction data..."
                : "Analyzing round tripping patterns..."}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {loadingTransactions
                ? `Fetching ${amlMetadata.transactionCount.toLocaleString()} transactions efficiently`
                : `Processing ${transactions.length} transactions via backend API`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
