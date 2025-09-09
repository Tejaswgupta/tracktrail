"use client";

import { useEntityMapping } from "@/hooks/useEntityMapping";
import { EntityMapper } from "@/services/entityMapper";
import type { EntityMappingGroup, EntityMatch } from "@/types/entityMapping";
import { useState } from "react";

interface EntityMappingTabProps {
  caseId: string;
}

export default function EntityMappingTab({ caseId }: EntityMappingTabProps) {
  const [selectedMappings, setSelectedMappings] = useState<Map<string, EntityMatch>>(new Map());
  const [similarityThreshold, setSimilarityThreshold] = useState(75);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);

  const { loading, mappingResult, stats, error, refresh } = useEntityMapping(
    caseId,
    similarityThreshold
  );

  const handleSelectMapping = (counterpartyName: string, match: EntityMatch) => {
    const newMappings = new Map(selectedMappings);
    newMappings.set(counterpartyName, match);
    setSelectedMappings(newMappings);
  };

  const handleRemoveMapping = (counterpartyName: string) => {
    const newMappings = new Map(selectedMappings);
    newMappings.delete(counterpartyName);
    setSelectedMappings(newMappings);
  };

  const handleSaveMappings = async () => {
    if (selectedMappings.size === 0) return;

    try {
      setSaving(true);
      const mapper = new EntityMapper();
      const mappingsToSave = Array.from(selectedMappings.entries()).map(
        ([counterpartyName, match]) => ({
          caseId,
          counterpartyName,
          entityId: match.entityId,
          confidenceScore: match.confidenceScore,
        })
      );

      const result = await mapper.batchSaveMappings(mappingsToSave, "current-user");

      if (result.errors.length > 0) {
        console.error("Some mappings failed to save:", result.errors);
      }

      refresh();
      setSelectedMappings(new Map());
    } catch (error) {
      console.error("Error saving mappings:", error);
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

  const filteredMappingGroups =
    mappingResult?.mappingGroups.filter(
      (group) =>
        group.counterpartyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        group.suggestedMatches.some((match) =>
          match.entityName.toLowerCase().includes(searchTerm.toLowerCase())
        )
    ) || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Analyzing entity mappings...</span>
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
            Error loading entity mappings
          </h3>
        </div>
        <p className="text-sm text-red-700 mt-2">{error}</p>
        <button
          onClick={refresh}
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
            <h2 className="text-lg font-medium text-gray-900">Entity Mapping</h2>
            <p className="text-sm text-gray-600 mt-1">
              Map counterparty names to known entities in your system
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {stats?.mappingCompleteness || 0}%
              </div>
              <div className="text-xs text-gray-500">Complete</div>
            </div>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-lg font-semibold text-gray-900">
                {stats.totalCounterparties}
              </div>
              <div className="text-xs text-gray-600">Total</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-semibold text-green-600">
                {stats.mappedCounterparties}
              </div>
              <div className="text-xs text-gray-600">Mapped</div>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg">
              <div className="text-lg font-semibold text-red-600">
                {stats.unmappedCounterparties}
              </div>
              <div className="text-xs text-gray-600">Unmapped</div>
            </div>
            <div className="text-center p-3 bg-yellow-50 rounded-lg">
              <div className="text-lg font-semibold text-yellow-600">
                {stats.highConfidenceMatches}
              </div>
              <div className="text-xs text-gray-600">High Confidence</div>
            </div>
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-lg font-semibold text-blue-600">
                {selectedMappings.size}
              </div>
              <div className="text-xs text-gray-600">Selected</div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label htmlFor="similarity-threshold" className="text-sm font-medium text-gray-700">
                Similarity Threshold:
              </label>
              <select
                id="similarity-threshold"
                value={similarityThreshold}
                onChange={(e) => setSimilarityThreshold(Number(e.target.value))}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm"
                aria-label="Select similarity threshold percentage for entity matching"
              >
                <option value={60}>60% - More matches</option>
                <option value={70}>70% - Balanced</option>
                <option value={75}>75% - Default</option>
                <option value={80}>80% - Conservative</option>
                <option value={90}>90% - Very strict</option>
              </select>
            </div>
            <div className="flex items-center space-x-2">
              <label htmlFor="search-counterparties" className="sr-only">
                Search counterparties
              </label>
              <input
                id="search-counterparties"
                type="text"
                placeholder="Search counterparties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm w-64"
                aria-label="Search counterparties by name or entity"
              />
            </div>
          </div>

          {selectedMappings.size > 0 && (
            <button
              onClick={handleSaveMappings}
              disabled={saving}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  Save {selectedMappings.size} Mapping
                  {selectedMappings.size !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {filteredMappingGroups.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-6 text-center">
            <div className="text-gray-500">
              {searchTerm
                ? "No matching counterparties found."
                : "No counterparties available for mapping."}
            </div>
          </div>
        ) : (
          filteredMappingGroups.map((group) => (
            <EntityMappingCard
              key={group.counterpartyName}
              group={group}
              selectedMapping={selectedMappings.get(group.counterpartyName)}
              onSelectMapping={(match) =>
                handleSelectMapping(group.counterpartyName, match)
              }
              onRemoveMapping={() => handleRemoveMapping(group.counterpartyName)}
              getConfidenceColor={getConfidenceColor}
              getConfidenceBadge={getConfidenceBadge}
            />
          ))
        )}
      </div>

      {mappingResult && mappingResult.unmappedCounterparties.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Unmapped Counterparties ({mappingResult.unmappedCounterparties.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {mappingResult.unmappedCounterparties.map((name) => (
              <div
                key={name}
                className="px-3 py-2 bg-gray-50 rounded text-sm text-gray-700"
              >
                {name}
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-500 mt-4">
            These counterparties don't have any suggested matches. Consider
            adding them as new entities or adjusting the similarity threshold.
          </p>
        </div>
      )}
    </div>
  );
}

interface EntityMappingCardProps {
  group: EntityMappingGroup;
  selectedMapping?: EntityMatch;
  onSelectMapping: (match: EntityMatch) => void;
  onRemoveMapping: () => void;
  getConfidenceColor: (score: number) => string;
  getConfidenceBadge: (score: number) => string;
}

function EntityMappingCard({
  group,
  selectedMapping,
  onSelectMapping,
  onRemoveMapping,
  getConfidenceColor,
  getConfidenceBadge,
}: EntityMappingCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-lg shadow border">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h3 className="font-medium text-gray-900">{group.counterpartyName}</h3>
              {group.currentMapping && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                  Already Mapped
                </span>
              )}
            </div>
            <div className="flex items-center space-x-4 mt-1 text-sm text-gray-500">
              <span>{group.transactionCount} transactions</span>
              <span>₹{group.totalAmount.toLocaleString("en-IN")}</span>
              <span>{group.suggestedMatches.length} suggested matches</span>
            </div>
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-2 text-gray-400 hover:text-gray-600"
            aria-label={`${expanded ? "Collapse" : "Expand"} mapping options for ${group.counterpartyName}`}
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
            {group.currentMapping ? (
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-green-900">
                      {group.currentMapping.entityName}
                    </div>
                    <div className="text-sm text-green-700">
                      {group.currentMapping.entityType}
                      {group.currentMapping.pan && ` • PAN: ${group.currentMapping.pan}`}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getConfidenceColor(
                      group.currentMapping.confidenceScore
                    )}`}
                  >
                    {group.currentMapping.confidenceScore}%{" "}
                    {getConfidenceBadge(group.currentMapping.confidenceScore)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {group.suggestedMatches.map((match, index) => {
                  const radioId = `mapping-${group.counterpartyName}-${match.entityId}-${index}`;
                  return (
                    <div
                      key={`${match.entityId}-${index}`}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedMapping?.entityId === match.entityId
                          ? "border-blue-500 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                      onClick={() => onSelectMapping(match)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <input
                              id={radioId}
                              type="radio"
                              checked={selectedMapping?.entityId === match.entityId}
                              onChange={() => onSelectMapping(match)}
                              className="text-blue-600"
                              aria-label={`Map ${group.counterpartyName} to ${match.entityName} (${match.confidenceScore}% confidence)`}
                            />
                            <label htmlFor={radioId} className="cursor-pointer">
                              <div className="font-medium text-gray-900">
                                {match.entityName}
                              </div>
                              <div className="text-sm text-gray-600">
                                {match.entityType}
                                {match.pan && ` • PAN: ${match.pan}`}
                                {match.gstin && ` • GSTIN: ${match.gstin}`}
                              </div>
                            </label>
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
                  );
                })}

                {selectedMapping && (
                  <div className="flex justify-end">
                    <button
                      onClick={onRemoveMapping}
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
