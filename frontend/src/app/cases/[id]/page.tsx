"use client";

import AIModeTab from "@/app/components/AIModeTab";
import AMLTab from "@/app/components/AMLTab";
import CaseTransactionsDataTable, {
  CaseTransactionRow,
} from "@/app/components/CaseTransactionsDataTable";
import EfficientCounterpartyMerge from "@/app/components/EfficientCounterpartyMerge";
import FlowchartTab from "@/app/components/FlowchartTab";
import OverviewTab from "@/app/components/OverviewTab";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  caseTransactionsService,
  entitiesService,
  transactionsService,
} from "@/services/database";
import type { EntityWithAccounts, Transaction } from "@/types/database";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import AppHeader from "../../components/AppHeader";

interface Case {
  id: string;
  name: string;
  description: string;
  status: "active" | "closed" | "pending";
  createdAt: string;
  investigator: string;
  entityCount: number;
  accountCount: number;
  statementCount: number;
  priority: "low" | "medium" | "high";
  category: string;
}

type CaseFilter = {
  id: string;
  field:
    | "entity"
    | "account"
    | "status"
    | "date"
    | "amount"
    | "counterparty"
    | "direction"
    | "description";
  operator:
    | "is"
    | "contains"
    | "before"
    | "after"
    | "greater"
    | "less"
    | "between";
  value: string | string[];
  valueTo?: string;
};

const getFilterValues = (filter: CaseFilter) => {
  const values = Array.isArray(filter.value)
    ? filter.value.filter(Boolean)
    : filter.value
    ? [filter.value]
    : [];
  return values.map((value) => value.trim()).filter(Boolean);
};

