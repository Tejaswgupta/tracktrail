# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrackTrail is a financial investigation platform for law enforcement agencies (DGGI) that detects fraudulent GST activities, money laundering patterns, and suspicious transaction networks through advanced analysis algorithms.

## Architecture

### Backend (FastAPI + Python 3.11)
- **Port**: 3011 (configured in `main.py:412`)
- **Package Manager**: `uv` (fast Python package installer)
- **Database**: Supabase (PostgreSQL)
- **Key Analysis Services**:
  - `services/flowchart_chain_analyzer.py` - Transaction chain analysis with hub detection
  - `services/counterparty_trend_analyzer.py` - Counterparty behavior patterns
  - `services/mule_account_detector.py` - Pass-through account detection
  - `services/network_cycle_detector.py` - Circular trading patterns
  - `services/time_based_analytics.py` - Temporal pattern analysis
  - `services/ai_llm_analysis.py` - AI-powered document analysis

### Frontend (Next.js 16 + TypeScript)
- **Port**: 3000 (development)
- **Package Manager**: pnpm
- **UI**: Radix UI components + Tailwind CSS 4
- **Visualization**: D3.js, Recharts
- **Auth**: Supabase SSR auth

### API Structure
All endpoints under `/api/v1/` organized in `app/api/v1/endpoints/`:
- `analysis.py` - Core financial analysis endpoints (7 endpoints)
- `flowchart.py` - Flowchart chain analysis
- `pdf.py` - PDF data extraction
- `settings.py` - Workspace settings
- `health.py` - Service health monitoring

## Development Commands

### Quick Start (Docker - Recommended)
```bash
# Backend only (most common)
docker-compose up --build

# With production optimizations
docker-compose -f docker-compose.prod.yml up -d --build

# View logs
docker-compose logs -f backend
```

### Local Development

**Backend** (requires Python 3.11+):
```bash
cd backend
# Ensure dependencies are installed via uv
uv sync
# Run with uvicorn (matches Docker setup)
python -m uvicorn main:app --reload --host 0.0.0.0 --port 3011
```

**Frontend** (requires Node.js 18+):
```bash
cd frontend
pnpm install
pnpm dev        # Development server on port 3000
pnpm build      # Production build
pnpm start      # Run production build
pnpm lint       # ESLint check
```

### Environment Setup

Backend environment file: `backend/.env` (use `backend/.env.example` as template)
```bash
# Required
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key

# Optional
OPENAI_API_KEY=your_openai_key
```

Docker compose automatically loads `backend/.env` via `env_file` directive.

## Key Architectural Patterns

### Backend Layered Architecture
```
API Layer (FastAPI routers)
    ↓
Business Logic (services/*.py)
    ↓
Data Access (app/services/database_service.py)
    ↓
Database (Supabase)
```

### Data Processing Stack
- **Polars** (primary) - High-performance DataFrame operations for large datasets
- **pandas** (compatibility) - Legacy support and specific integrations
- **NetworkX** - Graph algorithms for transaction network analysis
- All services return standardized response format: `{success, data, error}`

### Service Integration Pattern
Analysis services in `backend/services/` are standalone modules that:
1. Accept Polars DataFrames as input
2. Perform specialized pattern detection
3. Return structured results with metadata
4. Can be composed for multi-pattern analysis

### API Response Format
All endpoints use consistent response structure (`app/models/responses.py`):
```python
{
    "success": bool,
    "data": dict | None,
    "error": {
        "error_code": str,
        "message": str,
        "details": dict | None
    } | None
}
```

### Frontend Data Flow
```
Next.js Server Components
    ↓
Supabase Client (server-side auth)
    ↓
API Routes (/api/v1/*)
    ↓
React Client Components (state via hooks)
```

## Important Implementation Details

### Configuration Management
- Backend uses `app/core/config.py` - NOT Pydantic Settings
- Environment variables loaded via `python-dotenv`
- Settings class validates on initialization (positive integers, log levels)
- Default values provided in `config.py` for development

