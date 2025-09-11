## Extended Schema with Cases

### Additional Tables for Case Management

```sql
-- 1. cases Table (Investigation containers)
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    created_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(100)
);

-- 2. case_entities Junction Table (Many-to-Many: Cases ↔ Entities)
CREATE TABLE case_entities (
    case_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    entity_role VARCHAR(50) NOT NULL CHECK (entity_role IN ('Primary Suspect', 'Suspect', 'Person of Interest', 'Witness', 'Victim', 'Related Party')),
    notes TEXT,
    added_date TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    added_by VARCHAR(100) NOT NULL,
    UNIQUE(case_id, entity_id) -- Prevent duplicate associations
);

-- 3. case_transactions Junction Table (Flag specific transactions)
CREATE TABLE case_transactions (
    case_transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    transaction_id UUID NOT NULL REFERENCES transactions(transaction_id) ON DELETE CASCADE,
    flag_type VARCHAR(50) NOT NULL CHECK (flag_type IN ('Suspicious', 'Evidence', 'Related', 'Under Review')),
    notes TEXT,
    flagged_date TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    flagged_by VARCHAR(100) NOT NULL,
    UNIQUE(case_id, transaction_id)
);

-- 4. case_notes Table (Investigation diary/timeline)
CREATE TABLE case_notes (
    note_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    note_type VARCHAR(50) NOT NULL CHECK (note_type IN ('Observation', 'Action', 'Evidence', 'Interview', 'Analysis')),
    content TEXT NOT NULL,
    attachments JSONB, -- Store file references
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    created_by VARCHAR(100) NOT NULL
);
```

### Updated Entities Table (with case context)

```sql
-- Modify entities table to include investigation metadata
ALTER TABLE entities ADD COLUMN risk_score INTEGER CHECK (risk_score BETWEEN 0 AND 100);
ALTER TABLE entities ADD COLUMN entity_type VARCHAR(50) CHECK (entity_type IN ('Individual', 'Company', 'Trust', 'Partnership', 'Unknown'));
ALTER TABLE entities ADD COLUMN metadata JSONB; -- Flexible field for KYC data, addresses, etc.
```

### Indexes for Performance

```sql
-- Case-related indexes
CREATE INDEX idx_cases_status ON cases(status) WHERE status = 'Active';
CREATE INDEX idx_cases_agency ON cases(investigating_agency);
CREATE INDEX idx_case_entities_case ON case_entities(case_id);
CREATE INDEX idx_case_entities_entity ON case_entities(entity_id);
CREATE INDEX idx_case_transactions_case ON case_transactions(case_id);
CREATE INDEX idx_case_transactions_date ON case_transactions(flagged_date);
```

### Enhanced Analysis Views

```sql
-- 1. Case Overview View
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
    COUNT(DISTINCT ct.transaction_id) as flagged_transaction_count,
    SUM(CASE WHEN ce.entity_role = 'Primary Suspect' THEN 1 ELSE 0 END) as primary_suspects,
    MIN(t.tx_date) as earliest_transaction,
    MAX(t.tx_date) as latest_transaction,
    c.opened_date,
    c.closed_date
FROM cases c
LEFT JOIN case_entities ce ON c.case_id = ce.case_id
LEFT JOIN case_transactions ct ON c.case_id = ct.case_id
LEFT JOIN transactions t ON ct.transaction_id = t.transaction_id
GROUP BY c.case_id;

-- 2. Case Transaction Analysis View
CREATE VIEW case_transaction_analysis AS
SELECT
    c.case_number,
    c.case_name,
    t.tx_date::DATE as date,
    e.entity_owner,
    ce.entity_role,
    a.account_name,
    t.description,
    CASE WHEN t.direction = 'DR' THEN t.amount ELSE 0 END AS debit,
    CASE WHEN t.direction = 'CR' THEN t.amount ELSE 0 END AS credit,
    t.counterparty_merged,
    ct.flag_type,
    ct.notes as flag_notes,
    ct.flagged_by,
    t.row_id,
    c.case_id,
    t.transaction_id
FROM case_transactions ct
JOIN cases c ON ct.case_id = c.case_id
JOIN transactions t ON ct.transaction_id = t.transaction_id
JOIN accounts a ON t.account_id = a.account_id
JOIN entities e ON t.entity_id = e.entity_id
LEFT JOIN case_entities ce ON ce.case_id = c.case_id AND ce.entity_id = e.entity_id;

-- 3. Entity Investigation View (All cases for an entity)
CREATE VIEW entity_investigation_view AS
SELECT
    e.entity_id,
    e.entity_owner,
    e.entity_type,
    e.risk_score,
    c.case_id,
    c.case_number,
    c.case_name,
    c.status as case_status,
    ce.entity_role,
    ce.added_date,
    COUNT(DISTINCT a.account_id) as account_count,
    COUNT(DISTINCT t.transaction_id) as transaction_count,
    SUM(CASE WHEN t.direction = 'DR' THEN t.amount ELSE 0 END) as total_debits,
    SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE 0 END) as total_credits
FROM entities e
LEFT JOIN case_entities ce ON e.entity_id = ce.entity_id
LEFT JOIN cases c ON ce.case_id = c.case_id
LEFT JOIN accounts a ON e.entity_id = a.entity_id
LEFT JOIN transactions t ON e.entity_id = t.entity_id
GROUP BY e.entity_id, c.case_id, c.case_number, c.case_name, c.status, ce.entity_role, ce.added_date;
```

