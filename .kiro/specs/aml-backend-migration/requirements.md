# Requirements Document

## Introduction

This feature involves migrating all AML (Anti-Money Laundering) detection and analysis processing from the frontend to the backend. Currently, AML detection logic exists in frontend services and components, but the backend already has comprehensive analysis endpoints available. This migration will improve performance, security, and maintainability by centralizing AML processing on the server side while updating the frontend to consume these backend APIs.

## Requirements

### Requirement 1

**User Story:** As a law enforcement investigator, I want AML analysis to be processed on the backend server, so that I get faster, more secure, and more reliable analysis results.

#### Acceptance Criteria

1. WHEN I trigger any AML analysis from the frontend THEN the system SHALL send requests to the backend analysis endpoints
2. WHEN the backend processes AML analysis THEN the system SHALL return structured results that match the current frontend expectations
3. WHEN AML processing occurs THEN the system SHALL maintain the same user interface and experience as the current implementation
4. WHEN analysis is complete THEN the system SHALL display results with the same level of detail and formatting as before

### Requirement 2

**User Story:** As a developer, I want to remove AML processing logic from the frontend services, so that the codebase is cleaner and follows proper separation of concerns.

#### Acceptance Criteria

1. WHEN migrating AML logic THEN the system SHALL remove all AML detection algorithms from frontend services
2. WHEN updating frontend services THEN the system SHALL replace local processing with API calls to backend endpoints
3. WHEN refactoring is complete THEN the system SHALL have no duplicate AML logic between frontend and backend
4. WHEN code is cleaned up THEN the system SHALL maintain all existing AML detection capabilities

### Requirement 3

**User Story:** As a system administrator, I want AML analysis to use the existing backend endpoints, so that I can leverage the already implemented and tested analysis infrastructure.

#### Acceptance Criteria

1. WHEN performing rapid movement detection THEN the system SHALL use the `/analyze/rapid-movements` endpoint
2. WHEN performing round trip detection THEN the system SHALL use the `/analyze/cycles` endpoint for single entity analysis
3. WHEN performing cash flow analysis THEN the system SHALL use the `/analyze/cash-flow` endpoint
4. WHEN performing counterparty analysis THEN the system SHALL use the `/analyze/counterparty-trends` endpoint
5. WHEN performing mule account detection THEN the system SHALL use the `/analyze/mule-accounts` endpoint
6. WHEN performing time trends analysis THEN the system SHALL use the `/analyze/time-trends` endpoint
7. WHEN performing transfer pattern analysis THEN the system SHALL use the `/analyze/transfer-patterns` endpoint

### Requirement 4

**User Story:** As a law enforcement investigator, I want error handling and loading states to work seamlessly during AML analysis, so that I have clear feedback about the analysis progress and any issues.

#### Acceptance Criteria

1. WHEN AML analysis is initiated THEN the system SHALL show appropriate loading indicators
2. WHEN backend analysis fails THEN the system SHALL display user-friendly error messages
3. WHEN network issues occur THEN the system SHALL provide retry mechanisms where appropriate
4. WHEN analysis completes successfully THEN the system SHALL update the UI with results immediately

### Requirement 5

**User Story:** As a developer, I want the frontend AML components to be updated to work with backend APIs, so that the user interface remains functional while using server-side processing.

#### Acceptance Criteria

1. WHEN updating RapidMovementDetectionTab THEN the system SHALL call backend rapid movement endpoint
2. WHEN updating RoundTrippingDetectionTab THEN the system SHALL call backend cycle detection endpoint
3. WHEN updating SmurfingDetectionTab THEN the system SHALL call appropriate backend analysis endpoints
4. WHEN updating any AML tab THEN the system SHALL maintain the same props interface and component behavior
5. WHEN components are updated THEN the system SHALL handle backend response formats correctly

### Requirement 6

**User Story:** As a developer, I want proper TypeScript types for backend API responses, so that the frontend can safely consume and display analysis results.

#### Acceptance Criteria

1. WHEN defining API response types THEN the system SHALL create TypeScript interfaces matching backend response schemas
2. WHEN handling API responses THEN the system SHALL use proper type checking and validation
3. WHEN displaying results THEN the system SHALL ensure type safety throughout the data flow
4. WHEN errors occur THEN the system SHALL have properly typed error handling
