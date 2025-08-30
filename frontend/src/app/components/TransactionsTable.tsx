"use client";

import { useAuth } from "@/contexts/AuthContext";
import {
  caseTransactionsService,
  statementsService,
  transactionsService,
} from "@/services/database";
import { BankStatement, CaseTransaction, Transaction } from "@/types/database";
import { useEffect, useMemo, useState } from "react";
import NotesPanel from "./NotesPanel";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";


interface TransactionsTableProps {
  accountId: string;
  caseId?: string;
  onTransactionSelect?: (transaction: Transaction) => void;
}

export default function TransactionsTable({
  accountId,
  caseId,
  onTransactionSelect,
}: TransactionsTableProps) {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [selectedStatements, setSelectedStatements] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState({
    totalCredits: 0,
    totalDebits: 0,
    transactionCount: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(0);
  const [flagsByTxId, setFlagsByTxId] = useState<
    Record<string, CaseTransaction | null>
  >({});
  const [notesOpen, setNotesOpen] = useState(false);

  const canCollaborate = useMemo(() => Boolean(caseId && user?.id), [caseId, user?.id]);

  useEffect(() => {
    loadData();
  }, [accountId]);

  useEffect(() => {
    loadTransactionsAndSummary();
  }, [accountId, selectedStatements, currentPage]);

  // Load flags for the currently visible page when caseId is present
  useEffect(() => {
    const loadFlagsForVisibleTransactions = async () => {
      if (!caseId || transactions.length === 0) {
        setFlagsByTxId({});
        return;
      }
      try {
        const txIds = transactions.map((t) => t.transaction_id);
        const flags = await caseTransactionsService.getFlagsForTransactions(
          caseId,
          txIds
        );
        const map: Record<string, CaseTransaction> = {};
        flags.forEach((f) => {
          map[f.transaction_id] = f;
        });
        setFlagsByTxId(map);
      } catch (e) {
        console.error("Failed to load transaction flags:", e);
        // Don't set error for flags alone; keep table usable
      }
    };

    loadFlagsForVisibleTransactions();
  }, [caseId, transactions]);

  const handleFlagChange = async (
    transactionId: string,
    value: "" | CaseTransaction["flag_type"]
  ) => {
    if (!caseId) return; // safety
    try {
      if (value === "") {
        await caseTransactionsService.deleteFlagByTransaction(caseId, transactionId);
        setFlagsByTxId((prev) => ({ ...prev, [transactionId]: null }));
      } else {
        if (!user?.id) {
          alert("Please sign in to set flags.");
          return;
        }
        const updated = await caseTransactionsService.upsertFlag({
          caseId,
          transactionId,
          flag_type: value,
          userId: user.id,
        });
        setFlagsByTxId((prev) => ({ ...prev, [transactionId]: updated }));
      }
    } catch (e) {
      console.error("Failed to update flag:", e);
      alert(e instanceof Error ? e.message : "Failed to update flag");
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const statementsData = await statementsService.getByAccountId(accountId);

      setStatements(statementsData);

      // Initially select all statements
      const allStatementIds = statementsData.map((s) => s.statement_id);
      setSelectedStatements(allStatementIds);
    } catch (err) {
      console.error("Failed to load statements:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load statements"
      );
    } finally {
      setLoading(false);
    }
  };

  const loadTransactionsAndSummary = async () => {
    if (selectedStatements.length === 0) {
      setTransactions([]);
      setSummary({
        totalCredits: 0,
        totalDebits: 0,
        transactionCount: 0,
      });
      setTotalPages(0);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get summary first (this gets all matching transactions for summary calculation)
      const summaryData =
        await transactionsService.getTransactionSummaryByStatements(
          accountId,
          selectedStatements.length === statements.length
            ? undefined
            : selectedStatements
        );

      setSummary(summaryData);
      setTotalPages(Math.ceil(summaryData.transactionCount / itemsPerPage));

      // Get paginated transactions for current page using database-level pagination
      const offset = (currentPage - 1) * itemsPerPage;
      const transactionsData =
        await transactionsService.getByAccountIdAndStatements(
          accountId,
          selectedStatements.length === statements.length
            ? undefined
            : selectedStatements,
          {
            offset,
            limit: itemsPerPage,
          }
        );

      setTransactions(transactionsData);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load transactions"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleStatementToggle = (statementId: string) => {
    setSelectedStatements((prev) => {
      if (prev.includes(statementId)) {
        return prev.filter((id) => id !== statementId);
      } else {
        return [...prev, statementId];
      }
    });
    setCurrentPage(1); // Reset to first page when filtering
  };

  const handleSelectAllStatements = () => {
    if (selectedStatements.length === statements.length) {
      setSelectedStatements([]);
    } else {
      setSelectedStatements(statements.map((s) => s.statement_id));
    }
    setCurrentPage(1); // Reset to first page when filtering
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const flagStyle = (flag?: CaseTransaction) => {
    if (!flag) return "bg-gray-100 text-gray-600";
    switch (flag.flag_type) {
      case "Suspicious":
        return "bg-amber-100 text-amber-800";
      case "Evidence":
        return "bg-purple-100 text-purple-800";
      case "Related":
        return "bg-blue-100 text-blue-800";
      case "Under Review":
        return "bg-gray-200 text-gray-800";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  const netFlow = summary.totalCredits - summary.totalDebits;

  // Pagination info for display
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(
    startIndex + itemsPerPage,
    summary.transactionCount
  );

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  const goToPrevious = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 1));
  };

  const goToNext = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 p-4">
        <div className="flex">
          <svg
            className="h-5 w-5 text-red-400"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <div className="ml-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Credits</p>
              <p className="text-lg font-semibold text-green-600">
                {formatAmount(summary.totalCredits)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 12H4"
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Debits</p>
              <p className="text-lg font-semibold text-red-600">
                {formatAmount(summary.totalDebits)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${netFlow >= 0 ? "bg-green-100" : "bg-red-100"
                  }`}
              >
                <svg
                  className={`w-4 h-4 ${netFlow >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d={
                      netFlow >= 0
                        ? "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                        : "M13 17h8m0 0V9m0 8l-8-8-4 4-6-6"
                    }
                  />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Net Flow</p>
              <p
                className={`text-lg font-semibold ${netFlow >= 0 ? "text-green-600" : "text-red-600"
                  }`}
              >
                {netFlow >= 0 ? "+" : ""}
                {formatAmount(netFlow)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-blue-600"
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
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Transactions</p>
              <p className="text-lg font-semibold text-blue-600">
                {summary.transactionCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Info - Remove this after fixing */}
      {process.env.NODE_ENV === "development" && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-800 mb-2">
            Debug Info
          </h4>
          <div className="text-xs text-yellow-700 space-y-1">
            <div>Total Statements: {statements.length}</div>
            <div>Selected Statements: {selectedStatements.length}</div>
            <div>Total Matching Transactions: {summary.transactionCount}</div>
            <div>
              Current Page: {currentPage} of {totalPages}
            </div>
            <div>Showing: {transactions.length} transactions</div>
          </div>
        </div>
      )}

      {/* Statement Filter */}
      {statements.length > 1 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900">
              Filter by Statements
            </h4>
            <button
              onClick={handleSelectAllStatements}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {selectedStatements.length === statements.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {statements.map((statement) => {
              const isSelected = selectedStatements.includes(
                statement.statement_id
              );

              return (
                <button
                  key={statement.statement_id}
                  onClick={() => handleStatementToggle(statement.statement_id)}
                  className={`inline-flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${isSelected
                    ? "bg-blue-100 text-blue-800 border border-blue-200"
                    : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                    }`}
                >
                  <div className="flex items-center space-x-2">
                    <div
                      className={`w-2 h-2 rounded-full ${isSelected ? "bg-blue-600" : "bg-gray-400"
                        }`}
                    />
                    <span className="truncate max-w-[200px]">
                      {statement.file_name}
                    </span>
                    <span className="text-xs bg-white bg-opacity-50 px-1.5 py-0.5 rounded">
                      {statement.transaction_count}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {selectedStatements.length === 0 && (
            <p className="text-sm text-amber-600 mt-2 flex items-center">
              <svg
                className="w-4 h-4 mr-1"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              No statements selected. Select at least one statement to view
              transactions.
            </p>
          )}
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">
              Transaction History
            </h3>
            <div className="flex items-center gap-3">
              {statements.length > 1 && (
                <div className="text-sm text-gray-500">
                  {selectedStatements.length === statements.length
                    ? `All ${statements.length} statements`
                    : selectedStatements.length === 0
                      ? "No statements selected"
                      : `${selectedStatements.length} of ${statements.length} statements`}
                </div>
              )}
              {caseId && (
                <button
                  className="inline-flex items-center px-3 py-1.5 rounded-md text-sm font-medium border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
                  onClick={() => setNotesOpen(true)}
                >
                  Notes
                </button>
              )}
            </div>
          </div>
        </div>
        {summary.transactionCount === 0 ? (
          <div className="text-center py-8">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
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
            <p className="mt-2 text-sm text-gray-500">
              {selectedStatements.length === 0
                ? "No statements selected. Select at least one statement to view transactions."
                : "No transactions found for the selected statements."}
            </p>
          </div>
        ) : (
          <>
            <Table className="min-w-full">
              <TableHeader className="bg-gray-50">
                <TableRow>
                  <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </TableHead>
                  <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </TableHead>
                  {/* {statements.length > 1 && (
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Statement
                    </TableHead>
                  )} */}
                  <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </TableHead>
                  {caseId && (
                    <TableHead className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Flag
                    </TableHead>
                  )}
                  <TableHead className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </TableHead>
                  <TableHead className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="bg-white">
                {transactions.map((transaction) => (
                  <TableRow
                    key={transaction.transaction_id}
                    className={`${onTransactionSelect ? "cursor-pointer" : ""}`}
                    onClick={() => onTransactionSelect?.(transaction)}
                  >
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(transaction.tx_date)}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm text-gray-900">
                      <div className="max-w-xs truncate">
                        {transaction.description || "No description"}
                      </div>
                      {transaction.counterparty_merged && (
                        <div className="text-xs text-gray-500 mt-1">
                          {transaction.counterparty_merged}
                        </div>
                      )}
                    </TableCell>
                    {/* {statements.length > 1 && (
                      <TableCell className="px-6 py-4 text-sm text-gray-500">
                        <div className="max-w-xs truncate">
                          {statements.find(
                            (s) => s.statement_id === transaction.statement_id
                          )?.file_name || "Unknown"}
                        </div>
                      </TableCell>
                    )} */}
                    <TableCell className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${transaction.direction === "CR"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                          }`}
                      >
                        {transaction.direction === "CR" ? "Credit" : "Debit"}
                      </span>
                    </TableCell>
                    {caseId && (
                      <TableCell className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {flagsByTxId[transaction.transaction_id] ? (
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${flagStyle(
                                flagsByTxId[transaction.transaction_id] || undefined
                              )}`}
                            >
                              {flagsByTxId[transaction.transaction_id]?.flag_type}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                          <select
                            className="text-xs border border-gray-300 rounded-md px-1.5 py-1 bg-white text-gray-700 focus:outline-none"
                            disabled={!canCollaborate}
                            value={flagsByTxId[transaction.transaction_id]?.flag_type || ""}
                            onChange={(e) =>
                              handleFlagChange(
                                transaction.transaction_id,
                                (e.target.value as "" | CaseTransaction["flag_type"]) || ""
                              )
                            }
                            title={canCollaborate ? "Set or clear flag" : "Sign in to set flags"}
                          >
                            <option value="">No flag</option>
                            <option value="Suspicious">Suspicious</option>
                            <option value="Evidence">Evidence</option>
                            <option value="Related">Related</option>
                            <option value="Under Review">Under Review</option>
                          </select>
                        </div>
                      </TableCell>
                    )}
                    <TableCell
                      className={`px-6 py-4 whitespace-nowrap text-sm font-medium text-right ${transaction.direction === "CR"
                        ? "text-green-600"
                        : "text-red-600"
                        }`}
                    >
                      {transaction.direction === "CR" ? "+" : "-"}
                      {formatAmount(Math.abs(transaction.amount))}
                    </TableCell>
                    <TableCell className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      {typeof transaction.balance === "number"
                        ? formatAmount(transaction.balance)
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {summary.transactionCount > itemsPerPage && (
              <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
                <div className="flex-1 flex justify-between sm:hidden">
                  <button
                    onClick={goToPrevious}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={goToNext}
                    disabled={currentPage === totalPages}
                    className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-gray-700">
                      Showing{" "}
                      <span className="font-medium">{startIndex + 1}</span> to{" "}
                      <span className="font-medium">{endIndex}</span> of{" "}
                      <span className="font-medium">
                        {summary.transactionCount}
                      </span>{" "}
                      results
                    </p>
                  </div>
                  <div>
                    <nav
                      className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                      aria-label="Pagination"
                    >
                      <button
                        onClick={goToPrevious}
                        disabled={currentPage === 1}
                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Previous</span>
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>

                      {/* Page Numbers */}
                      {Array.from(
                        { length: Math.min(5, totalPages) },
                        (_, i) => {
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
                              onClick={() => goToPage(pageNum)}
                              className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === pageNum
                                ? "z-10 bg-blue-50 border-blue-500 text-blue-600"
                                : "bg-white border-gray-300 text-gray-500 hover:bg-gray-50"
                                }`}
                            >
                              {pageNum}
                            </button>
                          );
                        }
                      )}

                      <button
                        onClick={goToNext}
                        disabled={currentPage === totalPages}
                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <span className="sr-only">Next</span>
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </button>
                    </nav>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      {caseId && (
        <NotesPanel caseId={caseId} open={notesOpen} onClose={() => setNotesOpen(false)} />
      )}
    </div>
  );
}
