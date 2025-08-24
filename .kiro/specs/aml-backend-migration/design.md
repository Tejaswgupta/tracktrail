# Design Document

## Overview

This design document outlines the migration of AML (Anti-Money Laundering) detection and analysis processing from the frontend to the backend. The migration will leverage existing backend analysis endpoints while updating frontend components to consume these APIs instead of performing local processing.

The backend already provides comprehensive analysis endpoints at `/api/v1/analyze/*` that cover all required AML detection capabilities. The frontend currently has a complex `amlDetection.ts` service with over 1,200 lines of analysis logic that duplicates backend functionality.

## Architecture

### Current State

- **Frontend**: Complex AML detection service (`amlDetection.ts`) with local processing
- **Backend**: Comprehensive analysis endpoints already implemented and tested
- **Components**: AML tabs that use frontend service for analysis

### Target State

- **Frontend**: Lightweight API client services that call backend endpoints
- **Backend**: Existing analysis endpoints (no changes required)
- **Components**: Updated to use new API client services with same interface

### Migration Strategy

The migration follows a **replace-and-maintain** approach:

1. Replace frontend AML processing logic with API calls to existing backend endpoints
2. Maintain existing component interfaces and user experience
3. Preserve all current AML detection capabilities
4. Ensure type safety with proper TypeScript interfaces

## Components and Interfaces

### Backend API Endpoints (Existing)

The backend provides the following analysis endpoints that map to frontend AML detection needs:

| Frontend Detection     | Backend Endpoint                         | Purpose                             |
| ---------------------- | ---------------------------------------- | ----------------------------------- |
| Rapid Movement         | `/api/v1/analyze/rapid-movements`        | High velocity transaction detection |
| Round Tripping         | `/api/v1/analyze/cycles` (single entity) | Bilateral round trip patterns       |
| Cash Flow Analysis     | `/api/v1/analyze/cash-flow`              | Cash transaction pattern analysis   |
| Counterparty Analysis  | `/api/v1/analyze/counterparty-trends`    | Counterparty behavior analysis      |
| Mule Account Detection | `/api/v1/analyze/mule-accounts`          | Pass-through account detection      |
| Time Trends            | `/api/v1/analyze/time-trends`            | Temporal pattern analysis           |
| Transfer Patterns      | `/api/v1/analyze/transfer-patterns`      | Complex transfer pattern detection  |

### Frontend Service Architecture

#### New API Client Service

```typescript
// services/amlBackendClient.ts
class AMLBackendClient {
  async analyzeRapidMovements(
    params: RapidMovementParams
  ): Promise<RapidMovementResult>;
  async analyzeRoundTripping(
    params: RoundTrippingParams
  ): Promise<RoundTrippingResult>;
  async analyzeCashFlow(params: CashFlowParams): Promise<CashFlowResult>;
  async analyzeCounterpartyTrends(
    params: CounterpartyParams
  ): Promise<CounterpartyResult>;
  async analyzeMuleAccounts(
    params: MuleAccountParams
  ): Promise<MuleAccountResult>;
  async analyzeTimeTrends(params: TimeTrendsParams): Promise<TimeTrendsResult>;
  async analyzeTransferPatterns(
    params: TransferPatternParams
  ): Promise<TransferPatternResult>;
}
```

#### Updated AML Detection Service

```typescript
// services/amlDetection.ts (simplified)
class AMLDetectionService {
  constructor(private backendClient: AMLBackendClient) {}

  // Maintain existing interface but delegate to backend
  async detectRoundTripping(
    transactions: Transaction[],
    config: RoundTrippingConfig
  ): Promise<RoundTrippingResult>;
  async detectRapidMovement(
    transactions: Transaction[],
    config: RapidMovementConfig
  ): Promise<RapidMovementResult>;
  // ... other methods
}
```

### Component Updates

#### AML Tab Components

- **RapidMovementDetectionTab**: Update to use backend API for analysis
- **RoundTrippingDetectionTab**: Update to use backend API for cycle detection
- **SmurfingDetectionTab**: Update to use appropriate backend analysis endpoints

**Design Decision**: Maintain existing component props and interfaces to minimize breaking changes. Components will continue to accept `transactions` and configuration objects but will transform these into backend API requests.

## Data Models

### Request/Response Type Mapping

#### Frontend to Backend Parameter Mapping

