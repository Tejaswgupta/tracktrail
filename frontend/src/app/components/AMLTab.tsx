"use client";

import { entitiesService, transactionsService } from "@/services/database";
import { useEffect, useState } from "react";
import CashFlowAnalysisTab from "./aml/CashFlowAnalysisTab";
import RapidMovementDetectionTab from "./aml/RapidMovementDetectionTab";
import RoundTrippingDetectionTab from "./aml/RoundTrippingDetectionTab";
import CircularTradingDetectionTab from "./aml/CircularTradingDetectionTab";
import MuleAccountDetectionTab from "./aml/MuleAccountDetectionTab"; 

interface AMLTabProps {
  caseId: string;
}

interface AMLMetadata {
  entityIds: string[];
  dateRange: { from: string; to: string };
  transactionCount: number;
  totalVolume: number;
}

interface EntityDetails {
  entity_id: string;
  entity_name: string;
}

export default function AMLTab({ caseId }: AMLTabProps) {
  const [amlMetadata, setAmlMetadata] = useState<AMLMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeDetectionTab, setActiveDetectionTab] = useState<
    | "circular_trading"
    | "round_tripping"
    | "rapid_movement"
    | "cash_flow"
    | "mule_account"
  >("circular_trading");
  const [selectedEntityIds, setSelectedEntityIds] = useState<string[]>([]);
  const [entityDetails, setEntityDetails] = useState<EntityDetails[]>([]);
  const [analysisStarted, setAnalysisStarted] = useState(false);

  useEffect(() => {
    const fetchAMLMetadata = async () => {
      try {
        const metadata = await transactionsService.getCaseAMLMetadata(caseId);
        setAmlMetadata(metadata);

        // Fetch entity details for the case
        try {
          const caseEntities = await entitiesService.getByCaseId(caseId);
          const entityDetailsMap = caseEntities.map((entity) => ({
            entity_id: entity.entity_id,
            entity_name: entity.entity_name,
          }));
          setEntityDetails(entityDetailsMap);
        } catch (entityError) {
          console.error("Error fetching entity details:", entityError);
          setEntityDetails([]);
        }

        // Initialize with all entities selected by default
        setSelectedEntityIds(metadata.entityIds);
      } catch (error) {
        console.error("Error fetching AML metadata:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAMLMetadata();
  }, [caseId]);

  const handleEntitySelection = (entityId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedEntityIds((prev) => [...prev, entityId]);
    } else {
      setSelectedEntityIds((prev) => prev.filter((id) => id !== entityId));
    }
  };

  const handleSelectAllEntities = () => {
    if (amlMetadata) {
      setSelectedEntityIds(amlMetadata.entityIds);
    }
  };

  const handleDeselectAllEntities = () => {
    setSelectedEntityIds([]);
  };

  const detectionTabs = [
    {
      key: "circular_trading",
      label: "Circular Trading",
      description: "Detect money flowing in circular patterns between entities using advanced graph analysis",
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
    {
      key: "mule_account",
      label: "Mule Account", 
      description: "Detect pass-through money laundering patterns and suspicious account behavior",
      icon: (
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      key: "round_tripping",
      label: "Round Tripping",
      description: "Identify money that flows out and returns quickly",
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
    {
      key: "rapid_movement",
      label: "Rapid Movement",
      description: "Detect high-velocity money transfers",
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
    {
      key: "cash_flow",
      label: "Cash Flow",
      description: "Analyze cash transaction patterns and detect suspicious cash movements",
      icon: (
        <svg
          className="w-5 h-5"
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
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading transactions...</span>
      </div>
    );
  }

  if (!amlMetadata || amlMetadata.transactionCount === 0) {
    return (
      <div className="text-center py-12">
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
          No Transactions Available
        </h3>
        <p className="text-gray-500">
          Upload bank statements to run AML analysis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              AML Detection Suite
            </h2>
            <p className="text-sm text-gray-600">
              Advanced anti-money laundering analysis for{" "}
              {amlMetadata.transactionCount.toLocaleString()} transactions
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {amlMetadata.entityIds.length} entities •{" "}
              {amlMetadata.dateRange.from} to {amlMetadata.dateRange.to}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Transaction Volume</p>
            <p className="text-2xl font-semibold text-gray-900">
              {new Intl.NumberFormat("en-IN", {
                style: "currency",
                currency: "INR",
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              }).format(amlMetadata.totalVolume)}
            </p>
          </div>
        </div>

        {/* Detection Type Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 overflow-x-auto">
            {detectionTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveDetectionTab(tab.key as any)}
                className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
                  activeDetectionTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
        </div>

        {analysisStarted && (
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => setAnalysisStarted(false)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              Reset Analysis
            </button>
          </div>
        )}

        {/* Tab Description */}
        <div className="mt-4 p-4 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-700">
            {
              detectionTabs.find((tab) => tab.key === activeDetectionTab)
                ?.description
            }
          </p>
        </div>
      </div>

      {/* Entity Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-medium text-gray-900">
              Entity Selection for Analysis
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              Choose which entities to include in the AML analysis. Selected:{" "}
              {selectedEntityIds.length} of {amlMetadata?.entityIds.length || 0}
              {entityDetails.length > 0 && (
                <span className="text-green-600 ml-1">(names loaded)</span>
              )}
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAllEntities}
              className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
            >
              Select All
            </button>
            <button
              onClick={handleDeselectAllEntities}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
            >
              Deselect All
            </button>
          </div>
        </div>

        {amlMetadata && amlMetadata.entityIds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {entityDetails.length > 0
              ? entityDetails.map((entity) => (
                  <label
                    key={entity.entity_id}
                    className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEntityIds.includes(entity.entity_id)}
                      onChange={(e) =>
                        handleEntitySelection(
                          entity.entity_id,
                          e.target.checked
                        )
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entity.entity_name}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        ID: {entity.entity_id}
                      </p>
                    </div>
                  </label>
                ))
              : amlMetadata.entityIds.map((entityId) => (
                  <label
                    key={entityId}
                    className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedEntityIds.includes(entityId)}
                      onChange={(e) =>
                        handleEntitySelection(entityId, e.target.checked)
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entityId}
                      </p>
                      <p className="text-xs text-gray-500">Entity ID</p>
                    </div>
                  </label>
                ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </div>
            <h4 className="text-sm font-medium text-gray-900 mb-1">
              No Entities Available
            </h4>
            <p className="text-xs text-gray-500">
              No entities found for this case. Please add entities to run AML
              analysis.
            </p>
          </div>
        )}

        {selectedEntityIds.length === 0 && (
          <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-800">
                  No entities selected. Please select at least one entity to run
                  AML analysis.
                </p>
              </div>
            </div>
          </div>
        )}

        {selectedEntityIds.length > 0 && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => setAnalysisStarted(true)}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Start AML Analysis
            </button>
          </div>
        )}
      </div>

      {/* Detection Content */}
      <div className="min-h-[600px]">
        {!analysisStarted ? (
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
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Ready to Run AML Analysis
            </h3>
            <p className="text-gray-500 mb-4">
              {selectedEntityIds.length > 0
                ? `Analysis will run on ${selectedEntityIds.length} selected entities. Click "Start AML Analysis" to begin.`
                : "Please select at least one entity from the dropdown above to run AML analysis."}
            </p>
            {selectedEntityIds.length > 0 && (
              <button
                onClick={() => setAnalysisStarted(true)}
                className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Start AML Analysis
              </button>
            )}
          </div>
        ) : (
          <>
            {activeDetectionTab === "circular_trading" && (
              <CircularTradingDetectionTab
                caseId={caseId}
                amlMetadata={amlMetadata}
                selectedEntityIds={selectedEntityIds}
              />
            )}

            {activeDetectionTab === "mule_account" && (
        <MuleAccountDetectionTab
          caseId={caseId}
          amlMetadata={amlMetadata}
          selectedEntityIds={selectedEntityIds}
        />
           )}
            
            {activeDetectionTab === "round_tripping" && (
              <RoundTrippingDetectionTab
                caseId={caseId}
                amlMetadata={amlMetadata}
                selectedEntityIds={selectedEntityIds}
              />
            )}

            {activeDetectionTab === "rapid_movement" && (
              <RapidMovementDetectionTab
                caseId={caseId}
                amlMetadata={amlMetadata}
                selectedEntityIds={selectedEntityIds}
              />
            )}

            {activeDetectionTab === "cash_flow" && (
              <CashFlowAnalysisTab
                caseId={caseId}
                amlMetadata={amlMetadata}
                selectedEntityIds={selectedEntityIds}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
