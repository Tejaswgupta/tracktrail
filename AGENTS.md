# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Next.js 16 app (App Router) with TypeScript and Tailwind. Source lives in `frontend/src/` (e.g., `src/app/`, `src/components/`, `src/services/`). Static assets are in `frontend/public/`.
- `backend/`: FastAPI service (Python 3.11). Core code is in `backend/app/` and `backend/services/`, with utilities in `backend/utils/`. Database artifacts live in `backend/migrations/` and `backend/database.sql`.
- Root: Docker and environment configs (`docker-compose*.yml`, `.env.example`).

## Build, Test, and Development Commands
- Docker (recommended):
  - `docker-compose up --build` (dev, hot reload)
  - `docker-compose -f docker-compose.prod.yml up -d --build` (production)
- Frontend (local):
  - `cd frontend && pnpm install`
  - `pnpm dev` (runs Next.js dev server)
  - `pnpm build` / `pnpm start` (production build + serve)
  - `pnpm lint` (ESLint)
- Backend (local):
  - `cd backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000`

## Coding Style & Naming Conventions
- TypeScript: 2-space indentation, strict types, and idiomatic React hooks. Prefer descriptive component names (`PascalCase`) and hooks in `useThing` form.
- Python: 4-space indentation; follow FastAPI + Pydantic patterns already in `backend/app/` and `backend/services/`.
- Linting/formatting: ESLint is configured for the frontend (`pnpm lint`). No explicit Python formatter is configured in this repo.

## Testing Guidelines
- No dedicated test suite is currently wired up. If you add tests:
  - Frontend: colocate under `frontend/src/` or a `__tests__/` folder.
  - Backend: add a `backend/tests/` directory and run with `python -m pytest`.

## Commit & Pull Request Guidelines
- Commits generally follow Conventional Commits with optional scopes (e.g., `feat(ui): ...`, `chore(config): ...`). Keep messages short and imperative.
- PRs should include:
  - A concise description of the change and motivation.
  - Steps to verify (commands, screenshots for UI updates).
  - Linked issues/tickets when applicable.

## Configuration & Security Tips
- Copy `.env.example` to `.env` and set Supabase + API keys before running locally.
- Never commit secrets. Use `.env` locally and keep `OPENAI_API_KEY` optional.
