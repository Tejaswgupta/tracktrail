"use client";

import { useCounterpartyAnalysis } from "@/hooks/useCounterpartyAnalysis";
import { Transaction } from "@/types/database";
import React from "react";

interface CounterpartyAnalysisProps {
  transactions: Transaction[];
  onStandardizedTransactions?: (transactions: Transaction[]) => void;
}

export function CounterpartyAnalysis({
  transactions,
  onStandardizedTransactions,
}: CounterpartyAnalysisProps) {
  const {
    analysisResult,
    isAnalyzing,
    error,
    analyzeTransactions,
    applyStandardization,
    setBankPreset,
    clearAnalysis,
    findSimilarCounterparties,
    bankPreset,
    availablePresets,
    extractionRate,
    totalClusters,
    totalMappings,
  } = useCounterpartyAnalysis({
    autoRecommendPreset: true,
  });

  const [useAdvanced, setUseAdvanced] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    Array<{ name: string; score: number }>
  >([]);

  const handleAnalyze = async () => {
    await analyzeTransactions(transactions, useAdvanced);
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim()) {
      const results = findSimilarCounterparties(query, transactions, 5);
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }
  };

  const handleApplyStandardization = () => {
    const standardized = applyStandardization(transactions);
    onStandardizedTransactions?.(standardized);
  };

  return (
    <div className="space-y-6 p-6 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">
          Counterparty Analysis
        </h2>
        {analysisResult && (
          <button
            onClick={clearAnalysis}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Clear Analysis
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="bank-preset-select" className="block text-sm font-medium text-gray-700">
          Bank Preset
        </label>
        <select
          id="bank-preset-select"
          value={bankPreset}
          onChange={(e) => setBankPreset(e.target.value)}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          disabled={isAnalyzing}
          aria-label="Select bank preset for transaction format matching"
        >
          {availablePresets.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500">
          Select the bank preset that matches your transaction format for better
          extraction accuracy.
        </p>
      </div>

      <div className="flex items-center space-x-2">
        <input
          type="checkbox"
          id="useAdvanced"
          checked={useAdvanced}
          onChange={(e) => setUseAdvanced(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="useAdvanced" className="text-sm text-gray-700">
          Use advanced analysis (slower but more accurate)
        </label>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleAnalyze}
          disabled={isAnalyzing || transactions.length === 0}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? "Analyzing..." : "Analyze Counterparties"}
        </button>

        {analysisResult && (
          <button
            onClick={handleApplyStandardization}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Apply Standardization
          </button>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="counterparty-search" className="block text-sm font-medium text-gray-700">
          Search Counterparties
        </label>
        <input
          id="counterparty-search"
          type="text"
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Type to search for similar counterparty names..."
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
        {searchResults.length > 0 && (
          <div className="mt-2 bg-gray-50 rounded-md p-3">
            <div className="text-sm font-medium text-gray-700 mb-2">
              Similar counterparties:
            </div>
            <div className="space-y-1">
              {searchResults.map((result, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center text-sm"
                >
                  <span className="text-gray-900">{result.name}</span>
                  <span className="text-blue-600 font-medium">
                    {result.score}% match
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {analysisResult && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">
                {extractionRate.toFixed(1)}%
              </div>
              <div className="text-sm text-blue-800">Extraction Rate</div>
              <div className="text-xs text-blue-600">
                {analysisResult.extractionStats.extractedCounterparties} of{" "}
                {analysisResult.extractionStats.totalTransactions} transactions
              </div>
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">
                {totalClusters}
              </div>
              <div className="text-sm text-green-800">Clusters Found</div>
              <div className="text-xs text-green-600">
                Similar counterparty groups
              </div>
            </div>

            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {totalMappings}
              </div>
              <div className="text-sm text-purple-800">Name Mappings</div>
              <div className="text-xs text-purple-600">
                Standardization rules created
              </div>
            </div>
          </div>

          {analysisResult.standardization.clusters.length > 0 && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-3">
                Counterparty Clusters
              </h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {analysisResult.standardization.clusters.map(
                  (cluster, index) => (
                    <div
                      key={index}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-gray-900">
                          {cluster.representative}
                        </div>
                        <div className="flex gap-2 text-xs">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                            {cluster.totalCount} transactions
                          </span>
                          <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                            {cluster.confidence}% confidence
                          </span>
                        </div>
                      </div>

                      {cluster.aliases.length > 0 && (
                        <div>
                          <div className="text-sm text-gray-600 mb-1">
                            Similar names:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {cluster.aliases.map((alias, aliasIndex) => (
                              <span
                                key={aliasIndex}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                              >
                                {alias}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
