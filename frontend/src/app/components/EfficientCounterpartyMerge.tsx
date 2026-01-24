"use client";

import {
  counterpartyService,
  entitiesService,
  transactionsService,
} from "@/services/database";
import type { EntityWithAccounts, Transaction } from "@/types/database";
import { useEffect, useMemo, useState } from "react";
import {
  buildGroups,
  type CounterpartyEntry,
  type CounterpartyGroup,
} from "@/utils/counterpartyMerge";
import { useAuth } from "@/contexts/AuthContext";

interface EfficientCounterpartyMergeProps {
  caseId: string;
}

export default function EfficientCounterpartyMerge({
  caseId,
}: EfficientCounterpartyMergeProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [counterparties, setCounterparties] = useState<CounterpartyEntry[]>([]);
  const [entities, setEntities] = useState<EntityWithAccounts[]>([]);
  const [caseTransactions, setCaseTransactions] = useState<Transaction[] | null>(null);
  const [selectedCounterparty, setSelectedCounterparty] = useState<string | null>(null);
  const [selectedCounterpartyTransactions, setSelectedCounterpartyTransactions] =
    useState<Transaction[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownError, setBreakdownError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedByGroup, setSelectedByGroup] = useState<Record<string, string[]>>({});
  const [targetByGroup, setTargetByGroup] = useState<Record<string, string>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [savingGroups, setSavingGroups] = useState<Record<string, boolean>>({});
  const [groupErrors, setGroupErrors] = useState<Record<string, string>>({});
  const { user } = useAuth();

  const groups = useMemo(
    () => buildGroups(counterparties),
    [counterparties]
  );

  const filteredGroups = useMemo(() => {
    if (!searchTerm.trim()) return groups;
    const lowered = searchTerm.trim().toLowerCase();
    return groups.filter(
      (group) =>
        group.label.toLowerCase().includes(lowered) ||
        group.members.some((member) =>
          member.name.toLowerCase().includes(lowered)
        )
    );
  }, [groups, searchTerm]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const [counterpartyData, entityData] = await Promise.all([
          counterpartyService.getCounterpartiesByCase(caseId),
          entitiesService.getByCaseId(caseId),
        ]);
        setCounterparties(counterpartyData);
        setEntities(entityData);
      } catch (err) {
        console.error("Error loading counterparties:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load counterparties"
        );
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [caseId]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((entity) => {
      map.set(entity.entity_id, entity.entity_name);
    });
    return map;
  }, [entities]);

  const accountLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    entities.forEach((entity) => {
      entity.accounts?.forEach((account) => {
        const bankName = account.bank_name || "Bank";
        map.set(
          account.account_id,
          `${bankName} (${account.account_number})`
        );
      });
    });
    return map;
  }, [entities]);

  useEffect(() => {
    setSelectedByGroup((prev) => {
      const next = { ...prev };
      groups.forEach((group) => {
        const existing = next[group.key];
        const memberNames = group.members.map((member) => member.name);
        if (!existing || existing.length === 0) {
          next[group.key] = memberNames;
        } else {
          const validSet = new Set(memberNames);
          const filtered = existing.filter((name) => validSet.has(name));
          next[group.key] = filtered.length > 0 ? filtered : memberNames;
        }
      });
      return next;
    });

    setTargetByGroup((prev) => {
      const next = { ...prev };
      groups.forEach((group) => {
        if (!next[group.key]) {
          next[group.key] = group.members[0]?.name || group.label;
        }
      });
      return next;
    });

    setExpandedGroups((prev) => {
      const next = { ...prev };
      groups.forEach((group) => {
        if (next[group.key] === undefined) {
          next[group.key] = group.members.length <= 4;
        }
      });
      return next;
    });
  }, [groups]);

  const toggleMember = (groupKey: string, name: string) => {
    setSelectedByGroup((prev) => {
      const current = new Set(prev[groupKey] || []);
      if (current.has(name)) {
        current.delete(name);
      } else {
        current.add(name);
      }
      return { ...prev, [groupKey]: Array.from(current) };
    });
  };

  const setAllForGroup = (group: CounterpartyGroup, checked: boolean) => {
    setSelectedByGroup((prev) => ({
      ...prev,
      [group.key]: checked ? group.members.map((m) => m.name) : [],
    }));
  };

  const handleMergeGroup = async (group: CounterpartyGroup) => {
    const selected = selectedByGroup[group.key] || [];
    const targetName = (targetByGroup[group.key] || "").trim();

    if (!targetName) {
      setGroupErrors((prev) => ({
        ...prev,
        [group.key]: "Enter a merged name before merging.",
      }));
      return;
    }

    if (selected.length < 2) {
      setGroupErrors((prev) => ({
        ...prev,
        [group.key]: "Select at least two names to merge.",
      }));
      return;
    }

    const fromNames = selected.filter((name) => name !== targetName);

    if (fromNames.length === 0) {
      setGroupErrors((prev) => ({
        ...prev,
        [group.key]: "Choose a target name different from the only selected name.",
      }));
      return;
    }

    try {
      if (!user?.id) {
        setGroupErrors((prev) => ({
          ...prev,
          [group.key]: "User session is required to merge counterparties.",
        }));
        return;
      }

      setGroupErrors((prev) => ({ ...prev, [group.key]: "" }));
      setSavingGroups((prev) => ({ ...prev, [group.key]: true }));

      const result = await counterpartyService.batchMergeCounterparties(
        fromNames.map((name) => ({ from: name, to: targetName })),
        user.id
      );

      if (result.errors.length > 0) {
        setGroupErrors((prev) => ({
          ...prev,
          [group.key]: result.errors.join(" "),
        }));
      } else {
        await counterpartyService.getCounterpartiesByCase(caseId).then((data) => {
          setCounterparties(data);
        });
        setCaseTransactions(null);
        setSelectedCounterparty(null);
        setSelectedCounterpartyTransactions([]);
        setBreakdownError(null);
      }
    } catch (err) {
      console.error("Error merging counterparties:", err);
      setGroupErrors((prev) => ({
        ...prev,
        [group.key]:
          err instanceof Error ? err.message : "Failed to merge counterparties.",
      }));
    } finally {
      setSavingGroups((prev) => ({ ...prev, [group.key]: false }));
    }
  };

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

  const handleToggleBreakdown = async (name: string) => {
    if (selectedCounterparty === name) {
      setSelectedCounterparty(null);
      setSelectedCounterpartyTransactions([]);
      setBreakdownError(null);
      return;
    }

    setSelectedCounterparty(name);
    setBreakdownError(null);
    setBreakdownLoading(true);

    try {
      let transactions = caseTransactions;
      if (!transactions) {
        transactions = await transactionsService.getCaseTransactionsForAnalysis(
          caseId,
          [
            "transaction_id",
            "tx_date",
            "description",
            "amount",
            "direction",
            "counterparty_merged",
            "entity_id",
            "account_id",
          ]
        );
        setCaseTransactions(transactions);
      }

      const normalizedName = name.trim();
      const filtered = transactions.filter(
        (tx) => (tx.counterparty_merged || "").trim() === normalizedName
      );

      filtered.sort(
        (a, b) => new Date(b.tx_date).getTime() - new Date(a.tx_date).getTime()
      );

      setSelectedCounterpartyTransactions(filtered);
    } catch (err) {
      console.error("Error loading counterparty transactions:", err);
      setBreakdownError(
        err instanceof Error
          ? err.message
          : "Failed to load counterparty transactions."
      );
      setSelectedCounterpartyTransactions([]);
    } finally {
      setBreakdownLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">
          Preparing de-duplication groups...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <svg
            className="w-5 h-5 text-red-400 mr-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h3 className="text-sm font-medium text-red-800">
            Error loading counterparty groups
          </h3>
        </div>
        <p className="text-sm text-red-700 mt-2">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              Counterparty De-duplication
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              We group names by their first word to surface likely duplicates.
              Pick any names in a group, set the final merged name, and apply
              the merge.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600">
                {groups.length}
              </div>
              <div className="text-xs text-gray-500">Groups</div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-green-600">
                {groups.reduce((sum, group) => sum + group.members.length, 0)}
              </div>
              <div className="text-xs text-gray-500">Names</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-center space-x-2">
            <label htmlFor="search-merge-groups" className="sr-only">
              Search groups
            </label>
            <input
              id="search-merge-groups"
              type="text"
              placeholder="Search by first word or name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full sm:w-72"
            />
          </div>
          <div className="text-xs text-gray-500">
            {filteredGroups.length} of {groups.length} groups shown
          </div>
        </div>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-sm">No duplicate groups found.</p>
          <p className="text-xs mt-2">
            Try adjusting your search or upload more transactions.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredGroups.map((group) => {
            const selected = selectedByGroup[group.key] || [];
            const targetName = targetByGroup[group.key] || "";
            const isExpanded = expandedGroups[group.key];
            const isSaving = savingGroups[group.key];
            const groupError = groupErrors[group.key];
            const targetExists = group.members.some(
              (member) => member.name === targetName.trim()
            );

            return (
              <div
                key={group.key}
                className="bg-white rounded-lg shadow border border-gray-100"
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between p-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-gray-900">
                        {group.label}
                      </h3>
                      <span className="text-xs text-gray-500">
                        {group.members.length} names - {group.totalCount} tx
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      First word match group
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [group.key]: !isExpanded,
                      }))
                    }
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    {isExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-end gap-3">
                      <div className="flex-1">
                        <label
                          htmlFor={`target-${group.key}`}
                          className="text-xs font-medium text-gray-700"
                        >
                          Merged name
                        </label>
                        <input
                          id={`target-${group.key}`}
                          type="text"
                          value={targetName}
                          onChange={(e) =>
                            setTargetByGroup((prev) => ({
                              ...prev,
                              [group.key]: e.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                          placeholder="Enter final merged name"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          {targetExists
                            ? "Target matches one of the selected names."
                            : "Target can be a brand new name."}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setAllForGroup(group, true)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setAllForGroup(group, false)}
                          className="text-xs text-gray-500 hover:text-gray-700"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {group.members.map((member) => {
                        const isSelected = selected.includes(member.name);
                        const isTarget = member.name === targetName.trim();
                        return (
                          <div
                            key={member.name}
                            className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                              isSelected
                                ? "border-blue-200 bg-blue-50"
                                : "border-gray-200 bg-white"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  toggleMember(group.key, member.name)
                                }
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                              />
                              <div>
                                <div className="text-sm text-gray-900">
                                  {member.name}
                                </div>
                                <div className="text-xs text-gray-500">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleBreakdown(member.name)
                                    }
                                    className="text-xs font-medium text-blue-600 hover:text-blue-800"
                                  >
                                    {member.count} transactions
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isTarget && (
                                <span className="text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                  Target
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setTargetByGroup((prev) => ({
                                    ...prev,
                                    [group.key]: member.name,
                                  }))
                                }
                                className="text-xs text-blue-600 hover:text-blue-800"
                              >
                                Use
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="text-xs text-gray-500">
                        {selected.length} selected
                      </div>
                      <button
                        type="button"
                        onClick={() => handleMergeGroup(group)}
                        disabled={isSaving}
                        className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {isSaving ? "Merging..." : "Merge selected"}
                      </button>
                    </div>

                    {groupError && (
                      <div className="text-xs text-red-600">{groupError}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedCounterparty && (
        <div className="rounded-lg border border-gray-200 bg-white shadow">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-6 py-4">
            <div>
              <h4 className="text-sm font-semibold text-gray-900">
                Transactions for {selectedCounterparty}
              </h4>
              <p className="text-xs text-gray-500">
                {selectedCounterpartyTransactions.length.toLocaleString()} transactions
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedCounterparty(null);
                setSelectedCounterpartyTransactions([]);
                setBreakdownError(null);
              }}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          </div>

          {breakdownLoading ? (
            <div className="flex items-center justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-sm text-gray-600">
                Loading transactions...
              </span>
            </div>
          ) : breakdownError ? (
            <div className="px-6 py-6 text-sm text-red-600">
              {breakdownError}
            </div>
          ) : selectedCounterpartyTransactions.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-gray-500">
              No transactions found for this counterparty.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Direction
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {selectedCounterpartyTransactions.map((tx) => {
                    const entityName =
                      entityNameMap.get(tx.entity_id) || tx.entity_id;
                    const accountLabel =
                      accountLabelMap.get(tx.account_id) || tx.account_id;

                    return (
                      <tr key={tx.transaction_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {formatDate(tx.tx_date)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {tx.description || "No description"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          <div className="font-medium text-gray-900">
                            {entityName}
                          </div>
                          <div className="text-xs text-gray-500">
                            {accountLabel}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {formatCurrency(tx.amount)}
                        </td>
                        <td
                          className={`px-6 py-4 text-sm font-medium ${
                            tx.direction === "CR"
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {tx.direction === "CR" ? "Credit" : "Debit"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