### Database Operations
- Primary interface: `app/services/database_service.py`
- Use `DatabaseService.get_instance()` singleton pattern
- All queries return Polars DataFrames by default
- Connection pooling configured in `app/core/database.py`

### CORS Configuration
Development origins allowed (from `main.py:169-175`):
- `http://localhost:3000`, `http://127.0.0.1:3000`
- `http://localhost:3001`, `http://127.0.0.1:3001`
- `https://localhost:3000`, `https://127.0.0.1:3000`

Production: Set `CORS_ORIGINS` environment variable appropriately.

### Request Validation
- Pydantic models in `app/models/requests.py`
- Custom exception handlers in `app/core/exceptions.py`
- Validation errors return HTTP 422 with field-specific details
- Max request size: 10MB (configurable via `MAX_REQUEST_SIZE`)

### Performance Considerations
- **Polars operations**: Prefer lazy evaluation `.lazy()` for large datasets
- **Network analysis**: Use NetworkX DiGraph for directed transaction flows
- **Batch processing**: Limit entities per request (default: 50, max: 365 days range)
- **Docker builds**: Multi-stage builds use `uv` for 10-100x faster installs

## Common Development Tasks

### Adding New Analysis Endpoint
1. Create analysis service in `backend/services/new_analyzer.py`
2. Add request/response models in `backend/app/models/`
3. Create endpoint in `backend/app/api/v1/endpoints/analysis.py`
4. Register in `backend/app/api/v1/router.py`
5. Add frontend service client in `frontend/src/services/`
6. Create UI components in `frontend/src/components/`

### Working with Transactions
- Standard column names: `entity_id`, `counterparty_id`, `amount`, `date`, `transaction_type`
- Date filtering: Use `date >= start_date AND date <= end_date`
- Entity grouping: `.group_by("entity_id").agg(...)` (Polars syntax)
- Sorting: `.sort("amount", descending=True)` (Polars syntax)

### Database Schema Changes
1. Create migration in `backend/migrations/`
2. Update TypeScript types in `frontend/src/types/`
3. Update Pydantic models in `backend/app/models/`
4. Run migration manually or via Supabase dashboard

### Debugging API Issues
```bash
# Check backend logs
docker-compose logs -f backend

# Test endpoint directly
curl http://localhost:3011/api/v1/analyze/cash-flow \
  -H "Content-Type: application/json" \
  -d '{"entity_ids": ["ENTITY123"], "start_date": "2024-01-01"}'

# View API docs
open http://localhost:3011/docs
```

## CI/CD Pipeline

GitHub Actions workflow (`.github/workflows/ci-cd.yml`):
- Triggers on push to `main`
- SSH to production VM
- Pull latest code
- Run `docker-compose -f docker-compose.prod.yml up -d --build`
- Prune unused images

Required secrets: `HOST`, `USERNAME`, `SSH_KEY`

## File Structure Notes

### Backend
```
backend/
├── app/api/v1/endpoints/    # API endpoint modules
├── app/core/                 # Config, database, exceptions
├── app/models/               # Pydantic request/response DTOs
├── app/services/             # Database service layer
├── services/                 # Business logic analyzers (standalone)
├── utils/                    # Shared utilities
└── migrations/               # Database migrations
```

### Frontend
```
frontend/
├── src/app/                  # Next.js App Router pages
├── src/components/           # Reusable React components
├── src/services/             # API clients and data processing
├── src/types/                # TypeScript type definitions
└── database/                 # SQL schema files
```

## Critical Dependencies

**Backend** (managed via `pyproject.toml` + `uv.lock`):
- `polars==1.32.3` - Dataframe operations
- `fastapi==0.116.1` - API framework
- `uvicorn[standard]==0.35.0` - ASGI server
- `supabase==2.18.1` - Database client
- `networkx==3.5` - Graph algorithms

**Frontend** (managed via `package.json` + `pnpm-lock.yaml`):
- `next@16.1.1` - React framework
- `@supabase/supabase-js@2.90.0` - Database client
- `@supabase/ssr@0.6.1` - Server-side auth
- `d3@7.9.0` - Data visualization
- `recharts@3.6.0` - Charts
