// Database types for Bank Statement Analyzer

export interface Case {
  case_id: string;
  case_number: string;
  case_name: string;
  case_type: "Tax Evasion" | "Money Laundering" | "Fraud" | "Other";
  status: "Active" | "Closed" | "Archived" | "On Hold";
  priority?: "Critical" | "High" | "Medium" | "Low";
  description?: string;
  investigating_agency: string;
  lead_investigator: string;
  opened_date: string;
  closed_date?: string;
  created_at: string;
  created_by: string;
}

export enum EntityType {
  Individual = "Individual",
  Company = "Company",
  Partnership = "Partnership",
  Trust = "Trust",
}

export interface Entity {
  entity_id: string;
  pan?: string;
  aadhaar_hash?: string;
  gstin?: string;
  cin?: string;
  entity_name: string;
  entity_type: EntityType;
  passport_number?: string;
  voter_id?: string;
  driving_license?: string;
  primary_phone?: string;
  primary_email?: string;
  registered_address?: string;
  risk_score?: number;
  is_verified: boolean;
  verification_date?: string;
  metadata?: Record<string, any>;
  created_at: string;
  created_by: string;
}

export interface Account {
  account_id: string;
  entity_id: string;
  account_number: string;
  account_name: string;
  account_type?:
    | "Savings"
    | "Current"
    | "Cash Credit"
    | "Overdraft"
    | "Fixed Deposit"
    | "Recurring Deposit"
    | "NRE"
    | "NRO"
    | "Foreign Currency"
    | "Escrow"
    | "Other";
  bank_name?: string;
  branch_name?: string;
  ifsc_code?: string;
  opening_date?: string;
  status: "Active" | "Closed" | "Frozen" | "Dormant";
  created_at: string;
  created_by: string;
}

export interface Transaction {
  transaction_id: string;
  account_id: string;
  entity_id: string;
  statement_id: string;
  tx_date: string;
  description?: string;
  amount: number;
  direction: "DR" | "CR";
  counterparty_merged?: string;
  mapped_entity_id?: string;
  mapping_confidence?: number;
  mapping_verified?: boolean;
  mapped_at?: string;
  mapped_by?: string;
  balance?: number;
  original_index: number;
  created_at: string;
  created_by: string;
}

export interface BankStatement {
  statement_id: string;
  account_id: string;
  file_name: string;
  file_type: "pdf" | "csv" | "xlsx" | "xls";
  file_size?: number;
  statement_period_from?: string;
  statement_period_to?: string;
  upload_date: string;
  processing_status: "pending" | "processing" | "completed" | "error";
  processing_progress: number;
  transaction_count: number;
  uploaded_by: string;
}

interface CaseEntity {
  case_entity_id: string;
  case_id: string;
  entity_id: string;
  entity_role:
    | "Primary Suspect"
    | "Suspect"
    | "Person of Interest"
    | "Witness"
    | "Victim"
    | "Related Party";
  notes?: string;
  added_date: string;
  added_by: string;
}

export interface CaseTransaction {
  case_transaction_id: string;
  case_id: string;
  transaction_id: string;
  flag_type: "Suspicious" | "Evidence" | "Related" | "Under Review";
  notes?: string;
  flagged_date: string;
  flagged_by: string;
}

export interface CaseNote {
  note_id: string;
  case_id: string;
  note_type: "Observation" | "Action" | "Evidence" | "Interview" | "Analysis";
  content: string;
  attachments?: Record<string, any>;
  created_at: string;
  created_by: string;
}

// View types
interface CaseOverview {
  case_id: string;
  case_number: string;
  case_name: string;
  status: string;
  priority?: string;
  investigating_agency: string;
  lead_investigator: string;
  entity_count: number;
  account_count: number;
  statement_count: number;
  opened_date: string;
  closed_date?: string;
  created_at: string;
}

// Extended types with relations
export interface CaseWithStats extends Case {
  entity_count: number;
  account_count: number;
  statement_count: number;
}

export interface EntityWithAccounts extends Entity {
  accounts: Account[];
  account_count: number;
  statement_count: number;
}

export interface AccountWithStatements extends Account {
  statements: BankStatement[];
  statement_count: number;
  last_statement_date?: string;
  balance?: number;
  currency?: string;
}
