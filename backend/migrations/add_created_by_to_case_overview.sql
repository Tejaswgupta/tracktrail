-- Migration: Add created_by field to case_overview view
-- Purpose: Enable filtering cases by the user who created them
-- Date: 2025-01-16

-- Update the case_overview view to include created_by field
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
    c.opened_date,
    c.closed_date,
    c.created_at,
    c.created_by
FROM cases c
LEFT JOIN case_entities ce ON c.case_id = ce.case_id
LEFT JOIN accounts a ON ce.entity_id = a.entity_id
LEFT JOIN bank_statements bs ON a.account_id = bs.account_id
GROUP BY c.case_id;

-- Add comment for documentation
COMMENT ON VIEW case_overview IS 'Overview of cases with entity, account, and statement counts. Includes created_by for user-specific filtering.';
