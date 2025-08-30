"use client";

import { amlBackendClient } from "@/services/amlBackendClient";
import { transactionsService } from "@/services/database";
import { AIResponse } from "@/types/amlBackend";
import { Transaction } from "@/types/database";
import { useEffect, useState } from "react";

// Persistent client-side cache for AI analysis (no expiration)

const buildCacheKey = (caseId: string, entityIds: string[]) => {
  const sorted = Array.from(new Set(entityIds)).sort();
  return `ai_llm_analysis:${caseId}:${sorted.join(",")}`;
};

const readCache = (key: string): AIResponse | null => {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(key) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: AIResponse; ts?: number };
    // No TTL check: persist until explicitly cleared
    return parsed.data;
  } catch (e) {
    console.warn("AI cache read failed:", e);
    return null;
  }
};

const writeCache = (key: string, data: AIResponse) => {
  try {
    if (typeof window !== "undefined") {
      localStorage.setItem(key, JSON.stringify({ data }));
    }
  } catch (e) {
    // Ignore quota/security errors silently
    console.warn("AI cache write failed:", e);
  }
};

interface AIModeTabProps {
  caseId: string;
}

interface AMLFlag {
  type: string;
  description: string;
  transactions: string[];
  severity: "low" | "medium" | "high";
}



export default function AIModeTab({ caseId }: AIModeTabProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] =
    useState<AIResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forceRerun, setForceRerun] = useState(false);

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const txData = await transactionsService.getCaseTransactionsForAnalysis(
          caseId
        );
        setTransactions(txData);
      } catch (err) {
        setError("Failed to load transactions");
        console.error("Error fetching transactions:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
  }, [caseId]);

  const analyzeWithAI = async (force = false) => {
    setError(null);
    setAnalyzing(true);
    const entityIds = transactions.map((tx) => tx.entity_id);
    const cacheKey = buildCacheKey(caseId, entityIds);

    // 1) Try cache first unless force re-run
    if (!force) {
      const cached = readCache(cacheKey);
      if (cached) {
        setAnalysisResult(cached);
        setAnalyzing(false);
        console.log("Using cached AI analysis");
        return;
      }
    }

    // 2) Fallback to API and cache the result
    try {
      const result = await amlBackendClient.analyzeAIllm({
        entity_ids: Array.from(new Set(entityIds)),
      });
      console.log(`API response`, result.data,)
      setAnalysisResult(result.data);
      writeCache(cacheKey, result.data);
      console.log("AI analysis computed and cached");
    } catch (err) {
      setError("Failed to analyze transactions");
      console.error("Error analyzing transactions:", err);
    } finally {
      setAnalyzing(false);
    }

  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "bg-red-100 text-red-800";
      case "medium":
        return "bg-yellow-100 text-yellow-800";
      case "low":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-600">Loading transactions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <div className="mt-2 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              AI-Powered AML Analysis
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Uses advanced AI to detect potential money laundering patterns in
              transactions
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">Total Transactions</p>
            <p className="text-2xl font-semibold text-gray-900">
              {transactions.length.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-blue-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1 md:flex md:justify-between">
              <p className="text-sm text-blue-700">
                AI analysis will process transactions.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center">
            <input
              id="force-rerun"
              type="checkbox"
              className="h-4 w-4 text-blue-600 border-gray-300 rounded"
              checked={forceRerun}
              onChange={(e) => setForceRerun(e.target.checked)}
              disabled={analyzing}
            />
            <label htmlFor="force-rerun" className="ml-2 text-sm text-gray-700">
              Force re-run (ignore cache)
            </label>
          </div>
          <button
            onClick={() => analyzeWithAI(forceRerun)}
            disabled={analyzing || transactions.length === 0}
            className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${analyzing || transactions.length === 0
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              }`}
          >
            {analyzing ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                  xmlns="http://www.w3.org/2000/svg"
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
                Analyzing with AI...
              </>
            ) : (
              "Run AI-Powered AML Analysis"
            )}
          </button>
        </div>
      </div>

      {analysisResult && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            AI Analysis Results
          </h3>

          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-800 mb-2">Summary</h4>
            <p className="text-gray-700">{analysisResult.summary}</p>
          </div>

          {analysisResult.flags.length > 0 && (
            <div className="mb-6">
              <h4 className="text-md font-medium text-gray-800 mb-2">
                Identified Flags
              </h4>
              <div className="space-y-3">
                {analysisResult.flags.map((flag, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-md p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(
                            flag.severity
                          )}`}
                        >
                          {flag.severity.charAt(0).toUpperCase() +
                            flag.severity.slice(1)}
                        </span>
                        <h5 className="text-md font-medium text-gray-900 mt-2">
                          {flag.type}
                        </h5>
                        <p className="text-sm text-gray-600 mt-1">
                          {flag.description}
                        </p>
                      </div>
                    </div>
                    {flag.transactions_ids?.length > 0 && (
                      <div className="mt-2">
                        <p className="text-xs text-gray-500">
                          Related transactions: {flag.transactions_ids.join(", ")}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysisResult.recommendations.length > 0 && (
            <div>
              <h4 className="text-md font-medium text-gray-800 mb-2">
                Recommendations
              </h4>
              <ul className="list-disc pl-5 space-y-1">
                {analysisResult.recommendations.map((rec, index) => (
                  <li key={index} className="text-gray-700">
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysisResult.flags.length === 0 &&
            analysisResult.recommendations.length === 0 && (
              <div className="text-center py-8">
                <svg
                  className="mx-auto h-12 w-12 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">
                  No suspicious activities detected
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  The AI analysis did not identify any significant AML flags in
                  the transactions.
                </p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
