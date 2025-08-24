"use client";

import { useCounterpartyMerge } from "@/hooks/useCounterpartyMerge";
import { Transaction } from "@/types/database";
import { createClient } from "@/utils/supabase/client";
import { useCallback, useEffect, useState } from "react";

const supabase = createClient();

interface CaseCounterpartyMergeProps {
  caseId: string;
}

export default function CaseCounterpartyMerge({
  caseId,
}: CaseCounterpartyMergeProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [similarityThreshold, setSimilarityThreshold] = useState(85);
  const [searchTerm, setSearchTerm] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);

  const {
    loading,
    processing,
    error,
    successMessage,
    groups,
    selectedGroups,
    selectedAliases,
    loadAndAnalyze,
    toggleGroupSelection,
    toggleAliasSelection,
    selectAllGroups,
    clearSelection,
    applyMerges,
    clearMessages,
    totalMergeCount,
    totalTransactionImpact,
  } = useCounterpartyMerge();

  // Load transactions for entities in this case
  const loadCaseTransactions = useCallback(async () => {
    try {
      setInitialLoading(true);
      clearMessages();

      // Get transactions for all entities in this case
      const { data, error } = await supabase
        .from("transactions")
        .select(
          `
          *,
          accounts!inner (
            entity_id,
            entities!inner (
              case_entities!inner (
                case_id
              )
            )
          )
        `
        )
        .eq("accounts.entities.case_entities.case_id", caseId)
        // .is("counterparty_merged", "is", null)
        .order("tx_date", { ascending: false });

      if (error) throw error;

      const txData = data || [];
      setTransactions(txData);

      // Automatically analyze after loading
      if (txData.length > 0) {
        await loadAndAnalyze(txData, similarityThreshold);
      }
    } catch (err) {
      console.error("Failed to load case transactions:", err);
    } finally {
      setInitialLoading(false);
    }
  }, [caseId, loadAndAnalyze, similarityThreshold, clearMessages]);

  // Re-analyze when threshold changes
  const handleThresholdChange = useCallback(
    async (newThreshold: number) => {
      setSimilarityThreshold(newThreshold);
      if (transactions.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        await loadAndAnalyze(transactions, newThreshold);
      }
    },
    [transactions, loadAndAnalyze]
  );

  // Handle successful merge - reload data
  const handleMergeSuccess = useCallback(async () => {
    await loadCaseTransactions();
  }, [loadCaseTransactions]);

  // Filter groups based on search
  const filteredGroups = groups.filter((group) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      group.representative.toLowerCase().includes(searchLower) ||
      group.aliases.some((alias) => alias.toLowerCase().includes(searchLower))
    );
  });

  useEffect(() => {
    loadCaseTransactions();
  }, [loadCaseTransactions]);

  // Auto-reload after successful merge
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        handleMergeSuccess();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [successMessage, handleMergeSuccess]);

  if (initialLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading case transactions...</p>
        </div>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            No transactions found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            This case doesn't have any transactions with counterparty data yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              Counterparty Merge
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Identify and merge similar counterparty names for this case to
              standardize transaction data
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Case Transactions</div>
            <div className="text-2xl font-bold text-gray-900">
              {transactions.length}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Similarity Threshold
            </label>
            <input
              type="range"
              min="70"
              max="95"
              value={similarityThreshold}
              onChange={(e) => {
                return handleThresholdChange(Number(e.target.value));
              }}
              className="w-full"
              disabled={loading}
            />
            <div className="text-sm text-gray-500 mt-1">
              {similarityThreshold}%
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Groups
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search counterparty names..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={
                selectedGroups.size === groups.length &&
                selectedAliases.size === 0
                  ? clearSelection
                  : selectAllGroups
              }
              disabled={groups.length === 0}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {selectedGroups.size === groups.length &&
              selectedAliases.size === 0
                ? "Clear All"
                : "Select All Groups"}
            </button>
          </div>

          <div className="flex items-end">
            <button
              onClick={applyMerges}
              disabled={
                processing ||
                (selectedGroups.size === 0 && selectedAliases.size === 0)
              }
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing
                ? "Processing..."
                : `Merge Selected (${totalMergeCount} names)`}
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
              <button
                onClick={clearMessages}
                className="text-sm text-red-600 underline mt-1"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-green-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-green-800">{successMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {groups.length}
          </div>
          <div className="text-sm text-gray-600">Merge Groups Found</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {selectedGroups.size + selectedAliases.size}
          </div>
          <div className="text-sm text-gray-600">
            {selectedGroups.size > 0 && selectedAliases.size > 0
              ? "Groups + Individual"
              : selectedGroups.size > 0
              ? "Groups Selected"
              : "Individual Selected"}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {totalMergeCount}
          </div>
          <div className="text-sm text-gray-600">Names to Merge</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {totalTransactionImpact}
          </div>
          <div className="text-sm text-gray-600">Transactions Affected</div>
        </div>
      </div>

      {/* Groups List */}
      <div className="space-y-4">
        {loading && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Analyzing counterparties...</p>
            </div>
          </div>
        )}

        {!loading && filteredGroups.length === 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-center py-8">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">
                No merge candidates found
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting the similarity threshold to find more matches.
              </p>
            </div>
          </div>
        )}

        {filteredGroups.map((group) => (
          <CounterpartyGroupCard
            key={group.representative}
            group={group}
            selected={selectedGroups.has(group.representative)}
            onToggle={() => toggleGroupSelection(group.representative)}
            selectedAliases={
              selectedAliases.get(group.representative) || new Set()
            }
            onAliasToggle={(alias) =>
              toggleAliasSelection(group.representative, alias)
            }
          />
        ))}
      </div>
    </div>
  );
}

