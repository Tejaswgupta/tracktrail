-- View to pre-calculate counterparty statistics for performance
-- This view provides all the metrics needed for the OverviewTab counterparty analysis
CREATE OR REPLACE VIEW counterparty_stats AS
SELECT 
  t.counterparty_merged as counterparty_name,
  ce.case_id,
  COUNT(*)::BIGINT as transaction_count,
  SUM(CASE WHEN t.direction = 'DR' THEN t.amount ELSE 0 END) as total_debits,
  SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE 0 END) as total_credits,
  SUM(t.amount) as total_amount,
  SUM(CASE WHEN t.direction = 'CR' THEN t.amount ELSE -t.amount END) as net_flow,
  SUM(t.amount) / COUNT(*) as avg_transaction_size,
  MAX(t.amount) as max_transaction_size,
  MIN(t.tx_date::DATE) as first_seen,
  MAX(t.tx_date::DATE) as last_seen,
  MAX(t.tx_date::DATE) - MIN(t.tx_date::DATE) + 1 as days_active,
  COUNT(*)::DECIMAL / (MAX(t.tx_date::DATE) - MIN(t.tx_date::DATE) + 1) as frequency
FROM transactions t
INNER JOIN accounts a ON t.account_id = a.account_id
INNER JOIN entities e ON a.entity_id = e.entity_id
INNER JOIN case_entities ce ON e.entity_id = ce.entity_id
WHERE t.counterparty_merged IS NOT NULL
  AND TRIM(t.counterparty_merged) != ''
GROUP BY t.counterparty_merged, ce.case_id;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_counterparty_stats_case ON counterparty_stats(case_id);

-- Add comment
COMMENT ON VIEW counterparty_stats IS 'Pre-calculated counterparty statistics for performance optimization in OverviewTab';