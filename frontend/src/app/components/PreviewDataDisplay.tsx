"use client";

import { transactionExtractorService, type ExtractedTransaction, type ExtractionResult } from "@/services/transactionExtractor";
import { useEffect, useState } from "react";

interface PreviewDataDisplayProps {
  file: File | null;
  bankPreset: string;
  columnMapping: any;
  csvValidation: any;
}

export default function PreviewDataDisplay({ file, bankPreset, columnMapping, csvValidation }: PreviewDataDisplayProps) {
  const [previewData, setPreviewData] = useState<ExtractionResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  // Fetch preview data when dependencies change
  useEffect(() => {
    const fetchPreviewData = async () => {
      if (!file || !bankPreset || isPreviewLoading) return;
      
      // Only show preview for CSV or PDF files
      if (file.type !== "text/csv" && file.type !== "application/pdf") return;
      
      // Only show preview if we have valid column mapping or validation
      if (!csvValidation?.isValid && !columnMapping) return;
      
      setIsPreviewLoading(true);
      try {
        console.log("Fetching preview data for file:", file.name, "with bank:", bankPreset, "and mapping:", columnMapping);
        const preview = await transactionExtractorService.previewTransactions(
          file,
          bankPreset,
          columnMapping || undefined
        );
        console.log("Preview data fetched:", preview);
        setPreviewData(preview);
      } catch (error) {
        console.error("Preview error:", error);
        setPreviewData({
          transactions: [],
          errors: [error instanceof Error ? error.message : "Failed to generate preview"],
          summary: {
            totalTransactions: 0,
            totalCredits: 0,
            totalDebits: 0,
            dateRange: { from: "", to: "" },
          },
        });
      } finally {
        setIsPreviewLoading(false);
      }
    };

    fetchPreviewData();
  }, [file, bankPreset, columnMapping, csvValidation]);

  // Calculate success/failure rates
  const calculateExtractionStats = () => {
    if (!previewData || previewData.transactions.length === 0) {
      return { successRate: 0, failureRate: 0, total: 0 };
    }

    // Count successful extractions (where counterparty was extracted and is different from description)
    const successfulExtractions = previewData.transactions.filter(
      tx => tx.counterparty_merged && tx.counterparty_merged !== tx.description
    ).length;

    // Count failed extractions (where counterparty is same as description or missing)
    const failedExtractions = previewData.transactions.length - successfulExtractions;

    const total = previewData.transactions.length;
    const successRate = total > 0 ? Math.round((successfulExtractions / total) * 100) : 0;
    const failureRate = total > 0 ? Math.round((failedExtractions / total) * 100) : 0;

    return { successRate, failureRate, total, successfulExtractions, failedExtractions };
  };

  const stats = calculateExtractionStats();

  const handleCopyMarkdown = async () => {
    if (!previewData) return;
    
    const headers = ['Date', 'Description', 'Amount', 'Type', 'Counterparty'];
    const separator = headers.map(() => '---').join(' | ');
    const escape = (s: string | undefined) =>
      (s ?? '-').toString().replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const rows = previewData.transactions.map((tx) => {
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

  // Show loading state
  if (isPreviewLoading) {
    return (
      <div className="mt-4 border border-gray-200 rounded-md p-4 bg-gray-50">
        <div className="flex items-center justify-center">
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-gray-600"
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
          <span className="text-sm text-gray-600">Generating preview...</span>
        </div>
      </div>
    );
  }

  // Don't render if no data
  if (!previewData || (previewData.transactions.length === 0 && previewData.errors.length === 0)) {
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
      
      {/* Extraction Stats */}
      {previewData.transactions.length > 0 && (
        <div className="mb-4 p-3 bg-white rounded-md border border-gray-200">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-700">
              Extraction Stats for <span className="font-semibold">{bankPreset}</span> preset
            </div>
            <div className="flex gap-4">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">{stats.successRate}%</div>
                <div className="text-xs text-gray-500">Success Rate</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-red-600">{stats.failureRate}%</div>
                <div className="text-xs text-gray-500">Failure Rate</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">{stats.total}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
            </div>
          </div>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-green-600 h-2 rounded-full" 
              style={{ width: `${stats.successRate}%` }}
            ></div>
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {stats.successfulExtractions} successful, {stats.failedExtractions} failed extractions
          </div>
        </div>
      )}
      
      {previewData.errors.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-red-800 mb-1">Preview Errors:</div>
          <ul className="list-disc list-inside text-xs text-red-700 space-y-1">
            {previewData.errors.slice(0, 3).map((error, index) => (
              <li key={index}>{error}</li>
            ))}
            {previewData.errors.length > 3 && (
              <li>...and {previewData.errors.length - 3} more errors</li>
            )}
          </ul>
        </div>
      )}
      
      {previewData.transactions.length > 0 ? (
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
              {previewData.transactions.slice(0, 5).map((transaction, index) => (
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
          {previewData.transactions.length > 5 && (
            <div className="text-xs text-gray-500 mt-2">
              Showing 5 of {previewData.transactions.length} transactions
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