# Design Document

## Overview

This design implements a centralized data model system for transaction dataframes to ensure consistent column access, validation, and type safety across all modules. The solution provides a standardized schema, typed accessors, automatic format conversion, and backward compatibility while maintaining the existing functionality.

## Architecture

The system follows a layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────────┐
│           Application Layer             │
│  (existing modules: mule_detector,      │
│   trend_analyzer, network_builder, etc) │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Data Access Layer               │
│  (TransactionDataFrame wrapper class)   │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Validation Layer                 │
│  (Schema validation, type checking)     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│       Normalization Layer               │
│  (Format conversion, column mapping)    │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│         Raw Data Layer                  │
│  (CSV files, pandas DataFrames)        │
└─────────────────────────────────────────┘
```

## Components and Interfaces

### 1. TransactionSchema Class

Defines the standardized schema for transaction data:

```python
@dataclass
class TransactionSchema:
    """Defines the standard schema for transaction dataframes"""
    
    # Required columns with their expected types
    REQUIRED_COLUMNS = {
        'DATE': 'datetime64[ns]',
        'DESCRIPTION': 'object',
        'DEBIT': 'float64',
        'CREDIT': 'float64'
    }
    
    # Optional columns
    OPTIONAL_COLUMNS = {
        'counterparty': 'object',
        'entity_owner': 'object',
        'transaction_id': 'object',
        'account_number': 'object'
    }
    
    # Column aliases for mapping different input formats
    COLUMN_ALIASES = {
        'DATE': ['TRANS_DATE', 'TRANSACTION_DATE', 'TXN_DATE', 'VALUE_DATE'],
        'DESCRIPTION': ['DESC', 'PARTICULARS', 'NARRATION', 'DETAILS'],
        'DEBIT': ['DR', 'DEBIT_AMOUNT', 'WITHDRAWAL'],
        'CREDIT': ['CR', 'CREDIT_AMOUNT', 'DEPOSIT']
    }
```

### 2. TransactionDataFrame Class

A wrapper around pandas DataFrame providing typed access and validation:

```python
class TransactionDataFrame:
    """
    Wrapper around pandas DataFrame with transaction-specific validation and typed access
    """
    
    def __init__(self, df: pd.DataFrame, validate: bool = True):
        self._df = df
        if validate:
            self._validate_and_normalize()
    
    # Typed property accessors
    @property
    def date(self) -> pd.Series:
        return self._df['DATE']
    
    @property
    def description(self) -> pd.Series:
        return self._df['DESCRIPTION']
    
    @property
    def debit(self) -> pd.Series:
        return self._df['DEBIT']
    
    @property
    def credit(self) -> pd.Series:
        return self._df['CREDIT']
    
    # Computed properties
    @property
    def net_flow(self) -> pd.Series:
        return self.credit - self.debit
    
    @property
    def total_activity(self) -> pd.Series:
        return self.debit + self.credit
```

### 3. DataFrameValidator Class

Handles validation and error reporting:

```python
class DataFrameValidator:
    """Validates transaction dataframes against the standard schema"""
    
    def validate(self, df: pd.DataFrame) -> ValidationResult:
        """Validate dataframe and return detailed results"""
        
    def check_required_columns(self, df: pd.DataFrame) -> List[ValidationError]:
        """Check for presence of required columns"""
        
    def validate_data_types(self, df: pd.DataFrame) -> List[ValidationError]:
        """Validate column data types and attempt conversion"""
        
    def validate_data_quality(self, df: pd.DataFrame) -> List[ValidationWarning]:
        """Check for data quality issues"""
