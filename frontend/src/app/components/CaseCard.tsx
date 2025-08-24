"use client";

import { useRouter } from "next/navigation";

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

interface CaseCardProps {
  case: Case;
}

export default function CaseCard({ case: caseData }: CaseCardProps) {
  const router = useRouter();

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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div
      className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => router.push(`/cases/${caseData.id}`)}
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
              caseData.status
            )}`}
          >
            {caseData.status.charAt(0).toUpperCase() + caseData.status.slice(1)}
          </span>
          <span className="text-sm text-gray-500">
            {formatDate(caseData.createdAt)}
          </span>
        </div>

        <h3 className="text-lg font-medium text-gray-900 mb-2 line-clamp-2">
          {caseData.name}
        </h3>

        <p className="text-sm text-gray-600 mb-4 line-clamp-3">
          {caseData.description}
        </p>

        <div className="flex items-center text-sm text-gray-500 mb-4">
          <svg
            className="w-4 h-4 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          {caseData.investigator}
        </div>

        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-200">
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {caseData.entityCount}
            </div>
            <div className="text-xs text-gray-500">Entities</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {caseData.accountCount}
            </div>
            <div className="text-xs text-gray-500">Accounts</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-semibold text-gray-900">
              {caseData.statementCount}
            </div>
            <div className="text-xs text-gray-500">Statements</div>
          </div>
        </div>
      </div>
    </div>
  );
}
