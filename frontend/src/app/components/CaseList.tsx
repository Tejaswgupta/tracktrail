"use client";

import { useEffect, useState } from "react";
import CaseCard from "./CaseCard";

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
}

export default function CaseList() {
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "closed" | "pending">(
    "all"
  );

  useEffect(() => {
    const fetchCases = async () => {
      try {
        const { casesService } = await import("@/services/database");
        const casesData = await casesService.getAll();

        // Transform to match component interface
        const transformedCases = casesData.map((caseData) => ({
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
        }));

        setCases(transformedCases);
      } catch (error) {
        console.error("Error fetching cases:", error);
        setCases([]);
      } finally {
        setLoading(false);
      }
    };

    fetchCases();
  }, []);

  const filteredCases = cases.filter(
    (case_) => filter === "all" || case_.status === filter
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: "all", label: "All Cases", count: cases.length },
            {
              key: "active",
              label: "Active",
              count: cases.filter((c) => c.status === "active").length,
            },
            {
              key: "pending",
              label: "Pending",
              count: cases.filter((c) => c.status === "pending").length,
            },
            {
              key: "closed",
              label: "Closed",
              count: cases.filter((c) => c.status === "closed").length,
            },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                filter === tab.key
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              <span className="ml-2 bg-gray-100 text-gray-900 py-0.5 px-2.5 rounded-full text-xs">
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Cases Grid */}
      {filteredCases.length === 0 ? (
        <div className="text-center py-12">
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
            No cases found
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            {filter === "all"
              ? "Get started by creating a new case."
              : `No ${filter} cases found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {filteredCases.map((case_) => (
            <CaseCard key={case_.id} case={case_} />
          ))}
        </div>
      )}
    </div>
  );
}
