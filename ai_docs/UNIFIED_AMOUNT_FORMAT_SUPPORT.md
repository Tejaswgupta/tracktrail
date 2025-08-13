# Unified Amount Format Support

## Overview

The system now supports two common bank statement formats:

1. **Separate Debit/Credit Columns** (existing format)
2. **Unified Amount with DR/CR Indicator** (new format)

## Supported Formats

### Format 1: Separate Debit/Credit Columns

This is the original format where debits and credits are in separate columns.

**Required Columns:**
- `DATE` - Transaction date
- `DESCRIPTION` - Transaction description/particulars
- `DEBIT` - Debit amount (money going out)
- `CREDIT` - Credit amount (money coming in)

**Example:**
```csv
DATE,DESCRIPTION,DEBIT,CREDIT
15/01/23,NEFT ABCD1234 JOHN DOE,5000,
16/01/23,SALARY CREDIT,,25000
17/01/23,ATM WITHDRAWAL,2000,
```

### Format 2: Unified Amount with DR/CR Indicator

This format uses a single amount column with a separate indicator for debit/credit.

**Required Columns:**
- `DATE` - Transaction date
- `DESCRIPTION` - Transaction description/particulars
- `AMOUNT` - Transaction amount (unified column)
- `DR_CR` - Debit/Credit indicator

**Supported DR/CR Values:**
- `DR`, `DEBIT`, `D` - for debit transactions
- `CR`, `CREDIT`, `C` - for credit transactions

**Example:**
```csv
DATE,DESCRIPTION,AMOUNT,DR_CR
15/01/23,NEFT ABCD1234 JOHN DOE,5000,DR
16/01/23,SALARY CREDIT,25000,CR
17/01/23,ATM WITHDRAWAL,2000,DR
```

## How It Works

### Automatic Format Detection

The system automatically detects which format your CSV uses:

1. **Separate Columns Detection**: Looks for `DEBIT` and `CREDIT` columns
2. **Unified Amount Detection**: Looks for `AMOUNT` and `DR_CR` indicator columns
3. **Manual Selection**: If auto-detection fails, users can manually select the format

### Format Conversion

When a unified amount format is detected or selected:

1. The system validates the DR/CR indicator values
2. Converts the unified format to separate DEBIT/CREDIT columns internally
3. All downstream processing uses the standard separate columns format

### Column Mapping Interface

The column mapping interface now includes:

- **Format Selection**: Radio buttons to choose between the two formats
- **Dynamic Column Requirements**: Shows different required columns based on format choice
- **Format-Specific Help**: Contextual help text for each format
- **Sample Downloads**: Separate sample files for both formats

## Implementation Details

### Key Functions Added

1. **`detect_csv_format_type(df)`**: Auto-detects the CSV format type
2. **`validate_unified_amount_format(df, errors, warnings)`**: Validates unified format
3. **`convert_unified_to_separate_columns(df)`**: Converts unified to separate columns
4. **`create_sample_csv(format_type)`**: Generates sample CSVs for both formats

### Validation Enhancements

- **Amount Column Validation**: Ensures numeric values in the AMOUNT column
- **DR/CR Indicator Validation**: Checks for valid debit/credit indicators
- **Format-Specific Error Messages**: Provides targeted error messages for each format

### User Experience Improvements

- **Clear Format Selection**: Users can explicitly choose their format type
- **Contextual Help**: Format-specific guidance and examples
- **Sample Files**: Download samples for both formats
- **Automatic Conversion**: Seamless conversion from unified to separate columns

## PDF Support

The unified amount format support **automatically works with PDF files** because:

1. **PDF Extraction**: The system extracts table data from PDFs and converts it to CSV format
2. **Enhanced Header Recognition**: PDF extraction now recognizes DR/CR indicator columns including:
   - `DR CR`, `DR/CR`, `DRCR`
   - `DEBIT CREDIT`, `TRANSACTION TYPE`
   - `CR DR`, `CR/DR`
3. **Same Processing Pipeline**: Extracted PDF data follows the same validation and conversion process as CSV files
4. **Format Selection**: Users get the same format selection interface for PDF-extracted data

### PDF Processing Flow:
1. PDF → Table Extraction → CSV Format
2. CSV Format → Format Detection → Validation
3. Column Mapping → Format Conversion → Analysis

## Benefits

1. **Broader Bank Support**: Supports more bank statement formats (both CSV and PDF)
2. **User-Friendly**: Clear interface for format selection
3. **Backward Compatible**: Existing separate column format still works
4. **Automatic Processing**: Unified format is automatically converted for analysis
5. **Validation**: Comprehensive validation for both formats
6. **PDF Integration**: Seamless support for PDF bank statements

## Usage

### For CSV Files:
1. Upload your CSV file
2. The system will attempt to auto-detect the format
3. If needed, manually select your format type in the column mapping interface
4. Map your columns to the required fields
5. The system will automatically convert unified format to separate columns
6. Proceed with normal analysis

### For PDF Files:
1. Upload your PDF bank statement
2. The system extracts table data and converts it to CSV format
3. The extracted data goes through the same validation and format detection
4. Select your format type (separate columns or unified amount) in the column mapping interface
5. Map your columns to the required fields
6. The system will automatically convert unified format to separate columns
7. Proceed with normal analysis

**Note**: PDF support works seamlessly with both formats since the PDF extraction creates CSV data that then follows the same processing pipeline.

## Testing

The functionality includes comprehensive tests covering:
- Format detection
- Unified format conversion
- Sample CSV generation
- Validation for both formats

Run tests with: `python test_unified_format.py`