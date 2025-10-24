"use client";

import { statementsService } from "@/services/database";
import type { BankStatement } from "@/types/database";
import { useEffect, useState } from "react";
import ConfirmationDialog from "./ConfirmationDialog";
import UploadStatementModalWizard from "./UploadStatementModalWizard";

interface StatementListProps {
  accountId: string;
}

export default function StatementList({ accountId }: StatementListProps) {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{
    isOpen: boolean;
    statementId: string;
    fileName: string;
  }>({ isOpen: false, statementId: "", fileName: "" });
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const fetchStatements = async () => {
      try {
        setLoading(true);
        setError(null);
        const statementsData = await statementsService.getByAccountId(
          accountId
        );
        setStatements(statementsData);
      } catch (error) {
        console.error("Error fetching statements:", error);
        setError(
          error instanceof Error ? error.message : "Failed to load statements"
        );
        setStatements([]);
      } finally {
        setLoading(false);
      }
    };

    if (accountId) {
      fetchStatements();
    }
  }, [accountId]);

  const getFileIcon = (fileType: string) => {
    switch (fileType) {
      case "pdf":
        return (
          <svg
            className="w-4 h-4 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "csv":
        return (
          <svg
            className="w-4 h-4 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "xlsx":
      case "xls":
        return (
          <svg
            className="w-4 h-4 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-4 h-4 text-gray-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  const getStatusBadge = (
    status: BankStatement["processing_status"],
    progress?: number
  ) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
            <svg
              className="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Completed
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
            <svg
              className="animate-spin w-3 h-3 mr-1"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Processing {progress}%
          </span>
        );
      case "pending":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
            <svg
              className="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            Pending
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            <svg
              className="w-3 h-3 mr-1"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            Error
          </span>
        );
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleDeleteStatement = async () => {
    setIsDeleting(true);
    try {
      await statementsService.delete(deleteDialog.statementId);
      // Refresh statements list
      const statementsData = await statementsService.getByAccountId(accountId);
      setStatements(statementsData);
    } catch (error) {
      console.error("Error deleting statement:", error);
      alert("Failed to delete statement. Please try again.");
    } finally {
      setIsDeleting(false);
      setDeleteDialog({ isOpen: false, statementId: "", fileName: "" });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-16">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-4 text-red-600">
        <p className="text-xs">Error: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-xs text-blue-600 hover:text-blue-800 mt-1"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-xs text-gray-600">
          {statements.length} statements
        </span>
        <button
          onClick={() => setIsUploadModalOpen(true)}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
        >
          <svg
            className="w-3 h-3 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          Upload
        </button>
      </div>

      {statements.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          <p className="text-xs">No statements uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {statements.map((statement) => (
            <div
              key={statement.statement_id}
              className="flex items-center justify-between p-2 bg-white border border-gray-200 rounded text-xs"
            >
              <div className="flex items-center space-x-2 flex-1 min-w-0">
                {getFileIcon(statement.file_type)}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {statement.file_name}
                  </p>
                  <p className="text-gray-500">
                    {statement.statement_period_from &&
                    statement.statement_period_to
                      ? `${formatDate(
                          statement.statement_period_from
                        )} - ${formatDate(statement.statement_period_to)}`
                      : "Period not specified"}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="text-right">
                  <p className="text-gray-900">
                    {statement.transaction_count} txns
                  </p>
                  <p className="text-gray-500">
                    {statement.file_size
                      ? formatFileSize(statement.file_size)
                      : "Unknown size"}
                  </p>
                </div>
                {getStatusBadge(
                  statement.processing_status,
                  statement.processing_progress
                )}
                <button
                  onClick={() =>
                    setDeleteDialog({
                      isOpen: true,
                      statementId: statement.statement_id,
                      fileName: statement.file_name,
                    })
                  }
                  disabled={isDeleting}
                  className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                  title="Delete statement"
                >
                  <svg
                    className="w-3 h-3"
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
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <UploadStatementModalWizard
          accountId={accountId}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadComplete={() => {
            // Refresh the statements list
            const fetchStatements = async () => {
              try {
                const statementsData = await statementsService.getByAccountId(
                  accountId
                );
                setStatements(statementsData);
              } catch (error) {
                console.error("Error refreshing statements:", error);
              }
            };
            fetchStatements();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={deleteDialog.isOpen}
        title="Delete Statement"
        message={`Are you sure you want to delete "${deleteDialog.fileName}"? This will permanently delete the statement and all associated transactions. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDeleteStatement}
        onCancel={() =>
          setDeleteDialog({ isOpen: false, statementId: "", fileName: "" })
        }
        isDestructive={true}
      />
    </div>
  );
}
