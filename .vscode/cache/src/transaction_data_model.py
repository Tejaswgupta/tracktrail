"""
Core data model for transaction dataframes.

This module provides the foundational classes for standardizing transaction data
across the application, including schema definitions, validation results, and
custom exceptions.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Final
from enum import Enum
import pandas as pd


# Error Type Enums for type safety
class ValidationErrorType(Enum):
    """Enumeration of validation error types."""

    MISSING_REQUIRED_COLUMN = "MISSING_REQUIRED_COLUMN"
    INVALID_DATA_TYPE = "INVALID_DATA_TYPE"
    NULL_VALUES_IN_REQUIRED = "NULL_VALUES_IN_REQUIRED"
    INVALID_DATE_FORMAT = "INVALID_DATE_FORMAT"
    NEGATIVE_AMOUNTS = "NEGATIVE_AMOUNTS"
    DUPLICATE_TRANSACTIONS = "DUPLICATE_TRANSACTIONS"
    SCHEMA_MISMATCH = "SCHEMA_MISMATCH"


class ValidationWarningType(Enum):
    """Enumeration of validation warning types."""

    DATA_QUALITY_ISSUE = "DATA_QUALITY_ISSUE"
    SUSPICIOUS_VALUES = "SUSPICIOUS_VALUES"
    FORMATTING_INCONSISTENCY = "FORMATTING_INCONSISTENCY"
    MISSING_OPTIONAL_DATA = "MISSING_OPTIONAL_DATA"


# Custom Exception Hierarchy
class DataModelError(Exception):
    """Base exception for data model errors."""

    pass


class DataValidationError(DataModelError):
    """Raised when data validation fails."""

    def __init__(self, errors: List["ValidationError"]):
        if not errors:
            raise ValueError("DataValidationError requires at least one error")
        self.errors = errors
        super().__init__(self._format_error_message())

    def _format_error_message(self) -> str:
        """Format validation errors into a readable message."""
        error_messages = []
        for error in self.errors:
            msg = (
                f"{error.error_type.value} in column '{error.column}': {error.message}"
            )
            if error.row_indices:
                row_display = error.row_indices[:5]
                if len(error.row_indices) > 5:
                    row_display_str = (
                        f"{row_display}... (+{len(error.row_indices) - 5} more)"
                    )
                else:
                    row_display_str = str(row_display)
                msg += f" (rows: {row_display_str})"
            if error.suggested_fix:
                msg += f" - Suggested fix: {error.suggested_fix}"
            error_messages.append(msg)

        return "Data validation failed:\n" + "\n".join(
            f"  - {msg}" for msg in error_messages
        )


class SchemaError(DataModelError):
    """Raised when schema definition is invalid."""

    pass


class FormatDetectionError(DataModelError):
    """Raised when CSV format cannot be detected."""

    pass


# Validation Result Classes
@dataclass(frozen=True)
class ValidationError:
    """Represents a validation error with detailed information."""

    column: str
    error_type: ValidationErrorType
    message: str
    row_indices: Optional[List[int]] = None
    suggested_fix: Optional[str] = None

    def __post_init__(self):
        """Validate ValidationError fields."""
        if not self.column:
            raise ValueError("ValidationError column cannot be empty")
        if not self.message:
            raise ValueError("ValidationError message cannot be empty")
        if self.row_indices is not None and not isinstance(self.row_indices, list):
            raise ValueError("ValidationError row_indices must be a list or None")


@dataclass(frozen=True)
class ValidationWarning:
    """Represents a validation warning for data quality issues."""

    column: str
    warning_type: ValidationWarningType
    message: str
    affected_rows: int = 0

    def __post_init__(self):
        """Validate ValidationWarning fields."""
        if not self.column:
            raise ValueError("ValidationWarning column cannot be empty")
        if not self.message:
            raise ValueError("ValidationWarning message cannot be empty")
        if self.affected_rows < 0:
            raise ValueError("ValidationWarning affected_rows cannot be negative")


@dataclass
class ValidationResult:
    """Contains the results of dataframe validation."""

    is_valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationWarning] = field(default_factory=list)
    normalized_df: Optional[pd.DataFrame] = None

    def __post_init__(self):
        """Validate ValidationResult consistency."""
        if self.is_valid and self.errors:
            raise ValueError("ValidationResult cannot be valid with errors present")
        if not self.is_valid and not self.errors:
            raise ValueError("ValidationResult cannot be invalid without errors")

    def raise_if_invalid(self) -> None:
        """Raise DataValidationError if validation failed."""
        if not self.is_valid:
            raise DataValidationError(self.errors)

    def has_warnings(self) -> bool:
        """Check if there are any validation warnings."""
        return len(self.warnings) > 0

    def get_error_summary(self) -> str:
        """Get a summary of validation errors."""
        if self.is_valid:
            return "No validation errors"

        error_counts = {}
        for error in self.errors:
            error_type = error.error_type.value
            error_counts[error_type] = error_counts.get(error_type, 0) + 1

        summary_parts = [
            f"{count} {error_type}" for error_type, count in error_counts.items()
        ]
        return f"Validation failed: {', '.join(summary_parts)}"

    def get_warning_summary(self) -> str:
        """Get a summary of validation warnings."""
        if not self.has_warnings():
            return "No validation warnings"

        warning_counts = {}
        for warning in self.warnings:
            warning_type = warning.warning_type.value
            warning_counts[warning_type] = warning_counts.get(warning_type, 0) + 1

        summary_parts = [
            f"{count} {warning_type}" for warning_type, count in warning_counts.items()
        ]
        return f"Warnings: {', '.join(summary_parts)}"


# Transaction Schema Definition
class TransactionSchema:
    """Defines the standardized schema for transaction dataframes.

    This class provides a robust, immutable schema definition without relying on
    external aliases or mappings. It enforces strict typing and validation.
    """

    # Core required columns - these MUST be present in any valid transaction dataframe
    REQUIRED_COLUMNS: Final[Dict[str, str]] = {
        "DATE": "datetime64[ns]",
        "DESCRIPTION": "object",
        "DEBIT": "float64",
        "CREDIT": "float64",
    }

    # Optional columns that may enhance transaction data
    OPTIONAL_COLUMNS: Final[Dict[str, str]] = {
        "counterparty": "object",
        "entity_owner": "object",
        "transaction_id": "object",
        "account_number": "object",
    }

    # Validation constraints for each column
    COLUMN_CONSTRAINTS: Final[Dict[str, Dict[str, any]]] = {
        "DATE": {
            "nullable": False,
            "unique": False,
            "description": "Transaction date in datetime format",
        },
        "DESCRIPTION": {
            "nullable": False,
            "min_length": 1,
            "max_length": 500,
            "description": "Transaction description or narration",
        },
        "DEBIT": {
            "nullable": True,
            "min_value": 0.0,
            "description": "Debit amount (must be non-negative)",
        },
        "CREDIT": {
            "nullable": True,
            "min_value": 0.0,
            "description": "Credit amount (must be non-negative)",
        },
        "counterparty": {
            "nullable": True,
            "max_length": 200,
            "description": "Transaction counterparty",
        },
        "entity_owner": {
            "nullable": True,
            "max_length": 100,
            "description": "Entity that owns this transaction",
        },
        "transaction_id": {
            "nullable": True,
            "unique": True,
            "description": "Unique transaction identifier",
        },
        "account_number": {
            "nullable": True,
            "max_length": 50,
            "description": "Account number for this transaction",
        },
    }

    @classmethod
    def get_all_columns(cls) -> Dict[str, str]:
        """Get all columns (required + optional) with their types."""
        return {**cls.REQUIRED_COLUMNS, **cls.OPTIONAL_COLUMNS}

    @classmethod
    def get_required_column_names(cls) -> Set[str]:
        """Get set of required column names."""
        return set(cls.REQUIRED_COLUMNS.keys())

    @classmethod
    def get_optional_column_names(cls) -> Set[str]:
        """Get set of optional column names."""
        return set(cls.OPTIONAL_COLUMNS.keys())

    @classmethod
    def get_all_column_names(cls) -> Set[str]:
        """Get set of all valid column names."""
        return cls.get_required_column_names().union(cls.get_optional_column_names())

    @classmethod
    def get_expected_type(cls, column_name: str) -> Optional[str]:
        """Get expected pandas dtype for a column."""
        return cls.get_all_columns().get(column_name)

    @classmethod
    def is_required_column(cls, column_name: str) -> bool:
        """Check if a column is required."""
        return column_name in cls.REQUIRED_COLUMNS

    @classmethod
    def is_valid_column(cls, column_name: str) -> bool:
        """Check if a column name is valid (required or optional)."""
        return column_name in cls.get_all_column_names()

    @classmethod
    def get_column_constraints(cls, column_name: str) -> Optional[Dict[str, any]]:
        """Get validation constraints for a column."""
        return cls.COLUMN_CONSTRAINTS.get(column_name)

    @classmethod
    def validate_schema_definition(cls) -> None:
        """Validate that the schema definition is internally consistent."""
        # Check for overlapping column names
        required_names = cls.get_required_column_names()
        optional_names = cls.get_optional_column_names()

        overlap = required_names.intersection(optional_names)
        if overlap:
            raise SchemaError(
                f"Columns cannot be both required and optional: {overlap}"
            )

        # Check that all columns have constraints defined
        all_column_names = cls.get_all_column_names()
        constraint_columns = set(cls.COLUMN_CONSTRAINTS.keys())

        missing_constraints = all_column_names - constraint_columns
        if missing_constraints:
            raise SchemaError(f"Missing constraints for columns: {missing_constraints}")

        # Check that constraint columns exist in schema
        extra_constraints = constraint_columns - all_column_names
        if extra_constraints:
            raise SchemaError(
                f"Constraints defined for non-existent columns: {extra_constraints}"
            )

        # Validate individual column constraints
        for column_name, constraints in cls.COLUMN_CONSTRAINTS.items():
            if not isinstance(constraints, dict):
                raise SchemaError(
                    f"Constraints for column '{column_name}' must be a dictionary"
                )

            # Check required constraint fields
            if "description" not in constraints:
                raise SchemaError(
                    f"Column '{column_name}' missing required 'description' constraint"
                )

    @classmethod
    def create_empty_dataframe(cls) -> pd.DataFrame:
        """Create an empty DataFrame with the correct schema."""
        columns = {}
        for col_name, dtype in cls.get_all_columns().items():
            if dtype == "datetime64[ns]":
                columns[col_name] = pd.Series([], dtype=dtype)
            elif dtype == "float64":
                columns[col_name] = pd.Series([], dtype=dtype)
            else:  # object
                columns[col_name] = pd.Series([], dtype=dtype)

        return pd.DataFrame(columns)

    @classmethod
    def get_schema_info(cls) -> Dict[str, any]:
        """Get comprehensive schema information."""
        return {
            "required_columns": list(cls.REQUIRED_COLUMNS.keys()),
            "optional_columns": list(cls.OPTIONAL_COLUMNS.keys()),
            "column_types": cls.get_all_columns(),
            "constraints": cls.COLUMN_CONSTRAINTS,
            "total_columns": len(cls.get_all_column_names()),
        }


# Validate the schema definition at module load time
TransactionSchema.validate_schema_definition()
