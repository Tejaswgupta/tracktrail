# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TrackTrail is a comprehensive financial investigation platform designed for law enforcement agencies, specifically DGGI (Directorate General of GST Intelligence). The application combines:

- **Bogus ITC Detection**: Identifies fraudulent Input Tax Credit claims in GST systems
- **Transaction Analysis**: Advanced pattern detection for money laundering and suspicious activities
- **Visual Investigation Tools**: Network graphs and interactive dashboards
- **Multi-Entity Analysis**: Support for complex financial network investigations

## Architecture

The project uses a dual-service architecture:

### Backend (FastAPI + Python 3.11)
- **Core Services**: Financial analysis algorithms, GST data processing, pattern detection
- **API Layer**: RESTful endpoints with comprehensive OpenAPI documentation
- **Database**: Supabase integration for data persistence
- **AI/ML**: OpenAI integration for document analysis and pattern recognition

### Frontend (Next.js + TypeScript)
- **UI Framework**: React 19 with Tailwind CSS and Radix UI components
- **Data Visualization**: D3.js, Recharts for network graphs and charts
- **State Management**: React hooks and Supabase client
- **Authentication**: JWT-based auth with role-based access

## Development Commands

### Docker-based Development (Recommended)

```bash
# Quick start with Docker Compose
docker-compose up --build

# Or use the management script
chmod +x docker.sh
./docker.sh build
./docker.sh run

# View logs
./docker.sh logs --follow

# Stop services
./docker.sh stop
```

### Local Development

#### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

#### Frontend
```bash
cd frontend
pnpm install
pnpm dev
```

### Testing and Building
```bash
# Frontend
cd frontend
pnpm build
pnpm lint
pnpm start

# Backend
cd backend
python -m pytest  # (if tests exist)
```

## Key Services and Components

### Core Analysis Engines

1. **Bogus ITC Detection** (`backend/app/services/bogus_itc_core.py`):
   - Processes GSTR-1, GSTR-2, GSTR-3B data
   - Reconciles invoices between supplier and recipient claims
   - Propagates suspicious ITC through transaction networks
   - Generates risk scores and origin detection

2. **Mule Account Detection** (`backend/services/mule_account_detector.py`):
   - Identifies pass-through accounts used for money laundering
   - Analyzes transaction velocity and patterns

3. **Network Cycle Detection** (`backend/services/network_cycle_detector.py`):
   - Detects circular trading patterns
   - Identifies complex multi-entity transaction cycles

### API Endpoints Structure

- `/api/v1/analyze/` - Analysis endpoints
  - `cash-flow` - Cash transaction pattern analysis
  - `counterparty-trends` - Counterparty behavior analysis
  - `mule-accounts` - Mule account detection
  - `cycles` - Circular trading detection
  - `rapid-movements` - Quick fund transfer analysis
  - `time-trends` - Temporal pattern analysis
  - `transfer-patterns` - Complex network pattern analysis

- `/api/v1/bogus-itc/` - GST-specific analysis
- `/health` - Service health monitoring
- `/docs` - Interactive API documentation

### Frontend Architecture

- **Pages**: Main application views (`src/app/`)
- **Components**: Reusable UI components (`src/components/`)
- **Services**: API clients and data processing (`src/services/`)
- **Hooks**: Custom React hooks for state management (`src/hooks/`)
- **Types**: TypeScript type definitions (`src/types/`)

## Configuration

### Environment Variables

Key environment variables (create `.env` file):

```bash
# Database
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key

# API Configuration
DEBUG=false
LOG_LEVEL=INFO
CORS_ORIGINS=*

# AI/ML Services (optional)
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://model.thevotum.com/v1
```

### Docker Configuration

The application uses a multi-stage Docker build:
- **Frontend Builder**: Node.js 18 with pnpm
- **Backend Base**: Python 3.11 with system dependencies
- **Production**: Combines both services using Supervisor

## Important Patterns

### Data Processing
- GST data uses standardized column mapping (`_normalise_columns` function)
- Network analysis relies on NetworkX for graph operations
- Large datasets use Polars for performance, pandas for compatibility

### API Design
- Standardized response format with `success`, `data`, `error` fields
- Comprehensive error handling with proper HTTP status codes
- Request validation using Pydantic models
- Rate limiting and request size controls

### Frontend Patterns
- Server-side rendering with Next.js App Router
- Component composition with Radix UI primitives
- Data fetching with Supabase client and custom hooks
- Responsive design with Tailwind CSS

## Special Considerations

### Security
- Handles sensitive financial data
- Input validation and sanitization
- CORS configuration for production
- Request size limits to prevent DoS attacks

### Performance
- Docker multi-stage builds for optimized images
- Polars for large dataset processing
- NetworkX algorithms optimized for financial graphs
- Frontend code splitting and lazy loading

### Data Privacy
- All financial data processing is server-side
- Sensitive information sanitized in logs
- GDPR-compliant data handling practices

## Development Workflow

1. **Start with Docker**: Use `docker-compose up --build` for full development environment
2. **Local Development**: Use individual service commands for targeted development
3. **Testing**: Verify API endpoints at `http://localhost:8000/docs`
4. **Frontend Development**: Access UI at `http://localhost:3000`
5. **Database**: Use Supabase dashboard for data inspection

## Common Tasks

### Adding New Analysis Types
1. Create service in `backend/services/`
2. Add API endpoint in `backend/app/api/v1/endpoints/`
3. Create frontend service client
4. Add UI components and hooks

### Database Schema Changes
1. Update Supabase migrations
2. Update TypeScript types in `frontend/src/types/`
3. Update Pydantic models in `backend/app/models/`

### Adding New Visualizations
1. Create D3.js or Recharts components
2. Add data processing hooks
3. Integrate with analysis services

This codebase is designed for financial investigation professionals and handles sensitive data with appropriate security measures.