```typescript
// Frontend RoundTrippingConfig -> Backend CycleDetectionRequest
interface RoundTrippingConfig {
  maxTimeSpanHours: number; // -> time_window_hours
  minReturnRatio: number; // -> (derived from analysis logic)
  minAmount: number; // -> min_amount_threshold
  allowPartialReturns: boolean; // -> (analysis parameter)
  maxIntermediaries: number; // -> max_cycle_length
}

// Frontend RapidMovementConfig -> Backend RapidMovementRequest
interface RapidMovementConfig {
  maxTimeSpanHours: number; // -> time_window_hours
  minVelocity: number; // -> velocity_threshold
  minTransactionCount: number; // -> (filter parameter)
  percentageThreshold: number; // -> (analysis parameter)
  timeWindowHours: number; // -> time_window_hours
  amountMatchTolerance: number; // -> (analysis parameter)
  minAmount?: number; // -> min_amount_threshold
}
```

#### Backend Response Type Definitions

```typescript
// New types for backend API responses
interface BackendAnalysisResponse<T> {
  success: boolean;
  message: string;
  data: T;
  metadata: {
    analysis_type: string;
    entity_count: number;
    transaction_count: number;
    processing_time_ms: number;
    parameters: Record<string, any>;
    date_range?: {
      from: string;
      to: string;
    };
  };
  timestamp: string;
}

interface BackendRapidMovementResult {
  results: {
    alerts_count: number;
    patterns: Array<{
      entity_id: string;
      velocity: number;
      total_amount: number;
      time_span_hours: number;
      transaction_count: number;
      confidence_score: number;
      transactions: BackendTransaction[];
    }>;
    summary: {
      total_patterns: number;
      high_confidence_patterns: number;
      max_velocity: number;
      total_amount: number;
    };
  };
  transaction_count: number;
  date_range: {
    from: string;
    to: string;
  };
}
```

### Data Transformation Layer

A transformation layer will convert between frontend and backend data formats:

```typescript
// utils/amlDataTransformer.ts
class AMLDataTransformer {
  // Convert frontend transactions to backend format
  transformTransactionsForBackend(
    transactions: Transaction[]
  ): BackendTransactionRequest;

  // Convert backend results to frontend format
  transformRapidMovementResult(
    backendResult: BackendRapidMovementResult
  ): RapidMovementResult;
  transformRoundTrippingResult(
    backendResult: BackendCycleResult
  ): RoundTrippingResult;

  // Convert frontend config to backend parameters
  transformRapidMovementConfig(
    config: RapidMovementConfig
  ): RapidMovementParams;
  transformRoundTrippingConfig(
    config: RoundTrippingConfig
  ): CycleDetectionParams;
}
```

## Error Handling

### Backend Error Response Format

```typescript
interface BackendErrorResponse {
  error_code: string;
  message: string;
  details: Record<string, any>;
}
```

### Frontend Error Handling Strategy

1. **Network Errors**: Implement retry logic with exponential backoff
2. **Validation Errors**: Display user-friendly messages and highlight invalid inputs
3. **Server Errors**: Show generic error message with option to retry
4. **Timeout Errors**: Provide clear feedback about long-running analysis

### Error Mapping

```typescript
const ERROR_MESSAGES = {
  VALIDATION_ERROR: "Please check your input parameters and try again.",
  ENTITY_NOT_FOUND: "The selected entity could not be found.",
  DATABASE_ERROR: "Database temporarily unavailable. Please try again later.",
  ANALYSIS_ERROR: "Analysis failed. Please check your data and try again.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
};
```

## Migration Plan

### Phase 1: Backend API Client

1. Create new `amlBackendClient.ts` service
2. Implement data transformation utilities
3. Add comprehensive error handling
4. Create TypeScript types for backend responses

### Phase 2: Service Layer Update

1. Update `amlDetection.ts` to use backend client
2. Maintain existing method signatures for compatibility
3. Implement result transformation from backend to frontend format
4. Add proper loading states and error handling

### Phase 3: Component Updates

1. Update `RapidMovementDetectionTab` to use new service
2. Update `RoundTrippingDetectionTab` to use new service
3. Update `SmurfingDetectionTab` to use appropriate backend endpoints
4. Ensure all components handle loading and error states properly

### Phase 4: Testing and Validation

1. Comprehensive testing of all updated components
2. Performance testing and optimization
3. User acceptance testing to ensure feature parity
4. Documentation updates

## Rollback Strategy

### Compatibility Maintenance

- Keep original `amlDetection.ts` logic as fallback
- Implement feature flag to switch between frontend/backend processing
- Ensure components can work with both old and new service implementations

### Gradual Migration

- Migrate one AML detection type at a time
- Allow mixed mode where some detections use backend, others use frontend
- Monitor performance and accuracy during migration

This design ensures a smooth migration from frontend to backend AML processing while maintaining all existing functionality and user experience.
