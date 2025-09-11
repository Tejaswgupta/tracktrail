import pandas as pd


def detect_csv_format_type(df):
    """
    Detect whether CSV uses separate DR/CR columns or unified amount + indicator format.
    Returns: 'separate_columns' or 'unified_amount' or 'unknown'
    """
    df_columns_upper = [col.upper() for col in df.columns]

    # Check for separate DEBIT/CREDIT columns
    has_debit = any("DEBIT" in col for col in df_columns_upper)
    has_credit = any("CREDIT" in col for col in df_columns_upper)

    # Check for unified amount + indicator format
    has_amount = any(
        col in ["AMOUNT", "AMT", "TRANSACTION_AMOUNT", "TXN_AMOUNT"]
        for col in df_columns_upper
    )
    has_indicator = any(
        col in ["DR_CR", "DRCR", "TYPE", "TRANSACTION_TYPE", "CR_DR", "DEBIT_CREDIT"]
        for col in df_columns_upper
    )

    if has_debit and has_credit:
        return "separate_columns"
    elif has_amount and has_indicator:
        return "unified_amount"
    else:
        return "unknown"


def validate_csv_format(df):
    """Validate CSV format and provide helpful error messages for both format types"""
    errors = []
    warnings = []

    format_type = detect_csv_format_type(df)

    if format_type == "separate_columns":
        return validate_separate_columns_format(df, errors, warnings)
    elif format_type == "unified_amount":
        return validate_unified_amount_format(df, errors, warnings)
    else:
        return validate_unknown_format(df, errors, warnings)


def validate_separate_columns_format(df, errors, warnings):
    """Validate format with separate DEBIT/CREDIT columns"""
    required_columns = ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
    df_columns_upper = [col.upper() for col in df.columns]

    missing_columns = []
    for req_col in required_columns:
        if req_col not in df_columns_upper:
            missing_columns.append(req_col)

    if missing_columns:
        errors.append(f"Missing required columns: {', '.join(missing_columns)}")
        errors.append(f"Available columns in your file: {', '.join(df.columns)}")

        # Suggest column mapping if there are similar column names
        suggestions = []
        for missing_col in missing_columns:
            for actual_col in df.columns:
                if (
                    missing_col.lower() in actual_col.lower()
                    or actual_col.lower() in missing_col.lower()
                ):
                    suggestions.append(f"'{actual_col}' might be '{missing_col}'")

        if suggestions:
            errors.append(f"Possible column mappings: {'; '.join(suggestions)}")

    # Check if we have the columns we need (with case flexibility)
    column_mapping = {}
    for req_col in required_columns:
        for i, col in enumerate(df_columns_upper):
            if col == req_col:
                column_mapping[req_col] = df.columns[i]
                break

    if len(column_mapping) == len(required_columns):
        # Rename columns to standard format
        df_renamed = df.rename(columns={v: k for k, v in column_mapping.items()})

        # Validate date format using smart parsing
        try:
            sample_dates = df_renamed["DATE"].dropna().head(5)
            test_parsed = smart_date_parsing(sample_dates)
            valid_dates = test_parsed.notna().sum()

            if valid_dates == 0:
                errors.append(
                    "No valid dates found. Supported formats include: DD/MM/YY, DD-MM-YY, DD/MM/YYYY, DD-MMM-YY, etc."
                )
            elif valid_dates < len(sample_dates):
                warnings.append(
                    f"Some dates could not be parsed ({len(sample_dates) - valid_dates} out of {len(sample_dates)} sample dates failed)"
                )
        except Exception as e:
            errors.append(
                f"Date parsing error: {str(e)}. Supported formats include: DD/MM/YY, DD-MM-YY, DD/MM/YYYY, DD-MMM-YY, etc."
            )

        # Check if amount columns contain numeric data
        for col in ["DEBIT", "CREDIT"]:
            try:
                # Test conversion of non-null values
                test_values = df_renamed[col].dropna().head(5)
                for val in test_values:
                    if pd.notna(val):
                        # Remove commas and try to convert
                        cleaned_val = str(val).replace(",", "").replace("nan", "")
                        if cleaned_val:
                            float(cleaned_val)
            except:
                warnings.append(
                    f"{col} column contains non-numeric values that may cause issues"
                )

        return df_renamed, errors, warnings

    return df, errors, warnings


