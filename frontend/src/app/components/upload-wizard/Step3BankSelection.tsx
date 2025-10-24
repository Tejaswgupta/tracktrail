"use client";

import { getAvailableBankPresets, type BankPreset } from "@/constants/banks";
import {
  transactionExtractorService,
  type ExtractionResult,
} from "@/services/transactionExtractor";
import { useEffect, useState } from "react";

interface Step3BankSelectionProps {
  file: File | null;
  columnMapping: any;
  selectedBank: BankPreset;
  onBankChange: (bank: BankPreset) => void;
  disabled?: boolean;
}

export default function Step3BankSelection({
  file,
  columnMapping,
  selectedBank,
  onBankChange,
  disabled = false,
}: Step3BankSelectionProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [previewData, setPreviewData] = useState<ExtractionResult | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const banks = getAvailableBankPresets();

  useEffect(() => {
    const fetchPreview = async () => {
      if (!file || !selectedBank) return;
      
      setIsPreviewLoading(true);
      try {
        const preview = await transactionExtractorService.previewTransactions(
          file,
          selectedBank,
          columnMapping || undefined
        );
        setPreviewData(preview);
      } catch (error) {
        console.error("Preview error:", error);
        setPreviewData(null);
      } finally {
        setIsPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [file, selectedBank, columnMapping]);

  const calculateExtractionStats = () => {
    if (!previewData || previewData.transactions.length === 0) {
      return {
        successRate: 0,
        failureRate: 0,
        total: 0,
      };
    }

    const successfulExtractions = previewData.transactions.filter(
      (tx) =>
        tx.counterparty_merged &&
        tx.counterparty_merged.trim() !== "" &&
        tx.counterparty_merged !== tx.description
    ).length;

    const total = previewData.transactions.length;
    const successRate =
      total > 0 ? Math.round((successfulExtractions / total) * 100) : 0;
    const failureRate = 100 - successRate;

    return {
      successRate,
      failureRate,
      total,
      successfulExtractions,
      failedExtractions: total - successfulExtractions,
    };
  };

  const stats = calculateExtractionStats();
  const filteredBanks = Object.entries(banks).filter(([_, label]) =>
    label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Select Bank Type
        </h3>
        <p className="text-sm text-gray-600">
          Choose the bank preset that matches your statement format
        </p>
      </div>

      {/* Bank Search */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Banks
        </label>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by bank name..."
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Bank Grid */}
      <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
        {filteredBanks.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => onBankChange(value as BankPreset)}
            disabled={disabled}
            className={`p-3 text-left border-2 rounded-lg transition-all ${
              selectedBank === value
                ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600"
                : "border-gray-200 hover:border-blue-300"
            } disabled:opacity-50`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-900">{label}</span>
              {selectedBank === value && (
                <svg
                  className="h-5 w-5 text-blue-600"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Extraction Preview */}
      {isPreviewLoading ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-center">
            <svg
              className="animate-spin h-5 w-5 text-gray-600 mr-2"
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
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span className="text-sm text-gray-600">Loading preview...</span>
          </div>
        </div>
      ) : previewData && previewData.transactions.length > 0 ? (
        <div className="space-y-4">
          {/* Extraction Stats */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Extraction Results for "{banks[selectedBank]}"
            </h4>
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {stats.successRate}%
                  </div>
                  <div className="text-xs text-gray-500">Success</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-600">
                    {stats.failureRate}%
                  </div>
                  <div className="text-xs text-gray-500">Failed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {stats.total}
                  </div>
                  <div className="text-xs text-gray-500">Total</div>
                </div>
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${stats.successRate}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {stats.successfulExtractions} counterparties extracted, {stats.failedExtractions} failed
            </p>
          </div>

          {/* Sample Transactions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Sample Transactions (First 3)
            </h4>
            <div className="space-y-2">
              {previewData.transactions.slice(0, 3).map((tx, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3 rounded border border-gray-200"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-medium text-gray-900">
                      {tx.tx_date}
                    </span>
                    <span
                      className={`text-xs font-semibold ${
                        tx.direction === "CR"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {tx.direction} {tx.amount.toFixed(2)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 truncate mb-1">
                    {tx.description}
                  </p>
                  <div className="flex items-center text-xs">
                    <span className="text-gray-500 mr-2">Counterparty:</span>
                    <span
                      className={`font-medium ${
                        tx.counterparty_merged &&
                        tx.counterparty_merged !== tx.description
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {tx.counterparty_merged || "Not extracted"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
