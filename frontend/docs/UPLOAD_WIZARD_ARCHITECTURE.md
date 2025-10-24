# Upload Wizard - Component Architecture

```
UploadStatementModalWizard
├── Modal Container (full-screen overlay)
├── Header
│   ├── Title: "Upload Bank Statement"
│   └── Close Button
├── ProgressStepper
│   ├── Step 1: File (completed/current/pending)
│   ├── Step 2: Columns (completed/current/pending)
│   ├── Step 3: Bank (completed/current/pending)
│   └── Step 4: Review (completed/current/pending)
├── Step Content (switches based on currentStep)
│   ├── Step1FileUpload (currentStep === 1)
│   │   ├── File Upload Area
│   │   │   ├── Drag & Drop Zone
│   │   │   └── File Input
│   │   └── Selected File Display
│   │       ├── File Icon (PDF/CSV/Excel)
│   │       ├── File Name
│   │       ├── File Type & Size
│   │       └── Remove Button
│   ├── Step2ColumnMapping (currentStep === 2)
│   │   ├── Column Mapping Form
│   │   │   ├── DATE selector
│   │   │   ├── DESCRIPTION selector
│   │   │   ├── Amount Format Toggle
│   │   │   │   ├── Debit/Credit Mode
│   │   │   │   │   ├── DEBIT selector
│   │   │   │   │   └── CREDIT selector
│   │   │   │   └── Single Amount Mode
│   │   │   │       ├── AMOUNT selector
│   │   │   │       └── DIRECTION selector (optional)
│   │   │   └── Preview for each mapped column
│   │   └── Preview Table
│   │       ├── Headers (from CSV/PDF)
│   │       ├── Action Column (Delete/Restore buttons)
│   │       └── Data Rows (5 rows)
│   │           └── Row highlighting (deleted rows in red)
│   ├── Step3BankSelection (currentStep === 3)
│   │   ├── Bank Search Input
│   │   ├── Bank Grid
│   │   │   └── Bank Cards (clickable, selected highlighted)
│   │   └── Extraction Preview
│   │       ├── Metrics Card
│   │       │   ├── Success Rate (green)
│   │       │   ├── Failure Rate (red)
│   │       │   ├── Total Transactions
│   │       │   └── Progress Bar
│   │       └── Sample Transactions
│   │           └── Transaction Cards (3 samples)
│   │               ├── Date & Amount
│   │               ├── Description
│   │               └── Counterparty (success/failure indicator)
│   └── Step4Review (currentStep === 4)
│       ├── File Details Card
│       │   ├── Filename
│       │   ├── Type
│       │   ├── Size
│       │   └── Edit Button → Jump to Step 1
│       ├── Column Mapping Card
│       │   ├── Mapped Columns
│       │   └── Edit Button → Jump to Step 2
│       ├── Bank Type Card
│       │   ├── Selected Bank
│       │   └── Edit Button → Jump to Step 3
│       ├── Statement Period Card (optional)
│       │   ├── Period From (date input)
│       │   └── Period To (date input)
│       └── Ready Status Message (green)
├── Upload Progress (shown when uploading)
│   ├── Progress Percentage
│   └── Progress Bar
├── Error Message (shown when error occurs)
│   ├── Error Icon
│   └── Error Text
└── Navigation Footer
    ├── Back Button (disabled on step 1)
    ├── Cancel Button (always available)
    └── Next/Upload Button
        ├── "Next" (steps 1-3)
        └── "Upload Statement" (step 4)
```

## State Flow

```
User Actions → State Updates → UI Re-render

1. File Selection
   handleFileSelect() → setFile() → Auto-validation → setCsvValidation()
   
2. Column Mapping
   handleMappingChange() → setMapping() → Preview updates
   handleRowDelete() → setDeletedRows() → Row highlight
   
3. Bank Selection
   handleBankChange() → setSelectedBank() → Preview refresh
   
4. Review & Submit
   handleSubmit() → Upload process → onUploadComplete()
```

## Data Flow

```
Step 1: File Selection
   ↓
   File → Validation Service → CSVValidationResult
   ↓
   Auto-detect columns → suggestedMapping
   
Step 2: Column Mapping
   ↓
   User mapping + deletedRows → ColumnMapping object
   
Step 3: Bank Selection
   ↓
   Bank + File + Mapping → Preview Service → ExtractionResult
   ↓
   Display metrics and samples
   
Step 4: Review
   ↓
   Collect all data → Display summary
   ↓
   Upload → File + Mapping + Bank → Backend
```

## Component Props

```typescript
// Main Wizard
interface UploadStatementModalWizardProps {
  accountId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

// Step 1
interface Step1FileUploadProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

// Step 2
interface Step2ColumnMappingProps {
  validationResult: CSVValidationResult | null;
  columnMapping: ColumnMapping | null;
  onMappingComplete: (mapping: ColumnMapping, deletedRows: number[]) => void;
  disabled?: boolean;
}

// Step 3
interface Step3BankSelectionProps {
  file: File | null;
  columnMapping: any;
  selectedBank: BankPreset;
  onBankChange: (bank: BankPreset) => void;
  disabled?: boolean;
}

// Step 4
interface Step4ReviewProps {
  file: File | null;
  columnMapping: ColumnMapping | null;
  selectedBank: BankPreset;
  statementPeriodFrom?: string;
  statementPeriodTo?: string;
  onEdit?: (step: number) => void;
}
```

## Navigation Logic

```typescript
// Can proceed to next step?
canGoNext() {
  switch (currentStep) {
    case 1: return !!file;
    case 2: return !!columnMapping;
    case 3: return !!selectedBank;
    case 4: return true;
  }
}

// Step transitions
handleNext() {
  if (currentStep < 4) setCurrentStep(currentStep + 1);
}

handleBack() {
  if (currentStep > 1) setCurrentStep(currentStep - 1);
}

handleEdit(step: number) {
  setCurrentStep(step);
}
```

## Styling Patterns

### Color Coding
- **PDF**: Red (`text-red-500`, `bg-red-50`, `border-red-200`)
- **CSV**: Green (`text-green-500`, `bg-green-50`, `border-green-200`)
- **Excel**: Blue (`text-blue-500`, `bg-blue-50`, `border-blue-200`)
- **Success**: Green indicators
- **Error**: Red indicators
- **Active Step**: Blue (`border-blue-600`, `bg-blue-50`)

### Button States
- Primary action: `bg-blue-600 hover:bg-blue-700`
- Secondary action: `border-gray-300 hover:bg-gray-50`
- Disabled: `opacity-50 cursor-not-allowed`

### Layout
- Modal: `max-w-4xl` (wider for better preview visibility)
- Cards: `border rounded-lg p-4`
- Spacing: Consistent `space-y-6` between sections
- Grid: `grid grid-cols-2 gap-4` for bank selection
