-- Function to get detailed counterparty statistics for a case
-- This function provides all the metrics needed for the OverviewTab counterparty analysis
CREATE OR REPLACE FUNCTION get_case_counterparty_stats_detailed(p_case_id UUID)
RETURNS TABLE (
  counterparty_name VARCHAR(255),
  transaction_count BIGINT,
  total_debits NUMERIC,
  total_credits NUMERIC,
  total_amount NUMERIC,
  net_flow NUMERIC,
  avg_transaction_size NUMERIC,
  max_transaction_size NUMERIC,
  first_seen DATE,
  last_seen DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.counterparty_merged,
    COUNT(*)::BIGINT as transaction_count,
    SUM(CASE WHEN t.direction = 'DR' THEN t.amount ELSE 0 END) as total_debits,
    SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE 0 END) as total_credits,
    SUM(t.amount) as total_amount,
    SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE -t.amount END) as net_flow,
    SUM(t.amount) / COUNT(*) as avg_transaction_size,
    MAX(t.amount) as max_transaction_size,
    MIN(t.tx_date::DATE) as first_seen,
    MAX(t.tx_date::DATE) as last_seen
  FROM transactions t
  INNER JOIN accounts a ON t.account_id = a.account_id
  INNER JOIN entities e ON a.entity_id = e.entity_id
  INNER JOIN case_entities ce ON e.entity_id = ce.entity_id
  WHERE ce.case_id = p_case_id
    AND t.counterparty_merged IS NOT NULL
    AND TRIM(t.counterparty_merged) != ''
  GROUP BY t.counterparty_merged
  ORDER BY COUNT(*) DESC, SUM(t.amount) DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_case_counterparty_stats_detailed(UUID) IS 'Get detailed counterparty statistics for a specific case including debits, credits, net flow, and other metrics needed for analysis';