"use client";

import { entitiesService } from "@/services/database";
import type {
  EntityStandardizationGroup,
  EntityStandardizationMatch,
  EntityStandardizationResult,
} from "@/services/entityStandardizer";
import { EntityStandardizer } from "@/services/entityStandardizer";
import type { Entity } from "@/types/database";
import { useEffect, useState } from "react";

interface EntityStandardizationTabProps {
  caseId: string;
}

export default function EntityStandardizationTab({
  caseId,
}: EntityStandardizationTabProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<EntityStandardizationResult | null>(
    null
  );
  const [knownEntities, setKnownEntities] = useState<Entity[]>([]);
  const [selectedStandardizations, setSelectedStandardizations] = useState<
    Map<string, EntityStandardizationMatch>
  >(new Map());
  const [similarityThreshold, setSimilarityThreshold] = useState(75);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStandardizationData();
  }, [caseId, similarityThreshold]);

  const loadStandardizationData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all entities in the system
      const allEntities = await entitiesService.getAll();
      setKnownEntities(allEntities);

      if (allEntities.length === 0) {
        setResult({
          groups: [],
          totalCounterparties: 0,
          standardizedCounterparties: 0,
          unstandardizedCounterparties: 0,
          completeness: 0,
        });
        return;
      }

      // Find standardization opportunities
      const standardizer = new EntityStandardizer(similarityThreshold);
      const standardizationResult =
        await standardizer.findStandardizationOpportunities(
          caseId,
          allEntities
        );
      setResult(standardizationResult);
    } catch (err) {
      console.error("Error loading standardization data:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Failed to load standardization data"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectStandardization = (
    counterpartyName: string,
    match: EntityStandardizationMatch
  ) => {
    const newSelections = new Map(selectedStandardizations);
    newSelections.set(counterpartyName, match);
    setSelectedStandardizations(newSelections);
  };

  const handleRemoveSelection = (counterpartyName: string) => {
    const newSelections = new Map(selectedStandardizations);
    newSelections.delete(counterpartyName);
    setSelectedStandardizations(newSelections);
  };

  const handleStandardize = async () => {
    if (selectedStandardizations.size === 0) return;

    try {
      setSaving(true);
      const standardizer = new EntityStandardizer();
      const standardizations = Array.from(
        selectedStandardizations.entries()
      ).map(([counterpartyName, match]) => ({
        caseId,
        oldCounterpartyName: counterpartyName,
        newEntityName: match.entityName,
      }));

      const result = await standardizer.batchStandardize(
        standardizations,
        "current-user"
      );

      if (result.errors.length > 0) {
        console.error("Some standardizations failed:", result.errors);
      }

      // Reload data to reflect changes
      await loadStandardizationData();
      setSelectedStandardizations(new Map());
    } catch (error) {
      console.error("Error standardizing counterparties:", error);
    } finally {
      setSaving(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 90) return "text-green-600 bg-green-50";
    if (score >= 70) return "text-yellow-600 bg-yellow-50";
    return "text-red-600 bg-red-50";
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 90) return "High";
    if (score >= 70) return "Medium";
    return "Low";
  };

  const filteredGroups =
    result?.groups.filter(
      (group) =>
        group.counterpartyName
          .toLowerCase()
          .includes(searchTerm.toLowerCase()) ||
        group.suggestedMatches.some((match) =>
          match.entityName.toLowerCase().includes(searchTerm.toLowerCase())
        )
    ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">
          Finding standardization opportunities...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <svg
            className="w-5 h-5 text-red-400 mr-2"
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
          <h3 className="text-sm font-medium text-red-800">
            Error loading standardization data
          </h3>
        </div>
        <p className="text-sm text-red-700 mt-2">{error}</p>
        <button
          onClick={loadStandardizationData}
          className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              Entity Standardization
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Standardize counterparty names to known entity names for
              consistent analysis
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {result?.completeness || 0}%
              </div>
              <div className="text-xs text-gray-500">Standardized</div>
            </div>
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-lg font-semibold text-gray-900">
                {result.totalCounterparties}
              </div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-semibold text-green-600">
                {result.standardizedCounterparties}
              </div>
              <div className="text-xs text-gray-600">Standardized</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-lg font-semibold text-red-600">
                {result.unstandardizedCounterparties}
              </div>
              <div className="text-xs text-gray-600">Needs Review</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-lg font-semibold text-blue-600">
                {selectedStandardizations.size}
              </div>
              <div className="text-xs text-gray-600">Selected</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium text-gray-700">
                Similarity Threshold:
              </label>
              <select
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
              >
                <option value={60}>60% - More matches</option>
                <option value={70}>70% - Balanced</option>
                <option value={75}>75% - Default</option>
                <option value={80}>80% - Conservative</option>
                <option value={90}>90% - Very strict</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                placeholder="Search counterparties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm w-64"
              />
            </div>
          </div>

          {selectedStandardizations.size > 0 && (
            <button
              onClick={handleStandardize}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Standardizing...
                </>
              ) : (
                <>
                  Standardize {selectedStandardizations.size} Name
                  {selectedStandardizations.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {filteredGroups.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-gray-500">
              {searchTerm
                ? "No matching counterparties found."
                : "No standardization opportunities found."}
            </div>
            <p className="text-sm text-gray-400 mt-2">
              Try lowering the similarity threshold to find more potential
              matches.
            </p>
          </div>
        ) : (
          filteredGroups.map((group) => (
            <StandardizationCard
              key={group.counterpartyName}
              group={group}
              selectedMatch={selectedStandardizations.get(
                group.counterpartyName
              )}
              onSelectMatch={(match) =>
                handleSelectStandardization(group.counterpartyName, match)
              }
              onRemoveSelection={() =>
                handleRemoveSelection(group.counterpartyName)
              }
              getConfidenceColor={getConfidenceColor}
              getConfidenceBadge={getConfidenceBadge}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface StandardizationCardProps {
  group: EntityStandardizationGroup;
  selectedMatch?: EntityStandardizationMatch;
  onSelectMatch: (match: EntityStandardizationMatch) => void;
  onRemoveSelection: () => void;
  getConfidenceColor: (score: number) => string;
  getConfidenceBadge: (score: number) => string;
}

function StandardizationCard({
  group,
  selectedMatch,
  onSelectMatch,
  onRemoveSelection,
  getConfidenceColor,
  getConfidenceBadge,
}: StandardizationCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow border">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h3 className="font-medium text-gray-900">
                {group.counterpartyName}
              </h3>
              {group.isStandardized && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Already Standardized
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
              <span>{group.transactionCount} transactions</span>
              <span>₹{group.totalAmount.toLocaleString("en-IN")}</span>
              <span>{group.suggestedMatches.length} potential matches</span>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <svg
              className={`w-5 h-5 transform transition-transform ${
                expanded ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
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

        {expanded && (
          <div className="mt-4 space-y-3">
            {group.isStandardized ? (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-sm text-green-700">
                  This counterparty has already been standardized.
                  {group.standardizedAt && (
                    <span className="block mt-1">
                      Standardized on{" "}
                      {new Date(group.standardizedAt).toLocaleDateString()}
                      {group.standardizedBy && ` by ${group.standardizedBy}`}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {group.suggestedMatches.map((match, index) => (
                  <div
                    key={`${match.entityId}-${index}`}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedMatch?.entityId === match.entityId
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                    onClick={() => onSelectMatch(match)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <input
                            type="radio"
                            checked={selectedMatch?.entityId === match.entityId}
                            onChange={() => onSelectMatch(match)}
                            className="text-blue-600"
                          />
                          <div>
                            <div className="font-medium text-gray-900">
                              {match.entityName}
                              <span className="ml-2 text-sm text-gray-500">
                                → Will replace "{match.counterpartyName}"
                              </span>
                            </div>
                            <div className="text-sm text-gray-600">
                              {match.entityType}
                              {match.pan && ` • PAN: ${match.pan}`}
                              {match.gstin && ` • GSTIN: ${match.gstin}`}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(
                            match.confidenceScore
                          )}`}
                        >
                          {match.confidenceScore}%
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {match.matchMethod}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {selectedMatch && (
                  <div className="flex justify-end">
                    <button
                      onClick={onRemoveSelection}
                      className="text-sm text-red-600 hover:text-red-800"
                    >
                      Clear Selection
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
