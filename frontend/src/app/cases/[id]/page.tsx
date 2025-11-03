"use client";

import AMLTab from "@/app/components/AMLTab";
import AIModeTab from "@/app/components/AIModeTab";
import EfficientCounterpartyMerge from "@/app/components/EfficientCounterpartyMerge";
import EntityStandardizationTab from "@/app/components/EntityStandardizationTab";
import OverviewTab from "@/app/components/OverviewTab";
import FlowchartTab from "@/app/components/FlowchartTab";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import AppHeader from "../../components/AppHeader";
import CreateEntityModal from "../../components/CreateEntityModal";
import EntityList from "@/app/components/EntityList";


interface Case {
  id: string;
  name: string;
  description: string;
  status: "active" | "closed" | "pending";
  createdAt: string;
  investigator: string;
  entityCount: number;
  accountCount: number;
  statementCount: number;
  priority: "low" | "medium" | "high";
  category: string;
}

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "entities"
    | "timeline"
    | "analytics"
    | "ai-mode"
    | "counterparty-merge"
    | "entity-standardization"
    | "flowchart"
  >("overview");
  const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const { casesService, cacheManagement } = await import("@/services/database");
        const caseData = await casesService.getById(caseId);

        if (caseData) {
          // Warm the cache for this case
          cacheManagement.warmCaseCache(caseId).catch(console.warn);
          
          // Transform to match component interface
          setCaseData({
            id: caseData.case_id,
            name: caseData.case_name,
            description: caseData.description || "",
            status: caseData.status.toLowerCase() as
              | "active"
              | "closed"
              | "pending",
            createdAt: caseData.created_at,
            investigator: caseData.lead_investigator,
            entityCount: caseData.entity_count,
            accountCount: caseData.account_count,
            statementCount: caseData.statement_count,
            priority:
              (caseData.priority?.toLowerCase() as "low" | "medium" | "high") ||
              "medium",
            category: caseData.case_type || "Other",
          });
        } else {
          setCaseData(null);
        }
      } catch (error) {
        console.error("Error fetching case:", error);
        setCaseData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
  }, [caseId]);

  const handleEntityCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
    setIsCreateEntityModalOpen(false);
    if (caseData) {
      setCaseData((prev) =>
        prev ? { ...prev, entityCount: prev.entityCount + 1 } : null
      );
    }
  };

  const handleEntityDeleted = () => {
    setRefreshTrigger((prev) => prev + 1);
    if (caseData) {
      setCaseData((prev) =>
        prev
          ? { ...prev, entityCount: Math.max(0, prev.entityCount - 1) }
          : null
      );
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Case Not Found
          </h2>
          <p className="text-gray-600">
            The requested case could not be found.
          </p>
        </div>
      </div>
    );
  }

  const headerSubtitle = (
    <div className="flex items-center space-x-2">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
          caseData.status
        )}`}
      >
        {caseData.status.charAt(0).toUpperCase() + caseData.status.slice(1)}
      </span>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
          caseData.priority
        )}`}
      >
        {caseData.priority.charAt(0).toUpperCase() + caseData.priority.slice(1)}{" "}
        Priority
      </span>
      <span className="text-xs text-gray-500">
        Created {formatDate(caseData.createdAt)} • {caseData.investigator}
      </span>
    </div>
  );


  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={caseData.name}
        subtitle={headerSubtitle}
        showBackButton={true}
      />

      {/* Stats Bar */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 py-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {caseData.entityCount}
              </div>
              <div className="text-sm text-gray-600">Entities</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {caseData.accountCount}
              </div>
              <div className="text-sm text-gray-600">Bank Accounts</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">
                {caseData.statementCount}
              </div>
              <div className="text-sm text-gray-600">Statements</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">-</div>
              <div className="text-sm text-gray-600">Total Volume</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { key: "overview", label: "Overview" },
              { key: "entities", label: "Entities" },
              // { key: "timeline", label: "Timeline" },
              { key: "analytics", label: "AML Analytics" },
              { key: "flowchart", label: "Flowchart" },
              { key: "ai-mode", label: "AI Mode" },
              { key: "counterparty-merge", label: "Counterparty Merge" },
              {
                key: "entity-standardization",
                label: "Entity Standardization",
              },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "overview" && <OverviewTab caseId={caseData.id} />}

        {activeTab === "entities" && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-medium text-gray-900">
                Case Entities
              </h2>
              <button
                onClick={() => setIsCreateEntityModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Add Entity
              </button>
            </div>
            <EntityList
              caseId={caseData.id}
              key={refreshTrigger}
              onEntityDeleted={handleEntityDeleted}
              onEntityUpdated={() => setRefreshTrigger((prev) => prev + 1)}
            />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Case Timeline
            </h2>
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No timeline events available</p>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                AML Analytics Dashboard
              </h2>

              <AMLTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "flowchart" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Money Flow Visualization
              </h2>

              <FlowchartTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "ai-mode" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                AI-Powered AML Analysis
              </h2>

              <AIModeTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "counterparty-merge" && (
          <EfficientCounterpartyMerge caseId={caseData.id} />
        )}

        {activeTab === "entity-standardization" && (
          <EntityStandardizationTab caseId={caseData.id} />
        )}
      </main>

      {/* Create Entity Modal */}
      {isCreateEntityModalOpen && (
        <CreateEntityModal
          caseId={caseData.id}
          onClose={() => setIsCreateEntityModalOpen(false)}
          onEntityCreated={handleEntityCreated}
        />
      )}
    </div>
  );
}