interface CounterpartyGroupCardProps {
  group: {
    representative: string;
    aliases: string[];
    totalCount: number;
    confidence: number;
    transactions: Transaction[];
  };
  selected: boolean;
  onToggle: () => void;
  selectedAliases: Set<string>;
  onAliasToggle: (alias: string) => void;
}

function CounterpartyGroupCard({
  group,
  selected,
  onToggle,
  selectedAliases,
  onAliasToggle,
}: CounterpartyGroupCardProps) {
  const [expanded, setExpanded] = useState(false);

  // Calculate how many aliases are selected
  const selectedAliasCount = selectedAliases.size;
  const totalAliases = group.aliases.length;

  // Determine if this is a partial selection
  const isPartialSelection =
    selectedAliasCount > 0 && selectedAliasCount < totalAliases;
  const isFullSelection = selected || selectedAliasCount === totalAliases;

  return (
    <div
      className={`bg-white rounded-lg shadow border-2 transition-colors ${
        isFullSelection
          ? "border-blue-500 bg-blue-50"
          : isPartialSelection
          ? "border-yellow-500 bg-yellow-50"
          : "border-gray-200"
      }`}
    >
      <div className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <input
              type="checkbox"
              checked={isFullSelection}
              ref={(input) => {
                if (input) input.indeterminate = isPartialSelection;
              }}
              onChange={onToggle}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <div>
              <h3 className="text-lg font-medium text-gray-900">
                {group.representative}
              </h3>
              <p className="text-sm text-gray-600">
                {selectedAliasCount > 0 && selectedAliasCount < totalAliases ? (
                  <>
                    {selectedAliasCount} of {group.aliases.length} names
                    selected • {group.totalCount} transactions •{" "}
                    {group.confidence}% confidence
                  </>
                ) : (
                  <>
                    {group.aliases.length} similar names • {group.totalCount}{" "}
                    transactions • {group.confidence}% confidence
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full ${
                group.confidence >= 90
                  ? "bg-green-100 text-green-800"
                  : group.confidence >= 80
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {group.confidence}% match
            </span>
            {isPartialSelection && (
              <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                Partial
              </span>
            )}
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className={`h-5 w-5 transform transition-transform ${
                  expanded ? "rotate-180" : ""
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-gray-900">
                    Similar Names to Merge:
                  </h4>
                  <div className="text-xs text-gray-500">
                    Select individual names to merge
                  </div>
                </div>
                <ul className="space-y-2">
                  {group.aliases.map((alias, index) => (
                    <li
                      key={index}
                      className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedAliases.has(alias)}
                        onChange={() => onAliasToggle(alias)}
                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700 flex-1">
                        {alias}
                      </span>
                      <span className="text-xs text-gray-500">
                        → {group.representative}
                      </span>
                    </li>
                  ))}
                </ul>
                {group.aliases.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => {
                        // Toggle all aliases for this group
                        const allSelected = group.aliases.every((alias) =>
                          selectedAliases.has(alias)
                        );
                        group.aliases.forEach((alias) => {
                          if (allSelected && selectedAliases.has(alias)) {
                            onAliasToggle(alias);
                          } else if (
                            !allSelected &&
                            !selectedAliases.has(alias)
                          ) {
                            onAliasToggle(alias);
                          }
                        });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {group.aliases.every((alias) =>
                        selectedAliases.has(alias)
                      )
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">
                  Recent Transactions:
                </h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {group.transactions.slice(0, 5).map((tx, index) => (
                    <div
                      key={index}
                      className="text-xs text-gray-600 flex justify-between"
                    >
                      <span className="truncate mr-2">
                        {tx.description || "No description"}
                      </span>
                      <span className="font-medium">
                        ₹{tx.amount.toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {group.transactions.length > 5 && (
                    <div className="text-xs text-gray-500">
                      +{group.transactions.length - 5} more transactions
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
