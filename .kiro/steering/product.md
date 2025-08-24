# Product Overview

Bank Statement Analyzer for Law Enforcement Agencies (DGGI and similar organizations).

## Purpose

A specialized financial investigation tool designed to help law enforcement agencies analyze bank statements for:

- Transaction pattern analysis
- Suspicious activity detection
- Financial flow mapping
- Evidence gathering for investigations
- Compliance and audit support

## Target Users

- DGGI (Directorate General of GST Intelligence) officers
- Financial investigation teams
- Compliance auditors
- Law enforcement analysts

## Architecture

- **Frontend**: Secure web interface for investigators to upload and analyze statements
- **Backend**: Python-based processing engine with financial analysis capabilities
- **Structure**: Monorepo with clear separation between client interface and analysis engine

## Current State

- Early development phase with basic scaffolding in place
- Frontend uses Next.js 15 with React 19 and Tailwind CSS v4
- Backend is minimal Python setup ready for financial processing logic
- No database implementation yet (proposed_db.md exists but is empty)

## Development Focus

- Security and data privacy (handling sensitive financial data)
- Robust file processing (PDF, CSV, Excel bank statements)
- Advanced analytics and pattern recognition
- Audit trails and evidence preservation
- User access controls and authentication
