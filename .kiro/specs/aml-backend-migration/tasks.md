# Implementation Plan

## Overview

This implementation plan migrates AML (Anti-Money Laundering) detection and analysis processing from the frontend to the backend. The backend already has comprehensive analysis endpoints available at `/api/v1/analyze/*`. The frontend currently has a complex `amlDetection.ts` service with over 1,200 lines of analysis logic that duplicates backend functionality.

## Tasks

- [x] 1. Create backend API client service

  - Create `frontend/src/services/amlBackendClient.ts` with methods for all backend analysis endpoints
  - Implement proper error handling with retry logic and user-friendly error messages
  - Add TypeScript interfaces for all backend request and response types
  - Include proper authentication headers and request configuration
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3, 6.1, 6.2_

- [x] 2. Create data transformation utilities

  - Create `frontend/src/utils/amlDataTransformer.ts` to convert between frontend and backend data formats
  - Implement transformation functions for frontend config objects to backend request parameters
  - Add transformation functions for backend response data to frontend result formats
  - Ensure type safety throughout all transformations
  - _Requirements: 1.2, 6.1, 6.2, 6.3_

- [x] 3. Update AML detection service to use backend APIs

  - Modify `frontend/src/services/amlDetection.ts` to use the new backend client instead of local processing
  - Maintain existing method signatures for backward compatibility
  - Replace local analysis algorithms with API calls to appropriate backend endpoints
  - Implement proper loading states and error handling for all detection methods
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 4.1, 4.2_

- [x] 4. Update RapidMovementDetectionTab component

  - Modify `frontend/src/app/components/aml/RapidMovementDetectionTab.tsx` to use backend `/analyze/rapid-movements` endpoint
  - Update configuration mapping to match backend request parameters
  - Ensure proper handling of backend response format and error states
  - Maintain existing component interface and user experience
  - _Requirements: 3.1, 5.1, 5.4, 4.1, 4.4_

- [x] 5. Update RoundTrippingDetectionTab component

  - Modify `frontend/src/app/components/aml/RoundTrippingDetectionTab.tsx` to use backend `/analyze/cycles` endpoint for single entity analysis
  - Map frontend round tripping configuration to backend cycle detection parameters
  - Handle both simple bilateral and complex multi-entity patterns from backend response
  - Preserve existing UI behavior and pattern display functionality
  - _Requirements: 3.2, 5.2, 5.4, 4.1, 4.4_

- [x] 6. Update SmurfingDetectionTab component

  - Modify `frontend/src/app/components/aml/SmurfingDetectionTab.tsx` to use appropriate backend analysis endpoints
  - Implement smurfing detection using combination of cash flow analysis and transfer pattern endpoints
  - Map smurfing configuration parameters to backend analysis requests
  - Update component to handle backend response formats and display results appropriately
  - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7, 5.3, 5.4, 4.1, 4.4_

- [ ] 7. Add comprehensive error handling and loading states

  - Implement consistent error handling across all updated components
  - Add proper loading indicators during backend API calls
  - Create user-friendly error messages for different failure scenarios
  - Add retry mechanisms for network failures where appropriate
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 6.4_

- [ ] 8. Create TypeScript types for backend API integration

  - Define TypeScript interfaces in `frontend/src/types/amlBackend.ts` for all backend request/response schemas
  - Ensure type safety for API client methods and data transformations
  - Add proper error type definitions for backend error responses
  - Create union types for different analysis result formats
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 9. Remove duplicate AML logic from frontend

  - Remove local AML detection algorithms from `amlDetection.ts` service
  - Clean up unused helper methods and configuration that are now handled by backend
  - Ensure no duplicate processing logic remains between frontend and backend
  - Maintain only the API client interface and result formatting logic
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 10. Add integration tests for backend API client

  - Create test files for the new backend API client service
  - Test error handling scenarios and retry logic
  - Verify data transformation functions work correctly
  - Test component integration with backend APIs
  - _Requirements: 1.1, 1.2, 4.1, 4.2, 6.1, 6.2_

- [ ] 11. Update AML tab integration and ensure feature parity
  - Verify all AML detection capabilities are preserved after migration
  - Test that user interface and experience remain unchanged
  - Ensure all configuration options work with backend parameters
  - Validate that analysis results display with same level of detail as before
  - _Requirements: 1.3, 1.4, 5.4, 5.5_
