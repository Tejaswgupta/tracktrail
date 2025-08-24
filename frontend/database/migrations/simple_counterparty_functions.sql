-- Simplified counterparty functions that match actual database column types
-- Date: 2025-01-18
-- Description: Create functions that work with existing schema without type conflicts

-- Drop ALL existing versions first
DROP FUNCTION IF EXISTS get_counterparty_merge_candidates_v2(UUID, NUMERIC, INTEGER);
DROP FUNCTION IF EXISTS find_similar_counterparties_v2(UUID, NUMERIC);
DROP FUNCTION IF EXISTS get_case_counterparty_stats(UUID);
DROP FUNCTION IF EXISTS preview_counterparty_merge_v2(UUID, TEXT[], TEXT);

-- Ensure pg_trgm extension is available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Simple function to get counterparty stats using actual column types
CREATE OR REPLACE FUNCTION get_case_counterparty_stats(p_case_id UUID)
RETURNS TABLE (
  counterparty_name VARCHAR(255),
  transaction_count BIGINT,
  total_amount NUMERIC,
  first_seen DATE,
  last_seen DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.counterparty_merged,
    COUNT(*)::BIGINT,
    SUM(t.amount),
    MIN(t.tx_date::DATE),
    MAX(t.tx_date::DATE)
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

-- Simple similarity function
CREATE OR REPLACE FUNCTION find_similar_counterparties_v2(
  p_case_id UUID,
  p_similarity_threshold NUMERIC DEFAULT 0.8
)
RETURNS TABLE (
  name1 VARCHAR(255),
  name2 VARCHAR(255),
  similarity_score NUMERIC,
  combined_transaction_count BIGINT,
  name1_count BIGINT,
  name2_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH counterparty_stats AS (
    SELECT * FROM get_case_counterparty_stats(p_case_id)
  ),
  similarity_pairs AS (
    SELECT 
      c1.counterparty_name,
      c2.counterparty_name,
      SIMILARITY(UPPER(c1.counterparty_name), UPPER(c2.counterparty_name))::NUMERIC,
      (c1.transaction_count + c2.transaction_count)::BIGINT,
      c1.transaction_count,
      c2.transaction_count
    FROM counterparty_stats c1
    CROSS JOIN counterparty_stats c2
    WHERE c1.counterparty_name < c2.counterparty_name
      AND SIMILARITY(UPPER(c1.counterparty_name), UPPER(c2.counterparty_name)) >= p_similarity_threshold::REAL
  )
  SELECT * FROM similarity_pairs
  ORDER BY similarity_score DESC, combined_transaction_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Simple merge candidates function
CREATE OR REPLACE FUNCTION get_counterparty_merge_candidates_v2(
  p_case_id UUID,
  p_min_similarity NUMERIC DEFAULT 0.75,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  representative VARCHAR(255),
  similar_names VARCHAR(255)[],
  similarity_scores NUMERIC[],
  total_transactions BIGINT,
  potential_savings INTEGER
) AS $$
BEGIN
  RETURN QUERY
  WITH similar_pairs AS (
    SELECT * FROM find_similar_counterparties_v2(p_case_id, p_min_similarity)
  ),
  grouped_candidates AS (
    SELECT 
      CASE 
        WHEN sp.name1_count >= sp.name2_count THEN sp.name1 
        ELSE sp.name2 
      END as representative,
      CASE 
        WHEN sp.name1_count >= sp.name2_count THEN sp.name2 
        ELSE sp.name1 
      END as similar_name,
      sp.similarity_score,
      sp.combined_transaction_count
    FROM similar_pairs sp
  )
  SELECT 
    gc.representative,
    ARRAY_AGG(gc.similar_name ORDER BY gc.similarity_score DESC),
    ARRAY_AGG(gc.similarity_score ORDER BY gc.similarity_score DESC),
    MAX(gc.combined_transaction_count),
    (ARRAY_LENGTH(ARRAY_AGG(gc.similar_name), 1))::INTEGER
  FROM grouped_candidates gc
  GROUP BY gc.representative
  ORDER BY MAX(gc.combined_transaction_count) DESC, (ARRAY_LENGTH(ARRAY_AGG(gc.similar_name), 1))::INTEGER DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Simple preview function
CREATE OR REPLACE FUNCTION preview_counterparty_merge_v2(
  p_case_id UUID,
  p_from_names VARCHAR(255)[],
  p_to_name VARCHAR(255)
)
RETURNS TABLE (
  affected_transactions BIGINT,
  affected_accounts INTEGER,
  total_amount NUMERIC,
  date_range_start DATE,
  date_range_end DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT,
    COUNT(DISTINCT t.account_id)::INTEGER,
    SUM(t.amount),
    MIN(t.tx_date::DATE),
    MAX(t.tx_date::DATE)
  FROM transactions t
  INNER JOIN accounts a ON t.account_id = a.account_id
  INNER JOIN entities e ON a.entity_id = e.entity_id
  INNER JOIN case_entities ce ON e.entity_id = ce.entity_id
  WHERE ce.case_id = p_case_id
    AND t.counterparty_merged = ANY(p_from_names);
END;
$$ LANGUAGE plpgsql;

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty_trgm 
ON transactions USING gin (counterparty_merged gin_trgm_ops)
WHERE counterparty_merged IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_case_counterparty 
ON transactions (counterparty_merged) 
WHERE counterparty_merged IS NOT NULL;

-- Add comments
COMMENT ON FUNCTION get_case_counterparty_stats(UUID) IS 'Get counterparty statistics for a specific case using actual column types';
COMMENT ON FUNCTION find_similar_counterparties_v2(UUID, NUMERIC) IS 'Find similar counterparty names using database trigram similarity with VARCHAR types';
COMMENT ON FUNCTION get_counterparty_merge_candidates_v2(UUID, NUMERIC, INTEGER) IS 'Get grouped merge candidates with similarity scores using VARCHAR types';
COMMENT ON FUNCTION preview_counterparty_merge_v2(UUID, VARCHAR(255)[], VARCHAR(255)) IS 'Preview the impact of a counterparty merge operation using VARCHAR types';