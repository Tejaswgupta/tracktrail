"use client";

import { entitiesService, transactionsService, counterpartyService } from "@/services/database";
import type { Entity, Transaction } from "@/types/database";
import { useEffect, useState, useMemo } from "react";
// Import Recharts components
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell as PieCell,
  Legend as RechartsLegend,
} from "recharts";
import DetailedOverviewTab from "./DetailedOverviewTab";
import EditableTransactionType from "./EditableTransactionType";


interface CounterpartyStats {
  name: string;
  description?: string;
  transactionCount: number;
  totalDebit: number;
  totalCredit: number;
  totalVolume: number;
  netFlow: number;
  avgTransactionSize: number;
  maxTransactionSize: number;
  firstTransactionDate: string;
  lastTransactionDate: string;
  daysActive: number;
  frequency: number;
}

type NumericCounterpartyStatsKeys =
  | "transactionCount"
  | "totalDebit"
  | "totalCredit"
  | "totalVolume"
  | "netFlow"
  | "avgTransactionSize"
  | "maxTransactionSize"
  | "daysActive"
  | "frequency";

interface TransactionTypeStats {
  type: string;
  count: number;
  totalAmount: number;
  totalDebits: number;
  totalCredits: number;
  netFlow: number;
  avgAmount: number;
  maxAmount: number;
  minAmount: number;
  description?: string;
}

interface OverviewTabProps {
  caseId: string;
}

