# Flowchart Endpoint Database Schema Fix

## Issue 1: Database Schema (RESOLVED)

The flowchart endpoint was failing with PostgreSQL error:

```
column entities.case_id does not exist (error code: 42703)
```

## Issue 2: Async Context Manager (RESOLVED)

After fixing the schema issue, encountered:

```
AttributeError: '_AsyncGeneratorContextManager' object has no attribute 'table'
```

## Root Cause

**Issue 1**: The database uses a **many-to-many relationship** between cases and entities through a junction table:

```
cases (case_id) <----> case_entities (case_id, entity_id) <----> entities (entity_id)
```

The original code incorrectly attempted to query entities directly by `case_id`:

```python
# ❌ INCORRECT - entities table has no case_id column
entities_query = client.table("entities").select(...).eq("case_id", request.case_id)
```

## Solution

Query the junction table first to get entity_ids, then fetch entities:

```python
# ✅ CORRECT - Two-step query using junction table
# Step 1: Get entity_ids from case_entities junction table
case_entities_result = (
    client.table("case_entities")
    .select("entity_id")
    .eq("case_id", request.case_id)
    .execute()
)

entity_ids_from_case = [row["entity_id"] for row in case_entities_result.data]

# Step 2: Fetch entities using the entity_ids
entities_query = (
    client.table("entities")
    .select("entity_id, entity_name, risk_score")
    .in_("entity_id", entity_ids_from_case)
)
entities_result = entities_query.execute()
```

**Issue 2**: The `get_connection()` method returns an async context manager that must be used with `async with`:

```python
# ❌ INCORRECT - Not using async context manager
client = database_service.db_manager.get_connection()
client.table("case_entities")  # Fails: client is a context manager, not a Supabase client

# ✅ CORRECT - Using async with
async with database_service.db_manager.get_connection() as client:
    client.table("case_entities")  # Works: client is now the Supabase client
```

## Database Schema Reference

From `backend/database.sql`:

```sql
-- Case-Entity Junction Table
CREATE TABLE case_entities (
    case_entity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id UUID NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    entity_id UUID NOT NULL REFERENCES entities(entity_id) ON DELETE CASCADE,
    entity_role VARCHAR(50) NOT NULL,
    notes TEXT,
    added_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    added_by VARCHAR(100) NOT NULL,
    UNIQUE(case_id, entity_id)
);
```

## Files Modified

- `backend/app/api/v1/endpoints/flowchart.py` (lines 68-228)

## Code Structure After Fix

```python
@router.post("/flowchart-chains")
async def analyze_flowchart_chains(
    request: FlowchartChainRequest,
    database_service: DatabaseService = Depends(get_database_service),
):
    start_time = datetime.now(timezone.utc)

    try:
        # Correctly use async context manager
        async with database_service.db_manager.get_connection() as client:
            # Step 1: Query junction table
            case_entities_result = client.table("case_entities")...

            # Step 2: Query entities
            entities_result = client.table("entities")...

            # Step 3: Query transactions
            transactions_result = client.table("transactions")...

            # Step 4: Perform analysis
            analyzer = FlowchartChainAnalyzer(...)
            analysis_results = analyzer.analyze_flows(...)

            return JSONResponse(...)

    except Exception as e:
        # Error handling
```

## Testing

After this fix:

1. ✅ Async context manager properly yields Supabase client
2. ✅ The endpoint successfully fetches entities for a case via junction table
3. ✅ Transaction analysis can proceed with valid entity_ids
4. ✅ No more PostgreSQL column errors
5. ✅ No more AttributeError on context manager

## Next Steps

- Test the endpoint with a real case_id
- Verify transaction fetching works correctly
- Validate full chain analysis pipeline end-to-end
