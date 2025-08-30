# Flags and Notes UI in TransactionsTable

This document describes how to use the collaborative Flags and Notes features in the `TransactionsTable` component.

## Requirements
- The `TransactionsTable` must receive a valid `caseId` prop for collaboration features to appear.
- Users must be signed in via Supabase to add/update/remove flags and to add notes.

## Flags
- A "Flag" column appears when `caseId` is provided.
- Each row shows the current flag (if any) as a colored badge.
- Use the dropdown in the Flag column to set or clear a flag for that transaction.
  - Options: `Suspicious`, `Evidence`, `Related`, `Under Review`, or `No flag`.
  - Actions are attributed to the signed-in user.

## Notes
- A "Notes" button appears in the Transaction History header when `caseId` is provided.
- Clicking "Notes" opens a side panel to view and add case notes:
  - Select a note type: `Observation`, `Action`, `Evidence`, `Interview`, or `Analysis`.
  - Enter content and click "Add Note" to save.
  - New notes appear at the top of the list.
- Adding notes requires the user to be signed in.

## Auth
- The UI uses `useAuth` from `src/contexts/AuthContext.tsx`.
- If not signed in, flag dropdowns and note composer are disabled, and actions prompt the user to sign in.

## Files
- `src/app/components/TransactionsTable.tsx`
  - Adds per-row flag dropdown and a "Notes" button.
  - Integrates with `caseTransactionsService` for flag CRUD and `useAuth` for user attribution.
- `src/app/components/NotesPanel.tsx`
  - Minimal notes panel for viewing and adding notes via `caseNotesService`.

## Services
- `src/services/database.ts`
  - `caseTransactionsService.getFlagsForTransactions(caseId, txIds)`
  - `caseTransactionsService.upsertFlag({ caseId, transactionId, flag_type, notes?, userId })`
  - `caseTransactionsService.deleteFlagByTransaction(caseId, transactionId)`
  - `caseNotesService.getNotes(caseId)`
  - `caseNotesService.addNote({ caseId, note_type, content, attachments?, userId })`

## Testing and Linting
- Type-check and lint after changes:
```bash
# from frontend/
npm run lint
# Next.js build performs type-checks
npm run build
```

## Notes
- Flags are loaded only for the currently visible page of transactions for performance.
- When no `caseId` is provided, collaboration UI is hidden to preserve backward compatibility.
