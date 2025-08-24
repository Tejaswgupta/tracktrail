# Project Structure

## Root Level

```
├── frontend/          # Next.js React application
├── backend/           # Python API service
└── proposed_db.md     # Database design document (empty)
```

## Frontend Structure

```
frontend/
├── src/
│   └── app/           # Next.js App Router directory
│       ├── layout.tsx # Root layout component
│       ├── page.tsx   # Home page component
│       └── globals.css # Global styles
├── public/            # Static assets (SVG icons)
├── package.json       # Dependencies and scripts
└── next.config.ts     # Next.js configuration
```

## Backend Structure

```
backend/
├── main.py           # Application entry point
├── pyproject.toml    # Python project configuration
├── .python-version   # Python version specification
└── .venv/           # Virtual environment
```

## Conventions

### Frontend

- Use App Router structure (`src/app/`)
- Components should be TypeScript (.tsx)
- Global styles in `globals.css`
- Static assets in `public/`
- Tailwind classes for styling

### Backend

- Entry point is `main.py`
- Use virtual environment for dependencies
- Follow modern Python packaging with pyproject.toml

### General

- Each service has its own git repository
- Separate package management per service
- Clear separation between client and server code