export default function OverviewTab({ caseId }: OverviewTabProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [counterpartyStats, setCounterpartyStats] = useState<CounterpartyStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] =
    useState<NumericCounterpartyStatsKeys>("totalVolume");
  const [showTopN, setShowTopN] = useState(10);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"summary" | "detailed" | "types">("summary");
  const [transactionTypeStats, setTransactionTypeStats] = useState<TransactionTypeStats[]>([]);
  const [transactionTypesLoading, setTransactionTypesLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const caseEntities = await entitiesService.getByCaseId(caseId);
        console.log(caseEntities);
        setEntities(caseEntities);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch transactions (for summary metrics only)
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        let data: Transaction[] = [];
        if (selectedEntityId) {
          data = await transactionsService.getByEntityId(selectedEntityId);
        } else {
          // For large datasets, we'll only fetch a sample or use optimized queries
          data = await transactionsService.getCaseTransactionsForAnalysis(caseId, [
            "transaction_id",
            "amount",
            "direction"
          ]);
        }
        setTransactions(data);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [caseId, selectedEntityId]);

  // Fetch counterparty stats from backend (or calculate client-side for entity)
  useEffect(() => {
    const fetchCounterpartyStats = async () => {
      try {
        setLoading(true);
        
        if (selectedEntityId) {
          // For specific entity, calculate stats client-side from transactions
          const entityTransactions = await transactionsService.getByEntityId(selectedEntityId);
          
          // Group transactions by counterparty
          const counterpartyMap = new Map<string, {
            transactions: Transaction[];
            totalDebit: number;
            totalCredit: number;
            totalVolume: number;
            netFlow: number;
            firstDate: Date | null;
            lastDate: Date | null;
            maxTransaction: number;
          }>();
          
          for (const tx of entityTransactions) {
            const counterparty = tx.counterparty_merged || tx.description || "Unknown";
            if (!counterpartyMap.has(counterparty)) {
              counterpartyMap.set(counterparty, {
                transactions: [],
                totalDebit: 0,
                totalCredit: 0,
                totalVolume: 0,
                netFlow: 0,
                firstDate: null,
                lastDate: null,
                maxTransaction: 0
              });
            }
            
            const cp = counterpartyMap.get(counterparty)!;
            cp.transactions.push(tx);
            
            // Update financials
            if (tx.direction === "DR") {
              cp.totalDebit += tx.amount;
            } else {
              cp.totalCredit += tx.amount;
            }
            cp.totalVolume += tx.amount;
            cp.netFlow += tx.direction === "CR" ? tx.amount : -tx.amount;
            
            // Update dates
            const txDate = new Date(tx.tx_date);
            if (!cp.firstDate || txDate < cp.firstDate) cp.firstDate = txDate;
            if (!cp.lastDate || txDate > cp.lastDate) cp.lastDate = txDate;
            
            // Update max transaction
            if (tx.amount > cp.maxTransaction) cp.maxTransaction = tx.amount;
          }
          
          // Transform to our CounterpartyStats format
          const transformedStats: CounterpartyStats[] = Array.from(counterpartyMap.entries()).map(
            ([name, data]) => {
              const daysActive = data.firstDate && data.lastDate
                ? Math.max(
                    1,
                    Math.ceil(
                      (data.lastDate.getTime() - data.firstDate.getTime()) / (1000 * 60 * 60 * 24)
                    ) + 1
                  )
                : 1;
              
              const firstDescription = data.transactions[0]?.description;

              return {
                name,
                description: name !== firstDescription ? firstDescription : undefined,
                transactionCount: data.transactions.length,
                totalDebit: data.totalDebit,
                totalCredit: data.totalCredit,
                totalVolume: data.totalVolume,
                netFlow: data.netFlow,
                avgTransactionSize: data.totalVolume / data.transactions.length,
                maxTransactionSize: data.maxTransaction,
                firstTransactionDate: data.firstDate ? data.firstDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                lastTransactionDate: data.lastDate ? data.lastDate.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                daysActive: daysActive,
                frequency: data.transactions.length / daysActive
              };
            }
          );
          
          setCounterpartyStats(transformedStats);
        } else {
          // For entire case, use backend stats
          let stats;
          try {
            stats = await counterpartyService.getCaseCounterpartyStatsWithDetails(caseId);
          } catch (error) {
            console.warn("Detailed counterparty stats not available, using basic stats");
            const basicStats = await counterpartyService.getCaseCounterpartyStats(caseId);
            // Transform basic stats to match detailed format
            stats = basicStats.map(stat => ({
              counterparty_name: stat.counterparty_name,
              transaction_count: stat.transaction_count,
              total_debits: 0,
              total_credits: Number(stat.total_amount),
              total_amount: Number(stat.total_amount),
              net_flow: Number(stat.total_amount),
              avg_transaction_size: Number(stat.total_amount) / stat.transaction_count,
              max_transaction_size: 0,
              first_seen: stat.first_seen,
              last_seen: stat.last_seen
            }));
          }
          
          // Transform backend data to match our CounterpartyStats interface
          const transformedStats: CounterpartyStats[] = stats.map(stat => {
            const daysActive = Math.max(
              1,
              Math.ceil(
                (new Date(stat.last_seen).getTime() - new Date(stat.first_seen).getTime()) / (1000 * 60 * 60 * 24)
              ) + 1
            );
            
            return {
              name: stat.counterparty_name,
              transactionCount: stat.transaction_count,
              totalDebit: Number(stat.total_debits),
              totalCredit: Number(stat.total_credits),
              totalVolume: Number(stat.total_amount),
              netFlow: Number(stat.net_flow),
              avgTransactionSize: Number(stat.avg_transaction_size),
              maxTransactionSize: Number(stat.max_transaction_size),
              firstTransactionDate: stat.first_seen,
              lastTransactionDate: stat.last_seen,
              daysActive: daysActive,
              frequency: stat.transaction_count / daysActive
            };
          });
          
          setCounterpartyStats(transformedStats);
        }
      } catch (error) {
        console.error("Error fetching counterparty stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCounterpartyStats();
  }, [caseId, selectedEntityId]);

  // Calculate transaction type statistics
  useEffect(() => {
    const calculateTransactionTypeStats = async () => {
      try {
        setTransactionTypesLoading(true);

        let data: Transaction[] = [];
        if (selectedEntityId) {
          data = await transactionsService.getByEntityId(selectedEntityId);
        } else {
          // Fetch transactions for the entire case
          data = await transactionsService.getCaseTransactionsForAnalysis(caseId, [
            "transaction_id",
            "amount",
            "direction",
            "description"
          ]);
        }

        if (data.length === 0) {
          setTransactionTypeStats([]);
          return;
        }

        // Group transactions by type
        const typeMap = new Map<string, {
          transactions: Transaction[];
          totalAmount: number;
          totalDebits: number;
          totalCredits: number;
          netFlow: number;
          maxAmount: number;
          minAmount: number;
        }>();

        for (const tx of data) {
          const type = extractTransactionType(tx.description || "");

          if (!typeMap.has(type)) {
            typeMap.set(type, {
              transactions: [],
              totalAmount: 0,
              totalDebits: 0,
              totalCredits: 0,
              netFlow: 0,
              maxAmount: 0,
              minAmount: Infinity
            });
          }

          const typeData = typeMap.get(type)!;
          typeData.transactions.push(tx);
          typeData.totalAmount += tx.amount;

          if (tx.direction === "DR") {
            typeData.totalDebits += tx.amount;
          } else {
            typeData.totalCredits += tx.amount;
          }

          typeData.netFlow += tx.direction === "CR" ? tx.amount : -tx.amount;
          typeData.maxAmount = Math.max(typeData.maxAmount, tx.amount);
          typeData.minAmount = Math.min(typeData.minAmount, tx.amount);
        }

        // Transform to TransactionTypeStats format
        const typeStats: TransactionTypeStats[] = Array.from(typeMap.entries()).map(
          ([type, data]) => ({
            type,
            count: data.transactions.length,
            totalAmount: data.totalAmount,
            totalDebits: data.totalDebits,
            totalCredits: data.totalCredits,
            netFlow: data.netFlow,
            avgAmount: data.totalAmount / data.transactions.length,
            maxAmount: data.maxAmount,
            minAmount: data.minAmount === Infinity ? 0 : data.minAmount,
            description: data.transactions[0]?.description
          })
        );

        // Sort by total amount (descending)
        typeStats.sort((a, b) => b.totalAmount - a.totalAmount);

        setTransactionTypeStats(typeStats);
      } catch (error) {
        console.error("Error calculating transaction type stats:", error);
        setTransactionTypeStats([]);
      } finally {
        setTransactionTypesLoading(false);
      }
    };

    calculateTransactionTypeStats();
  }, [caseId, selectedEntityId]);

  // Calculate summary metrics based on current view
  const summaryMetrics = useMemo(() => {
    // For transaction types tab, use transactionTypeStats data
    if (activeSubTab === "types") {
      return {
        totalTransactions: transactionTypeStats.reduce((sum, type) => sum + type.count, 0),
        totalDebits: transactionTypeStats.reduce((sum, type) => sum + type.totalDebits, 0),
        totalCredits: transactionTypeStats.reduce((sum, type) => sum + type.totalCredits, 0),
        netFlow: transactionTypeStats.reduce((sum, type) => sum + type.netFlow, 0),
      };
    }

    // For other tabs, use transactions data
    return {
      totalTransactions: transactions.length,
      totalDebits: transactions.reduce(
        (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
        0
      ),
      totalCredits: transactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
        0
      ),
      netFlow: transactions.reduce(
        (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
        0
      ),
    };
  }, [transactions, transactionTypeStats, activeSubTab]);

  // Categorize transactions as cash vs bank
  const categorizeTransaction = (description: string): "cash" | "bank" => {
    if (!description) return "bank";
    const desc = description.toUpperCase();
    const cashKeywords = ["CASH", "ATM", "WITHDRAWAL", "CHQ"];

    if (cashKeywords.some((keyword) => desc.includes(keyword))) return "cash";
    return "bank"; // Default to bank
  };

  // Predefined transaction types for easy selection
  const PREDEFINED_TRANSACTION_TYPES = [
    "NEFT",
    "RTGS",
    "IMPS",
    "UPI",
    "CHQ",
    "CASH",
    "DD",
    "MOB",
    "NET",
    "CARD",
    "WIRE",
    "ACH",
    "SWIFT",
    "OTHER"
  ];

  // Colors for transaction types
  const TRANSACTION_TYPE_COLORS: { [key: string]: string } = {
    "NEFT": "#3B82F6",
    "RTGS": "#10B981",
    "IMPS": "#F59E0B",
    "UPI": "#8B5CF6",
    "CHQ": "#EF4444",
    "CASH": "#F97316",
    "DD": "#06B6D4",
    "MOB": "#EC4899",
    "NET": "#6366F1",
    "CARD": "#84CC16",
    "WIRE": "#14B8A6",
    "ACH": "#A855F7",
    "SWIFT": "#F43F5E",
    "OTHER": "#6B7280"
  };

  // Extract transaction type from description
  const extractTransactionType = (description: string, remarks?: string): string => {
    if (!description && !remarks) return "OTHER";

    const text = `${description} ${remarks}`.toUpperCase();

    // Define transaction type patterns with their keywords
    const typePatterns = [
      { type: "NEFT", keywords: ["NEFT", "NATIONAL ELECTRONIC FUND TRANSFER"] },
      { type: "RTGS", keywords: ["RTGS", "REAL TIME GROSS SETTLEMENT", "REAL-TIME"] },
      { type: "IMPS", keywords: ["IMPS", "IMMEDIATE PAYMENT"] },
      { type: "UPI", keywords: ["UPI", "UNIFIED PAYMENTS INTERFACE", "@", "UPI/"] },
      { type: "CHQ", keywords: ["CHEQUE", "CHQ", "CHEQUE NO", "CHEQUE NO.", "CHQ NO"] },
      { type: "CASH", keywords: ["CASH", "ATM", "WITHDRAWAL", "DEPOSIT"] },
      { type: "DD", keywords: ["DEMAND DRAFT", "DD", "DD NO", "DD NO."] },
      { type: "MOB", keywords: ["MOBILE", "MOB", "MOBILE BANKING"] },
      { type: "NET", keywords: ["NET BANKING", "NETBANKING", "INTERNET BANKING", "ONLINE"] },
      { type: "CARD", keywords: ["CARD", "DEBIT CARD", "CREDIT CARD", "ATM CARD"] },
      { type: "WIRE", keywords: ["WIRE", "WIRE TRANSFER"] },
      { type: "ACH", keywords: ["ACH", "AUTOMATIC CLEARING HOUSE"] },
      { type: "SWIFT", keywords: ["SWIFT", "MT103", "MT202"] }
    ];

    // Check each pattern
    for (const pattern of typePatterns) {
      for (const keyword of pattern.keywords) {
        if (text.includes(keyword)) {
          return pattern.type;
        }
      }
    }

    // Check for common bank transaction patterns
    if (text.includes("TRANSFER") || text.includes("TRF")) {
      if (text.includes("IMMEDIATE") || text.includes("INSTANT")) return "IMPS";
      if (text.includes("REAL") || text.includes("GROSS")) return "RTGS";
      return "OTHER";
    }

    return "OTHER";
  };

  // Calculate cash vs bank metrics based on current view
  const cashVsBankMetrics = useMemo(() => {
    // For transaction types tab, we need to calculate from transactionTypeStats
    // This is a simplified approach - we'd need the actual transaction descriptions for accurate cash/bank categorization
    if (activeSubTab === "types") {
      // Since we don't have individual transaction descriptions in transactionTypeStats,
      // we'll use a proportional split based on typical patterns
      const totalTransactions = transactionTypeStats.reduce((sum, type) => sum + type.count, 0);
      const estimatedCashTransactions = Math.floor(totalTransactions * 0.15); // 15% estimate for cash
      const estimatedBankTransactions = totalTransactions - estimatedCashTransactions;

      const totalDebits = transactionTypeStats.reduce((sum, type) => sum + type.totalDebits, 0);
      const totalCredits = transactionTypeStats.reduce((sum, type) => sum + type.totalCredits, 0);

      const cashRatio = estimatedCashTransactions / totalTransactions;
      const bankRatio = estimatedBankTransactions / totalTransactions;

      return {
        cash: {
          count: estimatedCashTransactions,
          debits: totalDebits * cashRatio,
          credits: totalCredits * cashRatio,
          netFlow: (totalCredits - totalDebits) * cashRatio,
        },
        bank: {
          count: estimatedBankTransactions,
          debits: totalDebits * bankRatio,
          credits: totalCredits * bankRatio,
          netFlow: (totalCredits - totalDebits) * bankRatio,
        },
      };
    }

    // For other tabs, use transactions data
    const cashTransactions = transactions.filter(
      (t) => categorizeTransaction(t.description || "") === "cash"
    );
    const bankTransactions = transactions.filter(
      (t) => categorizeTransaction(t.description || "") === "bank"
    );

    return {
      cash: {
        count: cashTransactions.length,
        debits: cashTransactions.reduce(
          (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
          0
        ),
        credits: cashTransactions.reduce(
          (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
          0
        ),
        netFlow: cashTransactions.reduce(
          (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
          0
        ),
      },
      bank: {
        count: bankTransactions.length,
        debits: bankTransactions.reduce(
          (sum, t) => (t.direction === "DR" ? sum + t.amount : sum),
          0
        ),
        credits: bankTransactions.reduce(
          (sum, t) => (t.direction === "CR" ? sum + t.amount : sum),
          0
        ),
        netFlow: bankTransactions.reduce(
          (sum, t) => (t.direction === "CR" ? sum + t.amount : sum - t.amount),
          0
        ),
      },
    };
  }, [transactions, transactionTypeStats, activeSubTab]);

    // Use backend counterparty stats instead of client-side calculation
  const sortedCounterparties = [...counterpartyStats]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, showTopN);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
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

  // Function to handle saving updated transaction type names
  const handleSaveTransactionType = async (oldType: string, newType: string) => {
    try {
      // Update all transactions with the old type to the new type
      // Note: Since transaction types are calculated on the fly from descriptions,
      // we need to store the mapping or update the actual description fields
      // For now, we'll update the local state to reflect the change

      setTransactionTypeStats(prevStats => {
        // Check if there's already a type with the new name
        const existingIndex = prevStats.findIndex(type => type.type === newType);
        const oldIndex = prevStats.findIndex(type => type.type === oldType);

        if (existingIndex !== -1 && oldIndex !== -1 && existingIndex !== oldIndex) {
          // Merge the old type into the existing one
          const updatedStats = [...prevStats];
          const existingType = updatedStats[existingIndex];
          const oldTypeData = updatedStats[oldIndex];

          // Create merged type with combined stats
          const mergedType: TransactionTypeStats = {
            type: newType,
            count: existingType.count + oldTypeData.count,
            totalAmount: existingType.totalAmount + oldTypeData.totalAmount,
            totalDebits: existingType.totalDebits + oldTypeData.totalDebits,
            totalCredits: existingType.totalCredits + oldTypeData.totalCredits,
            netFlow: existingType.netFlow + oldTypeData.netFlow,
            avgAmount: (existingType.totalAmount + oldTypeData.totalAmount) / (existingType.count + oldTypeData.count),
            maxAmount: Math.max(existingType.maxAmount, oldTypeData.maxAmount),
            minAmount: Math.min(existingType.minAmount, oldTypeData.minAmount),
            description: existingType.description || oldTypeData.description
          };

          // Replace the existing type with merged data and remove the old one
          updatedStats[existingIndex] = mergedType;
          return updatedStats.filter((_, index) => index !== oldIndex);
        } else {
          // Normal case: just update the name
          return prevStats.map(type =>
            type.type === oldType ? { ...type, type: newType } : type
          );
        }
      });

      console.log(`Successfully renamed transaction type from "${oldType}" to "${newType}"`);
    } catch (error) {
      console.error("Error updating transaction type:", error);
      alert(`Failed to update transaction type: ${(error as Error).message}`);
      throw error; // Re-throw so the child component can handle the error
    }
  };

  // Function to handle saving updated counterparty names
  const handleSaveCounterpartyName = async (oldName: string, newName: string) => {
    try {
      // Update all transactions with the old counterparty name to the new name
      const result = await transactionsService.updateTransactionCounterparty(
        caseId,
        oldName,
        newName,
      );

      // Update the local state to reflect the changes
      setCounterpartyStats(prevStats => {
        // Check if there's already a counterparty with the new name
        const existingIndex = prevStats.findIndex(cp => cp.name === newName);
        const oldIndex = prevStats.findIndex(cp => cp.name === oldName);
        
        if (existingIndex !== -1 && oldIndex !== -1 && existingIndex !== oldIndex) {
          // Merge the old counterparty into the existing one
          const updatedStats = [...prevStats];
          const existingCp = updatedStats[existingIndex];
          const oldCp = updatedStats[oldIndex];
          
          // Create merged counterparty with combined stats
          const mergedCp: CounterpartyStats = {
            name: newName,
            transactionCount: existingCp.transactionCount + oldCp.transactionCount,
            totalDebit: existingCp.totalDebit + oldCp.totalDebit,
            totalCredit: existingCp.totalCredit + oldCp.totalCredit,
            totalVolume: existingCp.totalVolume + oldCp.totalVolume,
            netFlow: existingCp.netFlow + oldCp.netFlow,
            avgTransactionSize: (existingCp.totalVolume + oldCp.totalVolume) / (existingCp.transactionCount + oldCp.transactionCount),
            maxTransactionSize: Math.max(existingCp.maxTransactionSize, oldCp.maxTransactionSize),
            firstTransactionDate: existingCp.firstTransactionDate < oldCp.firstTransactionDate ? existingCp.firstTransactionDate : oldCp.firstTransactionDate,
            lastTransactionDate: existingCp.lastTransactionDate > oldCp.lastTransactionDate ? existingCp.lastTransactionDate : oldCp.lastTransactionDate,
            daysActive: Math.max(existingCp.daysActive, oldCp.daysActive),
            frequency: (existingCp.transactionCount + oldCp.transactionCount) / Math.max(existingCp.daysActive, oldCp.daysActive),
            description: existingCp.description || oldCp.description  // Keep the first available description
          };
          
          // Replace the existing counterparty with merged data and remove the old one
          updatedStats[existingIndex] = mergedCp;
          return updatedStats.filter((_, index) => index !== oldIndex);
        } else {
          // Normal case: just update the name
          return prevStats.map(cp => 
            cp.name === oldName ? { ...cp, name: newName } : cp
          );
        }
      });

      console.log(`Successfully renamed counterparty from "${oldName}" to "${newName}", ${result.affectedCount} transactions updated`);
    } catch (error) {
      console.error("Error updating counterparty name:", error);
      alert(`Failed to update counterparty name: ${(error as Error).message}`);
      throw error; // Re-throw so the child component can handle the error
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (

<div className="space-y-6">
      {/* Subtabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveSubTab("summary")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === "summary"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Summary Overview
          </button>
          <button
            onClick={() => setActiveSubTab("detailed")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === "detailed"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Detailed Flow Analysis
          </button>
          <button
            onClick={() => setActiveSubTab("types")}
            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm ${
              activeSubTab === "types"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Transaction Types
          </button>
        </nav>
      </div>

      {/* Content based on active subtab */}
      {activeSubTab === "summary" ? (
        <div className="space-y-8">
          {/* Summary Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-blue-600"
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
                  <p className="text-sm font-medium text-gray-600">
                    Total Transactions
                  </p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {summaryMetrics.totalTransactions.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-red-100 rounded-md flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-red-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Debits</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(summaryMetrics.totalDebits)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                    <svg
                      className="w-5 h-5 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Total Credits</p>
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatCurrency(summaryMetrics.totalCredits)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div
                    className={`w-8 h-8 ${
                      summaryMetrics.netFlow >= 0 ? "bg-green-100" : "bg-red-100"
                    } rounded-md flex items-center justify-center`}
                  >
                    <svg
                      className={`w-5 h-5 ${
                        summaryMetrics.netFlow >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
                      />
                    </svg>
                  </div>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Net Flow</p>
                  <p
                    className={`text-2xl font-semibold ${
                      summaryMetrics.netFlow >= 0
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {formatCurrency(summaryMetrics.netFlow)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {summaryMetrics.netFlow >= 0 ? "Inflow" : "Outflow"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cash vs Bank Breakdown */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-6">
              Cash vs Bank Breakdown
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-700 flex items-center">
                  <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                  Cash Transactions
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Count</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {cashVsBankMetrics.cash.count.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Net Flow</p>
                    <p
                      className={`text-xl font-semibold ${
                        cashVsBankMetrics.cash.netFlow >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(cashVsBankMetrics.cash.netFlow)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Debits</p>
                    <p className="text-xl font-semibold text-red-600">
                      {formatCurrency(cashVsBankMetrics.cash.debits)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Credits</p>
                    <p className="text-xl font-semibold text-green-600">
                      {formatCurrency(cashVsBankMetrics.cash.credits)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-md font-medium text-gray-700 flex items-center">
                  <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                  Bank Transactions
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Count</p>
                    <p className="text-xl font-semibold text-gray-900">
                      {cashVsBankMetrics.bank.count.toLocaleString()}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Net Flow</p>
                    <p
                      className={`text-xl font-semibold ${
                        cashVsBankMetrics.bank.netFlow >= 0
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {formatCurrency(cashVsBankMetrics.bank.netFlow)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Debits</p>
                    <p className="text-xl font-semibold text-red-600">
                      {formatCurrency(cashVsBankMetrics.bank.debits)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <p className="text-sm text-gray-600">Total Credits</p>
                    <p className="text-xl font-semibold text-green-600">
                      {formatCurrency(cashVsBankMetrics.bank.credits)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Counterparty Analysis */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-wrap justify-between items-center mb-6 gap-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Counterparty Analysis
                </h3>
                {selectedEntityId && (
                  <p className="text-sm text-blue-600 mt-1">
                    Showing data for:{" "}
                    {entities.find((e) => e.entity_id === selectedEntityId)
                      ?.entity_name || selectedEntityId}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                {/* Entity Filter */}
                <div className="flex items-center space-x-2">
                  <select
                    value={selectedEntityId || ""}
                    onChange={(e) => setSelectedEntityId(e.target.value || null)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">All Entities</option>
                    {entities.map((entity) => (
                      <option key={entity.entity_id} value={entity.entity_id}>
                        {entity.entity_name}
                      </option>
                    ))}
                  </select>
                  {selectedEntityId && (
                    <button
                      onClick={() => setSelectedEntityId(null)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as NumericCounterpartyStatsKeys)
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="totalVolume">Total Volume</option>
                  <option value="transactionCount">Transaction Count</option>
                  <option value="netFlow">Net Flow</option>
                  <option value="frequency">Frequency</option>
                </select>
                <select
                  value={showTopN}
                  onChange={(e) => setShowTopN(Number(e.target.value))}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value={5}>Top 5</option>
                  <option value={10}>Top 10</option>
                  <option value={20}>Top 20</option>
                  <option value={50}>Top 50</option>
                </select>
              </div>
            </div>

            {sortedCounterparties.length > 0 ? (
              <>
                {/* Bar Chart */}
                <div className="mb-10 h-100">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={sortedCounterparties}
                      margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        angle={-45}
                        textAnchor="end"
                        height={60}
                        tick={{ fontSize: 12 }}
                      />
                      <YAxis
                        domain={[
                          0,
                          Math.max(...sortedCounterparties.map((c) => c[sortBy])) *
                            1.1,
                        ]}
                      />
                      <Tooltip
                        formatter={(value) => [
                          sortBy === "totalVolume" ||
                          sortBy === "netFlow" ||
                          sortBy === "avgTransactionSize" ||
                          sortBy === "maxTransactionSize"
                            ? formatCurrency(Number(value))
                            : sortBy === "frequency"
                            ? `${Number(value).toFixed(2)}/day`
                            : Number(value).toLocaleString(),
                          sortBy,
                        ]}
                        labelFormatter={(value) => `${value}`}
                      />
                      {/* <Legend /> */}
                      <Bar
                        dataKey={sortBy}
                        name={
                          sortBy === "totalVolume"
                            ? "Total Volume"
                            : sortBy === "transactionCount"
                            ? "Transaction Count"
                            : sortBy === "netFlow"
                            ? "Net Flow"
                            : sortBy === "frequency"
                            ? "Frequency (per day)"
                            : sortBy
                        }
                      >
                        {sortedCounterparties.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={
                              sortBy === "netFlow"
                                ? entry[sortBy] >= 0
                                  ? "#10B981"
                                  : "#EF4444"
                                : "#3B82F6"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Detailed Stats Table */}
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Counterparty
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Transactions
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Debits
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Credits
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Volume
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Net Flow
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Max Size
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          First Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Last Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Days Active
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Frequency
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {sortedCounterparties.map((cp) => (
                        <tr key={cp.name} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            <p className="font-medium">{cp.name}</p>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {cp.transactionCount.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {formatCurrency(cp.totalDebit)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {formatCurrency(cp.totalCredit)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(cp.totalVolume)}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm ${
                              cp.netFlow >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(cp.netFlow)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(cp.avgTransactionSize)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(cp.maxTransactionSize)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(cp.firstTransactionDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(cp.lastTransactionDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {cp.daysActive}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {cp.frequency.toFixed(2)}/day
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No counterparty data available</p>
                <p className="text-xs mt-1">
                  Upload bank statements to see counterparty analysis
                </p>
              </div>
            )}
          </div>
        </div>
      ) : activeSubTab === "types" ? (
        <div className="space-y-8">
          {/* Header with Entity Filter */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex flex-wrap justify-between items-center gap-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Transaction Types Analysis
                </h3>
                {selectedEntityId && (
                  <p className="text-sm text-blue-600 mt-1">
                    Showing data for:{" "}
                    {entities.find((e) => e.entity_id === selectedEntityId)
                      ?.entity_name || selectedEntityId}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <select
                  value={selectedEntityId || ""}
                  onChange={(e) => setSelectedEntityId(e.target.value || null)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                >
                  <option value="">All Entities</option>
                  {entities.map((entity) => (
                    <option key={entity.entity_id} value={entity.entity_id}>
                      {entity.entity_name}
                    </option>
                  ))}
                </select>
                {selectedEntityId && (
                  <button
                    onClick={() => setSelectedEntityId(null)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {transactionTypesLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : transactionTypeStats.length > 0 ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-100 rounded-md flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-purple-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                          />
                        </svg>
                      </div>
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">
                        Transaction Types
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {transactionTypeStats.length}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-blue-100 rounded-md flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-blue-600"
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
                    </div>
                    <div className="ml-4">
                      <p className="text-sm font-medium text-gray-600">
                        Total Volume
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {formatCurrency(transactionTypeStats.reduce((sum, type) => sum + type.totalAmount, 0))}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-green-100 rounded-md flex items-center justify-center">
                        <svg
                          className="w-5 h-5 text-green-600"
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
                      <p className="text-sm font-medium text-gray-600">
                        Most Common Type
                      </p>
                      <p className="text-2xl font-semibold text-gray-900">
                        {transactionTypeStats[0]?.type || "N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Pie Chart - Transaction Count by Type */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Transaction Count by Type
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={transactionTypeStats.map(stat => ({
                            name: stat.type,
                            value: stat.count,
                            fill: TRANSACTION_TYPE_COLORS[stat.type] || "#6B7280"
                          }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${((percent as number) * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {transactionTypeStats.map((entry, index) => (
                            <PieCell key={`cell-${index}`} fill={TRANSACTION_TYPE_COLORS[entry.type] || "#6B7280"} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value) => [`${value} transactions`, "Count"]} />
                        <RechartsLegend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bar Chart - Total Amount by Type */}
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    Total Amount by Type
                  </h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={transactionTypeStats.map(stat => ({
                          ...stat,
                          fill: TRANSACTION_TYPE_COLORS[stat.type] || "#6B7280"
                        }))}
                        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis
                          dataKey="type"
                          angle={-45}
                          textAnchor="end"
                          height={60}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis />
                        <Tooltip formatter={(value) => [formatCurrency(Number(value)), "Total Amount"]} />
                        <Bar dataKey="totalAmount" name="Total Amount">
                          {transactionTypeStats.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={TRANSACTION_TYPE_COLORS[entry.type] || "#6B7280"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Detailed Table */}
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-6">
                  Transaction Type Details
                </h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Count
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Debits
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Credits
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Net Flow
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Avg Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Min Amount
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Max Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {transactionTypeStats.map((typeStat) => (
                        <tr key={typeStat.type} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div className="flex items-center">
                              <div
                                className="w-3 h-3 rounded-full mr-2"
                                style={{ backgroundColor: TRANSACTION_TYPE_COLORS[typeStat.type] || "#6B7280" }}
                              ></div>
                              <EditableTransactionType
                                type={typeStat.type}
                                description={typeStat.description}
                                onSave={(newType) => handleSaveTransactionType(typeStat.type, newType)}
                                predefinedTypes={PREDEFINED_TRANSACTION_TYPES}
                              />
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {typeStat.count.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(typeStat.totalAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600">
                            {formatCurrency(typeStat.totalDebits)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-green-600">
                            {formatCurrency(typeStat.totalCredits)}
                          </td>
                          <td
                            className={`px-6 py-4 whitespace-nowrap text-sm ${
                              typeStat.netFlow >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {formatCurrency(typeStat.netFlow)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(typeStat.avgAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(typeStat.minAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatCurrency(typeStat.maxAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No transaction type data available</p>
              <p className="text-xs mt-1">
                Upload bank statements to see transaction type analysis
              </p>
            </div>
          )}
        </div>
      ) : (
        <DetailedOverviewTab caseId={caseId} />
      )}
    </div>
  );
}