### Security and Audit Triggers

```sql
-- Audit trigger for case modifications
CREATE OR REPLACE FUNCTION audit_case_changes() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        NEW.updated_at = NOW() AT TIME ZONE 'UTC';
        -- Log critical changes to audit table (create separately)
        IF OLD.status != NEW.status THEN
            INSERT INTO audit_log (table_name, record_id, action, field_name, old_value, new_value, changed_by, changed_at)
            VALUES ('cases', NEW.case_id, 'UPDATE', 'status', OLD.status, NEW.status, NEW.updated_by, NOW());
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_cases
BEFORE UPDATE ON cases
FOR EACH ROW EXECUTE FUNCTION audit_case_changes();
```

### Row-Level Security for Multi-Agency Support

```sql
-- Enable RLS
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cases from their agency
CREATE POLICY agency_cases ON cases
    FOR ALL
    USING (investigating_agency = current_setting('app.current_agency'));

-- Policy: Users can see entities linked to their cases
CREATE POLICY agency_case_entities ON case_entities
    FOR ALL
    USING (case_id IN (
        SELECT case_id FROM cases
        WHERE investigating_agency = current_setting('app.current_agency')
    ));
```

## Key Benefits of This Case Management Extension:

1. **Investigation Context**: Each case groups related entities and transactions, maintaining investigation boundaries
2. **Role Classification**: Entities have roles within cases (suspect, witness, etc.)
3. **Transaction Flagging**: Specific transactions can be marked as evidence or suspicious
4. **Multi-Agency Support**: RLS ensures agencies only see their own cases
5. **Audit Trail**: Complete history of case modifications for court admissibility
6. **Flexible Notes**: Investigation diary with attachment support (store file paths/S3 URLs in JSONB)
7. **Performance**: Optimized indexes for common queries like "all active cases" or "all transactions for case X"

## Sample Queries for Investigators:

```sql
-- Find all suspicious transactions across active cases
SELECT * FROM case_transaction_analysis
WHERE flag_type = 'Suspicious'
AND case_id IN (SELECT case_id FROM cases WHERE status = 'Active');

-- Get network of entities connected through common transactions
WITH entity_connections AS (
    SELECT DISTINCT
        t1.entity_id as entity_a,
        t2.entity_id as entity_b,
        t1.counterparty_merged as connection_point
    FROM transactions t1
    JOIN transactions t2 ON t1.counterparty_merged = t2.counterparty_merged
    WHERE t1.entity_id != t2.entity_id
    AND t1.entity_id IN (SELECT entity_id FROM case_entities WHERE case_id = ?)
)
SELECT * FROM entity_connections;
```

Absolutely! You're right - entities need unique identifiers like PAN for proper entity resolution and deduplication. This is critical for law enforcement to track individuals/companies across multiple cases and accounts. Here's the enhanced entity schema:

## Enhanced Entity Schema with Identifiers

```sql
-- Enhanced entities table with identification
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

    -- Additional Identifiers (for investigation)
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

    -- Flexible metadata for additional info
    metadata JSONB, -- Can store aliases, alternate names, addresses array, etc.

    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    created_by VARCHAR(100) NOT NULL,
    updated_at TIMESTAMPTZ,
    updated_by VARCHAR(100),

    -- Constraints for data quality
    CONSTRAINT pan_format CHECK (pan ~ '^[A-Z]{5}[0-9]{4}[A-Z]$' OR pan IS NULL),
    CONSTRAINT gstin_format CHECK (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9]$' OR gstin IS NULL),
    CONSTRAINT email_format CHECK (primary_email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}$' OR primary_email IS NULL)
);

-- Indexes for quick lookups
CREATE INDEX idx_entities_pan ON entities(pan) WHERE pan IS NOT NULL;
CREATE INDEX idx_entities_gstin ON entities(gstin) WHERE gstin IS NOT NULL;
CREATE INDEX idx_entities_aadhaar_hash ON entities(aadhaar_hash) WHERE aadhaar_hash IS NOT NULL;
CREATE INDEX idx_entities_risk_score ON entities(risk_score) WHERE risk_score > 50; -- High-risk entities
CREATE INDEX idx_entities_metadata ON entities USING GIN (metadata); -- For JSONB queries
```

