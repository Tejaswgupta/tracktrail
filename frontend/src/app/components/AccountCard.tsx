"use client";

import { accountsService, transactionsService } from "@/services/database";
import { useEffect, useState } from "react";
import ConfirmationDialog from "./ConfirmationDialog";
import StatementList from "./StatementList";
import TransactionsTable from "./TransactionsTable";
import TransactionFixer from "./TransactionFixer";
import type { Transaction } from "@/types/database";

interface Account {
  id: string;
  accountNumber: string;
  bankName: string;
  accountType: "savings" | "current" | "fixed_deposit" | "loan" | "other";
  ifscCode: string;
  branchName: string;
  statementCount: number;
  lastStatementDate: string;
  balance: number;
  currency: string;
}

interface AccountCardProps {
  account: Account;
  onAccountDeleted?: () => void;
  caseId?: string;
}

export default function AccountCard({
  account,
  onAccountDeleted,
  caseId,
}: AccountCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<"statements" | "transactions" | "fix_failed">(
    "statements"
  );
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [transactionStats, setTransactionStats] = useState({
    total: 0,
    successful: 0,
    failed: 0,
    successRate: 0,
    failureRate: 0
  });
  const [loadingStats, setLoadingStats] = useState(false);

  const getAccountTypeColor = (type: string) => {
    switch (type) {
      case "current":
        return "bg-blue-100 text-blue-800";
      case "savings":
        return "bg-green-100 text-green-800";
      case "fixed_deposit":
        return "bg-purple-100 text-purple-800";
      case "loan":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // Calculate transaction success/failure stats
  useEffect(() => {
    const calculateTransactionStats = async () => {
      if (!isExpanded) return;
      
      setLoadingStats(true);
      try {
        const transactions = await transactionsService.getByAccountId(account.id);
        
        // Calculate success/failure counts
        const total = transactions.length;
        const successful = transactions.filter(
          tx => tx.counterparty_merged && tx.counterparty_merged.trim() !== ""
        ).length;
        const failed = total - successful;
        
        const successRate = total > 0 ? Math.round((successful / total) * 100) : 0;
        const failureRate = total > 0 ? Math.round((failed / total) * 100) : 0;
        
        setTransactionStats({
          total,
          successful,
          failed,
          successRate,
          failureRate
        });
      } catch (error) {
        console.error("Error calculating transaction stats:", error);
      } finally {
        setLoadingStats(false);
      }
    };

    if (isExpanded) {
      calculateTransactionStats();
    }
  }, [account.id, isExpanded]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await accountsService.delete(account.id);
      onAccountDeleted?.();
    } catch (error) {
      console.error("Error deleting account:", error);
      alert("Failed to delete account. Please try again.");
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-md bg-white">
      <div className="p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 flex-1">
            <div className="flex-shrink-0">
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
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center space-x-2 mb-1">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {account.bankName}
                </p>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getAccountTypeColor(
                    account.accountType
                  )}`}
                >
                  {account.accountType.replace("_", " ").toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-1">
                Account: {account.accountNumber} • IFSC: {account.ifscCode}
              </p>
              <p className="text-xs text-gray-500">{account.branchName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-sm font-medium text-gray-900">
                {formatCurrency(account.balance, account.currency)}
              </div>
              <div className="text-xs text-gray-500">
                Last: {formatDate(account.lastStatementDate)}
              </div>
            </div>
            <div className="text-center">
              <div className="text-sm font-semibold text-blue-600">
                {account.statementCount}
              </div>
              <div className="text-xs text-gray-500">Statements</div>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setShowDeleteDialog(true)}
                disabled={isDeleting}
                className="p-1 text-red-400 hover:text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
                title="Delete account"
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
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
              >
                <svg
                  className={`w-4 h-4 transform transition-transform ${
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
          <div className="p-3">
            {/* Transaction Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-500">Total</p>
                    <p className="text-sm font-semibold text-blue-600">
                      {transactionStats.total}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-green-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-500">Success</p>
                    <p className="text-sm font-semibold text-green-600">
                      {transactionStats.successful} ({transactionStats.successRate}%)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-red-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-500">Failed</p>
                    <p className="text-sm font-semibold text-red-600">
                      {transactionStats.failed} ({transactionStats.failureRate}%)
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg border border-gray-200 p-2">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-purple-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    </div>
                  </div>
                  <div className="ml-2">
                    <p className="text-xs font-medium text-gray-500">Rate</p>
                    <p className="text-sm font-semibold text-purple-600">
                      {transactionStats.total > 0 
                        ? `${transactionStats.successRate}%` 
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex space-x-1 mb-4">
              <button
                onClick={() => setActiveTab("statements")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "statements"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                Statements ({account.statementCount})
              </button>
              <button
                onClick={() => setActiveTab("transactions")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "transactions"
                    ? "bg-blue-100 text-blue-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                Transactions
              </button>
              <button
                onClick={() => setActiveTab("fix_failed")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeTab === "fix_failed"
                    ? "bg-red-100 text-red-700"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
              >
                Fix Failed ({transactionStats.failed})
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "statements" ? (
              <StatementList accountId={account.id} />
            ) : activeTab === "transactions" ? (
              <TransactionsTable accountId={account.id} caseId={caseId} />
            ) : (
              <TransactionFixer accountId={account.id} caseId={caseId} />
            )}
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={showDeleteDialog}
        title="Delete Account"
        message={`Are you sure you want to delete account "${account.accountNumber}" from ${account.bankName}? This will permanently delete all associated statements and transactions. This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteDialog(false)}
        isDestructive={true}
      />
    </div>
  );
}
