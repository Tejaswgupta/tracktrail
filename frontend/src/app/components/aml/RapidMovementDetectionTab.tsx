"use client";

/**
 * Rapid Movement Detection Tab Component
 *
 * This component provides a user interface for configuring and running rapid movement detection
 * analysis. It uses the backend /api/v1/analyze/rapid-movements endpoint through the
 * amlDetectionService to perform server-side analysis with proper error handling and loading states.
 */

import {
  amlDetectionService,
  type RapidMovementConfig,
  type RapidMovementResult,
} from "@/services/amlDetection";

import { useState } from "react";

interface AMLMetadata {
  entityIds: string[];
  dateRange: { from: string; to: string };
  transactionCount: number;
  totalVolume: number;
}

interface RapidMovementDetectionTabProps {
  selectedEntityIds: string[];
}

export default function RapidMovementDetectionTab({
  selectedEntityIds,
}: RapidMovementDetectionTabProps) {
  const [config, setConfig] = useState<RapidMovementConfig>({
    percentageThreshold: 10,
    timeWindowHours: 24,
    amountMatchTolerance: 5,
    minAmount: 10000,
  });

  const [results, setResults] = useState<RapidMovementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [selectedPattern, setSelectedPattern] = useState<
    RapidMovementResult["patterns"][0] | null
  >(null);

  const runDetection = async (isRetry = false) => {
    if (selectedEntityIds.length === 0) {
      setError("Please select at least one entity to analyze.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await amlDetectionService.detectRapidMovement(
        selectedEntityIds,
        config
      );
      console.log(`Result`, results);
      setResults(result);
      setRetryCount(0); // Reset retry count on success
    } catch (error) {
      console.error("Error running rapid movement detection:", error);

      // Set user-friendly error message
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to analyze rapid movements. Please check your connection and try again.";
      setError(errorMessage);

      // Set empty results on error to maintain UI consistency
      setResults({
        alerts: [],
        patterns: [],
        summary: {
          totalPatterns: 0,
          maxVelocity: 0,
          totalAmount: 0,
        },
      });

      if (!isRetry) {
        setRetryCount((prev) => prev + 1);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = () => {
    runDetection(true);
  };

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
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Rapid Movement Detection Configuration
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Configure thresholds to detect suspicious rapid money movements
              and layering patterns. Analysis is performed using backend AI
              algorithms.
            </p>
          </div>
          <button
            onClick={() => runDetection()}
            disabled={loading || selectedEntityIds.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
          >
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
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Run Detection
            </>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Window (Hours)
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="number"
                value={config.timeWindowHours}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    timeWindowHours: Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="24"
                min="1"
                max="168"
              />
              <p className="text-xs text-gray-500 mt-1">
                Time window to detect rapid money movements (1-168 hours)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Amount Match Tolerance (%)
                <span className="text-red-500 ml-1">*</span>
              </label>
              <input
                type="number"
                value={config.amountMatchTolerance}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    amountMatchTolerance: Number(e.target.value),
                  }))
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="5"
                min="0"
                max="50"
                step="0.1"
              />
              <p className="text-xs text-gray-500 mt-1">
                Tolerance for matching credit/debit amounts (0-50%)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Amount (Optional)
              </label>
              <input
                type="number"
                value={config.minAmount || ""}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    minAmount: e.target.value
                      ? Number(e.target.value)
                      : undefined,
                  }))
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="100000"
                min="0"
              />
              <p className="text-xs text-gray-500 mt-1">
                Only consider transactions above this amount
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
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
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-red-800">
                Analysis Failed
              </h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <div className="mt-3">
                <button
                  onClick={handleRetry}
                  disabled={loading}
                  className="text-sm bg-red-100 text-red-800 px-3 py-1 rounded-md hover:bg-red-200 disabled:opacity-50"
                >
                  {loading ? "Retrying..." : "Try Again"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Summary */}
      {results && !error && (
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
                      d="M13 10V3L4 14h7v7l9-11h-7z"
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

      {/* Rapid Movements Table */}
      {results && !error && results.alerts.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Rapid Movement Patterns ({results.alerts.length})
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Detected rapid money movements with matching in/out transactions
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    In Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    In Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    In Counterparty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Out Date
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Out Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Out Counterparty
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    % Difference
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Time Gap (Hours)
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Risk Score
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.alerts
                  .sort((a, b) => b.score - a.score)
                  .map((alert, index) => {
                    // Use raw movement data from metadata with fallbacks
                    const metadata = alert.metadata || {};
                    const amountDifference = metadata.amountDifference || 0;
                    const timeGap = metadata.timeSpan || 0;

                    // Helper function to safely format dates
                    const formatDate = (dateValue: any) => {
                      if (!dateValue) return "Invalid Date";
                      try {
                        const date = new Date(dateValue);
                        return isNaN(date.getTime())
                          ? "Invalid Date"
                          : date.toLocaleDateString();
                      } catch {
                        return "Invalid Date";
                      }
                    };

                    // Helper function to safely format amounts
                    const formatAmount = (amount: any) => {
                      const numAmount = Number(amount);
                      return isNaN(numAmount)
                        ? "₹NaN"
                        : formatCurrency(numAmount);
                    };

                    return (
                      <tr key={alert.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatDate(metadata.inDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {formatAmount(metadata.inAmount)}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate"
                          title={
                            metadata.inCounterparty ||
                            metadata.inDescription ||
                            "Unknown"
                          }
                        >
                          {metadata.inCounterparty ||
                            metadata.inDescription ||
                            "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {formatDate(metadata.outDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                          {formatAmount(metadata.outAmount)}
                        </td>
                        <td
                          className="px-4 py-3 text-sm text-gray-900 max-w-xs truncate"
                          title={
                            metadata.outCounterparty ||
                            metadata.outDescription ||
                            "Unknown"
                          }
                        >
                          {metadata.outCounterparty ||
                            metadata.outDescription ||
                            "Unknown"}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              Math.abs(amountDifference) < 2
                                ? "bg-red-100 text-red-800"
                                : Math.abs(amountDifference) < 5
                                ? "bg-orange-100 text-orange-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {isNaN(amountDifference)
                              ? "NaN"
                              : amountDifference.toFixed(1)}
                            %
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              timeGap <= 6
                                ? "bg-red-100 text-red-800"
                                : timeGap <= 24
                                ? "bg-orange-100 text-orange-800"
                                : "bg-yellow-100 text-yellow-800"
                            }`}
                          >
                            {isNaN(timeGap) ? "NaN" : timeGap.toFixed(1)}h
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSeverityColor(
                              alert.score
                            )}`}
                          >
                            {isNaN(alert.score)
                              ? "NaN"
                              : (alert.score * 100).toFixed(0)}
                            %
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
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
                  Rapid Movement Pattern - {selectedPattern.entity}
                </h3>
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
                  <p className="text-sm text-gray-600">Velocity</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(selectedPattern.velocity)}/hr
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
                  Transaction Timeline
                </h4>
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Time
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
                                {transaction.direction}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-xs text-gray-900">
                              {transaction.counterparty_merged ||
                                transaction.description ||
                                "Unknown"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-orange-50 p-4 rounded-md">
                <h4 className="text-sm font-medium text-orange-800 mb-2">
                  Velocity Analysis
                </h4>
                <div className="text-sm text-orange-700">
                  <p>
                    This pattern shows {selectedPattern.transactions.length}{" "}
                    transactions totaling{" "}
                    <strong>
                      {formatCurrency(selectedPattern.totalAmount)}
                    </strong>{" "}
                    processed within{" "}
                    <strong>{selectedPattern.timeSpan.toFixed(1)} hours</strong>
                    .
                  </p>
                  <p className="mt-1">
                    The calculated velocity of{" "}
                    <strong>
                      {formatCurrency(selectedPattern.velocity)}/hour
                    </strong>{" "}
                    is classified as risk.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {results && !error && results.patterns.length === 0 && (
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
            No Rapid Movement Patterns Detected
          </h3>
          <p className="text-gray-500">
            Based on the current configuration, no suspicious rapid movement
            patterns were found in the transaction data.
          </p>
        </div>
      )}
    </div>
  );
}