## Entity Aliases Table (for alternate names/spellings)

```sql
-- Track alternate names, misspellings, and aliases
CREATE TABLE entity_aliases (
    alias_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    alias_name VARCHAR(255) NOT NULL,
    alias_type VARCHAR(50) CHECK (alias_type IN (
        'Trading Name', 'Previous Name', 'Nickname',
        'Misspelling', 'Abbreviated', 'DBA', 'Other'
    )),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    created_by VARCHAR(100) NOT NULL
);

CREATE INDEX idx_entity_aliases_name ON entity_aliases(LOWER(alias_name));
CREATE INDEX idx_entity_aliases_entity ON entity_aliases(entity_id);
```

## Entity Relationships Table (for tracking connections)

```sql
-- Track relationships between entities (beneficial ownership, family, business partners)
CREATE TABLE entity_relationships (
    relationship_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id_from UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    entity_id_to UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    relationship_type VARCHAR(50) NOT NULL CHECK (relationship_type IN (
        'Director', 'Shareholder', 'Beneficial Owner', 'Employee',
        'Family', 'Business Partner', 'Related Party', 'Subsidiary',
        'Parent Company', 'Sister Concern', 'Other'
    )),
    relationship_details JSONB, -- e.g., {"shareholding_percent": 25, "since": "2020-01-01"}
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW() AT TIME ZONE 'UTC',
    created_by VARCHAR(100) NOT NULL,
    CONSTRAINT no_self_relationship CHECK (entity_id_from != entity_id_to)
);

CREATE INDEX idx_entity_relationships_from ON entity_relationships(entity_id_from);
CREATE INDEX idx_entity_relationships_to ON entity_relationships(entity_id_to);
```

## Enhanced Entity Matching Function

```sql
-- Function to find potential duplicate entities
CREATE OR REPLACE FUNCTION find_matching_entities(
    p_pan VARCHAR(10) DEFAULT NULL,
    p_name VARCHAR(255) DEFAULT NULL,
    p_gstin VARCHAR(15) DEFAULT NULL,
    p_threshold FLOAT DEFAULT 0.7
) RETURNS TABLE (
    entity_id UUID,
    entity_name VARCHAR(255),
    pan VARCHAR(10),
    gstin VARCHAR(15),
    match_score FLOAT,
    match_reason TEXT
) AS $$
BEGIN
    RETURN QUERY
    WITH matches AS (
        SELECT
            e.entity_id,
            e.entity_name,
            e.pan,
            e.gstin,
            CASE
                -- Exact PAN match = 100% confidence
                WHEN p_pan IS NOT NULL AND e.pan = p_pan THEN 1.0
                -- Exact GSTIN match = 100% confidence
                WHEN p_gstin IS NOT NULL AND e.gstin = p_gstin THEN 1.0
                -- Fuzzy name match (using pg_trgm extension)
                WHEN p_name IS NOT NULL THEN similarity(LOWER(e.entity_name), LOWER(p_name))
                ELSE 0
            END as match_score,
            CASE
                WHEN p_pan IS NOT NULL AND e.pan = p_pan THEN 'PAN Match'
                WHEN p_gstin IS NOT NULL AND e.gstin = p_gstin THEN 'GSTIN Match'
                WHEN p_name IS NOT NULL THEN 'Name Similarity'
                ELSE 'No Match'
            END as match_reason
        FROM entities e
        WHERE
            (p_pan IS NOT NULL AND e.pan = p_pan) OR
            (p_gstin IS NOT NULL AND e.gstin = p_gstin) OR
            (p_name IS NOT NULL AND similarity(LOWER(e.entity_name), LOWER(p_name)) >= p_threshold)
    )
    SELECT * FROM matches
    WHERE match_score >= p_threshold
    ORDER BY match_score DESC;
END;
$$ LANGUAGE plpgsql;
```

## Entity Deduplication View