def validate_unified_amount_format(df, errors, warnings):
    """Validate format with unified amount column and DR/CR indicator"""
    required_columns = ["DATE", "DESCRIPTION", "AMOUNT", "DR_CR"]
    df_columns_upper = [col.upper() for col in df.columns]

    # Find actual column names that match our requirements
    column_mapping = {}

    # Map DATE column
    for col in df.columns:
        if col.upper() in [
            "DATE",
            "TRANS_DATE",
            "TRANSACTION_DATE",
            "TXN_DATE",
            "VALUE_DATE",
        ]:
            column_mapping["DATE"] = col
            break

    # Map DESCRIPTION column
    for col in df.columns:
        if col.upper() in [
            "DESCRIPTION",
            "DESC",
            "PARTICULARS",
            "NARRATION",
            "DETAILS",
        ]:
            column_mapping["DESCRIPTION"] = col
            break

    # Map AMOUNT column
    for col in df.columns:
        if col.upper() in ["AMOUNT", "AMT", "TRANSACTION_AMOUNT", "TXN_AMOUNT"]:
            column_mapping["AMOUNT"] = col
            break

    # Map DR_CR indicator column
    for col in df.columns:
        if col.upper() in [
            "DR_CR",
            "DRCR",
            "TYPE",
            "TRANSACTION_TYPE",
            "CR_DR",
            "DEBIT_CREDIT",
        ]:
            column_mapping["DR_CR"] = col
            break

    missing_columns = []
    for req_col in required_columns:
        if req_col not in column_mapping:
            missing_columns.append(req_col)

    if missing_columns:
        errors.append(
            f"Missing required columns for unified format: {', '.join(missing_columns)}"
        )
        errors.append(f"Available columns in your file: {', '.join(df.columns)}")
        errors.append(
            "For unified format, we need: DATE, DESCRIPTION, AMOUNT, and DR_CR indicator columns"
        )

    if len(column_mapping) == len(required_columns):
        # Rename columns to standard format
        df_renamed = df.rename(columns=column_mapping)

        # Convert unified format to separate DEBIT/CREDIT columns
        df_converted = convert_unified_to_separate_columns(df_renamed)

        # Validate date format using smart parsing
        try:
            sample_dates = df_converted["DATE"].dropna().head(5)
            test_parsed = smart_date_parsing(sample_dates)
            valid_dates = test_parsed.notna().sum()

            if valid_dates == 0:
                errors.append(
                    "No valid dates found. Supported formats include: DD/MM/YY, DD-MM-YY, DD/MM/YYYY, DD-MMM-YY, etc."
                )
            elif valid_dates < len(sample_dates):
                warnings.append(
                    f"Some dates could not be parsed ({len(sample_dates) - valid_dates} out of {len(sample_dates)} sample dates failed)"
                )
        except Exception as e:
            errors.append(
                f"Date parsing error: {str(e)}. Supported formats include: DD/MM/YY, DD-MM-YY, DD/MM/YYYY, DD-MMM-YY, etc."
            )

        # Validate amount column contains numeric data
        try:
            test_values = df_renamed["AMOUNT"].dropna().head(5)
            for val in test_values:
                if pd.notna(val):
                    cleaned_val = str(val).replace(",", "").replace("nan", "")
                    if cleaned_val:
                        float(cleaned_val)
        except:
            warnings.append(
                "AMOUNT column contains non-numeric values that may cause issues"
            )

        # Validate DR_CR indicator values
        try:
            dr_cr_values = df_renamed["DR_CR"].dropna().str.upper().unique()
            valid_indicators = {"DR", "CR", "DEBIT", "CREDIT", "D", "C"}
            invalid_indicators = [
                val for val in dr_cr_values if val not in valid_indicators
            ]
            if invalid_indicators:
                warnings.append(
                    f"DR_CR column contains unexpected values: {invalid_indicators}. Expected: DR, CR, DEBIT, CREDIT, D, or C"
                )
        except:
            warnings.append("DR_CR column validation failed")

        return df_converted, errors, warnings

    return df, errors, warnings


def validate_unknown_format(df, errors, warnings):
    """Handle cases where format cannot be auto-detected"""
    errors.append("Could not automatically detect CSV format.")
    errors.append("Supported formats:")
    errors.append("1. Separate columns: DATE, DESCRIPTION, DEBIT, CREDIT")
    errors.append("2. Unified amount: DATE, DESCRIPTION, AMOUNT, DR_CR")
    errors.append(f"Your columns: {', '.join(df.columns)}")

    return df, errors, warnings
