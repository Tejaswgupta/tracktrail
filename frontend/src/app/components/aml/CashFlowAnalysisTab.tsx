"use client";

import { amlBackendClient } from "@/services/amlBackendClient";
import { Transaction } from "@/types/database";
import { useEffect, useState } from "react";

interface CashFlowAnalysisTabProps {
  caseId: string;
  amlMetadata: {
    entityIds: string[];
    dateRange: { from: string; to: string };
    transactionCount: number;
    totalVolume: number;
  };
  selectedEntityIds: string[];
}

interface CashFlowMetrics {
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  cashTransactionCount: number;
  cashTransactionVolume: number;
  cashTransactionPercentage: number;
  largeCashTransactions: Transaction[];
  dailyCashFlow: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netFlow: number;
    transactionCount: number;
  }>;
  topCashCounterparties: Array<{
    counterparty: string;
    totalAmount: number;
    transactionCount: number;
    avgAmount: number;
  }>;
  // New fields from API
  largeCashCount: number;
  largeCashThreshold: number;
  amountPatterns: {
    averageAmount: number;
    medianAmount: number;
    maxAmount: number;
    minAmount: number;
  };
  frequencySummary: {
    avgMonthlyTransactions: number;
    dayOfWeekPattern: Record<string, number>;
    peakActivityDay: string;
  };
  temporalSummary: {
    dateRangeDays: number;
    analysisPeriod: { start: string; end: string };
  };
  cashTransactionsFound: boolean;
  insights: string[];
  riskIndicators: string[];
}

interface CashFlowPattern {
  pattern: string;
  description: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  transactions: Transaction[];
  amount: number;
  frequency: number;
}

