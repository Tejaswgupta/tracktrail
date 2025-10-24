# Upload Statement Wizard

A step-by-step wizard interface for uploading bank statements with improved UX and data validation.

## Overview

The Upload Statement Wizard replaces the old single-form modal with a guided 4-step process that helps users:
1. Select and validate their statement file
2. Map columns and clean data  
3. Choose the appropriate bank preset
4. Review and submit

## Components

### Main Wizard Component
- **`UploadStatementModalWizard.tsx`** - Main controller component that orchestrates the wizard flow

### Step Components
- **`Step1FileUpload.tsx`** - File selection with visual file type indicators
- **`Step2ColumnMapping.tsx`** - Column mapping interface with row deletion functionality
- **`Step3BankSelection.tsx`** - Bank preset selection with live extraction preview
- **`Step4Review.tsx`** - Final review screen with edit capabilities

### Supporting Components
- **`ProgressStepper.tsx`** - Visual progress indicator showing current step

## Features

### Step 1: File Selection & Upload
- Clean file type selector with visual indicators (PDF/CSV/Excel)
- Drag & drop support with file type validation
- File size and type information display
- Automatic file validation on selection

### Step 2: Column Mapping
- Unified column mapping interface for all file types (CSV, PDF, Excel)
- Preview data with headers (first 5 rows)
- Auto-detection of column mappings
- Support for both:
  - Separate Debit/Credit columns
  - Single Amount column with optional Direction
- **Row deletion functionality** - Remove unwanted header or footer rows from preview
- Visual feedback for deleted rows with restore capability

### Step 3: Bank Selection & Preview
- Searchable bank preset selector
- Live extraction preview showing:
  - Success/failure rates for counterparty extraction
  - Sample extracted transactions
  - Visual metrics and progress bars
- Ability to test different bank presets and compare results

### Step 4: Review & Submit
- Summary of all selections:
  - File details (name, type, size)
  - Column mapping configuration
  - Bank type selection
  - Statement period (optional)
- Edit buttons to jump back to any step
- Optional statement period date inputs
- Upload progress indicator

## Key Improvements

1. **Step-by-step navigation** - Clear progress with visual stepper
2. **Row management** - Delete unwanted rows from preview before upload
3. **Better visual feedback** - Color-coded file types, extraction metrics
4. **Responsive design** - Works well on different screen sizes
5. **Error handling** - Errors shown at each step with clear messaging
6. **Live preview** - See extraction results before uploading
7. **Edit capability** - Jump back to any step from review screen

## Usage

```tsx
import UploadStatementModalWizard from "./UploadStatementModalWizard";

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Upload Statement
      </button>

      {isOpen && (
        <UploadStatementModalWizard
          accountId="account-id"
          onClose={() => setIsOpen(false)}
          onUploadComplete={() => {
            // Handle successful upload
            setIsOpen(false);
          }}
        />
      )}
    </>
  );
}
```

## Migration from Old Modal

The new wizard has been integrated into:
- `StatementList.tsx` - Replaced `UploadStatementModal` with `UploadStatementModalWizard`

Legacy `UploadStatementModal.tsx` is kept for reference but should not be used for new implementations.

## Technical Details

### State Management
The wizard maintains state across all steps including:
- File selection and validation results
- Column mapping configuration
- Deleted row indices
- Bank preset selection
- Statement period dates
- Upload progress

### Validation
- **Step 1**: File type and size validation
- **Step 2**: Required column mapping validation
- **Step 3**: Bank preset selection required
- **Step 4**: Final validation before upload

### Navigation
- Back button: Navigate to previous step
- Next button: Advance to next step (disabled if current step incomplete)
- Cancel button: Close wizard (available at any step)
- Upload button: Only on final step

### Auto-Detection
The wizard automatically:
- Validates CSV/PDF files on selection
- Detects and suggests column mappings
- Infers bank type from account information
- Generates preview data for validation

## Future Enhancements

Potential improvements for future iterations:
- [ ] Save draft functionality to resume later
- [ ] Batch file upload support
- [ ] Advanced row filtering (regex-based)
- [ ] Custom bank preset creation from UI
- [ ] Statement duplicate detection
- [ ] Template saving for recurring uploads
