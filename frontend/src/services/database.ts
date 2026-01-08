import type {
  Account,
  AccountWithStatements,
  BankStatement,
  Case,
  CaseWithStats,
  Entity,
  EntityWithAccounts,
  Transaction,
} from "@/types/database";
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

// Simple in-memory cache with expiration
class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) { // 5 minutes default
    this.defaultTtl = defaultTtlMs;
  }

  set(key: string, value: T, ttl?: number): void {
    const expiry = Date.now() + (ttl ?? this.defaultTtl);
    this.cache.set(key, { value, expiry });
  }

  get(key: string): T | null {
    const item = this.cache.get(key);
    if (!item) return null;

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }
  
  // Get cache statistics
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([key, item]) => ({
        key,
        expiresAt: new Date(item.expiry).toISOString(),
        isExpired: Date.now() > item.expiry
      }))
    };
  }
}

// Create cache instances for different data types
const transactionCache = new SimpleCache<Transaction[]>(15 * 60 * 1000); // 5 minutes
const caseAMLMetadataCache = new SimpleCache<AMLMetadata>(10 * 60 * 1000); // 10 minutes
const caseTransactionsAnalysisCache = new SimpleCache<Transaction[]>(10 * 60 * 1000); // 10 minutes

export interface AMLMetadata {
  entityIds: string[];
  // dateRange: { from: string; to: string };
  // transactionCount: number;
  // totalVolume: number;
}

