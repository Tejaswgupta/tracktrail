"use client";

import { useState, useEffect } from "react";
import { transactionsService } from "@/services/database";
import { transactionExtractorService } from "@/services/transactionExtractor";
import type { Transaction } from "@/types/database";

interface TransactionFixerProps {
  accountId: string;
  caseId?: string;
  bankPreset?: string;
}

interface EditingTransaction extends Transaction {
  isEditing: boolean;
  editedCounterparty?: string;
  editedDescription?: string;
  editedAmount?: number;
  editedDate?: string;
  extractionError?: string;
}

export default function TransactionFixer({
  accountId,
  caseId,
  bankPreset = "generic",
}: TransactionFixerProps) {
  const [failedTransactions, setFailedTransactions] = useState<EditingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [bulkCounterparty, setBulkCounterparty] = useState("");
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [regexPattern, setRegexPattern] = useState("");
  const [testRegexPattern, setTestRegexPattern] = useState("");
  const [testingRegex, setTestingRegex] = useState(false);
  const [regexTestResult, setRegexTestResult] = useState<{ extracted: number; failed: number } | null>(null);

  // Load failed transactions
  useEffect(() => {
    loadFailedTransactions();
  }, [accountId]);

  const loadFailedTransactions = async () => {
    setLoading(true);
    try {
      const allTransactions = await transactionsService.getByAccountId(accountId);
      const failed = allTransactions
        .filter(tx => !tx.counterparty_merged || tx.counterparty_merged.trim() === "")
        .map(tx => ({
          ...tx,
          isEditing: false,
          editedCounterparty: "",
          editedDescription: tx.description || "",
          editedAmount: tx.amount,
          editedDate: tx.tx_date,
        }));

      setFailedTransactions(failed);
    } catch (error) {
      console.error("Error loading failed transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTransactionSelection = (transactionId: string) => {
    setSelectedTransactions(prev =>
      prev.includes(transactionId)
        ? prev.filter(id => id !== transactionId)
        : [...prev, transactionId]
    );
  };

  const selectAllTransactions = () => {
    setSelectedTransactions(failedTransactions.map(tx => tx.transaction_id));
  };

  const clearSelection = () => {
    setSelectedTransactions([]);
  };

  const toggleEditMode = (transactionId: string) => {
    setFailedTransactions(prev =>
      prev.map(tx =>
        tx.transaction_id === transactionId
          ? { ...tx, isEditing: !tx.isEditing }
          : tx
      )
    );
  };

  const updateTransactionField = (
    transactionId: string,
    field: keyof EditingTransaction,
    value: any
  ) => {
    setFailedTransactions(prev =>
      prev.map(tx =>
        tx.transaction_id === transactionId
          ? { ...tx, [field]: value, extractionError: undefined }
          : tx
      )
    );
  };

  const validateTransaction = (transaction: EditingTransaction) => {
    const errors: string[] = [];

    const description = transaction.editedDescription || transaction.description;
    if (!description || description.trim().length === 0) {
      errors.push("Description is required");
    }

    const amount = transaction.editedAmount || transaction.amount;
    if (!amount || amount <= 0) {
      errors.push("Amount must be greater than 0");
    }

    const date = transaction.editedDate || transaction.tx_date;
    if (!date) {
      errors.push("Date is required");
    } else {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) {
        errors.push("Invalid date format");
      }
    }

    return errors;
  };

  const extractCounterparty = async (transactionId: string) => {
    const transaction = failedTransactions.find(tx => tx.transaction_id === transactionId);
    if (!transaction) return;

    try {
      const description = transaction.editedDescription || transaction.description || "";
      const extractedCounterparty = transactionExtractorService.extractCounterparty(
        description,
        bankPreset
      );

      if (extractedCounterparty) {
        updateTransactionField(transactionId, "editedCounterparty", extractedCounterparty);
      } else {
        updateTransactionField(transactionId, "extractionError", "No counterparty found in description");
      }
    } catch (error) {
      updateTransactionField(transactionId, "extractionError", "Extraction failed");
    }
  };

  const extractCounterpartyForSelected = async () => {
    setSaving(true);
    try {
      for (const transactionId of selectedTransactions) {
        await extractCounterparty(transactionId);
      }
    } catch (error) {
      console.error("Error extracting counterparty for selected transactions:", error);
    } finally {
      setSaving(false);
    }
  };

  const saveTransaction = async (transactionId: string) => {
    const transaction = failedTransactions.find(tx => tx.transaction_id === transactionId);
    if (!transaction) return;

    // Validate data before saving
    const validationErrors = validateTransaction(transaction);
    if (validationErrors.length > 0) {
      updateTransactionField(transactionId, "extractionError", validationErrors.join(", "));
      return;
    }

    setSaving(true);
    try {
      // Update transaction in database
      await transactionsService.updateTransaction(transactionId, {
        description: (transaction.editedDescription || transaction.description)?.trim(),
        amount: transaction.editedAmount || transaction.amount,
        tx_date: transaction.editedDate || transaction.tx_date,
        counterparty_merged: transaction.editedCounterparty?.trim() || transaction.counterparty_merged?.trim(),
      });

      // Refresh failed transactions list
      await loadFailedTransactions();
    } catch (error) {
      console.error("Error saving transaction:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save transaction";
      updateTransactionField(transactionId, "extractionError", errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const saveSelectedTransactions = async () => {
    if (selectedTransactions.length === 0) return;

    setSaving(true);
    const errors: string[] = [];

    try {
      for (const transactionId of selectedTransactions) {
        const transaction = failedTransactions.find(tx => tx.transaction_id === transactionId);
        if (transaction) {
          const validationErrors = validateTransaction(transaction);
          if (validationErrors.length > 0) {
            errors.push(`Transaction ${transactionId}: ${validationErrors.join(", ")}`);
            continue;
          }

          try {
            await transactionsService.updateTransaction(transactionId, {
              description: (transaction.editedDescription || transaction.description)?.trim(),
              amount: transaction.editedAmount || transaction.amount,
              tx_date: transaction.editedDate || transaction.tx_date,
              counterparty_merged: transaction.editedCounterparty?.trim() || transaction.counterparty_merged?.trim(),
            });
          } catch (saveError) {
            errors.push(`Transaction ${transactionId}: ${saveError instanceof Error ? saveError.message : "Save failed"}`);
          }
        }
      }

      if (errors.length > 0) {
        alert(`Some transactions failed to save:\n${errors.join("\n")}`);
      }

      // Refresh failed transactions list
      await loadFailedTransactions();
      setSelectedTransactions([]);
    } catch (error) {
      console.error("Error saving selected transactions:", error);
      alert("Failed to save transactions. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const applyBulkCounterparty = async () => {
    if (!bulkCounterparty.trim()) return;

    setSaving(true);
    try {
      for (const transactionId of selectedTransactions) {
        updateTransactionField(transactionId, "editedCounterparty", bulkCounterparty.trim());
      }
    } catch (error) {
      console.error("Error applying bulk counterparty:", error);
      alert("Failed to apply bulk counterparty");
    } finally {
      setSaving(false);
      setBulkCounterparty("");
      setShowBulkEdit(false);
    }
  };

  const testCustomRegex = async () => {
    if (!testRegexPattern) return;

    setTestingRegex(true);
    try {
      // Get descriptions from selected transactions for testing
      const descriptions = selectedTransactions.map(id => {
        const tx = failedTransactions.find(t => t.transaction_id === id);
        return tx?.editedDescription || tx?.description || "";
      }).filter(desc => desc.length > 0);

      if (descriptions.length === 0) {
        setRegexTestResult({ extracted: 0, failed: 0 });
        return;
      }

      // Test regex pattern
      const result = transactionExtractorService.testRegexOnDescriptions(
        descriptions,
        testRegexPattern
      );

      setRegexTestResult(result);
    } catch (error) {
      console.error("Error testing regex pattern:", error);
      setRegexTestResult({ extracted: 0, failed: 0 });
    } finally {
      setTestingRegex(false);
    }
  };

  const applyCustomRegex = async () => {
    if (!regexPattern) return;

    setSaving(true);
    try {
      // Set custom regex pattern temporarily
      transactionExtractorService.setCustomRegexPattern(regexPattern);

      for (const transactionId of selectedTransactions) {
        const transaction = failedTransactions.find(tx => tx.transaction_id === transactionId);
        if (transaction) {
          const description = transaction.editedDescription || transaction.description || "";
          const extractedCounterparty = transactionExtractorService.extractCounterparty(
            description,
            bankPreset
          );

          if (extractedCounterparty) {
            updateTransactionField(transactionId, "editedCounterparty", extractedCounterparty);
            updateTransactionField(transactionId, "extractionError", undefined);
          } else {
            updateTransactionField(transactionId, "extractionError", "No match with custom regex");
          }
        }
      }
    } catch (error) {
      console.error("Error applying custom regex:", error);
      alert("Failed to apply custom regex pattern");
    } finally {
      setSaving(false);
      // Clear custom regex pattern
      transactionExtractorService.setCustomRegexPattern(null);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (failedTransactions.length === 0) {
    return (
      <div className="text-center p-8">
        <div className="text-green-600 mb-2">
          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">No Failed Transactions</h3>
        <p className="text-sm text-gray-600">All transactions have been successfully processed!</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">
            Failed Transactions ({failedTransactions.length})
          </h2>
          <div className="flex items-center space-x-2">
            {selectedTransactions.length > 0 && (
              <>
                <span className="text-sm text-gray-600">
                  {selectedTransactions.length} selected
                </span>
                <button
                  onClick={clearSelection}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={selectAllTransactions}
            disabled={saving}
            className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
          >
            Select All
          </button>

          {selectedTransactions.length > 0 && (
            <>
              <button
                onClick={extractCounterpartyForSelected}
                disabled={saving}
                className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Extracting..." : "Auto Extract"}
              </button>

              <button
                onClick={() => setShowBulkEdit(!showBulkEdit)}
                disabled={saving}
                className="px-3 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                Bulk Edit
              </button>

              <button
                onClick={saveSelectedTransactions}
                disabled={saving || selectedTransactions.length === 0}
                className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save Selected"}
              </button>
            </>
          )}
        </div>

        {/* Bulk Edit Panel */}
        {showBulkEdit && selectedTransactions.length > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Bulk Counterparty
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={bulkCounterparty}
                    onChange={(e) => setBulkCounterparty(e.target.value)}
                    placeholder="Enter counterparty name"
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={applyBulkCounterparty}
                    disabled={!bulkCounterparty.trim() || saving}
                    className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Custom Regex Pattern
                </label>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={regexPattern}
                    onChange={(e) => setRegexPattern(e.target.value)}
                    placeholder="Enter regex pattern"
                    className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={applyCustomRegex}
                    disabled={!regexPattern.trim() || saving}
                    className="px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>

            {/* Regex Testing */}
            <div className="mt-3 p-2 bg-white rounded border border-gray-200">
              <div className="flex items-center space-x-2 mb-2">
                <label className="text-xs font-medium text-gray-700">Test Regex:</label>
                <input
                  type="text"
                  value={testRegexPattern}
                  onChange={(e) => setTestRegexPattern(e.target.value)}
                  placeholder="Regex pattern to test"
                  className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  onClick={testCustomRegex}
                  disabled={!testRegexPattern.trim() || testingRegex}
                  className="px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                >
                  {testingRegex ? "Testing..." : "Test"}
                </button>
              </div>

              {regexTestResult && (
                <div className="text-xs text-gray-600">
                  <span className="text-green-600">Extracted: {regexTestResult.extracted}</span>
                  {" • "}
                  <span className="text-red-600">Failed: {regexTestResult.failed}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                <input
                  type="checkbox"
                  checked={selectedTransactions.length === failedTransactions.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      selectAllTransactions();
                    } else {
                      clearSelection();
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Counterparty
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {failedTransactions.map((transaction) => (
              <tr key={transaction.transaction_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs">
                  <input
                    type="checkbox"
                    checked={selectedTransactions.includes(transaction.transaction_id)}
                    onChange={() => toggleTransactionSelection(transaction.transaction_id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-3 py-2 text-xs">
                  {transaction.isEditing ? (
                    <input
                      type="date"
                      value={transaction.editedDate || transaction.tx_date}
                      onChange={(e) => updateTransactionField(transaction.transaction_id, "editedDate", e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    formatDate(transaction.tx_date)
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {transaction.isEditing ? (
                    <input
                      type="text"
                      value={transaction.editedDescription || transaction.description || ""}
                      onChange={(e) => updateTransactionField(transaction.transaction_id, "editedDescription", e.target.value)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    <div className="max-w-xs truncate" title={transaction.description}>
                      {transaction.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {transaction.isEditing ? (
                    <input
                      type="number"
                      value={transaction.editedAmount || transaction.amount}
                      onChange={(e) => updateTransactionField(transaction.transaction_id, "editedAmount", parseFloat(e.target.value) || 0)}
                      className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  ) : (
                    formatCurrency(transaction.amount)
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {transaction.isEditing ? (
                    <div className="flex items-center space-x-1">
                      <input
                        type="text"
                        value={transaction.editedCounterparty || ""}
                        onChange={(e) => updateTransactionField(transaction.transaction_id, "editedCounterparty", e.target.value)}
                        placeholder="Extract counterparty"
                        className="flex-1 px-1 py-0.5 text-xs border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => extractCounterparty(transaction.transaction_id)}
                        disabled={saving}
                        className="p-0.5 text-blue-600 hover:text-blue-800"
                        title="Auto extract counterparty"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <span className="text-red-600 italic">
                      {transaction.editedCounterparty || transaction.counterparty_merged || "Not extracted"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <div className="flex items-center space-x-1">
                    {transaction.isEditing ? (
                      <>
                        <button
                          onClick={() => saveTransaction(transaction.transaction_id)}
                          disabled={saving}
                          className="p-1 text-green-600 hover:text-green-800"
                          title="Save"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => toggleEditMode(transaction.transaction_id)}
                          disabled={saving}
                          className="p-1 text-gray-600 hover:text-gray-800"
                          title="Cancel"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => toggleEditMode(transaction.transaction_id)}
                          disabled={saving}
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      </>
                    )}

                    {transaction.extractionError && (
                      <span className="text-red-500 text-xs" title={transaction.extractionError}>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {failedTransactions.length > 0 && (
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {failedTransactions.length} failed transactions
            </div>
            <div className="text-xs text-gray-500">
              Use bulk operations to fix multiple transactions at once
            </div>
          </div>
        </div>
      )}
    </div>
  );
}