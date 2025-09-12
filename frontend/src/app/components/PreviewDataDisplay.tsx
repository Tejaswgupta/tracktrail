"use client";

import { ExtractedTransaction } from "@/services/transactionExtractor";
import { useState } from "react";

interface PreviewDataDisplayProps {
  transactions: ExtractedTransaction[];
  errors: string[];
}

export default function PreviewDataDisplay({ transactions, errors }: PreviewDataDisplayProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopyMarkdown = async () => {
    const headers = ['Date', 'Description', 'Amount', 'Type', 'Counterparty'];
    const separator = headers.map(() => '---').join(' | ');
    const escape = (s: string | undefined) =>
      (s ?? '-').toString().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const rows = transactions.map((tx) => {
      const cols = [
        tx.tx_date,
        escape(tx.description),
        tx.amount.toFixed(2),
        tx.direction,
        escape(tx.counterparty_merged || '-'),
      ];
      return `| ${cols.join(' | ')} |`;
    });
    const markdown = [
      `| ${headers.join(' | ')} |`,
      `| ${separator} |`,
      ...rows,
    ].join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(markdown);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = markdown;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopyStatus('copied');
    } catch (e) {
      setCopyStatus('error');
    } finally {
      setTimeout(() => setCopyStatus('idle'), 1500);
    }
  };

  if (transactions.length === 0 && errors.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 border border-gray-200 rounded-md p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-900">Preview of Extracted Transactions</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="inline-flex items-center rounded-md bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            Copy as Markdown
          </button>
          {copyStatus === 'copied' && (
            <span className="text-xs text-green-600">Copied!</span>
          )}
          {copyStatus === 'error' && (
            <span className="text-xs text-red-600">Failed to copy</span>
          )}
        </div>
      </div>
      
      {errors.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-red-800 mb-1">Preview Errors:</div>
          <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
            {errors.slice(0, 3).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
            {errors.length > 3 && (
              <li>...and {errors.length - 3} more errors</li>
            )}
          </ul>
        </div>
      )}
      
      {transactions.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Counterparty</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.map((transaction, index) => (
                <tr key={index} className="text-xs">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {transaction.tx_date}
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate" title={transaction.description}>
                    {transaction.description}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {transaction.amount.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      transaction.direction === "CR" 
                        ? "bg-green-100 text-green-800" 
                        : "bg-red-100 text-red-800"
                    }`}>
                      {transaction.direction}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate" title={transaction.counterparty_merged}>
                    {transaction.counterparty_merged || "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {transactions.length > 5 && (
            <div className="text-xs text-gray-500 mt-2">
              Showing 5 of {transactions.length} transactions
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-gray-500">
          No transactions could be extracted with the current bank preset and column mapping.
        </div>
      )}
    </div>
  );
}