"use client";

import { accountsService } from "@/services/database";
import { AccountWithStatements } from "@/types/database";
import { useEffect, useState } from "react";
import AccountCard from "./AccountCard";
import CreateAccountModal from "./CreateAccountModal";

// Transform database account to component format
interface Account {
  id: string;
  accountNumber: string;
  bankName: string;
  accountType: "savings" | "current" | "fixed_deposit" | "loan" | "other";
  ifscCode: string;
  branchName: string;
  statementCount: number;
  lastStatementDate: string;
  balance: number;
  currency: string;
}

interface AccountListProps {
  entityId: string;
}

export default function AccountList({ entityId }: AccountListProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setError(null);
        const accountsData = await accountsService.getByEntityId(entityId);

        // Transform database accounts to component format
        const transformedAccounts: Account[] = accountsData.map(
          (account: AccountWithStatements) => ({
            id: account.account_id,
            accountNumber: account.account_number,
            bankName: account.bank_name || "Unknown Bank",
            accountType: mapAccountType(account.account_type),
            ifscCode: account.ifsc_code || "",
            branchName: account.branch_name || "",
            statementCount: account.statement_count,
            lastStatementDate: account.last_statement_date || "",
            balance: account.balance || 0,
            currency: account.currency || "INR",
          })
        );

        setAccounts(transformedAccounts);
      } catch (error) {
        console.error("Error fetching accounts:", error);
        setError(
          error instanceof Error ? error.message : "Failed to fetch accounts"
        );
        setAccounts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, [entityId, refreshTrigger]);

  // Helper function to map database account types to component types
  const mapAccountType = (dbType?: string): Account["accountType"] => {
    if (!dbType) return "other";

    const typeMap: Record<string, Account["accountType"]> = {
      Savings: "savings",
      Current: "current",
      "Fixed Deposit": "fixed_deposit",
      "Recurring Deposit": "fixed_deposit",
      "Cash Credit": "loan",
      Overdraft: "loan",
    };

    return typeMap[dbType] || "other";
  };

  const handleAccountCreated = () => {
    setRefreshTrigger((prev) => prev + 1);
    setIsCreateModalOpen(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-20">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-red-600">Error loading accounts</span>
          <button
            onClick={() => setRefreshTrigger((prev) => prev + 1)}
            className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
          >
            Retry
          </button>
        </div>
        <div className="text-center py-6 text-red-500">
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {accounts.length} accounts found
        </span>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-blue-600 bg-blue-100 hover:bg-blue-200"
        >
          <svg
            className="w-3 h-3 mr-1"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Add Account
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="text-center py-6 text-gray-500">
          <p className="text-sm">No bank accounts added yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              onAccountDeleted={() => setRefreshTrigger((prev) => prev + 1)}
            />
          ))}
        </div>
      )}

      {isCreateModalOpen && (
        <CreateAccountModal
          entityId={entityId}
          onClose={() => setIsCreateModalOpen(false)}
          onAccountCreated={handleAccountCreated}
        />
      )}
    </div>
  );
}
