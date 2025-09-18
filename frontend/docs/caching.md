# Caching Implementation Documentation

This document describes the caching system implemented in the database service to improve performance for transaction-heavy operations.

## Overview

With 200k+ transactions that don't change frequently, we've implemented a caching layer to reduce database queries and improve application performance. The caching system includes:

1. In-memory caching with expiration times
2. Automatic cache invalidation
3. Cache warming strategies
4. Monitoring and statistics

## Cache Implementation Details

### SimpleCache Class

A lightweight in-memory cache implementation is used throughout the service:

```typescript
class SimpleCache<T> {
  private cache = new Map<string, { value: T; expiry: number }>();
  private defaultTtl: number;

  constructor(defaultTtlMs: number = 5 * 60 * 1000) // 5 minutes default
}
```

Features:
- Time-to-live (TTL) based expiration
- Automatic cleanup of expired entries
- Periodic cleanup (every 10 minutes)

### Cached Services

The following transaction-related methods are cached:

1. `transactionsService.getByAccountId()` - 5 minute TTL
2. `transactionsService.getByEntityId()` - 5 minute TTL
3. `transactionsService.getByCaseId()` - 5 minute TTL
4. `transactionsService.getCaseAMLMetadata()` - 10 minute TTL
5. `transactionsService.getCaseTransactionsForAnalysis()` - 10 minute TTL

The first three methods cache the full transaction data, while the last two cache subsets of data for specific use cases.

## Cache Invalidation

Cache invalidation occurs automatically when data is modified:

- All transaction caches are cleared when:
  - New transactions are added (create, createBatch)
  - A statement is deleted
  - An account is deleted
  - An entity is deleted

## Cache Warming

To improve initial load times, cache warming strategies are available and automatically used in key parts of the application:

1. `cacheManagement.warmCaseCache(caseId)` - Called when accessing a specific case, preloads:
   - AML metadata
   - Full transaction data for the case
   - Transaction data for analysis
   - Counterparty statistics
2. `cacheManagement.warmAccountCache(accountId)` - Called when viewing accounts for an entity, preloads full transaction data
3. `cacheManagement.warmAllCasesCache()` - Called when visiting the dashboard, preloads data for all cases

Strategic cache warming is implemented in:
- `/src/app/cases/[id]/page.tsx` - Warms cache for the specific case being viewed
- `/src/app/components/CaseList.tsx` - Warms caches for all cases when visiting the dashboard
- `/src/app/components/AccountList.tsx` - Warms caches for accounts when viewing an entity's accounts

## Monitoring and Statistics

Cache performance can be monitored through:

1. `cacheManagement.getCacheStats()` - Returns detailed cache statistics
2. `cacheManagement.logCacheStats()` - Logs cache statistics to console
3. `cacheManagement.enableMonitoring(true)` - Enables cache monitoring

## Usage Examples

### Basic Cache Usage

The caching is transparent to the application - simply call the service methods as before:

```typescript
const transactions = await transactionsService.getByAccountId(accountId);
```

### Manual Cache Warming

Warm the cache for a specific case when it's first accessed:

```typescript
await cacheManagement.warmCaseCache(caseId);
```

### Monitoring

Enable monitoring and log statistics:

```typescript
cacheManagement.enableMonitoring(true);
cacheManagement.logCacheStats();
```

## Configuration

Cache TTL values can be adjusted in the service implementation:

- Transaction data: 5 minutes
- AML metadata: 10 minutes
- Analysis data: 10 minutes

## Maintenance

Periodic cleanup happens automatically every 10 minutes. For manual cleanup:

```typescript
cacheManagement.cleanupAllCaches();
```

To clear all caches (e.g., after bulk data updates):

```typescript
cacheManagement.clearAllCaches();
```