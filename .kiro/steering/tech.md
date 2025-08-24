# Technology Stack

## Frontend

- **Framework**: Next.js 15.4.6 with App Router
- **Runtime**: React 19.1.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS v4 with PostCSS
- **Package Manager**: pnpm (based on pnpm-lock.yaml)

## Backend

- **Language**: Python 3.11+
- **Package Management**: pyproject.toml (modern Python packaging)
- **Virtual Environment**: .venv directory present
- **Expected Libraries**:
  - pandas/polars for data processing
  - openpyxl for Excel file handling
  - PyPDF2/pdfplumber for PDF processing
  - scikit-learn for pattern analysis
  - FastAPI for API endpoints (recommended)

## Development Commands

### Frontend

```bash
cd frontend
pnpm dev          # Start development server with Turbopack
pnpm build        # Build for production
pnpm start        # Start production server
pnpm lint         # Run ESLint
```

### Backend

```bash
cd backend
python main.py    # Run the main application
```

## Key Technologies

- **Turbopack**: Enabled for faster development builds
- **App Router**: Using Next.js 13+ app directory structure
- **Modern React**: Latest React 19 with concurrent features
- **Tailwind v4**: Latest version with improved performance

## Security Considerations

- Handle sensitive financial data with encryption
- Implement secure file upload mechanisms
- Ensure audit logging for all operations
- Consider data retention and deletion policies
- Implement role-based access controls