```

### 4. FormatNormalizer Class

Converts different CSV formats to the standard format:

```python
class FormatNormalizer:
    """Normalizes different CSV formats to standard transaction format"""
    
    def normalize(self, df: pd.DataFrame) -> pd.DataFrame:
        """Auto-detect format and normalize to standard schema"""
        
    def detect_format(self, df: pd.DataFrame) -> str:
        """Detect CSV format type"""
        
    def convert_unified_format(self, df: pd.DataFrame) -> pd.DataFrame:
        """Convert unified AMOUNT/DR_CR format to separate columns"""
        
    def map_column_names(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map column names using aliases"""
```

### 5. BackwardCompatibilityShim

Provides compatibility with existing code:

```python
class BackwardCompatibilityShim:
    """Provides backward compatibility for existing column access patterns"""
    
    def wrap_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Wrap dataframe to intercept column access and provide warnings"""
        
    def deprecation_warning(self, column_name: str, suggested_alternative: str):
        """Issue deprecation warnings for old access patterns"""
```

## Data Models

### ValidationResult

```python
@dataclass
class ValidationResult:
    is_valid: bool
    errors: List[ValidationError]
    warnings: List[ValidationWarning]
    normalized_df: Optional[pd.DataFrame] = None
    
    def raise_if_invalid(self):
        """Raise exception if validation failed"""
        if not self.is_valid:
            raise DataValidationError(self.errors)
```

### ValidationError and ValidationWarning

```python
@dataclass
class ValidationError:
    column: str
    error_type: str
    message: str
    row_indices: Optional[List[int]] = None
    suggested_fix: Optional[str] = None

@dataclass  
class ValidationWarning:
    column: str
    warning_type: str
    message: str
    affected_rows: int = 0
```

## Error Handling

### Exception Hierarchy

```python
class DataModelError(Exception):
    """Base exception for data model errors"""
    pass

class DataValidationError(DataModelError):
    """Raised when data validation fails"""
    def __init__(self, errors: List[ValidationError]):
        self.errors = errors
        super().__init__(self._format_error_message())

class SchemaError(DataModelError):
    """Raised when schema definition is invalid"""
    pass

class FormatDetectionError(DataModelError):
    """Raised when CSV format cannot be detected"""
    pass
```

### Error Recovery Strategies

1. **Missing Columns**: Attempt to map using aliases, create with default values if optional
2. **Type Conversion Failures**: Log warnings, use default values, provide detailed error context
3. **Date Parsing Issues**: Try multiple date formats, fall back to string representation
4. **Amount Parsing Issues**: Clean common formatting (commas, currency symbols), convert to numeric

## Testing Strategy

### Unit Tests

1. **Schema Validation Tests**
   - Test required column validation
   - Test data type validation
   - Test column alias mapping
   - Test error message formatting

2. **Format Normalization Tests**
   - Test separate column format handling
   - Test unified amount format conversion
   - Test edge cases and malformed data
   - Test column mapping accuracy

3. **TransactionDataFrame Tests**
   - Test typed property access
   - Test computed properties
   - Test backward compatibility
   - Test performance with large datasets

### Integration Tests

1. **End-to-End Workflow Tests**
   - Test complete CSV processing pipeline
   - Test integration with existing modules
   - Test error handling across components
   - Test performance benchmarks

2. **Compatibility Tests**
   - Test with existing module interfaces
   - Test deprecation warning system
   - Test gradual migration scenarios
   - Test with real-world CSV files

### Performance Tests

1. **Memory Usage Tests**
   - Test memory overhead of wrapper classes
   - Test with large dataframes (>1M rows)
   - Test garbage collection behavior

2. **Speed Tests**
   - Benchmark validation performance
   - Benchmark normalization performance
   - Compare with direct pandas access

## Migration Strategy

### Phase 1: Foundation (Week 1)
- Implement core schema and validation classes
- Create basic TransactionDataFrame wrapper
- Add comprehensive unit tests
- Ensure no breaking changes to existing code

### Phase 2: Format Support (Week 2)
- Implement FormatNormalizer for different CSV formats
- Add column mapping and alias support
- Integrate with existing CSV processing pipeline
- Test with various real-world CSV formats

### Phase 3: Integration (Week 3)
- Update key modules to use new data model
- Add backward compatibility shims
- Implement deprecation warning system
- Performance optimization and testing

### Phase 4: Full Migration (Week 4)
- Migrate remaining modules
- Remove deprecated access patterns
- Final performance tuning
- Documentation and training materials

## Backward Compatibility

The design ensures backward compatibility through:

1. **Non-breaking Interface**: Existing code continues to work unchanged
2. **Gradual Migration**: Modules can be updated incrementally
3. **Deprecation Warnings**: Clear guidance for migration
4. **Compatibility Shims**: Automatic handling of old access patterns
5. **Fallback Mechanisms**: Graceful degradation when new features fail