export default function CaseDetailPage() {
  const params = useParams();
  const caseId = params.id as string;

  const [caseData, setCaseData] = useState<Case | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    | "overview"
    | "entities"
    | "timeline"
    | "analytics"
    | "ai-mode"
    | "counterparty-merge"
    | "entity-standardization"
    | "flowchart"
  >("overview");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<
    "all" | "needs-review" | "failed"
  >("all");
  const [entities, setEntities] = useState<EntityWithAccounts[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(true);
  const [transactionsTotalCount, setTransactionsTotalCount] = useState(0);
  const [transactionsTotalAmount, setTransactionsTotalAmount] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize] = useState(25);
  const [flaggedTransactionIds, setFlaggedTransactionIds] = useState<
    string[] | null
  >(null);
  const [filters, setFilters] = useState<CaseFilter[]>([]);
  const [openMultiSelectId, setOpenMultiSelectId] = useState<string | null>(
    null
  );
  const normalizedQuery = searchQuery.trim();
  const normalizedQueryLower = normalizedQuery.toLowerCase();
  const activeFilters = useMemo(
    () =>
      filters.filter((filter) => {
        const values = getFilterValues(filter);
        if (values.length === 0) return false;
        if (filter.operator === "between" && !filter.valueTo) return false;
        return true;
      }),
    [filters]
  );
  const shouldUseServerSearch =
    normalizedQuery.length > 0 ||
    activeFilters.length > 0 ||
    activeView !== "all";
  const entityMap = useMemo(() => {
    const map = new Map<string, EntityWithAccounts>();
    entities.forEach((entity) => map.set(entity.entity_id, entity));
    return map;
  }, [entities]);
  const accountMap = useMemo(() => {
    const map = new Map<
      string,
      { entity: EntityWithAccounts; accountLabel: string }
    >();
    entities.forEach((entity) => {
      entity.accounts?.forEach((account) => {
        const label = `${account.bank_name || "Bank"} (${
          account.account_number
        })`;
        map.set(account.account_id, { entity, accountLabel: label });
      });
    });
    return map;
  }, [entities]);

  useEffect(() => {
    if (!openMultiSelectId) return;
    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(`[data-multi-select-id="${openMultiSelectId}"]`)) {
        return;
      }
      setOpenMultiSelectId(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [openMultiSelectId]);

  useEffect(() => {
    const fetchCase = async () => {
      try {
        const { casesService, cacheManagement } = await import(
          "@/services/database"
        );
        const caseData = await casesService.getById(caseId);

        if (caseData) {
          // Warm the cache for this case
          cacheManagement.warmCaseCache(caseId).catch(console.warn);

          // Transform to match component interface
          setCaseData({
            id: caseData.case_id,
            name: caseData.case_name,
            description: caseData.description || "",
            status: caseData.status.toLowerCase() as
              | "active"
              | "closed"
              | "pending",
            createdAt: caseData.created_at,
            investigator: caseData.lead_investigator,
            entityCount: caseData.entity_count,
            accountCount: caseData.account_count,
            statementCount: caseData.statement_count,
            priority:
              (caseData.priority?.toLowerCase() as "low" | "medium" | "high") ||
              "medium",
            category: caseData.case_type || "Other",
          });
        } else {
          setCaseData(null);
        }
      } catch (error) {
        console.error("Error fetching case:", error);
        setCaseData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCase();
  }, [caseId]);

  useEffect(() => {
    const fetchEntities = async () => {
      try {
        const caseEntities = await entitiesService.getByCaseId(caseId);
        setEntities(caseEntities);
      } catch (error) {
        console.error("Error fetching entities:", error);
      }
    };

    fetchEntities();
  }, [caseId]);

  useEffect(() => {
    setPageIndex(0);
  }, [caseId, normalizedQuery, activeView, filters]);

  useEffect(() => {
    let isCancelled = false;

    const loadFlaggedTransactions = async () => {
      if (activeView !== "needs-review") {
        setFlaggedTransactionIds(null);
        return;
      }
      try {
        const ids = await caseTransactionsService.getFlaggedTransactionIds(
          caseId,
          "Under Review"
        );
        if (!isCancelled) {
          setFlaggedTransactionIds(ids);
        }
      } catch (error) {
        console.error("Error fetching flagged transactions:", error);
        if (!isCancelled) {
          setFlaggedTransactionIds([]);
        }
      }
    };

    loadFlaggedTransactions();

    return () => {
      isCancelled = true;
    };
  }, [caseId, activeView]);

  const buildServerFilters = useCallback(() => {
    const entityFilters = activeFilters.filter(
      (filter) => filter.field === "entity"
    );
    const accountFilters = activeFilters.filter(
      (filter) => filter.field === "account"
    );
    const statusFilters = activeFilters.filter(
      (filter) => filter.field === "status"
    );
    const directionFilters = activeFilters.filter(
      (filter) => filter.field === "direction"
    );
    const descriptionFilter = activeFilters.find(
      (filter) => filter.field === "description"
    );
    const counterpartyFilter = activeFilters.find(
      (filter) => filter.field === "counterparty"
    );
    const dateFilter = activeFilters.find((filter) => filter.field === "date");
    const amountFilter = activeFilters.find(
      (filter) => filter.field === "amount"
    );

    const entityIds =
      entityFilters.length > 0
        ? entities
            .filter((entity) =>
              entityFilters.every((filter) => {
                const values = getFilterValues(filter).map((value) =>
                  value.toLowerCase()
                );
                if (values.length === 0) return true;
                const name = entity.entity_name.toLowerCase();
                if (filter.operator === "is") {
                  return values.some((value) => name === value);
                }
                return values.some((value) => name.includes(value));
              })
            )
            .map((entity) => entity.entity_id)
        : undefined;

    const accountEntries = Array.from(accountMap.entries());
    const accountIds =
      accountFilters.length > 0
        ? accountEntries
            .filter(([_, account]) =>
              accountFilters.every((filter) => {
                const values = getFilterValues(filter).map((value) =>
                  value.toLowerCase()
                );
                if (values.length === 0) return true;
                const label = account.accountLabel.toLowerCase();
                if (filter.operator === "is") {
                  return values.some((value) => label === value);
                }
                return values.some((value) => label.includes(value));
              })
            )
            .map(([accountId]) => accountId)
        : undefined;

    const statusValues = statusFilters.flatMap((filter) =>
      getFilterValues(filter)
    );
    const statusSet = new Set(statusValues);
    let status: "Failed" | "Success" | undefined;
    if (statusSet.size === 1) {
      const [value] = Array.from(statusSet);
      if (value === "Failed" || value === "Success") {
        status = value;
      }
    }
    if (activeView === "failed") {
      status = "Failed";
    }

    const directionValues = directionFilters.flatMap((filter) =>
      getFilterValues(filter)
    );
    const directionSet = new Set(directionValues);
    let direction: "DR" | "CR" | undefined;
    if (directionSet.size === 1) {
      const [value] = Array.from(directionSet);
      if (value === "DR" || value === "CR") {
        direction = value;
      }
    }

    const descriptionValues = descriptionFilter
      ? getFilterValues(descriptionFilter)
      : [];
    const counterpartyValues = counterpartyFilter
      ? getFilterValues(counterpartyFilter)
      : [];

    const dateValues = dateFilter ? getFilterValues(dateFilter) : [];
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    if (dateFilter && dateValues[0]) {
      if (dateFilter.operator === "before") {
        dateTo = dateValues[0];
      } else if (dateFilter.operator === "after") {
        dateFrom = dateValues[0];
      } else if (dateFilter.operator === "between") {
        dateFrom = dateValues[0];
        dateTo = dateFilter.valueTo || dateValues[0];
      }
    }

    const amountValues = amountFilter ? getFilterValues(amountFilter) : [];
    let minAmount: number | undefined;
    let maxAmount: number | undefined;
    if (amountFilter && amountValues[0]) {
      const value = Number(amountValues[0]);
      const valueTo = amountFilter.valueTo ? Number(amountFilter.valueTo) : value;
      if (!Number.isNaN(value)) {
        if (amountFilter.operator === "greater") {
          minAmount = value;
        } else if (amountFilter.operator === "less") {
          maxAmount = value;
        } else if (amountFilter.operator === "between") {
          minAmount = value;
          maxAmount = valueTo;
        }
      }
    }

    const searchEntityIds =
      normalizedQueryLower.length > 0
        ? entities
            .filter((entity) =>
              entity.entity_name.toLowerCase().includes(normalizedQueryLower)
            )
            .map((entity) => entity.entity_id)
        : [];
    const searchAccountIds =
      normalizedQueryLower.length > 0
        ? accountEntries
            .filter(([_, account]) =>
              account.accountLabel
                .toLowerCase()
                .includes(normalizedQueryLower)
            )
            .map(([accountId]) => accountId)
        : [];

    return {
      query: normalizedQuery || undefined,
      searchEntityIds: searchEntityIds.length > 0 ? searchEntityIds : undefined,
      searchAccountIds:
        searchAccountIds.length > 0 ? searchAccountIds : undefined,
      entityIds,
      accountIds,
      transactionIds:
        activeView === "needs-review"
          ? flaggedTransactionIds || []
          : undefined,
      dateFrom,
      dateTo,
      minAmount,
      maxAmount,
      direction,
      status,
      description: descriptionValues.length > 0 ? descriptionValues[0] : undefined,
      counterparty: counterpartyValues.length > 0 ? counterpartyValues[0] : undefined,
    };
  }, [
    activeFilters,
    accountMap,
    activeView,
    entities,
    flaggedTransactionIds,
    normalizedQuery,
    normalizedQueryLower,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const loadSummary = async () => {
      if (activeView === "needs-review" && flaggedTransactionIds === null) {
        return;
      }
      const serverFilters = shouldUseServerSearch ? buildServerFilters() : {};
      if (
        activeView === "needs-review" &&
        flaggedTransactionIds &&
        flaggedTransactionIds.length === 0
      ) {
        if (!isCancelled) {
          setTransactionsTotalCount(0);
          setTransactionsTotalAmount(0);
        }
        return;
      }
      try {
        const summary = await transactionsService.getCaseTransactionsSummary(
          caseId,
          serverFilters || {}
        );
        if (!isCancelled) {
          setTransactionsTotalCount(summary.totalCount);
          setTransactionsTotalAmount(summary.totalAmount);
        }
      } catch (error) {
        console.error("Error fetching transactions summary:", error);
      }
    };

    loadSummary();

    return () => {
      isCancelled = true;
    };
  }, [
    caseId,
    activeView,
    buildServerFilters,
    flaggedTransactionIds,
    shouldUseServerSearch,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const loadTransactions = async () => {
      if (activeView === "needs-review" && flaggedTransactionIds === null) {
        setTransactionsLoading(true);
        return;
      }
      if (
        activeView === "needs-review" &&
        flaggedTransactionIds &&
        flaggedTransactionIds.length === 0
      ) {
        setTransactions([]);
        setTransactionsLoading(false);
        return;
      }
      try {
        setTransactionsLoading(true);

        const serverFilters = shouldUseServerSearch ? buildServerFilters() : {};
        const offset = pageIndex * pageSize;
        const limit = pageSize;

        const page = shouldUseServerSearch
          ? await transactionsService.searchByCaseId(caseId, {
              ...(serverFilters || {}),
              offset,
              limit,
            })
          : await transactionsService.getByCaseId(caseId, { offset, limit });

        if (!isCancelled) {
          setTransactions(page);
        }
      } catch (error) {
        console.error("Error fetching transactions:", error);
      } finally {
        if (!isCancelled) {
          setTransactionsLoading(false);
        }
      }
    };

    loadTransactions();

    return () => {
      isCancelled = true;
    };
  }, [
    caseId,
    activeView,
    buildServerFilters,
    flaggedTransactionIds,
    pageIndex,
    pageSize,
    shouldUseServerSearch,
  ]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800";
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "closed":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateCompact = useCallback(
    (dateString: string) =>
      new Date(dateString).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    []
  );

  const formatCurrency = useCallback(
    (amount: number) =>
      new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount),
    []
  );

  const filtersWithLabels = useMemo(() => {
    return filters
      .map((filter) => {
        const filterValues = Array.isArray(filter.value)
          ? filter.value.filter(Boolean)
          : filter.value
          ? [filter.value]
          : [];
        if (filterValues.length === 0) {
          return null;
        }
        if (filter.operator === "between" && !filter.valueTo) {
          return null;
        }
        const operatorLabel =
          filter.operator === "is"
            ? "="
            : filter.operator === "contains"
            ? "contains"
            : filter.operator === "before"
            ? "before"
            : filter.operator === "after"
            ? "after"
            : filter.operator === "greater"
            ? ">"
            : filter.operator === "less"
            ? "<"
            : "between";
        const valueLabel =
          filter.operator === "between"
            ? `${filter.value} → ${filter.valueTo}`
            : filterValues.join(", ");
        return {
          id: filter.id,
          label: `${filter.field}: ${operatorLabel} ${valueLabel}`,
        };
      })
      .filter(Boolean) as Array<{ id: string; label: string }>;
  }, [filters]);

  const isFailedFocused =
    activeView === "failed" ||
    filters.some(
      (filter) =>
        filter.field === "status" &&
        (Array.isArray(filter.value)
          ? filter.value.includes("Failed")
          : filter.value === "Failed")
    );

  const tableRows = useMemo<CaseTransactionRow[]>(() => {
    return transactions.map((transaction) => {
      const entity = entityMap.get(transaction.entity_id);
      const account = accountMap.get(transaction.account_id);
      const counterpartyRaw = transaction.counterparty_merged;
      const counterparty = counterpartyRaw || "Unknown";
      const isCounterpartyMissing =
        !counterpartyRaw || counterpartyRaw.trim() === "";
      return {
        id: transaction.transaction_id,
        entityName: entity?.entity_name || "Unknown Entity",
        accountLabel: account?.accountLabel || "Unknown Account",
        dateLabel: formatDateCompact(transaction.tx_date),
        description: transaction.description || "No description",
        refId: transaction.transaction_id,
        amountLabel: formatCurrency(transaction.amount),
        amountValue: transaction.amount,
        directionLabel: transaction.direction === "DR" ? "Debit" : "Credit",
        counterparty,
        status: isCounterpartyMissing ? "Failed" : "Success",
        onCounterpartySave: async (newName) => {
          if (!counterparty || counterparty === newName) {
            return;
          }
          await transactionsService.updateTransactionCounterparty(
            caseId,
            counterparty,
            newName
          );
          setTransactions((prev) =>
            prev.map((tx) =>
              tx.counterparty_merged === counterparty
                ? { ...tx, counterparty_merged: newName }
                : tx
            )
          );
        },
      };
    });
  }, [
    transactions,
    entityMap,
    accountMap,
    caseId,
    formatDateCompact,
    formatCurrency,
  ]);

  const pageCount = useMemo(
    () => (transactionsTotalCount > 0 ? Math.ceil(transactionsTotalCount / pageSize) : 0),
    [transactionsTotalCount, pageSize]
  );

  const handlePageChange = useCallback(
    (nextPageIndex: number) => {
      if (pageCount === 0) {
        setPageIndex(0);
        return;
      }
      const clamped = Math.max(0, Math.min(nextPageIndex, pageCount - 1));
      setPageIndex(clamped);
    },
    [pageCount]
  );

  useEffect(() => {
    if (pageCount === 0 && pageIndex !== 0) {
      setPageIndex(0);
      return;
    }
    if (pageCount > 0 && pageIndex >= pageCount) {
      setPageIndex(pageCount - 1);
    }
  }, [pageCount, pageIndex]);

  const filterFieldOptions = [
    { value: "entity", label: "Entity" },
    { value: "account", label: "Account" },
    { value: "status", label: "Status" },
    { value: "date", label: "Date" },
    { value: "amount", label: "Amount" },
    { value: "counterparty", label: "Counterparty" },
    { value: "direction", label: "Direction" },
    { value: "description", label: "Description" },
  ];

  const getOperatorOptions = (field: string) => {
    if (field === "date") {
      return [
        { value: "before", label: "Before" },
        { value: "after", label: "After" },
        { value: "between", label: "Between" },
      ];
    }
    if (field === "amount") {
      return [
        { value: "greater", label: "Greater than" },
        { value: "less", label: "Less than" },
        { value: "between", label: "Between" },
      ];
    }
    if (field === "status" || field === "direction") {
      return [{ value: "is", label: "Is" }];
    }
    return [
      { value: "is", label: "Is" },
      { value: "contains", label: "Contains" },
    ];
  };

  const addFilter = () => {
    setFilters((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${prev.length}`,
        field: "entity",
        operator: "is",
        value: "",
      },
    ]);
  };

  const updateFilter = (
    id: string,
    updates: Partial<(typeof filters)[number]>
  ) => {
    setFilters((prev) =>
      prev.map((filter) =>
        filter.id === id ? { ...filter, ...updates } : filter
      )
    );
  };

  const removeFilter = (id: string) => {
    setFilters((prev) => prev.filter((filter) => filter.id !== id));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Case Not Found
          </h2>
          <p className="text-gray-600">
            The requested case could not be found.
          </p>
        </div>
      </div>
    );
  }

  const headerSubtitle = (
    <div className="flex items-center space-x-2">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(
          caseData.status
        )}`}
      >
        {caseData.status.charAt(0).toUpperCase() + caseData.status.slice(1)}
      </span>
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityColor(
          caseData.priority
        )}`}
      >
        {caseData.priority.charAt(0).toUpperCase() + caseData.priority.slice(1)}{" "}
        Priority
      </span>
      <span className="text-xs text-gray-500">
        Created {formatDate(caseData.createdAt)} • {caseData.investigator}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader
        title={caseData.name}
        subtitle={headerSubtitle}
        showBackButton={true}
      />

      {/* Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            {[
              { key: "overview", label: "Overview" },
              { key: "entities", label: "Transactions" },
              {
                key: "counterparty-merge",
                label: "De-duplicate data",
              },
              { key: "analytics", label: "AML Analytics" },
              { key: "flowchart", label: "Flowchart" },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? "border-blue-500 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      {/* Content */}
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === "overview" && <OverviewTab caseId={caseData.id} />}

        {activeTab === "entities" && (
          <div className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
              <aside className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 h-fit">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Smart Views
                </h3>
                <div className="mt-3 space-y-2">
                  {[
                    { key: "all", label: "All Transactions" },
                    { key: "needs-review", label: "Needs Review" },
                    { key: "failed", label: "Failed Extractions" },
                  ].map((view) => (
                    <button
                      key={view.key}
                      onClick={() => setActiveView(view.key as any)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                        activeView === view.key
                          ? "bg-blue-50 text-blue-700 border border-blue-200"
                          : "text-gray-700 hover:bg-gray-50 border border-transparent"
                      }`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </aside>

              <section className="space-y-4">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex-1">
                      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Global Search
                      </label>
                      <div className="mt-2 relative">
                        <Input
                          value={searchQuery}
                          onChange={(event) =>
                            setSearchQuery(event.target.value)
                          }
                          placeholder="Search entity, account, ref ID, or counterparty"
                          className="w-full bg-gray-50 pr-10"
                        />
                        <svg
                          className="absolute right-3 top-2.5 h-4 w-4 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-4.35-4.35m1.6-5.4a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {filtersWithLabels.map((pill) => (
                        <span
                          key={pill.id}
                          className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                        >
                          {pill.label}
                          <button
                            onClick={() => removeFilter(pill.id)}
                            className="ml-2 text-slate-500 hover:text-slate-700"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-dashed text-xs"
                        onClick={addFilter}
                      >
                        + Add Filter
                      </Button>
                    </div>
                  </div>

                  {filters.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {filters.map((filter) => {
                        const operatorOptions = getOperatorOptions(
                          filter.field
                        );
                        const isBetween = filter.operator === "between";
                        const filterValues = Array.isArray(filter.value)
                          ? filter.value
                          : filter.value
                          ? [filter.value]
                          : [];
                        const valueSelectOptions =
                          filter.field === "entity"
                            ? entities.map((entity) => ({
                                value: entity.entity_name,
                                label: entity.entity_name,
                              }))
                            : filter.field === "account"
                            ? Array.from(accountMap.values()).map(
                                (account) => ({
                                  value: account.accountLabel,
                                  label: account.accountLabel,
                                })
                              )
                            : filter.field === "status"
                            ? [
                                { value: "Success", label: "Success" },
                                { value: "Failed", label: "Failed" },
                              ]
                            : filter.field === "direction"
                            ? [
                                { value: "DR", label: "Debit (DR)" },
                                { value: "CR", label: "Credit (CR)" },
                              ]
                            : [];

                        const showSelectValue =
                          filter.operator === "is" &&
                          (filter.field === "status" ||
                            filter.field === "direction");
                        const showMultiSelect =
                          filter.operator === "is" &&
                          (filter.field === "entity" ||
                            filter.field === "account");

                        const inputType =
                          filter.field === "date"
                            ? "date"
                            : filter.field === "amount"
                            ? "number"
                            : "text";

                        return (
                          <div
                            key={filter.id}
                            className="grid gap-2 lg:grid-cols-[160px_160px_1fr_1fr_auto]"
                          >
                            <Select
                              value={filter.field}
                              onValueChange={(value) => {
                                const nextOperator =
                                  getOperatorOptions(value)[0]?.value || "is";
                                updateFilter(filter.id, {
                                  field: value as any,
                                  operator: nextOperator as any,
                                  value:
                                    value === "entity" || value === "account"
                                      ? []
                                      : "",
                                  valueTo: undefined,
                                });
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Field" />
                              </SelectTrigger>
                              <SelectContent>
                                {filterFieldOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Select
                              value={filter.operator}
                              onValueChange={(value) =>
                                updateFilter(filter.id, {
                                  operator: value as any,
                                  value:
                                    (filter.field === "entity" ||
                                      filter.field === "account") &&
                                    value === "is"
                                      ? Array.isArray(filter.value)
                                        ? filter.value
                                        : filter.value
                                        ? [filter.value]
                                        : []
                                      : (filter.field === "entity" ||
                                            filter.field === "account") &&
                                        value !== "is"
                                      ? ""
                                      : filter.value,
                                  valueTo:
                                    value === "between"
                                      ? filter.valueTo
                                      : undefined,
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Operator" />
                              </SelectTrigger>
                              <SelectContent>
                                {operatorOptions.map((option) => (
                                  <SelectItem
                                    key={option.value}
                                    value={option.value}
                                  >
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {showMultiSelect ? (
                              <div
                                className="relative"
                                data-multi-select-id={filter.id}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOpenMultiSelectId((current) =>
                                      current === filter.id ? null : filter.id
                                    )
                                  }
                                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                                >
                                  <span className="truncate text-gray-700">
                                    {filterValues.length === 0
                                      ? `Select ${filter.field}`
                                      : filterValues.length === 1
                                      ? filterValues[0]
                                      : `${filterValues.length} selected`}
                                  </span>
                                  <span className="text-gray-400">▾</span>
                                </button>
                                {openMultiSelectId === filter.id && (
                                  <div className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-md">
                                    <div className="max-h-56 overflow-auto p-2">
                                      {valueSelectOptions.length === 0 ? (
                                        <div className="px-2 py-2 text-xs text-gray-500">
                                          No options available.
                                        </div>
                                      ) : (
                                        valueSelectOptions.map((option) => {
                                          const isChecked =
                                            filterValues.includes(
                                              option.value
                                            );
                                          return (
                                            <label
                                              key={option.value}
                                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-gray-700 hover:bg-gray-50"
                                            >
                                              <Checkbox
                                                checked={isChecked}
                                                onCheckedChange={(checked) => {
                                                  const nextValues = checked
                                                    ? [
                                                        ...new Set([
                                                          ...filterValues,
                                                          option.value,
                                                        ]),
                                                      ]
                                                    : filterValues.filter(
                                                        (value) =>
                                                          value !==
                                                          option.value
                                                      );
                                                  updateFilter(filter.id, {
                                                    value: nextValues,
                                                  });
                                                }}
                                              />
                                              <span className="truncate">
                                                {option.label}
                                              </span>
                                            </label>
                                          );
                                        })
                                      )}
                                    </div>
                                    <div className="flex items-center justify-between border-t px-3 py-2 text-xs">
                                      <button
                                        type="button"
                                        className="text-gray-500 hover:text-gray-700"
                                        onClick={() =>
                                          updateFilter(filter.id, {
                                            value: [],
                                          })
                                        }
                                      >
                                        Clear
                                      </button>
                                      <button
                                        type="button"
                                        className="text-blue-600 hover:text-blue-700"
                                        onClick={() =>
                                          setOpenMultiSelectId(null)
                                        }
                                      >
                                        Done
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : showSelectValue ? (
                              <Select
                                value={Array.isArray(filter.value)
                                  ? filter.value[0] || ""
                                  : filter.value}
                                onValueChange={(value) =>
                                  updateFilter(filter.id, { value })
                                }
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Value" />
                                </SelectTrigger>
                                <SelectContent>
                                  {valueSelectOptions.map((option) => (
                                    <SelectItem
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input
                                type={inputType}
                                value={
                                  Array.isArray(filter.value)
                                    ? filter.value[0] || ""
                                    : filter.value
                                }
                                placeholder="Value"
                                onChange={(event) =>
                                  updateFilter(filter.id, {
                                    value: event.target.value,
                                  })
                                }
                              />
                            )}

                            {isBetween ? (
                              <Input
                                type={inputType}
                                value={filter.valueTo || ""}
                                placeholder="To"
                                onChange={(event) =>
                                  updateFilter(filter.id, {
                                    valueTo: event.target.value,
                                  })
                                }
                              />
                            ) : (
                              <div className="hidden lg:block" />
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-gray-500"
                              onClick={() => removeFilter(filter.id)}
                            >
                              Remove
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-gray-900 bg-gray-900 px-4 py-2 text-xs font-semibold text-white">
                  {transactionsTotalCount.toLocaleString()} Transactions
                  <span className="mx-2 text-gray-400">|</span>
                  Total Value: {formatCurrency(transactionsTotalAmount)}
                  <span className="mx-2 text-gray-400">|</span>
                  Risk:{" "}
                  <span className="text-amber-300">
                    {isFailedFocused ? "High" : "Medium"}
                  </span>
                  {!filtersWithLabels.length && (
                    <span className="ml-2 text-gray-400">
                      (Whole case view)
                    </span>
                  )}
                </div>

                {transactionsLoading ? (
                  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-600">
                    <div className="flex items-center justify-between">
                      <span>Loading transactions…</span>
                      {pageCount > 0 && (
                        <span>
                          Page {(pageIndex + 1).toLocaleString()} of{" "}
                          {pageCount.toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <CaseTransactionsDataTable
                    data={tableRows}
                    pageIndex={pageIndex}
                    pageSize={pageSize}
                    pageCount={pageCount}
                    totalCount={transactionsTotalCount}
                    onPageChange={handlePageChange}
                  />
                )}
              </section>
            </div>
          </div>
        )}

        {activeTab === "timeline" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Case Timeline
            </h2>
            <div className="text-center py-8 text-gray-500">
              <p className="text-sm">No timeline events available</p>
            </div>
          </div>
        )}

        {activeTab === "analytics" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                AML Analytics Dashboard
              </h2>

              <AMLTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "flowchart" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Money Flow Visualization
              </h2>

              <FlowchartTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "ai-mode" && (
          <div className="space-y-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                AI-Powered AML Analysis
              </h2>

              <AIModeTab caseId={caseData.id} />
            </div>
          </div>
        )}

        {activeTab === "counterparty-merge" && (
          <EfficientCounterpartyMerge caseId={caseData.id} />
        )}
      </main>
    </div>
  );
}
