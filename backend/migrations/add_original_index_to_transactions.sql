-- Migration: Add original_index column to transactions table
-- This preserves the original order of transactions from source files
-- Critical for pattern detection like round trips and rapid movements

-- Add original_index column to transactions table
ALTER TABLE transactions 
ADD COLUMN original_index INTEGER;

-- Create index for performance when ordering by original_index
CREATE INDEX idx_transactions_original_index ON transactions(original_index);

-- Create composite index for date + original_index ordering
CREATE INDEX idx_transactions_date_original_index ON transactions(tx_date, original_index);

-- Add comment to document the purpose
COMMENT ON COLUMN transactions.original_index IS 'Preserves the original order of transactions from source file. Critical for detecting patterns like round trips and rapid movements when dates are identical.';

-- Update existing transactions to have original_index based on creation order
-- This is a one-time operation for existing data
WITH ordered_transactions AS (
    SELECT 
        transaction_id,
        ROW_NUMBER() OVER (
            PARTITION BY account_id 
            ORDER BY tx_date, created_at
        ) as row_num
    FROM transactions
    WHERE original_index IS NULL
)
UPDATE transactions 
SET original_index = ordered_transactions.row_num
FROM ordered_transactions
WHERE transactions.transaction_id = ordered_transactions.transaction_id;

-- Make original_index NOT NULL after populating existing data
ALTER TABLE transactions 
ALTER COLUMN original_index SET NOT NULL;

-- Add constraint to ensure original_index is positive
ALTER TABLE transactions 
ADD CONSTRAINT chk_original_index_positive CHECK (original_index > 0);