// Cases
export const casesService = {
  async getAll(): Promise<CaseWithStats[]> {
    const { data, error } = await supabase
      .from("case_overview")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getById(caseId: string): Promise<CaseWithStats | null> {
    const { data, error } = await supabase
      .from("case_overview")
      .select("*")
      .eq("case_id", caseId)
      .single();

    if (error) throw error;
    return data;
  },

  async create(
    caseData: Omit<Case, "case_id" | "created_at" >
  ): Promise<Case> {
    const { data, error } = await supabase
      .from("cases")
      .insert(caseData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async update(caseId: string, updates: Partial<Case>): Promise<Case> {
    const { data, error } = await supabase
      .from("cases")
      .update({ ...updates })
      .eq("case_id", caseId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// Case Transactions (Flags) and Notes
export const caseTransactionsService = {
  async getFlagsForTransactions(
    caseId: string,
    transactionIds: string[]
  ): Promise<import("@/types/database").CaseTransaction[]> {
    if (!transactionIds || transactionIds.length === 0) return [];
    const { data, error } = await supabase
      .from("case_transactions")
      .select("*")
      .eq("case_id", caseId)
      .in("transaction_id", transactionIds);

    if (error) throw error;
    return data || [];
  },

  async getFlagForTransaction(
    caseId: string,
    transactionId: string
  ): Promise<import("@/types/database").CaseTransaction | null> {
    const { data, error } = await supabase
      .from("case_transactions")
      .select("*")
      .eq("case_id", caseId)
      .eq("transaction_id", transactionId)
      .single();

    if (error && error.code !== "PGRST116") throw error; // not found
    return data || null;
  },

  async upsertFlag(params: {
    caseId: string;
    transactionId: string;
    flag_type: import("@/types/database").CaseTransaction["flag_type"];
    notes?: string;
    userId: string;
  }): Promise<import("@/types/database").CaseTransaction> {
    const existing = await this.getFlagForTransaction(
      params.caseId,
      params.transactionId
    );

    if (existing) {
      const { data, error } = await supabase
        .from("case_transactions")
        .update({
          flag_type: params.flag_type,
          notes: params.notes ?? null,
          flagged_date: new Date().toISOString(),
          flagged_by: params.userId,
        })
        .eq("case_transaction_id", existing.case_transaction_id)
        .select("*")
        .single();
      if (error) throw error;
      return data!;
    } else {
      const { data, error } = await supabase
        .from("case_transactions")
        .insert({
          case_id: params.caseId,
          transaction_id: params.transactionId,
          flag_type: params.flag_type,
          notes: params.notes ?? null,
          flagged_date: new Date().toISOString(),
          flagged_by: params.userId,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data!;
    }
  },

  async deleteFlagByTransaction(
    caseId: string,
    transactionId: string
  ): Promise<void> {
    const { error } = await supabase
      .from("case_transactions")
      .delete()
      .eq("case_id", caseId)
      .eq("transaction_id", transactionId);
    if (error) throw error;
  },
};

const caseNotesService = {
  async getNotes(caseId: string) {
    const { data, error } = await supabase
      .from("case_notes")
      .select("*")
      .eq("case_id", caseId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async addNote(params: {
    caseId: string;
    note_type: import("@/types/database").CaseNote["note_type"];
    content: string;
    attachments?: Record<string, any> | null;
    userId: string;
  }) {
    const { data, error } = await supabase
      .from("case_notes")
      .insert({
        case_id: params.caseId,
        note_type: params.note_type,
        content: params.content,
        attachments: params.attachments ?? null,
        created_at: new Date().toISOString(),
        created_by: params.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data;
  },
};

// Entities
export const entitiesService = {
  async getAll(): Promise<Entity[]> {
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .order("entity_name", { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async getByCaseId(caseId: string): Promise<EntityWithAccounts[]> {
    const { data, error } = await supabase
      .from("case_entities")
      .select(
        `
        entity_role,
        added_date,
        entities!inner (
          *,
          accounts (
            *,
            bank_statements (count)
          )
        )
      `
      )
      .eq("case_id", caseId);

    if (error) throw error;

    return (data || []).map((item: any) => ({
      ...item.entities,
      entity_role: item.entity_role,
      accounts: item.entities.accounts || [],
      account_count: item.entities.accounts?.length || 0,
      statement_count:
        item.entities.accounts?.reduce(
          (sum: number, acc: any) =>
            sum + (acc.bank_statements?.[0]?.count || 0),
          0
        ) || 0,
    }));
  },

  async create(
    entityData: Omit<Entity, "entity_id" | "created_at">
  ): Promise<Entity> {
    const { data, error } = await supabase
      .from("entities")
      .insert(entityData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async addToCase(
    caseId: string,
    entityId: string,
    role: string,
    addedBy: string
  ): Promise<void> {
    const { error } = await supabase.from("case_entities").insert({
      case_id: caseId,
      entity_id: entityId,
      entity_role: role,
      added_by: addedBy,
    });

    if (error) throw error;
  },

  async delete(entityId: string): Promise<void> {
    // Delete entity and all related data (cascading)
    // This will also delete related accounts, statements, and transactions
    const { error } = await supabase
      .from("entities")
      .delete()
      .eq("entity_id", entityId);

    if (error) throw error;
    
    // Clear transaction caches since deleting an entity removes its transactions
    transactionCache.clear();
  },

  async removeFromCase(caseId: string, entityId: string): Promise<void> {
    const { error } = await supabase
      .from("case_entities")
      .delete()
      .eq("case_id", caseId)
      .eq("entity_id", entityId);

    if (error) throw error;
  },

  async update(entityId: string, updates: Partial<Omit<Entity, "entity_id" | "created_at">>): Promise<Entity> {
    const { data, error } = await supabase
      .from("entities")
      .update({ ...updates })
      .eq("entity_id", entityId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },
};

// Accounts
export const accountsService = {
  async getById(accountId: string): Promise<Account | null> {
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("account_id", accountId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }
    return data;
  },

  async getByEntityId(entityId: string): Promise<AccountWithStatements[]> {
    const { data, error } = await supabase
      .from("accounts")
      .select(
        `
        *,
        bank_statements (
          *
        )
      `
      )
      .eq("entity_id", entityId);

    if (error) throw error;

    return (data || []).map((account) => ({
      ...account,
      statements: account.bank_statements || [],
      statement_count: account.bank_statements?.length || 0,
      last_statement_date:
        account.bank_statements?.length > 0
          ? Math.max(
              ...account.bank_statements.map((s: any) =>
                new Date(s.upload_date).getTime()
              )
            )
          : undefined,
    }));
  },

  async create(
    accountData: Omit<Account, "account_id" | "created_at">
  ): Promise<Account> {
    const { data, error } = await supabase
      .from("accounts")
      .insert(accountData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async delete(accountId: string): Promise<void> {
    // Delete account and all related statements and transactions
    const { error } = await supabase
      .from("accounts")
      .delete()
      .eq("account_id", accountId);

    if (error) throw error;
    
    // Clear transaction caches since deleting an account removes its transactions
    transactionCache.clear();
  },
};

// Bank Statements
export const statementsService = {
  async getByAccountId(accountId: string): Promise<BankStatement[]> {
    const { data, error } = await supabase
      .from("bank_statements")
      .select("*")
      .eq("account_id", accountId)
      .order("upload_date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async create(
    statementData: Omit<BankStatement, "statement_id" | "upload_date">
  ): Promise<BankStatement> {
    const { data, error } = await supabase
      .from("bank_statements")
      .insert(statementData)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateProcessingStatus(
    statementId: string,
    status: BankStatement["processing_status"],
    progress?: number
  ): Promise<void> {
    const updates: any = { processing_status: status };
    if (progress !== undefined) {
      updates.processing_progress = progress;
    }

    const { error } = await supabase
      .from("bank_statements")
      .update(updates)
      .eq("statement_id", statementId);

    if (error) throw error;
  },

  async delete(statementId: string): Promise<void> {
    // Delete statement and all related transactions
    const { data, error } = await supabase
      .from("bank_statements")
      .delete()
      .eq("statement_id", statementId)
      .select();

    console.log(data);
    console.log(error);

    if (error) throw error;
    
    // Clear transaction caches since deleting a statement removes its transactions
    transactionCache.clear();
  },
};

// Transactions
export const transactionsService = {
  async getByAccountId(accountId: string): Promise<Transaction[]> {
    // Check cache first
    const cacheKey = `transactions-account-${accountId}`;
    const cached = transactionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("account_id", accountId)
      .order("tx_date", { ascending: false });

    if (error) throw error;
    
    const result = data || [];
    // Cache the result
    transactionCache.set(cacheKey, result);
    return result;
  },

  async getByEntityId(
    entityId: string,
    options?: {
      offset?: number;
      limit?: number;
    }
  ): Promise<Transaction[]> {
    // Check cache first (only for non-paginated requests)
    const cacheKey = `transactions-entity-${entityId}`;
    if (!options?.offset && !options?.limit) {
      const cached = transactionCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    let query = supabase
      .from("transactions")
      .select("*")
      .eq("entity_id", entityId)
      .order("tx_date", { ascending: false });

    if (options?.offset !== undefined) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 100) - 1
      );
    }

    const { data, error } = await query;

    if (error) throw error;
    
    const result = data || [];
    // Cache the result only for non-paginated requests
    if (!options?.offset && !options?.limit) {
      transactionCache.set(cacheKey, result);
    }
    return result;
  },

  async getByEntityIdCount(entityId: string): Promise<number> {
    const { count, error } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("entity_id", entityId);

    if (error) throw error;
    return count || 0;
  },

  async getByCaseId(
    caseId: string,
    options?: {
      offset?: number;
      limit?: number;
    }
  ): Promise<Transaction[]> {
    // Check cache first (only for non-paginated requests)
    const cacheKey = `transactions-case-${caseId}`;
    if (!options?.offset && !options?.limit) {
      const cached = transactionCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // First get all entity IDs for this case
    const { data: caseEntities, error: caseError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (caseError) throw caseError;

    if (!caseEntities || caseEntities.length === 0) {
      return [];
    }

    const entityIds = caseEntities.map((ce) => ce.entity_id);

    // Build query with pagination
    let query = supabase
      .from("transactions")
      .select("*")
      .in("entity_id", entityIds)
      .order("tx_date", { ascending: false });

    if (options?.offset !== undefined) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 100) - 1
      );
    }

    const { data, error } = await query;

    if (error) throw error;
    
    const result = data || [];
    // Cache the result only for non-paginated requests
    if (!options?.offset && !options?.limit) {
      transactionCache.set(cacheKey, result);
    }
    return result;
  },

  async getByCaseIdCount(caseId: string): Promise<number> {
    // First get all entity IDs for this case
    const { data: caseEntities, error: caseError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (caseError) throw caseError;

    if (!caseEntities || caseEntities.length === 0) {
      return 0;
    }

    const entityIds = caseEntities.map((ce) => ce.entity_id);

    // Get count of transactions
    const { count, error } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .in("entity_id", entityIds);

    if (error) throw error;
    return count || 0;
  },

  


  // Optimized method for AML analysis - only fetches metadata
  async getCaseAMLMetadata(caseId: string): Promise<AMLMetadata> {
    // Check cache first
    const cacheKey = `aml-metadata-${caseId}`;
    const cached = caseAMLMetadataCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First get all entity IDs for this case
    const { data: caseEntities, error: caseError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (caseError) throw caseError;

    if (!caseEntities || caseEntities.length === 0) {
      const result = {
        entityIds: [],
        // dateRange: { from: "", to: "" },
        // transactionCount: 0,
        // totalVolume: 0,
      };
      // Cache the result
      caseAMLMetadataCache.set(cacheKey, result);
      return result;
    }

    const entityIds = caseEntities.map((ce) => ce.entity_id);

    // Get transaction metadata for those entities
    // const { data, error } = await supabase
    //   .from("transactions")
    //   .select("tx_date, amount, entity_id")
    //   .in("entity_id", entityIds);

    // if (error) throw error;

    // if (!data || data.length === 0) {
    //   return {
    //     entityIds,
    //     dateRange: { from: "", to: "" },
    //     transactionCount: 0,
    //     totalVolume: 0,
    //   };
    // }

    // Calculate date range
    // const dates = data
    //   .map((tx: any) => new Date(tx.tx_date))
    //   .sort((a, b) => a.getTime() - b.getTime());
    // const dateRange = {
    //   from: dates[0].toISOString().split("T")[0],
    //   to: dates[dates.length - 1].toISOString().split("T")[0],
    // };

    // // Calculate totals
    // const transactionCount = data.length;
    // const totalVolume = data.reduce(
    //   (sum: number, tx: any) => sum + tx.amount,
    //   0
    // );

    const result = {
      entityIds,
      // dateRange,
      // transactionCount,
      // totalVolume,
    };
    
    // Cache the result
    caseAMLMetadataCache.set(cacheKey, result);
    return result;
  },

  // Optimized method for AML analysis - fetches only required fields
  async getCaseTransactionsForAnalysis(
    caseId: string,
    fields: string[] = [
      "transaction_id",
      "tx_date",
      "amount",
      "direction",
      "counterparty_merged",
      "entity_id",
    ]
  ): Promise<Transaction[]> {
    // Check cache first
    const cacheKey = `transactions-analysis-${caseId}-${fields.sort().join(',')}`;
    const cached = caseTransactionsAnalysisCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // First get all entity IDs for this case
    const { data: caseEntities, error: caseError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (caseError) throw caseError;

    if (!caseEntities || caseEntities.length === 0) {
      return [];
    }

    const entityIds = caseEntities.map((ce) => ce.entity_id);

    // Fix: Use the fields array directly in select, or ensure proper formatting
    const selectFields = fields.join(", ");

    // Then get transactions for those entities with only required fields
    const { data, error } = await supabase
      .from("transactions")
      .select(`*`)
      .in("entity_id", entityIds)
      .order("tx_date", { ascending: false });

    if (error) throw error;

    // Fix: Ensure we return an array of Transaction objects
    const result = (data as Transaction[]) || [];
    // Cache the result
    caseTransactionsAnalysisCache.set(cacheKey, result);
    return result;
  },

  async create(
    transactionData: Omit<Transaction, "transaction_id" | "created_at">
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from("transactions")
      .insert(transactionData)
      .select()
      .single();

    if (error) throw error;
    
    // Invalidate relevant caches
    transactionCache.clear(); // Clear all transaction caches when adding new transactions
    
    return data;
  },

  async createBatch(
    transactions: Omit<Transaction, "transaction_id" | "created_at">[]
  ): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from("transactions")
      .insert(transactions)
      .select();

    if (error) throw error;

    // Invalidate relevant caches
    transactionCache.clear(); // Clear all transaction caches when adding new transactions

    return data || [];
  },

  async updateTransaction(
    transactionId: string,
    updates: Partial<Omit<Transaction, "transaction_id" | "created_at" | "account_id" | "entity_id" | "statement_id" | "original_index">>
  ): Promise<Transaction> {
    const { data, error } = await supabase
      .from("transactions")
      .update(updates)
      .eq("transaction_id", transactionId)
      .select()
      .single();

    if (error) throw error;

    // Invalidate relevant caches
    transactionCache.clear(); // Clear all transaction caches when updating transactions

    return data;
  },

  async getTransactionSummary(accountId: string) {
    const { data, error } = await supabase
      .from("transactions")
      .select("amount, direction")
      .eq("account_id", accountId);

    if (error) throw error;

    const summary = {
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: data?.length || 0,
    };

    data?.forEach((tx) => {
      if (tx.direction === "CR") {
        summary.totalCredits += tx.amount;
      } else {
        summary.totalDebits += tx.amount;
      }
    });

    return summary;
  },

  async getByStatementIds(statementIds: string[]): Promise<Transaction[]> {
    if (statementIds.length === 0) return [];

    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .in("statement_id", statementIds)
      .order("tx_date", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async getByAccountIdAndStatements(
    accountId: string,
    statementIds?: string[],
    options?: {
      offset?: number;
      limit?: number;
    }
  ): Promise<Transaction[]> {
    let query = supabase
      .from("transactions")
      .select("*")
      .eq("account_id", accountId);

    if (statementIds && statementIds.length > 0) {
      query = query.in("statement_id", statementIds);
    }

    query = query.order("tx_date", { ascending: false });

    if (options?.offset !== undefined) {
      query = query.range(
        options.offset,
        options.offset + (options.limit || 10) - 1
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getTransactionSummaryByStatements(
    accountId: string,
    statementIds?: string[]
  ) {
    let query = supabase
      .from("transactions")
      .select("amount, direction")
      .eq("account_id", accountId);

    if (statementIds && statementIds.length > 0) {
      query = query.in("statement_id", statementIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    const summary = {
      totalCredits: 0,
      totalDebits: 0,
      transactionCount: data?.length || 0,
    };

    data?.forEach((tx) => {
      if (tx.direction === "CR") {
        summary.totalCredits += tx.amount;
      } else {
        summary.totalDebits += tx.amount;
      }
    });

    return summary;
  },

  async searchTransactions(
    accountId: string,
    filters: {
      dateFrom?: string;
      dateTo?: string;
      minAmount?: number;
      maxAmount?: number;
      direction?: "DR" | "CR";
      description?: string;
      statementIds?: string[];
      offset?: number;
      limit?: number;
    }
  ): Promise<Transaction[]> {
    let query = supabase
      .from("transactions")
      .select("*")
      .eq("account_id", accountId);

    if (filters.dateFrom) {
      query = query.gte("tx_date", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte("tx_date", filters.dateTo);
    }
    if (filters.minAmount) {
      query = query.gte("amount", filters.minAmount);
    }
    if (filters.maxAmount) {
      query = query.lte("amount", filters.maxAmount);
    }
    if (filters.direction) {
      query = query.eq("direction", filters.direction);
    }
    if (filters.description) {
      query = query.ilike("description", `%${filters.description}%`);
    }
    if (filters.statementIds && filters.statementIds.length > 0) {
      query = query.in("statement_id", filters.statementIds);
    }

    query = query.order("tx_date", { ascending: false });

    if (filters.offset !== undefined) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 10) - 1
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async getTransactionCount(
    accountId: string,
    filters?: {
      dateFrom?: string;
      dateTo?: string;
      minAmount?: number;
      maxAmount?: number;
      direction?: "DR" | "CR";
      description?: string;
      statementIds?: string[];
    }
  ): Promise<number> {
    let query = supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    if (filters?.dateFrom) {
      query = query.gte("tx_date", filters.dateFrom);
    }
    if (filters?.dateTo) {
      query = query.lte("tx_date", filters.dateTo);
    }
    if (filters?.minAmount) {
      query = query.gte("amount", filters.minAmount);
    }
    if (filters?.maxAmount) {
      query = query.lte("amount", filters.maxAmount);
    }
    if (filters?.direction) {
      query = query.eq("direction", filters.direction);
    }
    if (filters?.description) {
      query = query.ilike("description", `%${filters.description}%`);
    }
    if (filters?.statementIds && filters.statementIds.length > 0) {
      query = query.in("statement_id", filters.statementIds);
    }

    const { count, error } = await query;
    if (error) throw error;
    return count || 0;
  },

  async updateTransactionCounterparty(
    caseId: string,
    oldCounterpartyName: string,
    newCounterpartyName: string,
  ): Promise<{ affectedCount: number }> {

    console.log(`Updating counterparty from "${oldCounterpartyName}" to "${newCounterpartyName}" for case ${caseId}`);
    
    // First get all entity IDs for this case
    const { data: caseEntities, error: caseError } = await supabase
      .from("case_entities")
      .select("entity_id")
      .eq("case_id", caseId);

    if (caseError) throw caseError;

    if (!caseEntities || caseEntities.length === 0) {
      return { affectedCount: 0 };
    }

    const entityIds = caseEntities.map((ce) => ce.entity_id);

    console.log(`Case ${caseId} has ${entityIds.length} entities`);

    const { count: matchingTxCount } = await supabase
      .from("transactions")
      .select("*", { count: "exact", head: true })
      .in("entity_id", entityIds)
      .eq("counterparty_merged", oldCounterpartyName);

    console.log(`Found ${matchingTxCount} transactions matching criteria`);

    // Update transactions for entities in this case
    const { data, error } = await supabase
      .from("transactions")
      .update({
        counterparty_merged: newCounterpartyName,
      })
      .in("entity_id", entityIds)
      .eq("counterparty_merged", oldCounterpartyName).select();

    if (error) throw error;
    
    
    return { affectedCount: data?.length || 0 };
  },
};

// Counterparty Operations
export const counterpartyService = {
  async getAllCounterparties(): Promise<
    Array<{ name: string; count: number }>
  > {
    const { data, error } = await supabase
      .from("transactions")
      .select("counterparty_merged")
      .not("counterparty_merged", "is", null);

    if (error) throw error;

    // Count occurrences
    const counts = new Map<string, number>();
    data?.forEach((tx) => {
      if (tx.counterparty_merged) {
        counts.set(
          tx.counterparty_merged,
          (counts.get(tx.counterparty_merged) || 0) + 1
        );
      }
    });

    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },

  async getCaseCounterpartyStats(caseId: string): Promise<
    Array<{
      counterparty_name: string;
      transaction_count: number;
      total_amount: number;
      first_seen: string;
      last_seen: string;
    }>
  > {
    const { data, error } = await supabase.rpc("get_case_counterparty_stats", {
      p_case_id: caseId,
    });

    if (error) throw error;
    return data || [];
  },

  async getCaseCounterpartyStatsWithDetails(caseId: string): Promise<
    Array<{
      counterparty_name: string;
      transaction_count: number;
      total_debits: number;
      total_credits: number;
      total_amount: number;
      net_flow: number;
      avg_transaction_size: number;
      max_transaction_size: number;
      first_seen: string;
      last_seen: string;
      days_active: number;
      frequency: number;
    }>
  > {
    const { data, error } = await supabase
      .from("counterparty_stats")
      .select("*")
      .eq("case_id", caseId)
      .order("transaction_count", { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async findSimilarCounterparties(
    caseId: string,
    similarityThreshold: number = 0.8
  ): Promise<
    Array<{
      name1: string;
      name2: string;
      similarity_score: number;
      combined_transaction_count: number;
      name1_count: number;
      name2_count: number;
    }>
  > {
    const { data, error } = await supabase.rpc(
      "find_similar_counterparties_v2",
      {
        p_case_id: caseId,
        p_similarity_threshold: similarityThreshold,
      }
    );

    if (error) throw error;
    return data || [];
  },

  async getCounterpartyMergeCandidates(
    caseId: string,
    minSimilarity: number = 0.75,
    limit: number = 100
  ): Promise<
    Array<{
      representative: string;
      similar_names: string[];
      similarity_scores: number[];
      total_transactions: number;
      potential_savings: number;
    }>
  > {
    const { data, error } = await supabase.rpc(
      "get_counterparty_merge_candidates_v2",
      {
        p_case_id: caseId,
        p_min_similarity: minSimilarity,
        p_limit: limit,
      }
    );

    if (error) throw error;
    return data || [];
  },

  async previewCounterpartyMerge(
    caseId: string,
    fromNames: string[],
    toName: string
  ): Promise<{
    affected_transactions: number;
    affected_accounts: number;
    total_amount: number;
    date_range_start: string;
    date_range_end: string;
  } | null> {
    const { data, error } = await supabase.rpc(
      "preview_counterparty_merge_v2",
      {
        p_case_id: caseId,
        p_from_names: fromNames,
        p_to_name: toName,
      }
    );

    if (error) throw error;
    return data?.[0] || null;
  },

  async getCounterpartiesByCase(
    caseId: string
  ): Promise<Array<{ name: string; count: number }>> {
    // Use the new efficient function instead of complex joins
    const stats = await this.getCaseCounterpartyStats(caseId);
    return stats.map((stat) => ({
      name: stat.counterparty_name,
      count: stat.transaction_count,
    }));
  },

  async mergeCounterparties(
    fromName: string,
    toName: string,
    userId: string
  ): Promise<{ affectedCount: number }> {
    const { data, error } = await supabase
      .from("transactions")
      .update({
        counterparty_merged: toName,
      })
      .eq("counterparty_merged", fromName)
      .select("*");

    if (error) throw error;

    return { affectedCount: data.length || 0 };
  },

  async batchMergeCounterparties(
    merges: Array<{ from: string; to: string }>,
    userId: string
  ): Promise<{ totalAffected: number; errors: string[] }> {
    let totalAffected = 0;
    const errors: string[] = [];

    for (const merge of merges) {
      try {
        const result = await this.mergeCounterparties(
          merge.from,
          merge.to,
          userId
        );
        totalAffected += result.affectedCount;
      } catch (error) {
        errors.push(
          `Failed to merge "${merge.from}" to "${merge.to}": ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    }

    return { totalAffected, errors };
  },

  // Batch fetch entity information for multiple counterparties in a single query
  async getEntitiesForMultipleCounterparties(
    caseId: string,
    counterpartyNames: string[]
  ): Promise<Map<string, Array<{ entity_id: string; entity_name: string; entity_type: string }>>> {
    if (counterpartyNames.length === 0) {
      return new Map();
    }

    try {
      // First, get all entities in the case
      const { data: caseEntities, error: entityError } = await supabase
        .from("case_entities")
        .select(`
          entity_id,
          entities!inner (
            entity_id,
            entity_name,
            entity_type
          )
        `)
        .eq("case_id", caseId);

      if (entityError) throw entityError;

      const entities = caseEntities?.map((ce: any) => ce.entities) || [];

      if (entities.length === 0) {
        return new Map();
      }

      const entityIds = entities.map(e => e.entity_id);

      // Get accounts for these entities
      const { data: accounts, error: accountError } = await supabase
        .from("accounts")
        .select("account_id, entity_id")
        .in("entity_id", entityIds);

      if (accountError) throw accountError;

      const accountIds = accounts?.map(a => a.account_id) || [];

      if (accountIds.length === 0) {
        return new Map();
      }

      // Get all transactions for these accounts that match any of the counterparty names
      const { data: transactions, error: transactionError } = await supabase
        .from("transactions")
        .select("counterparty_merged, entity_id")
        .in("account_id", accountIds)
        .in("counterparty_merged", counterpartyNames);

      if (transactionError) throw transactionError;

      // Create a map of counterparty -> entity_id list
      const counterpartyToEntityIds = new Map<string, Set<string>>();

      transactions?.forEach((tx: any) => {
        if (tx.counterparty_merged && tx.entity_id) {
          if (!counterpartyToEntityIds.has(tx.counterparty_merged)) {
            counterpartyToEntityIds.set(tx.counterparty_merged, new Set());
          }
          counterpartyToEntityIds.get(tx.counterparty_merged)!.add(tx.entity_id);
        }
      });

      // Create the final result map
      const result = new Map<string, Array<{ entity_id: string; entity_name: string; entity_type: string }>>();

      // Create entity lookup map for quick access
      const entityLookup = new Map(entities.map((e: any) => [e.entity_id, e]));

      // For each counterparty name, find its entities
      counterpartyNames.forEach(name => {
        const entityIds = counterpartyToEntityIds.get(name) || new Set();
        const entityDetails = Array.from(entityIds).map(entityId => {
          const entity = entityLookup.get(entityId);
          return entity ? {
            entity_id: entity.entity_id,
            entity_name: entity.entity_name,
            entity_type: entity.entity_type,
          } : null;
        }).filter(Boolean) as Array<{ entity_id: string; entity_name: string; entity_type: string }>;

        result.set(name, entityDetails);
      });

      return result;

    } catch (error) {
      console.error("Error fetching entities for multiple counterparties:", error);
      // Return empty map on error
      return new Map();
    }
  },
};

// Entity Mapping Operations
const entityMappingService = {
  async getCaseStats(caseId: string) {
    const { data, error } = await supabase.rpc(
      "get_case_entity_mapping_stats",
      {
        p_case_id: caseId,
      }
    );

    if (error) throw error;
    return (
      data?.[0] || {
        total_counterparties: 0,
        mapped_counterparties: 0,
        unmapped_counterparties: 0,
        high_confidence_mappings: 0,
        medium_confidence_mappings: 0,
        low_confidence_mappings: 0,
        mapping_completeness: 0,
      }
    );
  },

  async getUnmappedCounterparties(caseId: string) {
    const { data, error } = await supabase.rpc(
      "get_case_unmapped_counterparties",
      {
        p_case_id: caseId,
      }
    );

    if (error) throw error;
    return data || [];
  },

  async getMappedTransactions(caseId: string) {
    const { data, error } = await supabase
      .from("transaction_entity_mappings")
      .select("*")
      .eq("case_id", caseId);

    if (error) throw error;
    return data || [];
  },
};

// Debug and Diagnostics
const diagnosticsService = {
  async checkStatementTransactionConsistency(accountId: string) {
    const { data, error } = await supabase.rpc(
      "check_statement_transaction_consistency",
      {
        p_account_id: accountId,
      }
    );

    if (error) {
      // Fallback to manual check if RPC doesn't exist
      const [statements, transactions] = await Promise.all([
        statementsService.getByAccountId(accountId),
        transactionsService.getByAccountId(accountId),
      ]);

      const results = statements.map((stmt) => {
        const actualCount = transactions.filter(
          (tx) => tx.statement_id === stmt.statement_id
        ).length;
        return {
          statement_id: stmt.statement_id,
          file_name: stmt.file_name,
          expected_count: stmt.transaction_count,
          actual_count: actualCount,
          status: actualCount === stmt.transaction_count ? "OK" : "MISMATCH",
        };
      });

      return results;
    }

    return data || [];
  },

  async getOrphanedTransactions(accountId: string) {
    const { data, error } = await supabase
      .from("transactions")
      .select(
        `
        transaction_id,
        statement_id,
        tx_date,
        description,
        amount
      `
      )
      .eq("account_id", accountId)
      .not(
        "statement_id",
        "in",
        supabase
          .from("bank_statements")
          .select("statement_id")
          .eq("account_id", accountId)
      );

    if (error) throw error;
    return data || [];
  },
};

// Search and Analytics
const searchService = {
  async findEntitiesByPAN(pan: string): Promise<Entity[]> {
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .eq("pan", pan);

    if (error) throw error;
    return data || [];
  },

  async findEntitiesByName(
    name: string,
    threshold: number = 0.3
  ): Promise<Entity[]> {
    const { data, error } = await supabase
      .from("entities")
      .select("*")
      .textSearch("entity_name", name);

    if (error) throw error;
    return data || [];
  },

  async getCaseStats(caseId: string) {
    // Get total transaction volume, suspicious patterns, etc.
    const { data, error } = await supabase.rpc("get_case_analytics", {
      case_id: caseId,
    });

    if (error) throw error;
    return data;
  },
};

// Cache management utilities
export const cacheManagement = {
  // Clean up all expired cache entries
  cleanupAllCaches() {
    transactionCache.cleanup();
    caseAMLMetadataCache.cleanup();
    caseTransactionsAnalysisCache.cleanup();
  },
  
  // Clear all caches (use when data has been updated)
  clearAllCaches() {
    transactionCache.clear();
    caseAMLMetadataCache.clear();
    caseTransactionsAnalysisCache.clear();
  },
  
  // Get cache statistics
  getCacheStats() {
    return {
      transactions: transactionCache.getStats(),
      amlMetadata: caseAMLMetadataCache.getStats(),
      transactionsAnalysis: caseTransactionsAnalysisCache.getStats()
    };
  },
  
  // Enable or disable cache monitoring
  enableMonitoring(enabled: boolean) {
    (globalThis as any).__CACHE_MONITORING_ENABLED__ = enabled;
  },
  
  // Log cache hit/miss statistics
  logCacheStats() {
    if (!(globalThis as any).__CACHE_MONITORING_ENABLED__) return;
    
    const stats = this.getCacheStats();
    console.log("=== Cache Statistics ===");
    console.log("Transaction cache size:", stats.transactions.size);
    console.log("AML Metadata cache size:", stats.amlMetadata.size);
    console.log("Transaction Analysis cache size:", stats.transactionsAnalysis.size);
    console.log("========================");
  },
  
  // Warm cache for a specific case by preloading commonly accessed data
  async warmCaseCache(caseId: string) {
    try {
      // Load AML metadata
      await transactionsService.getCaseAMLMetadata(caseId);
      
      // Load transactions for analysis (with default fields)
      await transactionsService.getCaseTransactionsForAnalysis(caseId);
      
      // Load full transaction data for the case (this is what DetailedOverviewTab needs)
      await transactionsService.getByCaseId(caseId);
      
      // Load counterparty stats which are commonly used
      await counterpartyService.getCaseCounterpartyStats(caseId);
      
      console.log(`Cache warmed for case ${caseId}`);
    } catch (error) {
      console.warn(`Failed to warm cache for case ${caseId}:`, error);
    }
  },
  
  // Warm cache for a specific account
  async warmAccountCache(accountId: string) {
    try {
      // Load account transactions (full data)
      await transactionsService.getByAccountId(accountId);
      
      console.log(`Cache warmed for account ${accountId}`);
    } catch (error) {
      console.warn(`Failed to warm cache for account ${accountId}:`, error);
    }
  },
  
  // Warm caches for all active cases
  async warmAllCasesCache() {
    try {
      // Get all cases
      const cases = await casesService.getAll();
      
      // Warm cache for each case
      for (const caseItem of cases) {
        await this.warmCaseCache(caseItem.case_id);
      }
      
      console.log(`Cache warmed for all ${cases.length} cases`);
    } catch (error) {
      console.warn("Failed to warm cache for all cases:", error);
    }
  }
};

// Periodic cache cleanup (runs every 10 minutes)
setInterval(() => {
  try {
    cacheManagement.cleanupAllCaches();
  } catch (error) {
    console.warn("Error during periodic cache cleanup:", error);
  }
}, 10 * 60 * 1000); // 10 minutes

// Bank Regex Patterns Service
export interface BankRegexPattern {
  id: string;
  bank_preset: string;
  pattern: string;
  priority: number;
  success_rate: number;
  usage_count: number;
  is_active: boolean;
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string;
  version: number;
  notes?: string;
}

export interface PatternUsageStats {
  patternId: string;
  success: boolean;
  description: string;
  bankPreset: string;
}

// Create cache for regex patterns (10 minutes TTL)
const regexPatternsCache = new SimpleCache<BankRegexPattern[]>(10 * 60 * 1000);

export const regexPatternsService = {
  // Get all active patterns for a specific bank preset
  async getPatternsByBank(bankPreset: string): Promise<BankRegexPattern[]> {
    const cacheKey = `regex_patterns_${bankPreset}`;

    // Try cache first
    const cached = regexPatternsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const { data, error } = await supabase
        .from("bank_regex_patterns")
        .select("*")
        .eq("bank_preset", bankPreset)
        .eq("is_active", true)
        .order("priority", { ascending: true })
        .order("success_rate", { ascending: false });

      if (error) throw error;

      const patterns = data || [];

      // Cache the result
      regexPatternsCache.set(cacheKey, patterns);

      return patterns;
    } catch (error) {
      console.error(`Error fetching patterns for bank ${bankPreset}:`, error);
      return [];
    }
  },

  // Get all patterns for a bank with performance statistics
  async getPatternsWithStats(bankPreset: string): Promise<BankRegexPattern[]> {
    try {
      const { data, error } = await supabase
        .from("bank_regex_patterns")
        .select("*")
        .eq("bank_preset", bankPreset)
        .order("priority", { ascending: true })
        .order("success_rate", { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error(`Error fetching patterns with stats for bank ${bankPreset}:`, error);
      return [];
    }
  },

  // Add a new regex pattern
  async addPattern(
    bankPreset: string,
    pattern: string,
    metadata: {
      isAiGenerated?: boolean;
      createdBy?: string;
      notes?: string;
      priority?: number;
    } = {}
  ): Promise<BankRegexPattern | null> {
    try {
      const { data, error } = await supabase
        .from("bank_regex_patterns")
        .insert({
          bank_preset: bankPreset,
          pattern,
          is_ai_generated: metadata.isAiGenerated || false,
          created_by: metadata.createdBy,
          notes: metadata.notes,
          priority: metadata.priority || 999, // Low priority for new patterns
        })
        .select()
        .single();

      if (error) throw error;

      // Clear cache for this bank to force refresh
      regexPatternsCache.delete(`regex_patterns_${bankPreset}`);

      console.log(`Added new regex pattern for ${bankPreset}:`, pattern);
      return data;
    } catch (error) {
      console.error(`Error adding pattern for bank ${bankPreset}:`, error);
      return null;
    }
  },

  // Update pattern usage statistics
  async updatePatternStats(stats: PatternUsageStats): Promise<void> {
    try {
      const { error } = await supabase.rpc('update_regex_pattern_stats', {
        p_pattern_id: stats.patternId,
        p_success: stats.success,
        p_increment: 1
      });

      if (error) {
        console.error("Error updating pattern stats:", error);
        return;
      }

      // Clear cache for this bank to force refresh of updated stats
      regexPatternsCache.delete(`regex_patterns_${stats.bankPreset}`);
    } catch (error) {
      console.error("Error updating pattern stats:", error);
    }
  },

  // Add multiple patterns (useful for AI optimization results)
  async addMultiplePatterns(
    patterns: Array<{
      bankPreset: string;
      pattern: string;
      isAiGenerated?: boolean;
      createdBy?: string;
      notes?: string;
      priority?: number;
    }>
  ): Promise<BankRegexPattern[]> {
    try {
      const patternsToInsert = patterns.map(p => ({
        bank_preset: p.bankPreset,
        pattern: p.pattern,
        is_ai_generated: p.isAiGenerated || false,
        created_by: p.createdBy,
        notes: p.notes,
        priority: p.priority || 999,
      }));

      const { data, error } = await supabase
        .from("bank_regex_patterns")
        .insert(patternsToInsert)
        .select();

      if (error) throw error;

      // Clear cache for all affected banks
      const uniqueBanks = [...new Set(patterns.map(p => p.bankPreset))];
      uniqueBanks.forEach(bank => {
        regexPatternsCache.delete(`regex_patterns_${bank}`);
      });

      console.log(`Added ${patterns.length} regex patterns`);
      return data || [];
    } catch (error) {
      console.error("Error adding multiple patterns:", error);
      return [];
    }
  },

  // Deactivate a pattern (soft delete)
  async deactivatePattern(patternId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("bank_regex_patterns")
        .update({ is_active: false })
        .eq("id", patternId);

      if (error) throw error;

      console.log(`Deactivated pattern: ${patternId}`);
      return true;
    } catch (error) {
      console.error(`Error deactivating pattern ${patternId}:`, error);
      return false;
    }
  },

  // Update pattern priority
  async updatePatternPriority(patternId: string, priority: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("bank_regex_patterns")
        .update({ priority })
        .eq("id", patternId);

      if (error) throw error;

      console.log(`Updated pattern priority: ${patternId} -> ${priority}`);
      return true;
    } catch (error) {
      console.error(`Error updating pattern priority ${patternId}:`, error);
      return false;
    }
  },

  // Get pattern performance analytics
  async getPatternAnalytics(bankPreset?: string): Promise<{
    totalPatterns: number;
    activePatterns: number;
    aiGeneratedPatterns: number;
    avgSuccessRate: number;
    topPerformingPatterns: BankRegexPattern[];
  }> {
    try {
      let query = supabase.from("bank_regex_patterns").select("*");

      if (bankPreset) {
        query = query.eq("bank_preset", bankPreset);
      }

      const { data, error } = await query;

      if (error) throw error;

      const patterns = data || [];
      const activePatterns = patterns.filter(p => p.is_active);
      const aiPatterns = patterns.filter(p => p.is_ai_generated);

      const avgSuccessRate = activePatterns.length > 0
        ? activePatterns.reduce((sum, p) => sum + p.success_rate, 0) / activePatterns.length
        : 0;

      const topPerforming = activePatterns
        .sort((a, b) => b.success_rate - a.success_rate)
        .slice(0, 5);

      return {
        totalPatterns: patterns.length,
        activePatterns: activePatterns.length,
        aiGeneratedPatterns: aiPatterns.length,
        avgSuccessRate: parseFloat(avgSuccessRate.toFixed(2)),
        topPerformingPatterns: topPerforming,
      };
    } catch (error) {
      console.error("Error getting pattern analytics:", error);
      return {
        totalPatterns: 0,
        activePatterns: 0,
        aiGeneratedPatterns: 0,
        avgSuccessRate: 0,
        topPerformingPatterns: [],
      };
    }
  },

  // Clear cache for a specific bank or all banks
  clearCache(bankPreset?: string): void {
    if (bankPreset) {
      regexPatternsCache.delete(`regex_patterns_${bankPreset}`);
    } else {
      regexPatternsCache.clear();
    }
  },
};
