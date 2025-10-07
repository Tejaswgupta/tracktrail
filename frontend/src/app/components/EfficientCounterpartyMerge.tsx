"use client";

import { useAuth } from "@/contexts/AuthContext";
import { counterpartyService, entitiesService, transactionsService } from "@/services/database";
import { useCallback, useEffect, useState } from "react";
import { useFrontendCounterpartyMerge } from "@/hooks/useFrontendCounterpartyMerge";

interface Entity {
  entity_id: string;
  entity_name: string;
  entity_type: string;
}

interface CounterpartyMergeCandidate {
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
  entity_ids?: string[]; // Added for cross-entity merges
}

interface EfficientCounterpartyMergeProps {
  caseId: string;
}

export default function EfficientCounterpartyMerge({
  caseId,
}: EfficientCounterpartyMergeProps) {
  const { user } = useAuth();
  const [candidates, setCandidates] = useState<CounterpartyMergeCandidate[]>(
    []
  );
  const [selectedMerges, setSelectedMerges] = useState<Set<string>>(new Set());
  const [selectedNames, setSelectedNames] = useState<Map<string, Set<string>>>(
    new Map()
  );
  const [similarityThreshold, setSimilarityThreshold] = useState(80);
  const [minTransactionCount, setMinTransactionCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [availableEntities, setAvailableEntities] = useState<Entity[]>([]);
  const [selectedEntities, setSelectedEntities] = useState<string[]>([]); // For cross-entity selection
  const [showEntitySelector, setShowEntitySelector] = useState(false); // Toggle for entity selection

  const {
    counterparties,
    candidates: frontendCandidates,
    loading: frontendLoading,
    error: frontendError,
    findMergeCandidates,
    refresh
  } = useFrontendCounterpartyMerge(caseId);

  // Enhanced version that reloads counterparties with entity filter when needed
  const loadCandidates = useCallback(() => {
    try {
      setLoading(true);
      setError(null);

      // If specific entities are selected, we need to refresh the counterparties with the entity filter
      if (selectedEntities.length > 0) {
        refresh(selectedEntities);
      }

      // Use frontend implementation instead of backend RPC
      const data = findMergeCandidates(
        similarityThreshold / 100, // Convert percentage to decimal
        100 // Limit to top 100 candidates
      );

      setCandidates(data);
    } catch (err) {
      console.error("Failed to load merge candidates:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load candidates"
      );
    } finally {
      setLoading(false);
    }
  }, [selectedEntities, similarityThreshold, findMergeCandidates, refresh]);

  // Load entities for cross-entity selection
  const loadEntities = useCallback(async () => {
    try {
      const entities = await entitiesService.getByCaseId(caseId);
      setAvailableEntities(entities.map(e => ({ 
        entity_id: e.entity_id, 
        entity_name: e.entity_name,
        entity_type: e.entity_type 
      })))
    } catch (err) {
      console.error("Failed to load entities:", err);
    }
  }, [caseId]);

  const handleThresholdChange = useCallback(
    (newThreshold: number) => {
      setSimilarityThreshold(newThreshold);
      setCurrentPage(1);
      // Debounce the API call
      const timeoutId = setTimeout(() => {
        loadCandidates();
      }, 500);
      // Clear the timeout on subsequent calls to avoid multiple API calls
      return () => clearTimeout(timeoutId);
    },
    [loadCandidates]
  );

  const toggleMergeSelection = useCallback(
    (representative: string) => {
      setSelectedMerges((prev) => {
        const newSelected = new Set(prev);
        if (newSelected.has(representative)) {
          newSelected.delete(representative);
          // Also remove from selectedNames when deselecting the group
          setSelectedNames((prevNames) => {
            const newNames = new Map(prevNames);
            newNames.delete(representative);
            return newNames;
          });
        } else {
          newSelected.add(representative);
          // Auto-select all names when selecting the group
          const candidate = candidates.find(
            (c) => c.representative === representative
          );
          if (candidate) {
            setSelectedNames((prevNames) => {
              const newNames = new Map(prevNames);
              newNames.set(representative, new Set(candidate.similar_names));
              return newNames;
            });
          }
        }
        return newSelected;
      });
    },
    [candidates]
  );

  const toggleNameSelection = useCallback(
    (representative: string, name: string) => {
      setSelectedNames((prev) => {
        const newNames = new Map(prev);
        const currentNames = newNames.get(representative) || new Set();
        const updatedNames = new Set(currentNames);

        if (updatedNames.has(name)) {
          updatedNames.delete(name);
        } else {
          updatedNames.add(name);
        }

        if (updatedNames.size === 0) {
          newNames.delete(representative);
          // Also deselect the group if no names are selected
          setSelectedMerges((prevMerges) => {
            const newMerges = new Set(prevMerges);
            newMerges.delete(representative);
            return newMerges;
          });
        } else {
          newNames.set(representative, updatedNames);
          // Ensure the group is selected if names are selected
          setSelectedMerges((prevMerges) => {
            const newMerges = new Set(prevMerges);
            newMerges.add(representative);
            return newMerges;
          });
        }

        return newNames;
      });
    },
    []
  );

  const selectAllVisible = useCallback(() => {
    const visibleCandidates = filteredCandidates.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );

    setSelectedMerges((prev) => {
      const newSelected = new Set(prev);
      visibleCandidates.forEach((candidate) => {
        newSelected.add(candidate.representative);
      });
      return newSelected;
    });
  }, [candidates, currentPage, itemsPerPage, searchTerm]);

  const clearSelection = useCallback(() => {
    setSelectedMerges(new Set());
    setSelectedNames(new Map());
  }, []);

  const applyMerges = useCallback(async () => {
    if (!user?.id || selectedMerges.size === 0) {
      setError("No merges selected or user not authenticated");
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      const mergeOperations: Array<{ from: string; to: string }> = [];

      // Build merge operations from selected candidates and names
      candidates.forEach((candidate) => {
        if (selectedMerges.has(candidate.representative)) {
          const selectedNamesForGroup = selectedNames.get(
            candidate.representative
          );
          if (selectedNamesForGroup && selectedNamesForGroup.size > 0) {
            selectedNamesForGroup.forEach((similarName) => {
              mergeOperations.push({
                from: similarName,
                to: candidate.representative,
              });
            });
          }
        }
      });

      if (mergeOperations.length === 0) {
        setError("No merge operations to perform");
        return;
      }

      // Apply merges using the existing service
      const result = await counterpartyService.batchMergeCounterparties(
        mergeOperations,
        user.id
      );

      if (result.errors.length > 0) {
        setError(`Some merges failed: ${result.errors.join(", ")}`);
      }

      if (result.totalAffected > 0) {
        setSuccessMessage(
          `Successfully merged ${mergeOperations.length} counterparty names affecting ${result.totalAffected} transactions`
        );

        // Reload candidates after successful merge
        setTimeout(() => {
          loadCandidates();
          setSelectedMerges(new Set());
          setSelectedNames(new Map());
        }, 2000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply merges");
    } finally {
      setProcessing(false);
    }
  }, [selectedMerges, candidates, user?.id, loadCandidates]);

  // Toggle entity selection for cross-entity merges
  const toggleEntitySelection = (entityId: string) => {
    setSelectedEntities(prev => {
      if (prev.includes(entityId)) {
        return prev.filter(id => id !== entityId);
      } else {
        return [...prev, entityId];
      }
    });
  };

  // Filter candidates based on search term and transaction count
  const filteredCandidates = candidates.filter((candidate) => {
    // Filter by transaction count
    if (candidate.total_transactions < minTransactionCount) return false;

    // Filter by search term
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      candidate.representative.toLowerCase().includes(searchLower) ||
      candidate.similar_names.some((name) =>
        name.toLowerCase().includes(searchLower)
      )
    );
  });

  // Pagination
  const totalPages = Math.ceil(filteredCandidates.length / itemsPerPage);
  const paginatedCandidates = filteredCandidates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate totals for selected merges
  const selectedStats = candidates
    .filter((candidate) => selectedMerges.has(candidate.representative))
    .reduce(
      (acc, candidate) => {
        const selectedNamesForGroup = selectedNames.get(
          candidate.representative
        );
        const selectedCount = selectedNamesForGroup
          ? selectedNamesForGroup.size
          : 0;
        return {
          totalMerges: acc.totalMerges + selectedCount,
          totalTransactions:
            acc.totalTransactions + candidate.total_transactions,
        };
      },
      { totalMerges: 0, totalTransactions: 0 }
    );

  // Update when entity selection changes
  useEffect(() => {
    loadCandidates();
  }, [selectedEntities, loadCandidates]);

  useEffect(() => {
    if (!frontendLoading && counterparties.length > 0) {
      loadCandidates();
    }
  }, [frontendLoading, counterparties]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analyzing counterparties...</p>
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
              Efficient Counterparty Merge
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Database-powered counterparty analysis with intelligent similarity
              matching
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Merge Candidates</div>
            <div className="text-2xl font-bold text-gray-900">
              {candidates.length}
            </div>
          </div>
        </div>

        {/* Entity selection section for cross-entity merges */}
        <div className="mb-4 p-4 bg-blue-50 rounded-md">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-gray-800">Entity Selection</h3>
            <button 
              onClick={() => setShowEntitySelector(!showEntitySelector)}
              className="text-sm bg-blue-600 text-white px-3 py-1 rounded-md hover:bg-blue-700"
            >
              {showEntitySelector ? "Hide" : "Show"} Entity Selector
            </button>
          </div>
          
          {showEntitySelector && (
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-2">Select entities to merge from:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 border rounded-md">
                {availableEntities.map(entity => (
                  <div key={entity.entity_id} className="flex items-center">
                    <input
                      type="checkbox"
                      id={`entity-${entity.entity_id}`}
                      checked={selectedEntities.includes(entity.entity_id)}
                      onChange={() => toggleEntitySelection(entity.entity_id)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <label htmlFor={`entity-${entity.entity_id}`} className="ml-2 text-sm text-gray-700">
                      {entity.entity_name} ({entity.entity_type})
                    </label>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-sm text-gray-600">
                {selectedEntities.length > 0 
                  ? `${selectedEntities.length} entity${selectedEntities.length > 1 ? 'ies' : ''} selected for cross-entity analysis`
                  : 'Select entities to enable cross-entity merge analysis'}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Similarity Threshold
            </label>
            <input
              type="range"
              min="70"
              max="95"
              value={similarityThreshold}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="w-full"
              disabled={loading}
            />
            <div className="text-sm text-gray-500 mt-1">
              {similarityThreshold}%
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Min Transactions
            </label>
            <input
              type="number"
              min="1"
              value={minTransactionCount}
              onChange={(e) => {
                setMinTransactionCount(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search names..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={selectAllVisible}
              disabled={paginatedCandidates.length === 0}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Select Page
            </button>
          </div>

          <div className="flex items-end">
            <button
              onClick={clearSelection}
              disabled={selectedMerges.size === 0}
              className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              Clear All
            </button>
          </div>

          <div className="flex items-end">
            <button
              onClick={applyMerges}
              disabled={processing || selectedMerges.size === 0}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processing
                ? "Processing..."
                : `Merge (${selectedStats.totalMerges})`}
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
                onClick={() => setError(null)}
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
            {candidates.length}
          </div>
          <div className="text-sm text-gray-600">Merge Groups Found</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {selectedMerges.size}
          </div>
          <div className="text-sm text-gray-600">Groups Selected</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {selectedStats.totalMerges}
          </div>
          <div className="text-sm text-gray-600">Names to Merge</div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-2xl font-bold text-gray-900">
            {selectedStats.totalTransactions}
          </div>
          <div className="text-sm text-gray-600">Transactions Affected</div>
        </div>
      </div>

      {/* Candidates List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Merge Candidates
            </h3>
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} ({filteredCandidates.length}{" "}
              total)
            </div>
          </div>
        </div>

        {paginatedCandidates.length === 0 ? (
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
        ) : (
          <div className="divide-y divide-gray-200">
            {paginatedCandidates.map((candidate) => (
              <MergeCandidateCard
                key={candidate.representative}
                candidate={candidate}
                selected={selectedMerges.has(candidate.representative)}
                selectedNames={
                  selectedNames.get(candidate.representative) || new Set()
                }
                onToggle={() => toggleMergeSelection(candidate.representative)}
                onToggleName={(name) =>
                  toggleNameSelection(candidate.representative, name)
                }
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() =>
                  setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                }
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{" "}
                  <span className="font-medium">
                    {(currentPage - 1) * itemsPerPage + 1}
                  </span>{" "}
                  to{" "}
                  <span className="font-medium">
                    {Math.min(
                      currentPage * itemsPerPage,
                      filteredCandidates.length
                    )}
                  </span>{" "}
                  of{" "}
                  <span className="font-medium">
                    {filteredCandidates.length}
                  </span>{" "}
                  results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(prev - 1, 1))
                    }
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === pageNum
                            ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                            : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(prev + 1, totalPages))
                    }
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface MergeCandidateCardProps {
  candidate: CounterpartyMergeCandidate;
  selected: boolean;
  selectedNames: Set<string>;
  onToggle: () => void;
  onToggleName: (name: string) => void;
}

function MergeCandidateCard({
  candidate,
  selected,
  selectedNames,
  onToggle,
  onToggleName,
}: MergeCandidateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const avgSimilarity =
    candidate.similarity_scores.reduce((a, b) => a + b, 0) /
    candidate.similarity_scores.length;

  return (
    <div
      className={`p-6 transition-colors ${
        selected ? "bg-blue-50 border-l-4 border-blue-500" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              {candidate.representative}
            </h3>
            <p className="text-sm text-gray-600">
              {candidate.similar_names.length} similar names •{" "}
              {candidate.total_transactions} transactions
              {selected && selectedNames.size > 0 && (
                <span className="ml-2 text-blue-600 font-medium">
                  ({selectedNames.size} selected for merge)
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full ${
              avgSimilarity >= 90
                ? "bg-green-100 text-green-800"
                : avgSimilarity >= 80
                ? "bg-yellow-100 text-yellow-800"
                : "bg-red-100 text-red-800"
            }`}
          >
            {Math.round(avgSimilarity * 100)}% avg
          </span>
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
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">
              Similar Names to Merge:
            </h4>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  candidate.similar_names.forEach((name) => {
                    if (!selectedNames.has(name)) {
                      onToggleName(name);
                    }
                  });
                }}
                className="text-xs text-blue-600 hover:text-blue-800 underline"
                disabled={selectedNames.size === candidate.similar_names.length}
              >
                Select All
              </button>
              <button
                onClick={() => {
                  candidate.similar_names.forEach((name) => {
                    if (selectedNames.has(name)) {
                      onToggleName(name);
                    }
                  });
                }}
                className="text-xs text-gray-600 hover:text-gray-800 underline"
                disabled={selectedNames.size === 0}
              >
                Clear All
              </button>
            </div>
          </div>
          <div className="space-y-2">
            {candidate.similar_names.map((name, index) => (
              <div
                key={index}
                className={`flex items-center justify-between p-2 rounded transition-colors ${
                  selectedNames.has(name)
                    ? "bg-blue-50 border border-blue-200"
                    : "bg-gray-50 hover:bg-gray-100"
                }`}
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedNames.has(name)}
                    onChange={() => onToggleName(name)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">{name}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-gray-500">
                    {Math.round(candidate.similarity_scores[index] * 100)}%
                    match
                  </span>
                  <span className="text-xs text-gray-400">
                    → {candidate.representative}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