export default function CashFlowAnalysisTab({
  caseId,
  amlMetadata,
  selectedEntityIds,
}: CashFlowAnalysisTabProps) {
  const [loading, setLoading] = useState(true);

  const [cashFlowMetrics, setCashFlowMetrics] =
    useState<CashFlowMetrics | null>(null);
  const [suspiciousPatterns, setSuspiciousPatterns] = useState<
    CashFlowPattern[]
  >([]);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [dateFrom, setDateFrom] = useState<string>(
    amlMetadata.dateRange.from || ""
  );
  const [dateTo, setDateTo] = useState<string>(amlMetadata.dateRange.to || "");
  const [threshold, setThreshold] = useState<number>(50000);
  const [keywordsInput, setKeywordsInput] = useState<string>(
    "CASH, ATM, WITHDRAWAL, CHQ"
  );
  const [dateError, setDateError] = useState<string | null>(null);

  // Map backend risk score [0-1] to UI risk level
  const riskLevelFromScore = (score: number): "LOW" | "MEDIUM" | "HIGH" => {
    if (score >= 0.7) return "HIGH";
    if (score >= 0.4) return "MEDIUM";
    return "LOW";
  };

  // Transform backend CashFlowResult into UI-friendly structures
  const mapBackendToUI = (
    backend: any,
    totalTxCount: number
  ): { metrics: CashFlowMetrics; patterns: CashFlowPattern[] } => {
    // Allow alternate backend shapes using safe fallbacks
    const results = (backend?.results ?? {}) as any;

    const inflow = Number(results.total_cash_in ?? 0);
    const outflow = Number(results.total_cash_out ?? 0);
    const cashTxCount = Number(results.total_cash_transactions ?? 0);

    // Prefer daily patterns; fall back to monthly frequency counts
    const dailyPatterns =
      results.temporal_patterns?.daily_patterns ??
      results.frequency_analysis?.monthly_frequency ??
      {};

    const dailyCashFlow: CashFlowMetrics["dailyCashFlow"] = Object.keys(
      dailyPatterns
    )
      .sort()
      .map((date) => ({
        date,
        inflow: 0,
        outflow: 0,
        netFlow: dailyPatterns[date] ?? 0,
        transactionCount: Number(dailyPatterns[date] ?? 0),
      }));

    // Map large cash transactions (if provided) into Transaction[] for the table
    const largeTxRaw: any[] = Array.isArray(results.large_transactions)
      ? results.large_transactions
      : [];

    const largeCashTransactions: Transaction[] = largeTxRaw.map((t, idx) => {
      const credit = Number(t.CREDIT ?? 0);
      const debit = Number(t.DEBIT ?? 0);
      const isCredit = credit > 0;
      const amount = isCredit ? credit : debit;

      return {
        transaction_id: `large_${idx}_${t.DATE ?? "unknown"}`,
        account_id: "unknown",
        entity_id: "unknown",
        statement_id: "unknown",
        tx_date: String(t.DATE ?? new Date().toISOString()),
        description: String(t.DESCRIPTION ?? ""),
        amount: amount,
        direction: isCredit ? "CR" : "DR",
        counterparty_merged: "",
        balance: undefined,
        original_index: 0,
        created_at: new Date().toISOString(),
        created_by: "system",
      };
    });

    // Additional fields from API
    const largeCashCount = Number(results.large_cash_transactions ?? 0);
    const largeCashThreshold = Number(results.large_cash_threshold ?? 0);

    const amountPatternsRaw = results.amount_patterns ?? {};
    const amountPatterns = {
      averageAmount: Number(amountPatternsRaw.average_amount ?? 0),
      medianAmount: Number(amountPatternsRaw.median_amount ?? 0),
      maxAmount: Number(amountPatternsRaw.max_amount ?? 0),
      minAmount: Number(amountPatternsRaw.min_amount ?? 0),
    };

    const freq = results.frequency_analysis ?? {};
    const frequencySummary = {
      avgMonthlyTransactions: Number(freq.avg_monthly_transactions ?? 0),
      dayOfWeekPattern: (freq.day_of_week_pattern ?? {}) as Record<string, number>,
      peakActivityDay: String(freq.peak_activity_day ?? ""),
    };

    const temporal = results.temporal_patterns ?? {};
    const temporalSummary = {
      dateRangeDays: Number(temporal.date_range_days ?? 0),
      analysisPeriod: {
        start: String(temporal.analysis_period?.start ?? ""),
        end: String(temporal.analysis_period?.end ?? ""),
      },
    };

    const cashTransactionsFound = Boolean(results.cash_transactions_found ?? false);
    const insights = Array.isArray(backend?.insights) ? backend.insights : [];
    const riskIndicators = Array.isArray(backend?.risk_indicators)
      ? backend.risk_indicators
      : [];

    const metrics: CashFlowMetrics = {
      totalInflow: inflow,
      totalOutflow: outflow,
      netFlow: inflow - outflow,
      cashTransactionCount: cashTxCount,
      cashTransactionVolume: inflow + outflow,
      cashTransactionPercentage:
        totalTxCount > 0 ? (cashTxCount / totalTxCount) * 100 : 0,
      largeCashTransactions,
      dailyCashFlow,
      topCashCounterparties: [],
      largeCashCount,
      largeCashThreshold,
      amountPatterns,
      frequencySummary,
      temporalSummary,
      cashTransactionsFound,
      insights,
      riskIndicators,
    };

    const patterns: any[] = (results.cash_patterns || []).map(
      (p: any) => ({
        pattern: p.pattern_type,
        description: `${p.pattern_type} pattern detected`,
        riskLevel: riskLevelFromScore(p.risk_score ?? 0),
        transactions: [],
        amount: p.total_amount || 0,
        frequency: p.frequency || 0,
      })
    );

    return { metrics, patterns };
  };

  useEffect(() => {
    let isCancelled = false;

    const fetchCashFlow = async () => {
      if (!selectedEntityIds || selectedEntityIds.length === 0) {
        setLoading(false);
        setAnalysisComplete(false);
        setCashFlowMetrics(null);
        setSuspiciousPatterns([]);
        return;
      }

      try {
        setLoading(true);
        setAnalysisComplete(false);

        const fromDate = dateFrom
          ? new Date(dateFrom)
          : amlMetadata.dateRange.from
          ? new Date(amlMetadata.dateRange.from)
          : undefined;
        const toDate = dateTo
          ? new Date(dateTo)
          : amlMetadata.dateRange.to
          ? new Date(amlMetadata.dateRange.to)
          : undefined;

        // Validate date range if both provided
        if (fromDate && toDate && fromDate > toDate) {
          setDateError("From date must be before To date");
          setLoading(false);
          setAnalysisComplete(false);
          setCashFlowMetrics(null);
          setSuspiciousPatterns([]);
          return;
        } else {
          setDateError(null);
        }

        console.log(`Entity IDs`, selectedEntityIds);

        const parsedKeywords = keywordsInput
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k.length > 0);

        const response = await amlBackendClient.analyzeCashFlow({
          entity_ids: selectedEntityIds,
          date_from: fromDate ? fromDate.toISOString() : undefined,
          date_to: toDate ? toDate.toISOString() : undefined,
          granularity: "daily",
          threshold: threshold > 0 ? threshold : undefined,
          cash_keywords: parsedKeywords.length > 0 ? parsedKeywords : undefined,
        });

        if (isCancelled) return;

        const { metrics, patterns } = mapBackendToUI(
          response.data,
          response.metadata?.transaction_count ?? 0
        );

        setCashFlowMetrics(metrics);
        setSuspiciousPatterns(patterns);
        setAnalysisComplete(true);
      } catch (error) {
        console.error("Cash flow analysis failed", error);
        setAnalysisComplete(false);
        setCashFlowMetrics(null);
        setSuspiciousPatterns([]);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchCashFlow();

    return () => {
      isCancelled = true;
    };
  }, [
    selectedEntityIds,
    dateFrom,
    dateTo,
    threshold,
    keywordsInput,
    amlMetadata.dateRange.from,
    amlMetadata.dateRange.to,
  ]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRiskColor = (riskLevel: string) => {
    switch (riskLevel) {
      case "HIGH":
        return "text-red-600 bg-red-50 border-red-200";
      case "MEDIUM":
        return "text-yellow-600 bg-yellow-50 border-yellow-200";
      case "LOW":
        return "text-green-600 bg-green-50 border-green-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">
            Analyzing cash flow patterns...
          </span>
        </div>
      </div>
    );
  }

  if (!analysisComplete || !cashFlowMetrics) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
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
              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Cash Flow Analysis
        </h3>
        <p className="text-gray-500">
          Click "Start Analysis" to begin cash flow pattern detection
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Cash Flow Analysis
          </h3>
        </div>

        {/* Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From date
            </label>
            <input
              type="date"
              value={dateFrom ? dateFrom.slice(0, 10) : ""}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To date
            </label>
            <input
              type="date"
              value={dateTo ? dateTo.slice(0, 10) : ""}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Large cash threshold (₹)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cash keywords (comma-separated)
            </label>
            <input
              type="text"
              value={keywordsInput}
              onChange={(e) => setKeywordsInput(e.target.value)}
              className="w-full border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., CASH, ATM, WITHDRAWAL, CHQ"
            />
          </div>
        </div>

        {dateError && (
          <p className="text-sm text-red-600 mb-2" role="alert">
            {dateError}
          </p>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 11l5-5m0 0l5 5m-5-5v12"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-green-600">
                  Total Inflow
                </p>
                <p className="text-2xl font-semibold text-green-900">
                  {formatCurrency(cashFlowMetrics.totalInflow)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-red-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 13l-5 5m0 0l-5-5m5 5V6"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-red-600">
                  Total Outflow
                </p>
                <p className="text-2xl font-semibold text-red-900">
                  {formatCurrency(cashFlowMetrics.totalOutflow)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-blue-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-blue-600">
                  Cash Transactions
                </p>
                <p className="text-2xl font-semibold text-blue-900">
                  {cashFlowMetrics.cashTransactionCount}
                </p>
                <p className="text-xs text-blue-600">
                  {cashFlowMetrics.cashTransactionPercentage.toFixed(1)}% of all
                  transactions
                </p>
              </div>
            </div>
          </div>

          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-purple-600"
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
              <div className="ml-4">
                <p className="text-sm font-medium text-purple-600">
                  Cash Volume
                </p>
                <p className="text-2xl font-semibold text-purple-900">
                  {formatCurrency(cashFlowMetrics.cashTransactionVolume)}
                </p>
              </div>
            </div>
          </div>

          {/* Large Cash Count */}
          <div className="bg-yellow-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-yellow-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-yellow-600">
                  Large Cash Count
                </p>
                <p className="text-2xl font-semibold text-yellow-900">
                  {cashFlowMetrics.largeCashCount}
                </p>
              </div>
            </div>
          </div>

          {/* Large Cash Threshold */}
          <div className="bg-indigo-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-indigo-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-indigo-600">
                  Large Threshold
                </p>
                <p className="text-2xl font-semibold text-indigo-900">
                  {formatCurrency(cashFlowMetrics.largeCashThreshold || threshold)}
                </p>
              </div>
            </div>
          </div>

          {/* Avg Monthly Cash Tx */}
          <div className="bg-teal-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-teal-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M3 6h18M3 14h18M3 18h18"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-teal-600">
                  Avg Monthly Cash Tx
                </p>
                <p className="text-2xl font-semibold text-teal-900">
                  {cashFlowMetrics.frequencySummary.avgMonthlyTransactions.toFixed(
                    1
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Peak Activity Day */}
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="w-8 h-8 text-orange-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6l4 2"
                  />
                </svg>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-orange-600">
                  Peak Activity Day
                </p>
                <p className="text-2xl font-semibold text-orange-900">
                  {cashFlowMetrics.frequencySummary.peakActivityDay || "N/A"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cash Flow Insights */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Cash Flow Insights
        </h3>

        {/* Amount Patterns */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Amount Patterns
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Average</div>
              <div className="text-base font-semibold text-gray-900">
                {formatCurrency(cashFlowMetrics.amountPatterns.averageAmount)}
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Median</div>
              <div className="text-base font-semibold text-gray-900">
                {formatCurrency(cashFlowMetrics.amountPatterns.medianAmount)}
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Max</div>
              <div className="text-base font-semibold text-gray-900">
                {formatCurrency(cashFlowMetrics.amountPatterns.maxAmount)}
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Min</div>
              <div className="text-base font-semibold text-gray-900">
                {formatCurrency(cashFlowMetrics.amountPatterns.minAmount)}
              </div>
            </div>
          </div>
        </div>

        {/* Frequency Summary */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Day-of-Week Distribution
          </h4>
          {Object.keys(cashFlowMetrics.frequencySummary.dayOfWeekPattern || {}).length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {Object.entries(
                cashFlowMetrics.frequencySummary.dayOfWeekPattern
              ).map(([day, count]) => (
                <span
                  key={day}
                  className="px-2 py-1 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200"
                >
                  {day}: {count}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500">No frequency data</div>
          )}
        </div>

        {/* Temporal Summary */}
        <div className="mb-6">
          <h4 className="text-sm font-medium text-gray-900 mb-3">
            Temporal Summary
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Date Range (days)</div>
              <div className="text-base font-semibold text-gray-900">
                {cashFlowMetrics.temporalSummary.dateRangeDays || 0}
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Analysis Start</div>
              <div className="text-base font-semibold text-gray-900">
                {cashFlowMetrics.temporalSummary.analysisPeriod.start
                  ? new Date(
                      cashFlowMetrics.temporalSummary.analysisPeriod.start
                    ).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
            <div className="p-3 bg-gray-50 rounded">
              <div className="text-xs text-gray-500">Analysis End</div>
              <div className="text-base font-semibold text-gray-900">
                {cashFlowMetrics.temporalSummary.analysisPeriod.end
                  ? new Date(
                      cashFlowMetrics.temporalSummary.analysisPeriod.end
                    ).toLocaleDateString()
                  : "N/A"}
              </div>
            </div>
          </div>
        </div>

        {/* Insights and Risk Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Insights
            </h4>
            {cashFlowMetrics.insights && cashFlowMetrics.insights.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                {cashFlowMetrics.insights.map((insight, idx) => (
                  <li key={idx}>{insight}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500">No insights provided</div>
            )}
          </div>
          <div>
            <h4 className="text-sm font-medium text-gray-900 mb-2">
              Risk Indicators
            </h4>
            {cashFlowMetrics.riskIndicators &&
            cashFlowMetrics.riskIndicators.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                {cashFlowMetrics.riskIndicators.map((ri, idx) => (
                  <li key={idx}>{ri}</li>
                ))}
              </ul>
            ) : (
              <div className="text-sm text-gray-500">No risk indicators provided</div>
            )}
          </div>
        </div>
      </div>

      {/* Suspicious Patterns */}
      {suspiciousPatterns.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Suspicious Cash Flow Patterns
          </h3>
          <div className="space-y-4">
            {suspiciousPatterns.map((pattern, index) => (
              <div
                key={index}
                className={`border rounded-lg p-4 ${getRiskColor(
                  pattern.riskLevel
                )}`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-medium">{pattern.pattern}</h4>
                    <p className="text-sm mt-1">{pattern.description}</p>
                  </div>
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded ${
                      pattern.riskLevel === "HIGH"
                        ? "bg-red-100 text-red-800"
                        : pattern.riskLevel === "MEDIUM"
                        ? "bg-yellow-100 text-yellow-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {pattern.riskLevel} RISK
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Amount:</span>{" "}
                    {formatCurrency(pattern.amount)}
                  </div>
                  <div>
                    <span className="font-medium">Frequency:</span>{" "}
                    {pattern.frequency} transactions
                  </div>
                  <div>
                    <span className="font-medium">Avg Amount:</span>{" "}
                    {formatCurrency(pattern.amount / pattern.frequency)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Large Cash Transactions */}
      {cashFlowMetrics.largeCashTransactions.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Large Cash Transactions (count: {cashFlowMetrics.largeCashCount},
            threshold: {formatCurrency(
              cashFlowMetrics.largeCashThreshold || threshold
            )})
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Counterparty
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {cashFlowMetrics.largeCashTransactions
                  .slice(0, 10)
                  .map((tx) => (
                    <tr key={tx.transaction_id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(tx.tx_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {formatCurrency(tx.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded ${
                            tx.direction === "CR"
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {tx.direction === "CR" ? "Credit" : "Debit"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {tx.description}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {tx.counterparty_merged || "N/A"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Cash Counterparties */}
      {cashFlowMetrics.topCashCounterparties.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Top Cash Transaction Counterparties
          </h3>
          <div className="space-y-3">
            {cashFlowMetrics.topCashCounterparties
              .slice(0, 5)
              .map((counterparty, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {counterparty.counterparty}
                    </p>
                    <p className="text-sm text-gray-600">
                      {counterparty.transactionCount} transactions
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatCurrency(counterparty.totalAmount)}
                    </p>
                    <p className="text-sm text-gray-600">
                      Avg: {formatCurrency(counterparty.avgAmount)}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
