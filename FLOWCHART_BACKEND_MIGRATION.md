# Flowchart Chain Analysis - Backend Migration

## Overview

The flowchart chain analysis has been migrated from client-side (browser) to server-side (backend) processing to eliminate performance limitations and enable analysis of large transaction datasets.

## Files Created

### Backend

1. **`backend/services/flowchart_chain_analyzer.py`**

   - Core analysis engine using Polars for efficient data processing
   - Implements chain detection, hub identification, and branching analysis
   - No arbitrary transaction limits
   - Optimized algorithms for large datasets

2. **`backend/app/api/v1/endpoints/flowchart.py`**

   - REST API endpoint: `POST /api/v1/analyze/flowchart-chains`
   - Handles request validation, database queries, and response formatting
   - Proper error handling and logging

3. **`backend/app/models/requests.py`** (updated)
   - Added `FlowchartChainRequest` model for request validation

### Frontend

4. **`frontend/src/services/flowchartChainService.ts`**

   - Client service for calling backend API
   - Request/response handling with timeout management

5. **`frontend/src/types/flowchartChain.ts`**
   - TypeScript type definitions matching backend response format

### Router Updates

6. **`backend/app/api/v1/router.py`** (updated)
   - Registered flowchart endpoint in API router

## API Endpoint

### Request

```http
POST /api/v1/analyze/flowchart-chains
Content-Type: application/json

{
  "case_id": "string",
  "entity_ids": ["string"] (optional),
  "date_from": "YYYY-MM-DD" (optional),
  "date_to": "YYYY-MM-DD" (optional),
  "min_amount_threshold": 0,
  "chain_time_window_ms": 604800000,
  "include_inflow": true,
  "include_outflow": true
}
```

### Response

```json
{
  "success": true,
  "message": "Flowchart chain analysis completed successfully",
  "data": {
    "events": [...],
    "chains": [...],
    "sequential_runs": [...],
    "branch_meta": {...},
    "branch_nodes": [...],
    "hub_candidates": [...],
    "highlighted_hub_node_ids": [...],
    "metadata": {
      "total_events": 0,
      "total_chains": 0,
      "displayed_chains": 0,
      "sequential_runs": 0,
      "hub_candidates": 0,
      "chain_time_window_ms": 604800000,
      "min_amount_threshold": 0
    }
  },
  "metadata": {
    "case_id": "string",
    "entity_count": 0,
    "transaction_count": 0,
    "processing_time_ms": 0,
    "filters": {...}
  },
  "timestamp": "2024-11-04T00:00:00Z"
}
```

## Key Features

### Backend Analysis Engine

1. **No Transaction Limits**

   - Removed 50,000 transaction cap
   - Can process millions of transactions
   - Efficient memory management with Polars

2. **Optimized Algorithms**

   - Dynamic programming for chain detection
   - Efficient adjacency map building
   - Proper deduplication and ranking

3. **Comprehensive Analysis**

   - **Flow Chains**: Identifies sequences of connected transactions
   - **Hub Detection**: Finds intermediary nodes that repeatedly pass funds
   - **Branch Analysis**: Detects splitting and merging patterns
   - **Sequential Runs**: Identifies back-to-back transaction flows
   - **Cycle Detection**: Flags chains that loop back to origin

4. **Flexible Filtering**
   - Date range filtering
   - Entity filtering
   - Amount threshold
   - Direction filtering (inflow/outflow)
   - Configurable time windows

## Next Steps to Complete Integration

### 1. Update FlowchartChronologicalView Component

Replace the local `buildChronologicalArtifacts` computation with API call:

