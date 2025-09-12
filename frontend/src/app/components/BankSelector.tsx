"use client";

import { transactionExtractorService } from "@/services/transactionExtractor";
import { useEffect, useRef, useState } from "react";

interface BankOption {
  value: string;
  label: string;
  description: string;
}

interface BankSelectorProps {
  selectedBank: string;
  onBankChange: (bankPreset: string) => void;
  disabled?: boolean;
  onRegexTest?: (result: { extracted: number; failed: number }) => void;
  extractedData?: any[] | null;
}

export default function BankSelector({
  selectedBank,
  onBankChange,
  disabled = false,
  onRegexTest,
  extractedData,
}: BankSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customRegex, setCustomRegex] = useState("");
  const [testResult, setTestResult] = useState<{ extracted: number; failed: number } | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const banks = transactionExtractorService.getAvailableBanks();
  const selectedBankInfo = banks.find((bank) => bank.value === selectedBank);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleBankSelect = (bankPreset: string) => {
    onBankChange(bankPreset);
    setIsOpen(false);
  };

  const handleRegexTest = () => {
    if (!customRegex || !extractedData || extractedData.length === 0) return;
    
    setIsTesting(true);
    setTestResult(null);
    
    try {
      // Extract descriptions from the data
      const descriptions = extractedData.map(item => item.description || "");
      
      // Test the regex pattern
      const result = transactionExtractorService.testRegexOnDescriptions(
        descriptions,
        customRegex
      );
      
      setTestResult(result);
      if (onRegexTest) {
        onRegexTest(result);
      }
    } catch (error) {
      console.error("Error testing regex pattern:", error);
      setTestResult({ extracted: 0, failed: 0 });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Bank Type *
      </label>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        <div className="flex items-center">
          <span className="block truncate">
            {selectedBankInfo?.label || "Select a bank"}
          </span>
        </div>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${
              isOpen ? "rotate-180" : ""
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
        </span>
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
          {banks.map((bank) => (
            <div
              key={bank.value}
              onClick={() => handleBankSelect(bank.value)}
              className={`cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-blue-50 ${
                selectedBank === bank.value
                  ? "text-blue-900 bg-blue-50"
                  : "text-gray-900"
              }`}
            >
              <div className="flex flex-col">
                <span
                  className={`block truncate ${
                    selectedBank === bank.value
                      ? "font-semibold"
                      : "font-normal"
                  }`}
                >
                  {bank.label}
                </span>
                <span className="text-xs text-gray-500 mt-1">
                  {bank.description}
                </span>
              </div>
              {selectedBank === bank.value && (
                <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                  <svg
                    className="h-5 w-5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedBankInfo && (
        <p className="mt-2 text-sm text-gray-600">
          {selectedBankInfo.description}
        </p>
      )}

      {/* Custom Regex Input */}
      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Custom Regex Pattern
        </label>
        <div className="flex">
          <input
            type="text"
            value={customRegex}
            onChange={(e) => setCustomRegex(e.target.value)}
            placeholder="Enter regex pattern for counterparty extraction"
            className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={handleRegexTest}
            disabled={disabled || isTesting || !customRegex}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {isTesting ? "Testing..." : "Test"}
          </button>
        </div>
        
        {testResult && (
          <div className="mt-2 text-sm">
            <span className="text-green-600 font-medium">
              Extracted: {testResult.extracted}
            </span>
            <span className="mx-2">|</span>
            <span className="text-red-600 font-medium">
              Failed: {testResult.failed}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