```sql
-- View to identify potential duplicate entities
CREATE VIEW potential_duplicate_entities AS
WITH entity_pairs AS (
    SELECT
        e1.entity_id as entity_id_1,
        e1.entity_name as name_1,
        e1.pan as pan_1,
        e2.entity_id as entity_id_2,
        e2.entity_name as name_2,
        e2.pan as pan_2,
        similarity(LOWER(e1.entity_name), LOWER(e2.entity_name)) as name_similarity
    FROM entities e1
    CROSS JOIN entities e2
    WHERE e1.entity_id < e2.entity_id -- Avoid duplicate pairs
    AND (
        -- Same PAN but different entity_id
        (e1.pan IS NOT NULL AND e1.pan = e2.pan) OR
        -- Same GSTIN
        (e1.gstin IS NOT NULL AND e1.gstin = e2.gstin) OR
        -- Very similar names (>80% match)
        similarity(LOWER(e1.entity_name), LOWER(e2.entity_name)) > 0.8
    )
)
SELECT * FROM entity_pairs
ORDER BY name_similarity DESC;
```

## Updated Accounts Table with KYC

```sql
-- Enhanced accounts table
ALTER TABLE accounts ADD COLUMN account_type VARCHAR(50) CHECK (account_type IN (
    'Savings', 'Current', 'Cash Credit', 'Overdraft',
    'Fixed Deposit', 'Recurring Deposit', 'NRE', 'NRO',
    'Foreign Currency', 'Escrow', 'Other'
));
ALTER TABLE accounts ADD COLUMN bank_name VARCHAR(100);
ALTER TABLE accounts ADD COLUMN branch_name VARCHAR(100);
ALTER TABLE accounts ADD COLUMN ifsc_code VARCHAR(11);
ALTER TABLE accounts ADD COLUMN opening_date DATE;
ALTER TABLE accounts ADD COLUMN status VARCHAR(20) DEFAULT 'Active' CHECK (status IN ('Active', 'Closed', 'Frozen', 'Dormant'));
```

## Sample Data and Usage

```sql
-- Insert an entity with PAN
INSERT INTO entities (
    pan, entity_name, entity_type, gstin, risk_score, metadata
) VALUES (
    'AAAPA1234A',
    'ABC Traders Pvt Ltd',
    'Company',
    '27AAAPA1234A1Z5',
    45,
    '{"industry": "Trading", "incorporation_date": "2015-03-15", "authorized_capital": 10000000}'::jsonb
);

-- Find all accounts linked to a PAN
SELECT
    e.pan,
    e.entity_name,
    a.account_name,
    a.account_number,
    a.bank_name,
    COUNT(t.transaction_id) as transaction_count,
    SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE 0 END) as total_credits,
    SUM(CASE WHEN t.direction = 'DR' THEN t.amount ELSE 0 END) as total_debits
FROM entities e
JOIN accounts a ON e.entity_id = a.entity_id
LEFT JOIN transactions t ON a.account_id = t.account_id
WHERE e.pan = 'AAAPA1234A'
GROUP BY e.pan, e.entity_name, a.account_name, a.account_number, a.bank_name;

-- Find entities with multiple PANs (potential fraud)
SELECT
    entity_name,
    COUNT(DISTINCT pan) as pan_count,
    STRING_AGG(pan, ', ') as all_pans
FROM entities
WHERE pan IS NOT NULL
GROUP BY entity_name
HAVING COUNT(DISTINCT pan) > 1;
```

## Benefits of This Approach:

1. **Unique Identification**: PAN serves as primary key for Indian entities, preventing duplicates
2. **Multi-ID Support**: Can track entities even if PAN isn't available (using GSTIN, Aadhaar hash, etc.)
3. **Entity Resolution**: The matching function helps merge duplicate entities during import
4. **Compliance**: Stores Aadhaar as hash only (following UIDAI guidelines)
5. **Flexibility**: JSONB metadata allows storing additional identifiers without schema changes
6. **Investigation Ready**: Risk scores, relationships, and aliases support complex investigations
7. **Data Quality**: CHECK constraints ensure PAN/GSTIN format validity

## Import Workflow with Deduplication:

```sql
-- Before inserting a new entity, check for existing
DO $$
DECLARE
    v_existing_entity_id UUID;
    v_new_pan VARCHAR(10) := 'AAAPA1234A';
    v_new_name VARCHAR(255) := 'ABC Traders Private Limited';
BEGIN
    -- Check if entity exists
    SELECT entity_id INTO v_existing_entity_id
    FROM find_matching_entities(v_new_pan, v_new_name)
    LIMIT 1;

    IF v_existing_entity_id IS NULL THEN
        -- Insert new entity
        INSERT INTO entities (pan, entity_name, entity_type)
        VALUES (v_new_pan, v_new_name, 'Company');
    ELSE
        -- Update existing entity or create alias
        INSERT INTO entity_aliases (entity_id, alias_name, alias_type)
        VALUES (v_existing_entity_id, v_new_name, 'Misspelling');
    END IF;
END $$;
```
