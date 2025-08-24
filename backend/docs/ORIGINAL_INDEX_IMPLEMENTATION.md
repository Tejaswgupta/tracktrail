# Original Index Implementation

## Overview

The `original_index` column has been implemented to preserve the original order of transactions from source files. This is critical for financial investigation tools where the sequence of transactions matters, especially when detecting patterns like round trips, rapid movements, and other suspicious activities.

## Problem Statement

When transactions are batch uploaded and filtered by date, transactions with identical dates lose their original order. This breaks pattern detection algorithms that rely on the sequence of transactions, such as:

- **Round Trip Detection**: Detecting money that goes out and comes back from the same counterparty
- **Rapid Movement Analysis**: Identifying quick successive transactions (debit followed by credit)
- **Layering Patterns**: Complex money laundering schemes that rely on transaction sequence
- **Velocity Analysis**: Understanding the speed and order of fund movements

## Solution

### Database Schema Changes

1. **Added `original_index` column to transactions table**:

   ```sql
   ALTER TABLE transactions
   ADD COLUMN original_index INTEGER NOT NULL CHECK (original_index > 0);
   ```

2. **Created performance indexes**:

   ```sql
   CREATE INDEX idx_transactions_original_index ON transactions(original_index);
   CREATE INDEX idx_transactions_date_original_index ON transactions(tx_date, original_index);
   ```

3. **Migration script**: `backend/migrations/add_original_index_to_transactions.sql`

### Frontend Changes

1. **Updated ExtractedTransaction interface** to include `original_index: number`

2. **Modified transaction extractor service** to preserve original order:

   - CSV processing now assigns sequential `original_index` values (1-based)
   - Each transaction gets its position from the source file

3. **Updated file upload service** to include `original_index` when saving to database

4. **Updated Transaction interface** in types to include the new field

### Backend Changes

1. **Updated database queries** to order by `tx_date, original_index`:

   ```sql
   ORDER BY tx_date, original_index
   ```

2. **Modified analysis services** to preserve order:

   - Rapid movement detection now sorts by `[DATE, original_index]`
   - Round trip detection maintains chronological order within same dates
   - All data preparation methods updated to use proper sorting

3. **Enhanced transaction upload service** to handle `original_index` properly

## Usage Examples

### Detecting Rapid Movements

Before (problematic):

```python
# This loses order for same-date transactions
df_sorted = df.sort_values(by=["DATE"]).reset_index(drop=True)
```

After (correct):

```python
# This preserves original order for same-date transactions
sort_columns = ["DATE"]
if "original_index" in df.columns:
    sort_columns.append("original_index")
df_sorted = df.sort_values(sort_columns).reset_index(drop=True)
```

### Round Trip Detection

The algorithm now correctly identifies round trips even when the outgoing and incoming transactions occur on the same date, by considering their original sequence.

### Database Queries

```sql
-- Get transactions in proper chronological order
SELECT * FROM transactions
WHERE entity_id = 'some-uuid'
ORDER BY tx_date, original_index;

-- Find rapid movements (same day, sequential transactions)
SELECT t1.*, t2.*
FROM transactions t1
JOIN transactions t2 ON t1.entity_id = t2.entity_id
WHERE t1.tx_date = t2.tx_date
  AND t1.original_index = t2.original_index - 1
  AND t1.direction = 'DR'
  AND t2.direction = 'CR';
```

## Implementation Details

### CSV Processing

1. **Original Index Assignment**:

   - Header row is skipped (not counted)
   - Data rows get sequential numbers starting from 1
   - Empty/invalid rows are skipped but don't break the sequence

2. **Column Mapping**:
   - Works with both automatic and manual column mapping
   - Preserves order regardless of column arrangement

### Data Flow

1. **File Upload** → CSV parsed line by line with `original_index`
2. **Transaction Extraction** → Each valid transaction gets its sequence number
3. **Database Storage** → `original_index` stored alongside transaction data
4. **Analysis Queries** → Always order by `tx_date, original_index`
5. **Pattern Detection** → Algorithms can rely on proper chronological sequence

### Performance Considerations

1. **Indexes**: Composite index on `(tx_date, original_index)` for optimal query performance
2. **Memory**: Minimal overhead (one integer per transaction)
3. **Compatibility**: Backward compatible with existing data (migration handles existing records)

## Testing

### Scenarios Covered

1. **Same Date Transactions**: Multiple transactions on same date maintain original order
2. **Round Trip Detection**: Correctly identifies patterns within same-date transactions
3. **Rapid Movement**: Detects quick successive transactions regardless of date
4. **Large Files**: Performance tested with large CSV files
5. **Mixed Formats**: Works with different bank statement formats

### Test Cases

```python
# Test case: Same date, different original_index
transactions = [
    {"date": "2024-01-15", "original_index": 1, "direction": "DR", "amount": 1000},
    {"date": "2024-01-15", "original_index": 2, "direction": "CR", "amount": 1000},
]
# Should detect as potential round trip due to sequence
```

## Migration Guide

### For Existing Data

1. Run the migration script: `backend/migrations/add_original_index_to_transactions.sql`
2. Existing transactions get `original_index` based on creation order
3. New uploads will have proper sequence from source files

### For New Deployments

1. Use the updated `backend/database.sql` schema
2. All new transactions will have `original_index` from the start

## Benefits

1. **Accurate Pattern Detection**: Algorithms can rely on proper transaction sequence
2. **Forensic Integrity**: Maintains the original order from source documents
3. **Audit Trail**: Investigators can see transactions in their original sequence
4. **Better Analysis**: More accurate detection of suspicious patterns
5. **Compliance**: Meets requirements for maintaining document integrity

## Future Enhancements

1. **Batch Processing**: Optimize for very large files (millions of transactions)
2. **Cross-File Ordering**: Handle multiple files uploaded for same account
3. **Temporal Analysis**: Use original_index for more sophisticated time-based patterns
4. **Visualization**: Show transactions in original order in UI components

## Troubleshooting

### Common Issues

1. **Missing original_index**: Check if migration was run properly
2. **Wrong Order**: Verify that queries use `ORDER BY tx_date, original_index`
3. **Performance**: Ensure composite indexes are created
4. **Data Integrity**: Validate that original_index values are sequential and positive

### Debugging Queries

```sql
-- Check for missing original_index
SELECT COUNT(*) FROM transactions WHERE original_index IS NULL;

-- Verify ordering
SELECT tx_date, original_index, description
FROM transactions
WHERE entity_id = 'some-uuid'
ORDER BY tx_date, original_index
LIMIT 20;

-- Find gaps in sequence (potential data issues)
SELECT entity_id, account_id,
       original_index,
       LAG(original_index) OVER (ORDER BY original_index) as prev_index
FROM transactions
WHERE original_index - LAG(original_index) OVER (ORDER BY original_index) > 1;
```
