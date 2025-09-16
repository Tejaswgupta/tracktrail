"use client";

import { useState } from "react";
import { transactionExtractorService, type ExtractedTransaction } from "@/services/transactionExtractor";

interface ManualTransactionEntryProps {
  accountId: string;
  entityId: string;
  bankPreset: string;
  onTransactionsAdded: (transactions: ExtractedTransaction[]) => void;
  onCancel: () => void;
}

export default function ManualTransactionEntry({
  accountId,
  entityId,
  bankPreset,
  onTransactionsAdded,
  onCancel,
}: ManualTransactionEntryProps) {
  const [transactions, setTransactions] = useState([
    {
      tx_date: "",
      description: "",
      amount: 0,
      direction: "DR" as "DR" | "CR",
    },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addTransaction = () => {
    setTransactions([
      ...transactions,
      {
        tx_date: "",
        description: "",
        amount: 0,
        direction: "DR" as "DR" | "CR",
      },
    ]);
  };

  const removeTransaction = (index: number) => {
    if (transactions.length <= 1) return;
    const newTransactions = [...transactions];
    newTransactions.splice(index, 1);
    setTransactions(newTransactions);
  };

  const updateTransaction = (
    index: number,
    field: string,
    value: string | number
  ) => {
    const newTransactions = [...transactions];
    (newTransactions[index] as any)[field] = value;
    setTransactions(newTransactions);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Process each transaction through the extractor to get counterparty
      const processedTransactions: ExtractedTransaction[] = [];

      for (let i = 0; i < transactions.length; i++) {
        const tx = transactions[i];
        if (!tx.tx_date || !tx.description || tx.amount <= 0) {
          throw new Error(`Please fill in all fields for transaction ${i + 1}`);
        }

        // Extract counterparty using the same logic as the service
        const counterparty = transactionExtractorService.extractCounterparty(
          tx.description,
          bankPreset
        );

        processedTransactions.push({
          tx_date: tx.tx_date,
          description: tx.description,
          amount: tx.amount,
          direction: tx.direction,
          counterparty_merged: counterparty,
          original_index: -1, // Manual entries don't have original index
        });
      }

      onTransactionsAdded(processedTransactions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add transactions");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Manual Transaction Entry</h2>
      <p className="text-sm text-gray-600 mb-6">
        Enter the details for failed transactions manually
      </p>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6">
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
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {transactions.map((tx, index) => (
          <div key={index} className="border border-gray-200 rounded-lg p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                Transaction {index + 1}
              </h3>
              {transactions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeTransaction(index)}
                  className="text-red-600 hover:text-red-800"
                >
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
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date *
                </label>
                <input
                  type="date"
                  value={tx.tx_date}
                  onChange={(e) =>
                    updateTransaction(index, "tx_date", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={tx.amount || ""}
                  onChange={(e) =>
                    updateTransaction(
                      index,
                      "amount",
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description *
                </label>
                <input
                  type="text"
                  value={tx.description}
                  onChange={(e) =>
                    updateTransaction(index, "description", e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Type *
                </label>
                <select
                  value={tx.direction}
                  onChange={(e) =>
                    updateTransaction(
                      index,
                      "direction",
                      e.target.value as "DR" | "CR"
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="DR">Debit</option>
                  <option value="CR">Credit</option>
                </select>
              </div>
            </div>
          </div>
        ))}

        <div className="flex justify-between">
          <button
            type="button"
            onClick={addTransaction}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg
              className="w-5 h-5 mr-2"
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
            Add Another Transaction
          </button>
        </div>

        <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
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
                Adding...
              </>
            ) : (
              "Add Transactions"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}