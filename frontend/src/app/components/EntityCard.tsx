"use client";

import { entitiesService } from "@/services/database";
import { EntityType, EntityWithAccounts } from "@/types/database";
import { useState } from "react";
import AccountList from "./AccountList";
import ConfirmationDialog from "./ConfirmationDialog";

interface EntityCardProps {
  entity: EntityWithAccounts;
  caseId?: string;
  onEntityDeleted?: () => void;
}

export default function EntityCard({
  entity,
  caseId,
  onEntityDeleted,
}: EntityCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const getEntityIcon = (type: EntityType) => {
    switch (type) {
      case EntityType.Company:
        return (
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
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        );
      case EntityType.Individual:
        return (
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
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        );
      case EntityType.Trust:
        return (
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
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
        );
      default:
        return (
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        );
    }
  };

  const getTypeColor = (type: EntityType) => {
    switch (type) {
      case EntityType.Company:
        return "bg-blue-100 text-blue-800";
      case EntityType.Individual:
        return "bg-green-100 text-green-800";
      case EntityType.Trust:
        return "bg-purple-100 text-purple-800";
      case EntityType.Partnership:
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleDelete = async () => {
    if (!caseId) return;

    setIsDeleting(true);
    try {
      // Remove entity from case (this preserves the entity for other cases)
      await entitiesService.removeFromCase(caseId, entity.entity_id);
      onEntityDeleted?.();
    } catch (error) {
      console.error("Error deleting entity:", error);
      alert("Failed to delete entity. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-white">
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div
              className={`p-2 rounded-lg ${getTypeColor(entity.entity_type)}`}
            >
              {getEntityIcon(entity.entity_type)}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <h4 className="text-lg font-medium text-gray-900">
                  {entity.entity_name}
                </h4>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getTypeColor(
                    entity.entity_type
                  )}`}
                >
                  {entity.entity_type}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-1">
                {entity.pan || entity.cin || "No identifier"}
              </p>
              <p className="text-sm text-gray-500">
                {entity.metadata?.description ||
                  entity.registered_address ||
                  "No description"}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {entity.account_count}
              </div>
              <div className="text-xs text-gray-500">Accounts</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {entity.statement_count}
              </div>
              <div className="text-xs text-gray-500">Statements</div>
            </div>
            <div className="flex items-center space-x-2">
              {caseId && (
                <button
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isDeleting}
                  className="p-2 text-red-400 hover:text-red-600 rounded-full hover:bg-red-50 disabled:opacity-50"
                  title="Remove entity from case"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
              >
                <svg
                  className={`w-5 h-5 transform transition-transform ${
                    isExpanded ? "rotate-180" : ""
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
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-gray-200 bg-gray-50">
          <div className="p-4">
            <h5 className="text-sm font-medium text-gray-900 mb-3">
              Bank Accounts
            </h5>
            <AccountList entityId={entity.entity_id} caseId={caseId} />
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        title="Remove Entity from Case"
        message={`Are you sure you want to remove "${entity.entity_name}" from this case? This will remove all associated accounts and statements from the case but won't delete the entity permanently.`}
        confirmText="Remove"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        isDestructive={true}
      />
    </div>
  );
}
