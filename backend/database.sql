-- Bank Statement Analyzer Database Schema
-- Migration script for Supabase

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text matching

-- 1. Cases Table (Investigation containers)
CREATE TABLE cases (
    case_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_number VARCHAR(100) UNIQUE NOT NULL, -- e.g., "DGGI/2024/MUM/001"
    case_name VARCHAR(255) NOT NULL,
    case_type VARCHAR(50) NOT NULL CHECK (case_type IN ('Tax Evasion', 'Money Laundering', 'Fraud', 'Other')),
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Archived', 'On Hold')),
    priority VARCHAR(10) CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
    description TEXT,
    investigating_agency VARCHAR(100) NOT NULL, -- e.g., "DGGI Mumbai"
    lead_investigator VARCHAR(100) NOT NULL,
    opened_date DATE NOT NULL DEFAULT CURRENT_DATE,
    closed_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(100)
);

-- 2. Enhanced Entities Table with Identifiers
CREATE TABLE entities (
    entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Primary Identifiers (for deduplication/matching)
    pan VARCHAR(10) UNIQUE, -- AAAPA1234A format
    aadhaar_hash VARCHAR(64), -- Store only hash for security
    gstin VARCHAR(15), -- For businesses: 22AAAAA0000A1Z5
    cin VARCHAR(21), -- Company Identification Number
    
    -- Basic Information
    entity_name VARCHAR(255) NOT NULL, -- Legal name
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN (
        'Individual', 'Company', 'Partnership', 'Trust', 'LLP',
        'Proprietorship', 'HUF', 'Foreign Entity', 'Unknown'
    )),
    
    -- Additional Identifiers
    passport_number VARCHAR(20),
    voter_id VARCHAR(20),
    driving_license VARCHAR(20),
    
    -- Contact Information
    primary_phone VARCHAR(15),
    primary_email VARCHAR(255),
    registered_address TEXT,
    
    -- Risk and Investigation Metadata
    risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100),
    is_verified BOOLEAN DEFAULT FALSE,
    verification_date DATE,
    
    -- Flexible metadata
    metadata JSONB,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(100),
    
    -- Constraints for data quality
    CONSTRAINT pan_format CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' OR pan IS NULL),
    CONSTRAINT gstin_format CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]$' OR gstin IS NULL),
    CONSTRAINT email_format CHECK (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}$' OR primary_email IS NULL)
);

-- 3. Accounts Table
CREATE TABLE accounts (
    account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    account_number VARCHAR(50) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    account_type VARCHAR(50) CHECK (account_type IN (
        'Savings', 'Current', 'Cash Credit', 'Overdraft',
        'Fixed Deposit', 'Recurring Deposit', 'NRE', 'NRO',
        'Foreign Currency', 'Escrow', 'Other'
    )),
    bank_name VARCHAR(100),
    branch_name VARCHAR(100),
    ifsc_code VARCHAR(11),
    opening_date DATE,
    status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Frozen', 'Dormant')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    UNIQUE(entity_id, account_number, bank_name)
);

-- 4. Transactions Table
CREATE TABLE transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    tx_date DATE NOT NULL,
    description TEXT,
    amount DECIMAL(15,2) NOT NULL,
    direction VARCHAR(2) NOT NULL CHECK (direction IN ('DR', 'CR')),
    counterparty_merged VARCHAR(255),
    balance DECIMAL(15,2),
    original_index INTEGER NOT NULL CHECK (original_index > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL
);

-- 5. Bank Statements Table
CREATE TABLE bank_statements (
    statement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(account_id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_type VARCHAR(10) CHECK (file_type IN ('pdf', 'csv', 'xlsx', 'xls')),
    file_size BIGINT,
    statement_period_from DATE,
    statement_period_to DATE,
    upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'error')),
    processing_progress INTEGER DEFAULT 0 CHECK (processing_progress BETWEEN 0 AND 100),
    transaction_count INTEGER DEFAULT 0,
    uploaded_by VARCHAR(100) NOT NULL
);

-- 6. Case-Entity Junction Table
CREATE TABLE case_entities (
    case_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    entity_role VARCHAR(50) NOT NULL CHECK (entity_role IN ('Primary Suspect', 'Suspect', 'Person of Interest', 'Witness', 'Victim', 'Related Party')),
    notes TEXT,
    added_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by VARCHAR(100) NOT NULL,
    UNIQUE(case_id, entity_id)
);

-- 7. Case-Transaction Junction Table
CREATE TABLE case_transactions (
    case_transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('Suspicious', 'Evidence', 'Related', 'Under Review')),
    notes TEXT,
    flagged_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    flagged_by VARCHAR(100) NOT NULL,
    UNIQUE(case_id, transaction_id)
);

-- 8. Case Notes Table
CREATE TABLE case_notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL CHECK (note_type IN ('Observation', 'Action', 'Evidence', 'Interview', 'Analysis')),
    content TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL
);

-- Create Indexes for Performance
CREATE INDEX idx_cases_status ON cases(status) WHERE status = 'Active';
CREATE INDEX idx_cases_agency ON cases(investigating_agency);
CREATE INDEX idx_entities_pan ON entities(pan) WHERE pan IS NOT NULL;
CREATE INDEX idx_entities_gstin ON entities(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_entities_risk_score ON entities(risk_score) WHERE risk_score > 50;
CREATE INDEX idx_accounts_entity ON accounts(entity_id);
CREATE INDEX idx_transactions_account ON transactions(account_id);
CREATE INDEX idx_transactions_date ON transactions(tx_date);
CREATE INDEX idx_transactions_original_index ON transactions(original_index);
CREATE INDEX idx_transactions_date_original_index ON transactions(tx_date, original_index);
CREATE INDEX idx_case_entities_case ON case_entities(case_id);
CREATE INDEX idx_case_entities_entity ON case_entities(entity_id);

-- Create Views for Common Queries
CREATE VIEW case_overview AS
SELECT
    c.case_id,
    c.case_number,
    c.case_name,
    c.status,
    c.priority,
    c.investigating_agency,
    c.lead_investigator,
    COUNT(DISTINCT ce.entity_id) as entity_count,
    COUNT(DISTINCT a.account_id) as account_count,
    COUNT(DISTINCT bs.statement_id) as statement_count,
    c.opened_date,
    c.closed_date,
    c.created_at
FROM cases c
LEFT JOIN case_entities ce ON c.case_id = ce.case_id
LEFT JOIN accounts a ON ce.entity_id = a.entity_id
LEFT JOIN bank_statements bs ON a.account_id = bs.account_id
GROUP BY c.case_id;

-- Enable Row Level Security
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (Basic - can be enhanced based on auth requirements)
CREATE POLICY "Enable read access for all users" ON cases FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON cases FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON cases FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON entities FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON entities FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON entities FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON accounts FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON accounts FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON transactions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON bank_statements FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON bank_statements FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON case_entities FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON case_entities FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON case_transactions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON case_transactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON case_notes FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON case_notes FOR INSERT WITH CHECK (auth.role() = 'authenticated');