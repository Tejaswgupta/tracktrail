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

-- 9. AML Alerts Table
CREATE TABLE aml_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL CHECK (alert_type IN ('smurfing', 'round_tripping', 'rapid_movement', 'transfer_pattern', 'common_counterparty')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    score DECIMAL(5,4) NOT NULL CHECK (score BETWEEN 0 AND 1), -- 0.0000 to 1.0000
    entities JSONB NOT NULL, -- Array of entity names/IDs
    transaction_ids JSONB NOT NULL, -- Array of transaction UUIDs
    metadata JSONB, -- Additional alert-specific data
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'closed', 'false_positive')),
    assigned_to VARCHAR(100),
    resolution_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(100),
    resolved_at TIMESTAMPTZ
);

-- 10. AML Analysis Sessions Table
CREATE TABLE aml_analysis_sessions (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL DEFAULT 'full_analysis',
    transaction_count INTEGER NOT NULL,
    alerts_generated INTEGER DEFAULT 0,
    overall_risk_score DECIMAL(5,2) CHECK (overall_risk_score BETWEEN 0 AND 100),
    analysis_parameters JSONB, -- Configuration used for analysis
    execution_time_ms INTEGER, -- Analysis performance metrics
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    created_by VARCHAR(100) NOT NULL
);

-- 11. Entity Risk Scores Table
CREATE TABLE entity_risk_scores (
    risk_score_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    case_id UUID REFERENCES cases(case_id) ON DELETE CASCADE, -- NULL for global scores
    risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
    risk_factors JSONB, -- Array of risk factor descriptions
    recommendations JSONB, -- Array of recommended actions
    transaction_count INTEGER NOT NULL,
    total_amount DECIMAL(15,2) NOT NULL,
    analysis_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL,
    UNIQUE(entity_id, case_id, analysis_date) -- One score per entity per case per day
);

-- 12. AML Reports Table
CREATE TABLE aml_reports (
    report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    report_type VARCHAR(50) NOT NULL DEFAULT 'comprehensive',
    report_title VARCHAR(255) NOT NULL,
    report_sections JSONB NOT NULL, -- Array of included sections
    file_name VARCHAR(255),
    file_size BIGINT,
    file_path TEXT, -- If storing files
    generation_parameters JSONB, -- Report configuration
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_by VARCHAR(100) NOT NULL,
    downloaded_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ
);

-- 13. Regulatory Thresholds Table (for compliance tracking)
CREATE TABLE regulatory_thresholds (
    threshold_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    threshold_name VARCHAR(100) NOT NULL UNIQUE,
    threshold_amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'INR',
    threshold_type VARCHAR(50) NOT NULL CHECK (threshold_type IN ('CTR', 'STR', 'HVT', 'CROSS_BORDER', 'CASH')),
    description TEXT,
    regulatory_authority VARCHAR(100), -- e.g., 'RBI', 'FIU-IND'
    effective_date DATE NOT NULL,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by VARCHAR(100) NOT NULL
);

-- Insert default Indian regulatory thresholds
INSERT INTO regulatory_thresholds (threshold_name, threshold_amount, threshold_type, description, regulatory_authority, effective_date, created_by) VALUES
('Cash Transaction Report', 1000000, 'CTR', 'Cash transactions of ₹10 lakh and above', 'FIU-IND', '2005-07-01', 'system'),
('Suspicious Transaction Report', 1000000, 'STR', 'Suspicious transactions regardless of amount, but ₹10 lakh threshold for certain categories', 'FIU-IND', '2005-07-01', 'system'),
('High Value Transaction', 2000000, 'HVT', 'High value transactions requiring enhanced monitoring', 'RBI', '2020-01-01', 'system'),
('Cross Border Transaction', 500000, 'CROSS_BORDER', 'Cross-border transactions of ₹5 lakh and above', 'FIU-IND', '2005-07-01', 'system'),
('Cash Deposit/Withdrawal', 50000, 'CASH', 'Cash transactions requiring additional documentation', 'RBI', '2017-01-01', 'system');

-- Create additional indexes for AML tables
CREATE INDEX idx_aml_alerts_case ON aml_alerts(case_id);
CREATE INDEX idx_aml_alerts_type_severity ON aml_alerts(alert_type, severity);
CREATE INDEX idx_aml_alerts_status ON aml_alerts(status) WHERE status = 'open';
CREATE INDEX idx_aml_analysis_sessions_case ON aml_analysis_sessions(case_id);
CREATE INDEX idx_entity_risk_scores_entity ON entity_risk_scores(entity_id);
CREATE INDEX idx_entity_risk_scores_case ON entity_risk_scores(case_id);
CREATE INDEX idx_entity_risk_scores_risk_score ON entity_risk_scores(risk_score) WHERE risk_score > 50;
CREATE INDEX idx_aml_reports_case ON aml_reports(case_id);
CREATE INDEX idx_regulatory_thresholds_active ON regulatory_thresholds(is_active) WHERE is_active = TRUE;

-- Create GIN indexes for JSONB columns
CREATE INDEX idx_aml_alerts_entities_gin ON aml_alerts USING GIN (entities);
CREATE INDEX idx_aml_alerts_transaction_ids_gin ON aml_alerts USING GIN (transaction_ids);
CREATE INDEX idx_entity_risk_scores_risk_factors_gin ON entity_risk_scores USING GIN (risk_factors);