```typescript
// In FlowchartChronologicalView.tsx
import { flowchartChainService } from "@/services/flowchartChainService";

// Replace useMemo with useEffect + useState
const [artifacts, setArtifacts] = useState<ChronologicalArtifacts | null>(null);
const [loading, setLoading] = useState(true);

useEffect(() => {
  const fetchChainAnalysis = async () => {
    setLoading(true);
    try {
      const result = await flowchartChainService.analyzeFlowchartChains({
        case_id: caseId,
        entity_ids: selectedEntityFilter !== "all" ? selectedEntities : undefined,
        date_from: dateRange.from || undefined,
        date_to: dateRange.to || undefined,
        min_amount_threshold: minAmountThreshold,
        chain_time_window_ms: chainTimeWindowMs,
        include_inflow: showInflow,
        include_outflow: showOutflow,
      });

      setArtifacts({
        events: result.events.map(convertEvent),
        chains: result.chains.map(convertChain),
        // ... map other fields
      });
    } catch (error) {
      console.error("Failed to fetch chain analysis:", error);
    } finally {
      setLoading(false);
    }
  };

  fetchChainAnalysis();
}, [caseId, dateRange, minAmountThreshold, chainTimeWindowMs, ...]);
```

### 2. Update FlowchartTab Component

Pass `caseId` to FlowchartChronologicalView:

```typescript
<FlowchartChronologicalView
  caseId={caseId}
  dateRange={dateRange}
  minAmountThreshold={minAmountThreshold}
  chainTimeWindowMs={chainTimeWindowMs}
  // ... other props
/>
```

### 3. Remove Client-Side Functions

Delete from FlowchartChronologicalView.tsx:

- `buildChronologicalArtifacts`
- `deriveFlowChains`
- `deriveSequentialRuns`
- `buildEventAdjacency`
- `buildBranchMeta`
- `summarizeBranchNodes`
- `identifyHubCandidates`
- All helper functions used only for computation

### 4. Update Constants

Remove or update in FlowchartConstants.ts:

- `FLOWCHAIN_ANALYSIS_CAP` (no longer needed)

### 5. Add Loading States

Add proper loading UI for async data fetching:

```typescript
if (loading) {
  return <LoadingSpinner message="Analyzing transaction chains..." />;
}
```

### 6. Add Error Handling

```typescript
if (error) {
  return <ErrorMessage error={error} retry={fetchChainAnalysis} />;
}
```

## Benefits of Migration

### Performance

- ✅ No browser memory constraints
- ✅ Process millions of transactions
- ✅ Faster computation with Polars
- ✅ No UI freezing during analysis

### Reliability

- ✅ No arbitrary caps on transaction count
- ✅ Server-side caching potential
- ✅ Better error handling
- ✅ Proper logging for debugging

### Scalability

- ✅ Backend can be horizontally scaled
- ✅ Database optimizations possible
- ✅ Caching strategies available
- ✅ Background processing potential

### User Experience

- ✅ Faster initial load (no heavy computation)
- ✅ Progress indicators possible
- ✅ Better error messages
- ✅ Consistent results across browsers

## Testing

### Backend Testing

```bash
# Test the endpoint
curl -X POST http://localhost:8000/api/v1/analyze/flowchart-chains \
  -H "Content-Type: application/json" \
  -d '{
    "case_id": "your-case-id",
    "min_amount_threshold": 100000,
    "chain_time_window_ms": 604800000
  }'
```

### Frontend Testing

1. Import and use the service in a component
2. Verify API calls in Network tab
3. Check data transformation and rendering
4. Test error scenarios (network failure, validation errors)

## Performance Considerations

### Backend

- Polars handles large DataFrames efficiently
- Algorithms use O(n) or O(n log n) complexity where possible
- Early termination in adjacency building
- Proper indexing in database queries

### Frontend

- Minimal data transformation needed
- Pagination for large result sets (future enhancement)
- Virtual scrolling for event timeline (future enhancement)

## Future Enhancements

1. **Caching**: Cache results for identical queries
2. **Background Jobs**: For very large analyses (>1M transactions)
3. **Progressive Loading**: Stream results as they're computed
4. **Export**: Download chains as CSV/JSON
5. **Visualization**: Enhanced graph rendering for chains
6. **Alerts**: Notify when suspicious chains detected

## Migration Checklist

- [x] Create backend analyzer service
- [x] Create backend API endpoint
- [x] Create frontend service client
- [x] Create TypeScript types
- [x] Update API router
- [ ] Update FlowchartChronologicalView component
- [ ] Update FlowchartTab component
- [ ] Remove old client-side functions
- [ ] Update constants
- [ ] Add loading states
- [ ] Add error handling
- [ ] Test end-to-end
- [ ] Update documentation
- [ ] Deploy and monitor
