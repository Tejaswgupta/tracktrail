# Bank Statement Analyzer - DGGI

A comprehensive financial investigation tool for law enforcement agencies to analyze bank statements, track entities, and manage investigation cases.

## Features

- **Case Management**: Create and manage investigation cases with hierarchical organization
- **Entity Tracking**: Track individuals, companies, and other entities with unique identifiers (PAN, GSTIN, etc.)
- **Account Management**: Manage bank accounts linked to entities
- **Statement Processing**: Upload and process bank statements (PDF, CSV, Excel)
- **AML Analytics**: Anti-Money Laundering analysis and risk scoring
- **Audit Trail**: Complete audit logging for court admissibility

## Tech Stack

- **Frontend**: Next.js 15.4.6 with App Router, React 19, TypeScript, Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL with Row Level Security)
- **Package Manager**: pnpm

## Setup Instructions

### 1. Prerequisites

- Node.js 18+
- pnpm
- Supabase account

### 2. Supabase Setup

1. Go to [database.new](https://database.new/) and create a new Supabase project
2. In your Supabase dashboard, go to SQL Editor
3. Run the migration script from `database/migration.sql`
4. Note your project URL and anon key from Settings > API

### 3. Environment Configuration

1. Copy the environment template:

   ```bash
   cp .env.local.example .env.local
   ```

2. Update `.env.local` with your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

### 4. Install Dependencies

```bash
pnpm install
```

### 5. Run Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the application.

## Database Schema

The application uses a comprehensive schema designed for financial investigations:

### Core Tables

- **cases**: Investigation containers with metadata
- **entities**: Individuals/companies with unique identifiers (PAN, GSTIN)
- **accounts**: Bank accounts linked to entities
- **transactions**: Individual transaction records
- **bank_statements**: Uploaded statement files with processing status

### Junction Tables

- **case_entities**: Links entities to cases with roles
- **case_transactions**: Flags specific transactions for cases
- **case_notes**: Investigation timeline and notes

### Key Features

- **Entity Deduplication**: Automatic matching based on PAN/GSTIN
- **Row Level Security**: Multi-agency data isolation
- **Audit Logging**: Complete change tracking
- **Flexible Metadata**: JSONB fields for extensibility

## API Services

The application uses direct Supabase client calls for optimal performance:

- `casesService`: Case CRUD operations
- `entitiesService`: Entity management and case linking
- `accountsService`: Account management
- `statementsService`: Statement upload and processing
- `transactionsService`: Transaction retrieval with caching for performance
- `searchService`: Entity search and analytics

See [caching documentation](docs/caching.md) for details on the caching implementation.

## Development Guidelines

### Code Quality

- TypeScript strict mode enabled
- ESLint and Prettier configured
- Component-based architecture with reusable patterns

### Database Best Practices

- Use prepared statements and parameterized queries
- Leverage RLS policies for security
- Optimize with appropriate indexes
- Use views for complex queries

### Performance

- Server components where possible
- Direct database access via Supabase SDK
- Optimized queries with proper joins
- Lazy loading for large datasets
- In-memory caching for transaction-heavy operations (see [caching documentation](docs/caching.md))

## Security Considerations

- **Data Encryption**: Sensitive data like Aadhaar stored as hashes
- **Row Level Security**: Agency-based data isolation
- **Audit Logging**: Complete change tracking for legal compliance
- **Input Validation**: Server-side validation with CHECK constraints
- **Access Control**: Role-based permissions

## Deployment

### Production Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your-production-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-production-anon-key
```

### Build Commands

```bash
pnpm build
pnpm start
```

## Contributing

1. Follow the established TypeScript patterns
2. Use the database service layer for all data operations
3. Implement proper error handling
4. Add appropriate indexes for new queries
5. Update migration scripts for schema changes

## License

This project is designed for law enforcement use and contains sensitive financial investigation tools. Unauthorized use is prohibited.