-- Enable RLS for AML tables
ALTER TABLE aml_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_analysis_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE aml_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_thresholds ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for AML tables
CREATE POLICY "Enable read access for all users" ON aml_alerts FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON aml_alerts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Enable update for authenticated users only" ON aml_alerts FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON aml_analysis_sessions FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON aml_analysis_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON entity_risk_scores FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON entity_risk_scores FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON aml_reports FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON aml_reports FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable read access for all users" ON regulatory_thresholds FOR SELECT USING (true);
CREATE POLICY "Enable insert for authenticated users only" ON regulatory_thresholds FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Create SQL functions for AML operations
CREATE OR REPLACE FUNCTION increment_report_download(report_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE aml_reports 
    SET downloaded_count = downloaded_count + 1,
        last_downloaded_at = NOW()
    WHERE aml_reports.report_id = increment_report_download.report_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate entity risk score based on transactions
CREATE OR REPLACE FUNCTION calculate_entity_risk_score(
    p_entity_id UUID,
    p_case_id UUID DEFAULT NULL
)
RETURNS TABLE(
    risk_score INTEGER,
    risk_factors JSONB,
    recommendations JSONB
) AS $$
DECLARE
    total_amount DECIMAL(15,2);
    transaction_count INTEGER;
    cash_ratio DECIMAL(3,2);
    high_value_count INTEGER;
    calculated_risk_score INTEGER := 0;
    factors JSONB := '[]'::JSONB;
    recs JSONB := '[]'::JSONB;
BEGIN
    -- Get transaction statistics for the entity
    SELECT 
        COALESCE(SUM(t.amount), 0),
        COUNT(*),
        COALESCE(COUNT(*) FILTER (WHERE UPPER(t.description) LIKE '%CASH%' OR UPPER(t.description) LIKE '%ATM%'), 0)::DECIMAL / GREATEST(COUNT(*), 1),
        COUNT(*) FILTER (WHERE t.amount >= 2000000)
    INTO total_amount, transaction_count, cash_ratio, high_value_count
    FROM transactions t
    JOIN accounts a ON t.account_id = a.account_id
    WHERE a.entity_id = p_entity_id
    AND (p_case_id IS NULL OR EXISTS (
        SELECT 1 FROM case_entities ce 
        WHERE ce.entity_id = p_entity_id AND ce.case_id = p_case_id
    ));

    -- Calculate risk score based on various factors
    
    -- High volume risk (>5 crore)
    IF total_amount > 50000000 THEN
        calculated_risk_score := calculated_risk_score + 20;
        factors := factors || '"High transaction volume (>₹5 crore)"'::JSONB;
        recs := recs || '"Enhanced due diligence required"'::JSONB;
    END IF;

    -- High frequency risk (>300 transactions)
    IF transaction_count > 300 THEN
        calculated_risk_score := calculated_risk_score + 15;
        factors := factors || '"High transaction frequency"'::JSONB;
        recs := recs || '"Monitor for structuring patterns"'::JSONB;
    END IF;

    -- Cash transaction risk (>50% cash)
    IF cash_ratio > 0.5 THEN
        calculated_risk_score := calculated_risk_score + 25;
        factors := factors || '"High cash transaction ratio"'::JSONB;
        recs := recs || '"Verify source of cash transactions"'::JSONB;
    END IF;

    -- High value transaction risk
    IF high_value_count > 0 THEN
        calculated_risk_score := calculated_risk_score + 20;
        factors := factors || format('"Multiple high-value transactions (%s)"', high_value_count)::JSONB;
        recs := recs || '"Review high-value transaction documentation"'::JSONB;
    END IF;

    -- Cap the risk score at 100
    calculated_risk_score := LEAST(calculated_risk_score, 100);

    RETURN QUERY SELECT calculated_risk_score, factors, recs;
END;
$$ LANGUAGE plpgsql;

-- Create updated view with AML data
CREATE OR REPLACE VIEW case_overview AS
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
    COUNT(DISTINCT aa.alert_id) as aml_alert_count,
    COUNT(DISTINCT aa.alert_id) FILTER (WHERE aa.severity IN ('critical', 'high')) as high_priority_alerts,
    AVG(ers.risk_score) as avg_entity_risk_score,
    c.opened_date,
    c.closed_date,
    c.created_at
FROM cases c
LEFT JOIN case_entities ce ON c.case_id = ce.case_id
LEFT JOIN accounts a ON ce.entity_id = a.entity_id
LEFT JOIN bank_statements bs ON a.account_id = bs.account_id
LEFT JOIN aml_alerts aa ON c.case_id = aa.case_id
LEFT JOIN entity_risk_scores ers ON ce.entity_id = ers.entity_id AND c.case_id = ers.case_id
GROUP BY c.case_id;

-- Create AML-specific views
CREATE VIEW aml_alert_summary AS
SELECT
    aa.case_id,
    aa.alert_type,
    aa.severity,
    COUNT(*) as alert_count,
    AVG(aa.score) as avg_score,
    MAX(aa.created_at) as latest_alert
FROM aml_alerts aa
WHERE aa.status = 'open'
GROUP BY aa.case_id, aa.alert_type, aa.severity;

CREATE VIEW high_risk_entities AS
SELECT
    ers.entity_id,
    e.entity_name,
    ers.case_id,
    ers.risk_score,
    ers.risk_factors,
    ers.recommendations,
    ers.transaction_count,
    ers.total_amount,
    ers.analysis_date
FROM entity_risk_scores ers
JOIN entities e ON ers.entity_id = e.entity_id
WHERE ers.risk_score >= 70
ORDER BY ers.risk_score DESC, ers.analysis_date DESC;