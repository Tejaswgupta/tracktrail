import json
import re
from collections import Counter
from datetime import datetime, timedelta

import networkx as nx
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from fuzzywuzzy import fuzz, process

from counterparty_trend_analyzer import CounterpartyTrendAnalyzer
from graph_data_models import NetworkAnalysisResults
from graph_network_builder import GraphNetworkBuilder
from mule_account_detector import MuleAccountDetector
from network_cycle_detector import NetworkCycleDetector
from network_visualizer import NetworkVisualizer, VisualizationConfig
from time_based_analytics import TimeBasedAnalytics
from trend_report_generator import TrendReportGenerator


from dateutil import parser as dateutil_parser
import os

from digital_pdf_extraction import process_pdf_to_csv
from graph_analysis_config import show_config_summary, show_graph_analysis_config_ui


def initialize_session_state():
    """Initialize session state if data_foundation module is not available"""
    if "data_store" not in st.session_state:
        st.session_state.data_store = {
            "entities": {},
            "accounts": {},
            "transactions": {},
            "counterparties": {},
            "analysis_cache": {},
            "user_preferences": {},
            "metadata": {"initialized_at": datetime.now(), "version": "1.0.0"},
        }


def smart_date_parsing(date_series, sample_size=10, return_info=False):
    """
    Intelligently parse dates from a pandas Series, trying multiple approaches.

    Args:
        date_series: pandas Series containing date strings
        sample_size: number of samples to test formats on
        return_info: if True, returns (parsed_series, format_info)

    Returns:
        pandas Series with parsed datetime objects, or tuple if return_info=True
    """
    if date_series.empty:
        result = date_series
        return (result, "Empty series") if return_info else result

    # Get non-null sample for testing
    sample_dates = date_series.dropna().astype(str).head(sample_size)

    if len(sample_dates) == 0:
        result = pd.to_datetime(date_series, errors="coerce")
        return (result, "No valid dates found") if return_info else result

    # Method 1: Try pandas automatic parsing first (fastest and handles many formats)
    try:
        # Test on sample first
        test_result = pd.to_datetime(sample_dates, errors="raise")
        if test_result.notna().all():
            # If sample works, apply to full series
            result = pd.to_datetime(date_series, errors="coerce")
            info = f"Auto-detected format from samples: {sample_dates.iloc[0]} → {test_result.iloc[0].strftime('%Y-%m-%d')}"
            return (result, info) if return_info else result
    except:
        pass

    try:
        # Test on sample first
        for date_str in sample_dates.head(3):
            dateutil_parser.parse(str(date_str))

        # If sample works, apply to full series
        def parse_with_dateutil(date_str):
            try:
                if pd.isna(date_str) or str(date_str).strip() == "":
                    return pd.NaT
                return dateutil_parser.parse(str(date_str))
            except:
                return pd.NaT

        result = date_series.apply(parse_with_dateutil)
        info = f"Used intelligent parsing (dateutil) for format: {sample_dates.iloc[0]}"
        return (result, info) if return_info else result
    except:
        pass

    # Method 4: Final fallback - pandas with errors='coerce'
    result = pd.to_datetime(date_series, errors="coerce")
    info = "Used fallback parsing - some dates may not be recognized"
    return (result, info) if return_info else result


# ============== CSV FORMAT VALIDATION ==============
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
    df_columns_upper = [col.upper() for col in df.columns]

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


def convert_unified_to_separate_columns(df):
    """
    Convert unified amount + DR/CR format to separate DEBIT/CREDIT columns.

    Args:
        df: DataFrame with AMOUNT and DR_CR columns

    Returns:
        DataFrame with DEBIT and CREDIT columns
    """
    df_converted = df.copy()

    # Initialize DEBIT and CREDIT columns
    df_converted["DEBIT"] = 0.0
    df_converted["CREDIT"] = 0.0

    # Clean amount column
    df_converted["AMOUNT"] = pd.to_numeric(
        df_converted["AMOUNT"].astype(str).str.replace(",", "").str.replace("₹", ""),
        errors="coerce",
    ).fillna(0)

    # Clean DR_CR indicator
    df_converted["DR_CR"] = df_converted["DR_CR"].astype(str).str.upper().str.strip()

    # Map amounts to appropriate columns based on DR_CR indicator
    debit_mask = df_converted["DR_CR"].isin(["DR", "DEBIT", "D"])
    credit_mask = df_converted["DR_CR"].isin(["CR", "CREDIT", "C"])

    df_converted.loc[debit_mask, "DEBIT"] = df_converted.loc[debit_mask, "AMOUNT"]
    df_converted.loc[credit_mask, "CREDIT"] = df_converted.loc[credit_mask, "AMOUNT"]

    # Drop the original AMOUNT and DR_CR columns
    df_converted = df_converted.drop(columns=["AMOUNT", "DR_CR"])

    return df_converted


def show_column_mapping_interface(df):
    """Allow users to manually map their columns to required format"""
    st.subheader("🔗 Column Mapping")
    st.write("Map your CSV columns to the required format:")

    # Add option to go back
    col_back, col_info = st.columns([1, 3])
    with col_back:
        if st.button("⬅️ Upload Different File"):
            st.session_state.show_column_mapping = False
            st.session_state.df_for_mapping = None
            st.session_state.mapping_entity_name = None
            st.session_state.mapping_account_number = None
            st.rerun()
    with col_info:
        st.info("Choose which column in your CSV corresponds to each required field.")

    # Entity Information Section for column mapping
    st.markdown("#### 👤 Entity Information for this Upload")

    # Get stored entity and account info from session state. These are read-only during mapping.
    entity_name = st.session_state.get("mapping_entity_name", "")
    account_number = st.session_state.get("mapping_account_number", "")

    # Display the entity and account as non-editable info
    if entity_name:
        st.markdown(f"**Entity:** `{entity_name}`")
        st.markdown(f"**Account Number:** `{account_number or 'Not specified'}`")
    else:
        st.error(
            "❌ Entity name was not provided before upload. Please go back and specify an entity."
        )
        # Invalidate the entity_name to prevent the 'Apply' button from working
        entity_name = ""

    st.divider()

    # Format selection
    st.markdown("#### 📊 Select Your Bank Statement Format")

    format_choice = st.radio(
        "Choose the format that matches your CSV:",
        options=[
            "Separate Debit/Credit Columns",
            "Unified Amount with DR/CR Indicator",
        ],
        help="Select the format that matches your bank statement structure",
        key="format_choice",
    )

    st.divider()

    # Show data preview
    with st.expander("📋 Your Data Preview", expanded=True):
        st.dataframe(df.head(), use_container_width=True)

    # Set required columns based on format choice
    if format_choice == "Separate Debit/Credit Columns":
        required_columns = ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
        format_help = """
        **Separate Columns Format:**
        - DATE: Transaction date
        - DESCRIPTION: Transaction description/particulars
        - DEBIT: Debit amount (money going out)
        - CREDIT: Credit amount (money coming in)
        """
    else:
        required_columns = ["DATE", "DESCRIPTION", "AMOUNT", "DR_CR"]
        format_help = """
        **Unified Amount Format:**
        - DATE: Transaction date
        - DESCRIPTION: Transaction description/particulars  
        - AMOUNT: Transaction amount (unified column)
        - DR_CR: Debit/Credit indicator (DR/CR, D/C, DEBIT/CREDIT)
        """

    st.info(format_help)

    column_mapping = {}

    col1, col2 = st.columns(2)

    with col1:
        st.write("**Your Columns:**")
        for i, col in enumerate(df.columns):
            st.write(f"{i + 1}. `{col}`")

    with col2:
        st.write("**Map to Required Columns:**")
        for req_col in required_columns:
            help_text = {
                "DATE": "Select the column containing transaction dates",
                "DESCRIPTION": "Select the column with transaction descriptions/particulars",
                "DEBIT": "Select the column with debit amounts (money going out)",
                "CREDIT": "Select the column with credit amounts (money coming in)",
                "AMOUNT": "Select the column with transaction amounts",
                "DR_CR": "Select the column indicating DR/CR (should contain values like DR, CR, D, C, DEBIT, CREDIT)",
            }

            column_mapping[req_col] = st.selectbox(
                f"Map {req_col} to:",
                options=[""] + list(df.columns),
                key=f"map_{req_col}",
                help=help_text.get(
                    req_col, f"Select which column corresponds to {req_col}"
                ),
            )

    # Show mapping summary
    if any(column_mapping.values()):
        st.write("**Current Mapping:**")
        for req_col, mapped_col in column_mapping.items():
            if mapped_col:
                st.write(f"• {req_col} ← `{mapped_col}`")

    if all(column_mapping.values()) and entity_name:
        # Show summary of what will be processed
        st.success(f"✅ Ready to process: **{entity_name}** ({len(df)} transactions)")
        if account_number:
            st.caption(f"Account: {account_number}")

        if st.button("✅ Apply Column Mapping", type="primary"):
            # Validate entity name is provided
            if not entity_name:
                st.error(
                    "❌ Please provide an entity name before applying column mapping."
                )
                return df, False

            # Store entity info in session state for processing
            st.session_state.mapping_entity_name = entity_name
            st.session_state.mapping_account_number = account_number

            # Create reverse mapping
            reverse_mapping = {v: k for k, v in column_mapping.items() if v}
            df_mapped = df.rename(columns=reverse_mapping)

            # Convert unified format to separate columns if needed
            if format_choice == "Unified Amount with DR/CR Indicator":
                df_mapped = convert_unified_to_separate_columns(df_mapped)
                st.success(
                    "✅ Converted unified amount format to separate DEBIT/CREDIT columns"
                )

            return df_mapped, True
    else:
        missing_items = []
        missing_maps = [k for k, v in column_mapping.items() if not v]
        if missing_maps:
            missing_items.append(f"columns: {', '.join(missing_maps)}")
        if not entity_name:
            missing_items.append("entity name")

        if missing_items:
            st.warning(f"Please provide: {', '.join(missing_items)}")

    return df, False


def show_format_help():
    """Display CSV format requirements for both supported formats"""
    st.info(
        """
    📋 **Supported CSV Formats:**
    
    We support two common bank statement formats:
    
    **Format 1: Separate Debit/Credit Columns**
    - `DATE` - Transaction date
    - `DESCRIPTION` - Transaction description/particulars
    - `DEBIT` - Debit amount (money going out)
    - `CREDIT` - Credit amount (money coming in)
    
    **Format 2: Unified Amount with DR/CR Indicator**
    - `DATE` - Transaction date  
    - `DESCRIPTION` - Transaction description/particulars
    - `AMOUNT` - Transaction amount (unified column)
    - `DR_CR` - Debit/Credit indicator (DR, CR, D, C, DEBIT, CREDIT)
    
    **Supported Date Formats (Auto-detected):**
    - DD/MM/YY, DD/MM/YYYY (e.g., 15/01/23, 15/01/2023)
    - DD-MM-YY, DD-MM-YYYY (e.g., 15-01-23, 15-01-2023)
    - DD.MM.YY, DD.MM.YYYY (e.g., 15.01.23, 15.01.2023)
    - DD-MMM-YY, DD-MMM-YYYY (e.g., 15-Jan-23, 15-Jan-2023)
    - YYYY-MM-DD (e.g., 2023-01-15)
    - MM/DD/YY, MM/DD/YYYY (US format)
    - And many other variations automatically detected!
    
    **Example - Separate Columns:**
    ```
    DATE,DESCRIPTION,DEBIT,CREDIT
    15/01/23,NEFT ABCD1234 JOHN DOE,5000,
    16/01/23,SALARY CREDIT,,25000
    17/01/23,ATM WITHDRAWAL,2000,
    ```
    
    **Example - Unified Amount:**
    ```
    DATE,DESCRIPTION,AMOUNT,DR_CR
    15/01/23,NEFT ABCD1234 JOHN DOE,5000,DR
    16/01/23,SALARY CREDIT,25000,CR
    17/01/23,ATM WITHDRAWAL,2000,DR
    ```
    """
    )


def create_sample_csv(format_type="separate"):
    """Generate a sample CSV for download"""
    if format_type == "unified":
        sample_data = {
            "DATE": ["15/01/23", "16/01/23", "17/01/23", "18/01/23"],
            "DESCRIPTION": [
                "NEFT ABCD1234 JOHN DOE MAHB",
                "SALARY CREDIT FROM COMPANY",
                "ATM WITHDRAWAL",
                "UPI/123456789/MERCHANT/",
            ],
            "AMOUNT": [5000, 25000, 2000, 500],
            "DR_CR": ["DR", "CR", "DR", "DR"],
        }
    else:  # separate columns format
        sample_data = {
            "DATE": ["15/01/23", "16/01/23", "17/01/23", "18/01/23"],
            "DESCRIPTION": [
                "NEFT ABCD1234 JOHN DOE MAHB",
                "SALARY CREDIT FROM COMPANY",
                "ATM WITHDRAWAL",
                "UPI/123456789/MERCHANT/",
            ],
            "DEBIT": [5000, "", 2000, 500],
            "CREDIT": ["", 25000, "", ""],
        }
    return pd.DataFrame(sample_data).to_csv(index=False)


def generate_account_id(account_name, account_number):
    """Generate a unique account ID from account name and number"""
    if account_number:
        return f"{account_name}_{account_number}".replace(" ", "_").upper()
    else:
        return f"{account_name}_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}".replace(
            " ", "_"
        ).upper()


def save_account_data(
    account_id,
    account_name,
    account_number,
    df_original,
    df_processed=None,
    entity_id=None,
):
    """Save account data to session state"""
    st.session_state.accounts[account_id] = {
        "account_name": account_name,
        "account_number": account_number,
        "entity_id": entity_id,  # New field for entity association
        "df_original": df_original,
        "df_processed": df_processed,
        "upload_timestamp": pd.Timestamp.now(),
        "transaction_count": len(df_original),
        "date_range": {
            "start": (
                df_original["DATE"].min()
                if not df_original["DATE"].isna().all()
                else None
            ),
            "end": (
                df_original["DATE"].max()
                if not df_original["DATE"].isna().all()
                else None
            ),
        },
        "total_debits": df_original["DEBIT"].fillna(0).sum(),
        "total_credits": df_original["CREDIT"].fillna(0).sum(),
    }


# ============== ENTITY MANAGEMENT FUNCTIONS ==============


def resolve_primary_entity(entity_name):
    """
    Simple entity resolution - just checks if entity exists, doesn't do fuzzy matching.
    Returns (entity_id, is_new_entity)
    """
    if not entity_name or not entity_name.strip():
        raise ValueError("Entity name cannot be empty")

    entity_name = entity_name.strip()

    # Ensure required session state structures exist
    if "global_entity_registry" not in st.session_state:
        st.session_state.global_entity_registry = {}

    if "entities" not in st.session_state:
        st.session_state.entities = {}

    # More robust check using canonical name and aliases
    query_canonical = entity_name.upper().replace(" ", "_")
    for (
        canonical_name,
        registry_entry,
    ) in st.session_state.global_entity_registry.items():
        if registry_entry["primary_entity_id"] is not None:
            # Check if the canonical form of the input name matches the registry key
            # Or if the input name matches any of the stored aliases (case-insensitive)
            if query_canonical == canonical_name or entity_name.upper() in {
                alias.upper() for alias in registry_entry["aliases"]
            }:
                return registry_entry["primary_entity_id"], False

    # Create new entity
    entity_id = f"ENTITY_{len(st.session_state.entities) + 1}_{int(pd.Timestamp.now().timestamp())}"
    st.session_state.entities[entity_id] = {"name": entity_name, "account_ids": []}

    # Add to global registry
    canonical_name = entity_name.upper().replace(" ", "_")
    st.session_state.global_entity_registry[canonical_name] = {
        "primary_entity_id": entity_id,
        "aliases": {entity_name},
    }

    return entity_id, True


def create_and_save_account(entity_id, account_number, df_processed):
    """
    Create and save account data for a given entity.
    Returns the account_id
    """
    # Generate account ID
    entity_name = st.session_state.entities[entity_id]["name"]
    account_id = generate_account_id(entity_name, account_number)

    # Save account data with entity_id
    save_account_data(
        account_id=account_id,
        account_name=f"{entity_name} - {account_number[-4:] if account_number else 'Account'}",
        account_number=account_number,
        df_original=df_processed,
        df_processed=df_processed,
        entity_id=entity_id,
    )

    return account_id


def update_global_registry_with_counterparties(df_processed):
    """
    Extract counterparties from the dataframe and update the global registry.
    This is a simplified version - in a full implementation, you'd want more sophisticated
    counterparty extraction and matching logic.
    """
    # Ensure global_entity_registry exists in session state
    if "global_entity_registry" not in st.session_state:
        st.session_state.global_entity_registry = {}

    if "counterparty" not in df_processed.columns:
        return

    # Extract unique counterparties
    counterparties = df_processed["counterparty"].dropna().unique()

    for counterparty in counterparties:
        if not counterparty or pd.isna(counterparty):
            continue

        counterparty_clean = str(counterparty).strip()
        if len(counterparty_clean) < 2:  # Skip very short names
            continue

        # Check if this counterparty already exists in registry
        found_match = False
        for (
            canonical_name,
            registry_entry,
        ) in st.session_state.global_entity_registry.items():
            if (
                counterparty_clean.upper() == canonical_name.upper()
                or counterparty_clean.upper()
                in {alias.upper() for alias in registry_entry["aliases"]}
            ):
                # Add as alias if not already present
                registry_entry["aliases"].add(counterparty_clean)
                found_match = True
                break

        if not found_match:
            # Create new entry in registry (without primary_entity_id since we don't have a statement for this entity)
            canonical_name = counterparty_clean.upper().replace(" ", "_")
            if canonical_name not in st.session_state.global_entity_registry:
                st.session_state.global_entity_registry[canonical_name] = {
                    "primary_entity_id": None,
                    "aliases": {counterparty_clean},
                }


def extract_counterparty_for_analysis(df):
    """
    Extract counterparty names from transaction descriptions for analysis.
    This is a helper function for when counterparty data is not available from merged data.
    """
    if df.empty:
        return df

    df_copy = df.copy()

    # Ensure DESCRIPTION column is string type
    if "DESCRIPTION" in df_copy.columns:
        df_copy["DESCRIPTION"] = df_copy["DESCRIPTION"].astype(str).fillna("")

    # Initialize counterparty columns if they don't exist
    if "counterparty" not in df_copy.columns:
        df_copy["counterparty"] = ""
    if "COUNTERPARTY_ORIGINAL" not in df_copy.columns:
        df_copy["COUNTERPARTY_ORIGINAL"] = ""

    # Get or create standardizer
    if "standardizer" not in st.session_state:
        st.session_state.standardizer = CounterpartyStandardizer(85)

    standardizer = st.session_state.standardizer

    # Extract counterparty names
    for idx, row in df_copy.iterrows():
        desc = row.get("DESCRIPTION", "")
        if desc and pd.notna(desc) and str(desc).strip():
            name = standardizer.extract_counterparty_name(str(desc))
            if name:
                df_copy.at[idx, "COUNTERPARTY_ORIGINAL"] = str(name)
                df_copy.at[idx, "counterparty"] = str(name)

    return df_copy


def get_analysis_dataframe(force_refresh=False):
    """
    Prepares a single DataFrame for analysis based on the current scope.
    Crucially, it adds 'entity_owner' and 'account_name' columns for context.

    Args:
        force_refresh: If True, bypass any cached data and rebuild the dataframe
    """
    scope = st.session_state.get("analysis_scope")
    if not scope:
        return pd.DataFrame()

    # Check if we have a cached dataframe for this scope
    cache_key = f"analysis_df_{scope}"
    if not force_refresh and cache_key in st.session_state:
        # Use cached dataframe if available and not forcing refresh
        return st.session_state[cache_key]

    dfs_to_concat = []

    # Determine which accounts to include based on scope
    account_ids_in_scope = []
    if scope == "all":
        account_ids_in_scope = list(st.session_state.accounts.keys())
    elif scope in st.session_state.entities:  # It's an entity_id
        account_ids_in_scope = st.session_state.entities[scope]["account_ids"]
    elif scope in st.session_state.accounts:  # It's an account_id
        account_ids_in_scope = [scope]

    # Build the list of DataFrames to concatenate
    for acc_id in account_ids_in_scope:
        acc_data = st.session_state.accounts.get(acc_id)
        if acc_data is not None:
            df = acc_data.get("df_processed")
            if df is None:
                df = acc_data.get("df_original")

            if df is not None:
                df_copy = df.copy()
                entity_id = acc_data.get("entity_id")
                if entity_id and entity_id in st.session_state.entities:
                    # Add context columns!
                    df_copy["entity_owner"] = st.session_state.entities[entity_id][
                        "name"
                    ]
                    df_copy["account_name"] = acc_data["account_name"]
                    dfs_to_concat.append(df_copy)

    if not dfs_to_concat:
        result_df = pd.DataFrame()
    else:
        result_df = pd.concat(dfs_to_concat, ignore_index=True)

    # Cache the result for future use
    st.session_state[cache_key] = result_df

    return result_df


def show_analysis_scope_selector():
    """
    Display UI for selecting the analysis scope (all entities, specific entity, or specific account).
    """
    st.sidebar.markdown("### 🎯 Analysis Scope")

    # Create a list of options: All Entities, individual entities, and their accounts
    options = {"Analyze All Loaded Data": "all"}

    for entity_id, entity_data in st.session_state.entities.items():
        options[f"Entity: {entity_data['name']}"] = entity_id
        for acc_id in entity_data["account_ids"]:
            acc_data = st.session_state.accounts.get(acc_id)
            if acc_data:
                acc_num_suffix = (
                    f" (*{acc_data['account_number'][-4:]})"
                    if acc_data.get("account_number")
                    else ""
                )
                options[f"  - Account: {acc_data['account_name']}{acc_num_suffix}"] = (
                    acc_id
                )

    # Get current selection's index
    current_scope = st.session_state.get("analysis_scope")
    current_index = 0  # Default to "Analyze All Loaded Data"

    if current_scope:
        for i, (label, value) in enumerate(options.items()):
            if value == current_scope:
                current_index = i
                break

    # Use a key for the selectbox to ensure it refreshes properly
    selected_option_label = st.sidebar.selectbox(
        "Select data to analyze:",
        options=list(options.keys()),
        index=current_index,
        key="analysis_scope_selector",
        help="Choose what data to analyze. You can analyze all loaded data, a specific entity, or a specific account.",
    )

    newly_selected_scope = options[selected_option_label]
    if st.session_state.analysis_scope != newly_selected_scope:
        st.session_state.analysis_scope = newly_selected_scope

        # Clear cached analysis data when scope changes
        cached_vars = [
            "df_for_merging",
            "extracted_df",
            "clusters",
            "name_counts",
            "standardizer",
            "merge_mappings",
            "similarity_results",
        ]
        for var in cached_vars:
            if var in st.session_state:
                del st.session_state[var]

        # Also clear the cached dataframes in the analysis_state
        if (
            "analysis_state" in st.session_state
            and "cached_dataframes" in st.session_state.analysis_state
        ):
            st.session_state.analysis_state["cached_dataframes"] = {}

        # Use the AnalysisManager to refresh the data if available
        try:
            from data_foundation import AnalysisManager

            AnalysisManager.clear_cache(scope=newly_selected_scope)
            AnalysisManager.set_analysis_scope(newly_selected_scope)
        except ImportError:
            pass

        # Force a rerun to refresh the UI with the new data
        st.rerun()


# ============== counterparty STANDARDIZER CLASS ==============
class CounterpartyStandardizer:
    def __init__(self, similarity_threshold=85, bank_preset="generic"):
        self.similarity_threshold = similarity_threshold
        self.name_mappings = {}
        self.bank_preset = bank_preset

        # Bank-specific regex patterns
        self.bank_patterns = {
            "generic": [
                r"UPI/([^/]+)/[^/]+/?",  # UPI/COUNTERPARTY/number/optional
                r"(?:NEFT|RTGS)/[^/]+/([^/\n]+)/?",
                r"POS/([^/\n]+)/?",
                r"IMPS(?:-[A-Z]+)?/[^/]+/[^/]+/([^/\n]+)/?",
                r"(?:.*/)?([^/\n]+)$",  # General fallback: last segment after slash
            ],
            "axis": [
                # 1. INB/RTGS/{ref}/{name}/... (MOST SPECIFIC FIRST)
                r"^INB/RTGS/[^/]+/([^/]+)/",
                r"^INB/RTGS/[^/]+/([^/]+)$",
                # 2. INB/NEFT/{ref}/{name}/...
                r"^INB/NEFT/[^/]+/([^/]+)/",
                r"^INB/NEFT/[^/]+/([^/]+)$",
                # 3. INB/IFT/{name}/TPARTY TRANSFER
                r"^INB/IFT/([^/]+)/TPARTY TRANSFER",
                # 4. RTGS patterns (as before)
                r"^RTGS/[^/]+/[^/]+/([^/]+)/[^/]+",
                r"^RTGS/[^/]+/[^/]+/([^/]+)$",
                r"^RTGS/[^/]+/([^/]+)/[^/]+",
                r"^RTGS/[^/]+/([^/]+)$",
                # 5. NEFT patterns
                r"^NEFT/RETURN/[^/]+/[^/]+/([^/]+)",
                r"^NEFT/[^/]+/([^/]+)/[^/]+//ATTN//INB",
                r"^NEFT/IC/[^/]+/([^/]+)",
                r"^NEFT/[^/]+/([^/]+)/[^/]+//URGENT/",
                # 6. IMPS patterns
                r"^IMPS/P2A/[^/]+/([^/]+)/[^/]+/",
                r"^IMPS/P2A/[^/]+//[^/]+/[^/]+/([^/]+)",
                r"^IMPS/P2A/[^/]+//([^/]+)",
                # 7. GENERAL INB PATTERN (NOW LAST)
                r"^INB/[^/]+/([^/]+)/",
                r"^INB/[^/]+//([^/]+)",
                # 8. Other patterns
                r"^DD ISSUED/[^/]+/([^,]+), PAYABLE AT",
                r"^ICONN REF/[^/]+/([^/]+)/",
                r"^BY CASH DEPOSIT[^/]+/[^/]+/[^/]+/[^/]+/([^/]+)$",
                r"^SAK/CASH WDL/[^/]+/[^/]+/[^/]+/WD BY(.+)$",
                r"^BRN-CLG-CHQ PAID TO ([^ /]+)",
            ],
            "federal": [
                r"^(?:RTG|NFT|FTIMPS|IFN\/CHRG|CHRG|dd\sissue|DD:|BBYT:|TFR:?)\/?\s*:?\s*(?:IFI\/\d+\/)?([^\/,:\n]+)",
                r"^(ALLOYS?|LLP|BANK|ICICI|SBI|HDFC|PAYMENT?|Pymt|SELF)$",
                r'^(?:TFR:|ID\s*:\s*\[[^\]]*\]\s*:|BillId\s*:\s*\[[^\]]*\]\s*:)\s*"?([^",:\n/]+?)"?$',
                r"^FT?\s*IMPS\/IFI\/\d+\/([^\/]+)\/SUPP",
            ],
            "indian": [
                # UPI generic
                r'^[^"/]+/([^/]+?)/XXXXX',
                # /Pay/<Name> extraction (TO/FROM variants)
                r'^TRANSFER (?:TO|FROM) \d+ [^/]*?/P[Aa]y/([^/\r\n"]+?)\s*(?:/|\r|\n|$)',
                # /Pay/<Name> after IMPS/P2A/... (more structured)
                r"^TRANSFER (?:TO|FROM) \d+ [^/]*?/IMPS/P2A/\d+/ /P[Aa]y/([^/]+?)\s*/BRANCH",
                # Fallback: extract mobile/account number after "TRANSFER TO"
                r"^TRANSFER TO (\d{8,15})",
                r"Paid to SELF /BRANCH\s*:\s*([^/]+)",
            ],
            "jammu_and_kashmir_bank": [
                r"^UPI/[A-Z]+/\d+/[CD]R/([^/]+)/P2M",  # UPI
                r"^NEFT-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])",  # NEFT
                r"^RTGS-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])",  # RTGS
                r"^mTFR/\d+/([A-Za-z][A-Za-z\s]*[A-Za-z])",  # IMPS/mTFR
            ],
        }

    def extract_counterparty_name(self, description: str) -> str:
        """
        Extracts the party name from a bank transaction description using bank-specific patterns.
        Returns None if it can't confidently extract a party name.
        """
        if not isinstance(description, str) or not description.strip():
            return None

        # Get patterns for the selected bank preset
        patterns = self.bank_patterns.get(
            self.bank_preset, self.bank_patterns["generic"]
        )
        for pat in patterns:
            description = re.sub(r"\s+", " ", description).strip()
            m = re.match(pat, description, flags=re.IGNORECASE)
            if m:
                print(m)
                return m.group(1).strip()

        return None

    def find_similar_names(self, names, threshold):
        name_counts = Counter(names)
        unique_names = list(name_counts.keys())

        # Filter out very short names and common noise patterns
        filtered_names = []
        for name in unique_names:
            if self._is_valid_name_for_matching(name):
                filtered_names.append(name)

        unique_names = filtered_names

        # First pass: group by case-insensitive matching
        case_groups = {}
        for name in unique_names:
            key = name.lower().strip()
            if key not in case_groups:
                case_groups[key] = []
            case_groups[key].append(name)

        # Merge case variants and update counts
        merged_names = []
        merged_counts = Counter()

        for group in case_groups.values():
            # Use the most frequent variant, or first alphabetically if tied
            representative = max(
                group, key=lambda x: (name_counts[x], -ord(x[0]) if x else 0)
            )
            merged_names.append(representative)
            # Sum counts for all variants
            merged_counts[representative] = sum(name_counts[name] for name in group)

        # ULTRA-OPTIMIZED: Multi-stage filtering for maximum performance
        clusters = []
        cluster_scores = []
        clustered = set()

        # Sort by frequency to process most common names first (better clustering)
        merged_names.sort(key=lambda x: merged_counts[x], reverse=True)

        # OPTIMIZATION 0: For very large datasets, use aggressive pre-filtering
        if len(merged_names) > 5000:
            # Only process names that appear more than once (likely to have variations)
            high_frequency_names = [
                name for name in merged_names if merged_counts[name] > 1
            ]
            # Plus top 1000 most frequent names regardless of count
            top_names = merged_names[:1000]
            merged_names = list(set(high_frequency_names + top_names))
            merged_names.sort(key=lambda x: merged_counts[x], reverse=True)

        # OPTIMIZATION 1: Pre-filter by length similarity (much faster than fuzzy matching)
        def length_filter(name1, name2, max_length_diff=10):
            return abs(len(name1) - len(name2)) <= max_length_diff

        # OPTIMIZATION 2: Pre-filter by first character (instant elimination)
        def first_char_groups(names):
            groups = {}
            for name in names:
                first_char = name[0].upper() if name else ""
                if first_char not in groups:
                    groups[first_char] = []
                groups[first_char].append(name)
            return groups

        # Group names by first character for faster processing
        char_groups = first_char_groups(merged_names)

        # Progress reporting for large datasets
        total_to_process = len(merged_names)
        processed = 0

        for name in merged_names:
            if name in clustered:
                continue

            cluster = [name]
            scores = {name: 100}  # Perfect match with itself
            clustered.add(name)

            # OPTIMIZATION 3: Only compare with names starting with same or similar characters
            first_char = name[0].upper() if name else ""
            potential_candidates = []

            # Include same first character
            if first_char in char_groups:
                potential_candidates.extend(char_groups[first_char])

            # Include similar first characters (common variations)
            similar_chars = {
                "A": ["E"],
                "E": ["A"],
                "I": ["Y"],
                "Y": ["I"],
                "C": ["K"],
                "K": ["C"],
                "S": ["Z"],
                "Z": ["S"],
            }
            if first_char in similar_chars:
                for similar_char in similar_chars[first_char]:
                    if similar_char in char_groups:
                        potential_candidates.extend(char_groups[similar_char])

            # Filter out already clustered names and apply length filter
            candidates = [
                n
                for n in potential_candidates
                if n not in clustered and n != name and length_filter(name, n)
            ]

            if not candidates:
                continue

            # OPTIMIZATION 4: Use process.extract with limited candidates
            matches = process.extract(
                name,
                candidates,
                scorer=fuzz.token_set_ratio,  # Single best algorithm
                limit=min(20, len(candidates)),  # Further reduced limit for speed
            )

            # OPTIMIZATION 5: Early termination - stop after finding good matches
            good_matches = 0
            for match_name, score in matches:
                if score >= threshold and self._should_match_names(
                    name, match_name, score
                ):
                    cluster.append(match_name)
                    scores[match_name] = score
                    clustered.add(match_name)
                    good_matches += 1

                    # Early termination: stop after finding 10 good matches
                    if good_matches >= 10:
                        break

            # Only keep clusters with meaningful matches
            if len(cluster) > 1:
                clusters.append(cluster)
                cluster_scores.append(scores)

            # Update progress
            processed += 1
            if hasattr(self, "_progress_callback") and processed % 50 == 0:
                self._progress_callback(
                    processed, total_to_process, "Finding similar names"
                )

        return clusters, merged_counts, cluster_scores

    def _is_valid_name_for_matching(self, name):
        """Filter out names that shouldn't be included in fuzzy matching"""
        if not name or len(name.strip()) < 3:
            return False

        name_clean = name.strip().upper()

        # Skip common noise patterns
        noise_patterns = [
            r"^[0-9]+$",  # Pure numbers
            r"^[A-Z]{1,2}[0-9]+$",  # Account numbers like A123, AB456
            r"^ATM",  # ATM transactions
            r"^CASH",  # Cash transactions
            r"^CHQ",  # Cheque transactions
            r"^CHRG",  # Charges
            r"^FEE",  # Fees
            r"^INTEREST",  # Interest
        ]

        for pattern in noise_patterns:
            if re.match(pattern, name_clean):
                return False

        return True

    def _should_match_names(self, name1, name2, score):
        """Enhanced logic to allow partial and hierarchical name matching."""
        name1_clean = name1.strip().upper()
        name2_clean = name2.strip().upper()

        # Check if one name is a substring of the other
        if name1_clean in name2_clean or name2_clean in name1_clean:
            # Ensure non-trivial containment (not just "A" in "AXIS")
            longer = name1_clean if len(name1_clean) > len(name2_clean) else name2_clean
            shorter = (
                name2_clean if len(name1_clean) > len(name2_clean) else name1_clean
            )
            if (
                len(shorter) >= 5 and score >= 70
            ):  # Reasonable length and some similarity
                return True

        # Split names into tokens
        tokens1 = set(name1_clean.split())
        tokens2 = set(name2_clean.split())
        common_tokens = tokens1.intersection(tokens2)

        # If no common tokens, don't match regardless of fuzzy score
        if not common_tokens:
            return False

        # For single-token names, be more restrictive
        if len(tokens1) == 1 and len(tokens2) == 1:
            return score >= 92

        # Check edit distance for short names to avoid false positives
        if len(name1_clean) <= 8 or len(name2_clean) <= 8:
            # For short names, ensure they're genuinely similar, not just sharing a token
            from difflib import SequenceMatcher

            char_similarity = (
                SequenceMatcher(None, name1_clean, name2_clean).ratio() * 100
            )
            return char_similarity >= 80

        return True

    def build_entity_graph(self, df: pd.DataFrame) -> nx.Graph:
        """
        Build graph of entity-counterparty relationships using existing entity linking logic.
        Creates clean entity-counterparty mappings leveraging standardized entity names.

        Args:
            df: DataFrame with transaction data including entity_owner and counterparty columns

        Returns:
            NetworkX Graph with entities and counterparties as nodes, relationships as edges
        """
        if df.empty:
            return nx.Graph()

        # Create undirected graph for entity-counterparty relationships
        G = nx.Graph()

        # Use existing entity linking from global registry for clean mappings
        entity_mappings = self._get_standardized_entity_mappings(df)

        # Process each transaction to build relationships
        for _, row in df.iterrows():
            # Get standardized entity name using existing logic
            entity_owner = row.get("entity_owner")
            counterparty = row.get("counterparty")

            if pd.isna(entity_owner) or pd.isna(counterparty):
                continue

            # Apply standardized mappings
            std_entity = entity_mappings.get(str(entity_owner), str(entity_owner))
            std_counterparty = entity_mappings.get(str(counterparty), str(counterparty))

            # Skip self-transactions
            if std_entity == std_counterparty:
                continue

            # Add nodes with attributes
            if not G.has_node(std_entity):
                G.add_node(
                    std_entity,
                    node_type="entity",
                    original_name=str(entity_owner),
                    transaction_count=0,
                    total_volume=0.0,
                )

            if not G.has_node(std_counterparty):
                G.add_node(
                    std_counterparty,
                    node_type="counterparty",
                    original_name=str(counterparty),
                    transaction_count=0,
                    total_volume=0.0,
                )

            # Calculate transaction amount
            debit = row.get("DEBIT", 0) or 0
            credit = row.get("CREDIT", 0) or 0
            amount = float(debit) if debit else float(credit) if credit else 0.0

            # Add or update edge
            if G.has_edge(std_entity, std_counterparty):
                G[std_entity][std_counterparty]["weight"] += amount
                G[std_entity][std_counterparty]["transaction_count"] += 1
            else:
                G.add_edge(
                    std_entity, std_counterparty, weight=amount, transaction_count=1
                )

            # Update node attributes
            G.nodes[std_entity]["transaction_count"] += 1
            G.nodes[std_entity]["total_volume"] += amount
            G.nodes[std_counterparty]["transaction_count"] += 1
            G.nodes[std_counterparty]["total_volume"] += amount

        return G

    def _get_standardized_entity_mappings(self, df: pd.DataFrame) -> dict:
        """
        Helper method to get standardized entity mappings from global registry.

        Args:
            df: DataFrame with entity data

        Returns:
            Dictionary mapping original names to standardized names
        """
        mappings = {}

        # Use existing global registry for standardized mappings
        if hasattr(st.session_state, "global_entity_registry"):
            for (
                canonical_name,
                registry_entry,
            ) in st.session_state.global_entity_registry.items():
                for alias in registry_entry.get("aliases", set()):
                    mappings[alias] = canonical_name.replace("_", " ").title()

        return mappings


# ============== GRAPH NETWORK ANALYSIS FUNCTIONS ==============


def show_graph_network_analysis():
    """
    Display graph network analysis interface with tabbed layout for comprehensive
    network visualization, centrality analysis, cycle details, money flow, dashboard, and export.

    This function integrates with the existing UI framework to provide:
    - Network Overview: Main network visualization and round trip detection
    - Centrality Analysis: Entity importance and influence metrics
    - Cycle Details: Detailed cycle information in table format
    - Money Flow: Transaction flow patterns and suspicious movement analysis
    - Dashboard: Comprehensive network summary with law enforcement metrics
    - Export: Export functionality for all visualization types
    """
    st.header("🕸️ Graph Network Analysis")

    # Check if we have processed data with counterparty information
    df = st.session_state.get("df_for_merging")

    if df is None or df.empty:
        st.warning("⚠️ No processed transaction data available for graph analysis.")
        st.info(
            "💡 Please run the 'Counterparty Extraction' tab first to extract counterparty names from transaction descriptions."
        )
        return

    # Check if counterparty data is available
    if "counterparty" not in df.columns or df["counterparty"].isna().all():
        st.warning("⚠️ Counterparty data not found in processed data.")
        st.info(
            "💡 Please run the 'Counterparty Extraction' tab first to extract counterparty names from transaction descriptions."
        )
        return

    # Add entity_owner column if not present (needed for graph analysis)
    if "entity_owner" not in df.columns:
        # Try to get entity information from the analysis scope
        current_scope = st.session_state.get("analysis_scope")
        if current_scope and current_scope in st.session_state.entities:
            entity_name = st.session_state.entities[current_scope]["name"]
            df = df.copy()
            df["entity_owner"] = entity_name
            st.info(f"✅ Added entity_owner column with value: {entity_name}")
        else:
            st.warning("⚠️ Cannot determine entity owner for graph analysis.")
            st.info(
                "💡 Please select a specific entity from the analysis scope selector in the sidebar."
            )
            return

    # Import required components
    try:
        st.success("✅ All graph analysis components imported successfully")

        # Verify required columns are present
        required_columns = [
            "entity_owner",
            "counterparty",
            "DATE",
            "DESCRIPTION",
            "DEBIT",
            "CREDIT",
        ]
        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:
            st.error(
                f"❌ Missing required columns for graph analysis: {missing_columns}"
            )
            st.info(
                "The following columns are required: entity_owner, counterparty, DATE, DESCRIPTION, DEBIT, CREDIT"
            )
            return

        # Check if we have actual counterparty data
        counterparty_count = df["counterparty"].notna().sum()
        if counterparty_count == 0:
            st.warning("⚠️ No counterparty data found in the processed dataset.")
            st.info(
                "💡 Please ensure counterparty extraction was successful in the 'Counterparty Extraction' tab."
            )
            return

        st.success(
            f"✅ All required columns present with {counterparty_count} counterparty records"
        )

    except ImportError as e:
        st.error(f"❌ Error importing graph analysis components: {str(e)}")
        st.info("Please ensure all graph analysis modules are available.")
        return

    # Initialize session state for graph analysis
    if "graph_analysis_state" not in st.session_state:
        st.session_state.graph_analysis_state = {
            "last_analysis_scope": None,
            "cached_graph": None,
            "cached_results": None,
            "analysis_in_progress": False,
        }

    # Configuration section
    with st.expander("🔧 Analysis Configuration", expanded=False):
        config = show_graph_analysis_config_ui()

    # Show current configuration summary
    show_config_summary(config)

    # Analysis controls
    st.markdown("### 🎯 Analysis Controls")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        run_analysis = st.button(
            "🚀 Run Graph Analysis",
            type="primary",
            help="Perform graph-based round trip detection on the selected data",
        )

    with col2:
        force_refresh = st.button(
            "🔄 Force Refresh", help="Clear cache and re-run analysis from scratch"
        )

    with col3:
        clear_cache = st.button("🗑️ Clear Cache", help="Clear all cached analysis data")

    # Handle control actions
    if clear_cache:
        st.session_state.graph_analysis_state = {
            "last_analysis_scope": None,
            "cached_graph": None,
            "cached_results": None,
            "analysis_in_progress": False,
        }
        st.success("✅ Cache cleared successfully!")
        st.rerun()

    # Check if we need to run analysis
    current_scope = st.session_state.get("analysis_scope")
    need_analysis = (
        run_analysis
        or force_refresh
        or st.session_state.graph_analysis_state["last_analysis_scope"] != current_scope
        or st.session_state.graph_analysis_state["cached_results"] is None
    )

    if (
        need_analysis
        and not st.session_state.graph_analysis_state["analysis_in_progress"]
    ):
        st.info("🚀 Starting graph network analysis...")
        _run_graph_network_analysis(df, config)
    elif (
        need_analysis and st.session_state.graph_analysis_state["analysis_in_progress"]
    ):
        st.warning("⏳ Analysis already in progress...")

    # Create tabbed interface for different visualization types
    tabs = st.tabs(
        [
            "🕸️ Network Overview",
            "📊 Centrality Analysis",
            "🔄 Cycle Details",
            "💰 Money Flow",
            "📈 Dashboard",
            "📥 Export",
        ]
    )

    # Get results for display in tabs
    results = st.session_state.graph_analysis_state.get("cached_results")
    graph = st.session_state.graph_analysis_state.get("cached_graph")

    # Network Overview Tab - Preserve existing network visualization
    with tabs[0]:
        st.markdown("### 🕸️ Network Overview")
        if results is not None:
            _display_network_overview_tab(results, config, graph)
        else:
            st.info("🔄 Please run the graph analysis to view network overview.")

    # Centrality Analysis Tab - Placeholder for future implementation
    with tabs[1]:
        st.markdown("### 📊 Centrality Analysis")
        if results is not None:
            _display_centrality_analysis_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view centrality analysis.")

    # Cycle Details Tab - Placeholder for future implementation
    with tabs[2]:
        st.markdown("### 🔄 Cycle Details")
        if results is not None:
            _display_cycle_details_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view cycle details.")

    # Money Flow Tab - Placeholder for future implementation
    with tabs[3]:
        st.markdown("### 💰 Money Flow Analysis")
        if results is not None:
            _display_money_flow_tab(results, config, graph)
        else:
            st.info("🔄 Please run the graph analysis to view money flow analysis.")

    # Dashboard Tab - Placeholder for future implementation
    with tabs[4]:
        st.markdown("### 📈 Network Dashboard")
        if results is not None:
            _display_dashboard_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view dashboard.")

    # Export Tab
    with tabs[5]:
        st.markdown("### 📥 Export Analysis Results")
        if results is not None:
            _handle_export_results(results, config)
        else:
            st.info("🔄 Please run the graph analysis to export results.")


def _display_network_overview_tab(results, config, graph):
    """
    Display the Network Overview tab with the existing network visualization.
    This preserves the current functionality in the first tab.
    """
    # This contains the existing display logic from _display_graph_analysis_results
    _display_graph_analysis_results(results, config)


def _display_centrality_analysis_tab(results, config):
    """
    Display centrality analysis visualization tab.
    Shows betweenness, PageRank, and degree centrality metrics with top entities ranked by combined centrality scores.
    """
    if not results.centrality_metrics:
        st.warning(
            "⚠️ No centrality metrics available. Please ensure centrality analysis is enabled in configuration."
        )
        return

    st.markdown("#### 📊 Entity Centrality Analysis")
    st.markdown(
        "Centrality analysis identifies the most important entities in the network based on their connectivity and influence."
    )

    # Create NetworkVisualizer instance for centrality visualization
    try:
        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Create centrality visualization using NetworkVisualizer method
        centrality_fig = visualizer.create_centrality_visualization(
            centrality_data=results.centrality_metrics, top_n=20
        )

        # Display the centrality visualization
        st.plotly_chart(centrality_fig, use_container_width=True)

    except Exception as e:
        st.error(f"❌ Error creating centrality visualization: {str(e)}")
        st.info("Falling back to basic centrality data display...")

    # Display top entities ranked by combined centrality scores
    st.markdown("#### 🏆 Top Entities by Combined Centrality Score")

    # Calculate combined centrality scores
    entity_scores = []
    for entity, metrics in results.centrality_metrics.items():
        betweenness = metrics.get("betweenness", 0)
        pagerank = metrics.get("pagerank", 0)
        degree = metrics.get("total_degree", 0)

        # Normalize degree by total number of entities for fair comparison
        max_degree = (
            max([m.get("total_degree", 0) for m in results.centrality_metrics.values()])
            or 1
        )
        normalized_degree = degree / max_degree

        # Combined score (weighted average)
        combined_score = (
            (betweenness * 0.4) + (pagerank * 0.4) + (normalized_degree * 0.2)
        )

        entity_scores.append(
            {
                "Entity": entity,
                "Betweenness Centrality": f"{betweenness:.4f}",
                "PageRank Centrality": f"{pagerank:.4f}",
                "Degree Centrality": degree,
                "Combined Score": f"{combined_score:.4f}",
            }
        )

    # Sort by combined score and display top entities
    entity_scores.sort(key=lambda x: float(x["Combined Score"]), reverse=True)

    # Display top 15 entities in a table
    top_entities_df = pd.DataFrame(entity_scores[:15])
    st.dataframe(top_entities_df, use_container_width=True)

    # Show interpretation guide
    with st.expander("📖 Understanding Centrality Metrics", expanded=False):
        st.markdown("""
        **Centrality Metrics Explained:**
        
        - **Betweenness Centrality**: Measures how often an entity acts as a bridge between other entities. High values indicate entities that control information or transaction flow.
        
        - **PageRank Centrality**: Measures the importance of an entity based on the importance of entities connected to it. High values indicate influential entities in the network.
        
        - **Degree Centrality**: Simply counts the number of direct connections. High values indicate entities with many direct relationships.
        
        - **Combined Score**: A weighted average of all centrality measures, providing an overall importance ranking.
        
        **Law Enforcement Relevance:**
        - High centrality entities may be key players in money laundering networks
        - Entities with high betweenness centrality could be intermediaries or money brokers
        - High PageRank entities might be influential figures in criminal networks
        """)

    # Additional metrics summary
    st.markdown("#### 📈 Centrality Analysis Summary")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        total_entities = len(results.centrality_metrics)
        st.metric("Total Entities", total_entities)

    with col2:
        # Count high centrality entities (combined score > 0.5)
        high_centrality_count = sum(
            1 for scores in entity_scores if float(scores["Combined Score"]) > 0.5
        )
        st.metric("High Centrality Entities", high_centrality_count)

    with col3:
        # Average betweenness centrality
        avg_betweenness = np.mean(
            [
                metrics.get("betweenness", 0)
                for metrics in results.centrality_metrics.values()
            ]
        )
        st.metric("Avg Betweenness", f"{avg_betweenness:.4f}")

    with col4:
        # Average PageRank
        avg_pagerank = np.mean(
            [
                metrics.get("pagerank", 0)
                for metrics in results.centrality_metrics.values()
            ]
        )
        st.metric("Avg PageRank", f"{avg_pagerank:.4f}")


def _display_cycle_details_tab(results, config):
    """
    Display cycle details table visualization tab.
    Shows cycle ID, path, amounts, duration, confidence, and type with sorting and filtering capabilities.
    """
    if not results.detected_cycles:
        st.warning("⚠️ No round trip cycles detected in the current analysis.")
        st.info(
            "💡 Try adjusting the analysis configuration to detect more cycles, or ensure your data contains potential round trip patterns."
        )
        return

    st.markdown("#### 🔄 Detected Round Trip Cycles")
    st.markdown(
        f"Found **{len(results.detected_cycles)}** round trip cycles in the network analysis."
    )

    # Create NetworkVisualizer instance for cycle details table
    try:
        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Create cycle details table using NetworkVisualizer method
        cycle_table_fig = visualizer.create_cycle_details_table(results.detected_cycles)

        # Display the cycle details table
        st.plotly_chart(cycle_table_fig, use_container_width=True)

    except Exception as e:
        st.error(f"❌ Error creating cycle details table: {str(e)}")
        st.info("Falling back to basic cycle data display...")

        # Fallback: Create a basic table using Streamlit's dataframe
        _display_fallback_cycle_table(results.detected_cycles)

    # Add filtering and sorting controls
    st.markdown("#### 🔍 Filter and Sort Cycles")

    col1, col2, col3 = st.columns(3)

    with col1:
        # Filter by minimum amount
        min_amount = st.number_input(
            "Minimum Amount (₹)",
            min_value=0.0,
            value=0.0,
            step=1000.0,
            help="Filter cycles by minimum total amount",
        )

    with col2:
        # Filter by cycle type
        cycle_types = list(set(cycle.cycle_type for cycle in results.detected_cycles))
        selected_types = st.multiselect(
            "Cycle Types",
            options=cycle_types,
            default=cycle_types,
            help="Filter cycles by type",
        )

    with col3:
        # Sort options
        sort_options = {
            "Total Amount (High to Low)": ("total_amount", False),
            "Total Amount (Low to High)": ("total_amount", True),
            "Duration (Shortest First)": ("duration_days", True),
            "Duration (Longest First)": ("duration_days", False),
            "Confidence (High to Low)": ("confidence_score", False),
            "Confidence (Low to High)": ("confidence_score", True),
        }

        sort_choice = st.selectbox(
            "Sort By",
            options=list(sort_options.keys()),
            index=0,
            help="Sort cycles by selected criteria",
        )

    # Apply filters and sorting
    filtered_cycles = []
    for cycle in results.detected_cycles:
        # Apply amount filter
        if cycle.total_amount < min_amount:
            continue

        # Apply type filter
        if cycle.cycle_type not in selected_types:
            continue

        filtered_cycles.append(cycle)

    # Apply sorting
    sort_attr, ascending = sort_options[sort_choice]
    filtered_cycles.sort(key=lambda x: getattr(x, sort_attr), reverse=not ascending)

    # Display filtered results summary
    if len(filtered_cycles) != len(results.detected_cycles):
        st.info(
            f"📊 Showing {len(filtered_cycles)} of {len(results.detected_cycles)} cycles after filtering"
        )

    # Create detailed cycle information display
    if filtered_cycles:
        st.markdown("#### 📋 Detailed Cycle Information")

        # Create expandable sections for each cycle
        for i, cycle in enumerate(
            filtered_cycles[:20]
        ):  # Limit to first 20 for performance
            with st.expander(
                f"🔄 Cycle {i + 1}: {' → '.join(cycle.path[:3])}{'...' if len(cycle.path) > 3 else ''} (₹{cycle.total_amount:,.0f})",
                expanded=False,
            ):
                # Create columns for cycle details
                detail_col1, detail_col2 = st.columns(2)

                with detail_col1:
                    st.markdown("**Cycle Information:**")
                    st.write(f"• **ID:** RT-{i + 1:03d}")
                    st.write(f"• **Type:** {cycle.cycle_type.title()}")
                    st.write(f"• **Total Amount:** ₹{cycle.total_amount:,.2f}")
                    st.write(f"• **Net Flow:** ₹{cycle.net_flow:,.2f}")
                    st.write(f"• **Duration:** {cycle.duration_days} days")
                    st.write(f"• **Confidence:** {cycle.confidence_score:.3f}")

                with detail_col2:
                    st.markdown("**Transaction Path:**")
                    path_display = " → ".join(cycle.path)
                    st.write(f"• **Full Path:** {path_display}")
                    st.write(f"• **Path Length:** {len(cycle.path)} entities")

                    # Show risk indicators
                    risk_level = (
                        "🔴 High"
                        if cycle.confidence_score > 0.8
                        else "🟡 Medium"
                        if cycle.confidence_score > 0.5
                        else "🟢 Low"
                    )
                    st.write(f"• **Risk Level:** {risk_level}")

                # In/Out Analysis
                if cycle.transactions:
                    st.markdown("**💰 In/Out Analysis:**")

                    # Calculate in/out amounts and timing
                    first_tx = cycle.transactions[0]
                    last_tx = cycle.transactions[-1]
                    out_amount = first_tx["amount"]
                    in_amount = last_tx["amount"]
                    out_time = first_tx["date"]
                    in_time = last_tx["date"]

                    # Calculate percentage difference
                    if out_amount > 0:
                        percentage_diff = ((in_amount - out_amount) / out_amount) * 100
                    else:
                        percentage_diff = 0

                    # Calculate time difference
                    time_diff = (in_time - out_time).total_seconds()
                    time_diff_days = time_diff / (24 * 3600)

                    in_out_col1, in_out_col2, in_out_col3 = st.columns(3)

                    with in_out_col1:
                        st.write(f"• **Out:** ₹{out_amount:,.0f}")
                        st.write(
                            f"• **Out Time:** {out_time.strftime('%Y-%m-%d %H:%M')}"
                        )

                    with in_out_col2:
                        st.write(f"• **In:** ₹{in_amount:,.0f}")
                        st.write(f"• **In Time:** {in_time.strftime('%Y-%m-%d %H:%M')}")

                    with in_out_col3:
                        st.write(f"• **Difference:** {percentage_diff:+.1f}%")
                        if time_diff_days >= 1:
                            time_display = f"{time_diff_days:.1f} days"
                        else:
                            time_display = f"{time_diff_days * 24:.1f} hours"
                        st.write(f"• **Duration:** {time_display}")

                # Additional analysis if available
                if hasattr(cycle, "transaction_details") and cycle.transaction_details:
                    st.markdown("**Transaction Details:**")
                    # Display transaction details in a small table
                    details_df = pd.DataFrame(cycle.transaction_details)
                    st.dataframe(details_df, use_container_width=True, height=150)

    # Cycle analysis summary
    st.markdown("#### 📈 Cycle Analysis Summary")

    if filtered_cycles:
        summary_col1, summary_col2, summary_col3, summary_col4 = st.columns(4)

        with summary_col1:
            total_cycles = len(filtered_cycles)
            st.metric("Filtered Cycles", total_cycles)

        with summary_col2:
            total_amount = sum(cycle.total_amount for cycle in filtered_cycles)
            st.metric("Total Amount", f"₹{total_amount:,.0f}")

        with summary_col3:
            avg_confidence = np.mean(
                [cycle.confidence_score for cycle in filtered_cycles]
            )
            st.metric("Avg Confidence", f"{avg_confidence:.3f}")

        with summary_col4:
            avg_duration = np.mean([cycle.duration_days for cycle in filtered_cycles])
            st.metric("Avg Duration", f"{avg_duration:.1f} days")

    # Show interpretation guide
    with st.expander("📖 Understanding Cycle Analysis", expanded=False):
        st.markdown("""
        **Round Trip Cycle Analysis Explained:**
        
        - **Cycle ID**: Unique identifier for each detected cycle (RT-001, RT-002, etc.)
        - **Path**: The sequence of entities involved in the round trip transaction flow
        - **Total Amount**: Sum of all transaction amounts in the cycle
        - **Net Flow**: The net amount that flows through the cycle (should be close to zero for true round trips)
        - **Duration**: Time span from the first to last transaction in the cycle
        - **Confidence Score**: Algorithm confidence in the cycle detection (0.0 to 1.0)
        - **Type**: Classification of the cycle pattern (e.g., simple, complex, layered)
        
        **Law Enforcement Relevance:**
        - High-confidence cycles with large amounts may indicate money laundering
        - Short-duration cycles could suggest rapid movement to avoid detection
        - Complex paths might indicate sophisticated layering techniques
        - Multiple cycles involving the same entities could indicate systematic criminal activity
        """)


def _display_fallback_cycle_table(cycles):
    """
    Fallback function to display cycle details using Streamlit's basic dataframe when NetworkVisualizer fails.
    """
    # Prepare data for basic table display
    cycle_data = []

    for i, cycle in enumerate(cycles):
        cycle_data.append(
            {
                "ID": f"RT-{i + 1:03d}",
                "Path": " → ".join(cycle.path),
                "Total Amount": f"₹{cycle.total_amount:,.2f}",
                "Net Flow": f"₹{cycle.net_flow:,.2f}",
                "Duration": f"{cycle.duration_days} days",
                "Confidence": f"{cycle.confidence_score:.3f}",
                "Type": cycle.cycle_type.title(),
            }
        )

    # Create DataFrame and display
    cycles_df = pd.DataFrame(cycle_data)
    st.dataframe(cycles_df, use_container_width=True)


def _display_money_flow_tab(results, config, graph):
    """
    Display money flow analysis visualization tab.
    Shows transaction flow direction with arrows, edge thickness based on volume,
    color coding for timing patterns, and temporal flow analysis with animation.
    """
    st.markdown("#### 💰 Money Flow Analysis")
    st.markdown(
        "Analyze transaction flows over time to identify rapid movement patterns, "
        "smurfing indicators, and temporal sequences that may indicate suspicious activity."
    )

    if not graph or graph.number_of_edges() == 0:
        st.warning("⚠️ No transaction network available for money flow analysis.")
        return

    # Create NetworkVisualizer instance for flow visualization
    try:
        from datetime import datetime, timedelta

        import pandas as pd

        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Show basic flow information
        st.markdown("#### 📊 Flow Summary")
        col1, col2, col3, col4 = st.columns(4)

        total_edges = graph.number_of_edges()
        total_volume = sum(
            d.get("total_amount", 0) for _, _, d in graph.edges(data=True)
        )
        rapid_cycles = (
            len([c for c in results.detected_cycles if c.duration_days <= 7])
            if results.detected_cycles
            else 0
        )

        with col1:
            st.metric("Transaction Relationships", total_edges)
        with col2:
            st.metric("Total Volume", f"₹{total_volume:,.0f}")
        with col3:
            st.metric(
                "Detected Cycles",
                len(results.detected_cycles) if results.detected_cycles else 0,
            )
        with col4:
            st.metric("Rapid Cycles (≤7 days)", rapid_cycles)

        # Temporal Flow Analysis Section
        st.markdown("#### ⏰ Temporal Flow Analysis")

        # Temporal analysis controls
        col1, col2 = st.columns(2)

        with col1:
            st.markdown("**Time Period Filter**")
            # Get date range from graph data
            all_dates = []
            for _, _, data in graph.edges(data=True):
                if "first_transaction" in data and pd.notna(data["first_transaction"]):
                    all_dates.append(pd.to_datetime(data["first_transaction"]))
                if "last_transaction" in data and pd.notna(data["last_transaction"]):
                    all_dates.append(pd.to_datetime(data["last_transaction"]))

            if all_dates:
                min_date = min(all_dates).date()
                max_date = max(all_dates).date()

                date_range = st.date_input(
                    "Select date range for analysis",
                    value=(min_date, max_date),
                    min_value=min_date,
                    max_value=max_date,
                    help="Filter transactions to analyze specific time periods",
                )

                if isinstance(date_range, tuple) and len(date_range) == 2:
                    time_filter_start = datetime.combine(
                        date_range[0], datetime.min.time()
                    )
                    time_filter_end = datetime.combine(
                        date_range[1], datetime.max.time()
                    )
                else:
                    time_filter_start = None
                    time_filter_end = None
            else:
                st.info("No temporal data available in the transaction network.")
                time_filter_start = None
                time_filter_end = None

        with col2:
            st.markdown("**Analysis Parameters**")
            velocity_threshold = st.slider(
                "Velocity Threshold (transactions/day)",
                min_value=0.1,
                max_value=5.0,
                value=1.0,
                step=0.1,
                help="Highlight sequences with transaction velocity above this threshold",
            )

            animation_mode = st.selectbox(
                "Animation Mode",
                options=["sequence", "continuous"],
                index=0,
                help="Choose how temporal flows are animated",
            )

        # Create temporal flow visualization
        if st.button("🎬 Generate Temporal Flow Animation", type="primary"):
            with st.spinner("Creating temporal flow analysis..."):
                try:
                    temporal_fig = visualizer.create_temporal_flow_animation(
                        graph=graph,
                        cycles=results.detected_cycles or [],
                        time_filter_start=time_filter_start,
                        time_filter_end=time_filter_end,
                        velocity_threshold=velocity_threshold,
                        animation_mode=animation_mode,
                        title="Temporal Transaction Flow Analysis",
                    )

                    st.plotly_chart(temporal_fig, use_container_width=True)

                    # Show analysis insights
                    st.markdown("#### 🔍 Analysis Insights")

                    if temporal_fig.frames:
                        st.success(
                            f"✅ Created temporal animation with {len(temporal_fig.frames)} time periods"
                        )

                        # Show rapid sequence warnings if any
                        if rapid_cycles > 0:
                            st.warning(
                                f"⚠️ **{rapid_cycles} rapid cycles detected** (≤7 days duration)\n\n"
                                "These may indicate potential smurfing or layering activities. "
                                "Use the animation controls to examine the timing and sequence of these transactions."
                            )

                        # Usage instructions
                        with st.expander(
                            "📖 How to Use Temporal Analysis", expanded=False
                        ):
                            st.markdown("""
                            **Animation Controls:**
                            - **Play Button**: Start the temporal animation to see transactions unfold over time
                            - **Time Slider**: Jump to specific time periods or scrub through the timeline
                            - **Pause Button**: Stop the animation at any point for detailed examination
                            
                            **Visual Indicators:**
                            - **Blue Lines**: Normal transaction flows
                            - **Red Dashed Lines**: Rapid sequences (potential smurfing indicators)
                            - **Node Size**: Larger nodes indicate higher activity in the current time period
                            - **Node Brightness**: Brighter nodes are active in the current time period
                            
                            **Investigation Tips:**
                            - Look for rapid sequences of transactions between the same entities
                            - Pay attention to timing patterns that suggest coordinated activity
                            - Use the time filter to focus on specific suspicious periods
                            - Adjust velocity threshold to highlight different levels of activity
                            """)
                    else:
                        st.info(
                            "No temporal patterns found in the selected time range."
                        )

                except Exception as e:
                    st.error(f"❌ Error creating temporal flow analysis: {str(e)}")
                    st.info(
                        "Please check that your transaction data includes valid date information."
                    )

    except ImportError as e:
        st.error(f"❌ Error importing visualization components: {str(e)}")
        st.info("Please ensure all required visualization modules are available.")
    except Exception as e:
        st.error(f"❌ Unexpected error in money flow analysis: {str(e)}")

        # Fallback to basic flow information
        st.markdown("#### Basic Flow Information")
        total_edges = graph.number_of_edges()
        total_volume = sum(
            d.get("total_amount", 0) for _, _, d in graph.edges(data=True)
        )
        st.metric("Total Transaction Relationships", total_edges)
        st.metric("Total Transaction Volume", f"₹{total_volume:,.0f}")


def _display_dashboard_tab(results, config):
    """
    Display comprehensive network dashboard tab.
    Shows network overview, cycle distribution, top entities, anomaly scores, and financial crime indicators
    in an organized, multi-panel layout with law enforcement-focused metrics.
    """
    st.markdown("#### 📈 Comprehensive Network Dashboard")
    st.markdown(
        "Overview of network analysis results including financial crime indicators and law enforcement metrics."
    )

    # Import NetworkVisualizer for dashboard creation
    try:
        # Create visualizer instance
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Get the graph from session state
        graph = st.session_state.graph_analysis_state.get("cached_graph")

        if graph is None:
            st.error(
                "❌ Graph data not available for dashboard. Please run the analysis first."
            )
            return

        # Create the dashboard visualization
        dashboard_fig = visualizer.create_network_summary_dashboard(
            graph=graph,
            cycles=results.detected_cycles,
            centrality_metrics=results.centrality_metrics,
            anomaly_scores=results.anomaly_scores,
        )

        # Display the dashboard
        st.plotly_chart(dashboard_fig, use_container_width=True)

    except ImportError as e:
        st.error(f"❌ Error importing NetworkVisualizer: {str(e)}")
        st.info("Please ensure the network_visualizer module is available.")
        return
    except Exception as e:
        st.error(f"❌ Error creating dashboard: {str(e)}")
        st.info("Falling back to basic statistics display.")

        # Fallback to basic statistics if dashboard creation fails
        _display_basic_network_statistics(results)
        return

    # Additional law enforcement-focused metrics below the main dashboard
    st.markdown("---")
    st.markdown("#### 🚨 Financial Crime Indicators")

    # Create metrics columns for law enforcement indicators
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # High-risk cycles (short duration, high amounts)
        high_risk_cycles = [
            cycle
            for cycle in results.detected_cycles
            if cycle.duration_days <= 7 and cycle.total_amount >= 100000
        ]
        st.metric(
            "High-Risk Cycles",
            len(high_risk_cycles),
            help="Cycles completed within 7 days with amounts ≥ ₹1,00,000",
        )

    with col2:
        # Suspicious velocity patterns
        rapid_cycles = [
            cycle for cycle in results.detected_cycles if cycle.duration_days <= 3
        ]
        st.metric(
            "Rapid Movement",
            len(rapid_cycles),
            help="Cycles completed within 3 days (potential smurfing)",
        )

    with col3:
        # High centrality entities (potential hubs)
        high_centrality_entities = [
            entity
            for entity, metrics in results.centrality_metrics.items()
            if (
                metrics.get("betweenness", 0) * 0.4
                + metrics.get("pagerank", 0) * 0.4
                + (
                    metrics.get("total_degree", 0)
                    / max(1, len(results.centrality_metrics))
                )
                * 0.2
            )
            > 0.5
        ]
        st.metric(
            "Hub Entities",
            len(high_centrality_entities),
            help="Entities with high combined centrality scores (>0.5)",
        )

    with col4:
        # High anomaly score entities
        high_anomaly_entities = [
            entity for entity, score in results.anomaly_scores.items() if score > 0.7
        ]
        st.metric(
            "Anomalous Entities",
            len(high_anomaly_entities),
            help="Entities with anomaly scores > 0.7",
        )

    # Detailed breakdown sections
    col_left, col_right = st.columns(2)

    with col_left:
        st.markdown("##### 🔍 Top Risk Entities")
        if results.anomaly_scores:
            # Sort entities by anomaly score
            top_anomalies = sorted(
                results.anomaly_scores.items(), key=lambda x: x[1], reverse=True
            )[:5]

            for i, (entity, score) in enumerate(top_anomalies, 1):
                # Truncate long entity names
                display_name = entity[:30] + "..." if len(entity) > 30 else entity
                st.write(f"{i}. **{display_name}** - Risk Score: {score:.3f}")
        else:
            st.info("No anomaly scores available")

    with col_right:
        st.markdown("##### 💰 Largest Cycles")
        if results.detected_cycles:
            # Sort cycles by total amount
            largest_cycles = sorted(
                results.detected_cycles, key=lambda x: x.total_amount, reverse=True
            )[:5]

            for i, cycle in enumerate(largest_cycles, 1):
                path_display = " → ".join(cycle.path[:3]) + (
                    "..." if len(cycle.path) > 3 else ""
                )
                st.write(
                    f"{i}. **₹{cycle.total_amount:,.0f}** - {path_display} ({cycle.duration_days}d)"
                )
        else:
            st.info("No cycles detected")

    # Network health indicators
    st.markdown("---")
    st.markdown("##### 📊 Network Health Indicators")

    if results.network_statistics:
        health_col1, health_col2, health_col3 = st.columns(3)

        with health_col1:
            # Network density
            total_nodes = results.network_statistics.get("total_nodes", 0)
            total_edges = results.network_statistics.get("total_edges", 0)
            max_possible_edges = (
                total_nodes * (total_nodes - 1) if total_nodes > 1 else 1
            )
            density = total_edges / max_possible_edges if max_possible_edges > 0 else 0

            st.metric(
                "Network Density",
                f"{density:.3f}",
                help="Ratio of actual edges to maximum possible edges",
            )

        with health_col2:
            # Average cycle amount
            if results.detected_cycles:
                avg_cycle_amount = sum(
                    cycle.total_amount for cycle in results.detected_cycles
                ) / len(results.detected_cycles)
                st.metric(
                    "Avg Cycle Amount",
                    f"₹{avg_cycle_amount:,.0f}",
                    help="Average amount involved in detected cycles",
                )
            else:
                st.metric("Avg Cycle Amount", "₹0", help="No cycles detected")

        with health_col3:
            # Network complexity score
            complexity_score = (
                (total_nodes / 100) * 0.3  # Node complexity
                + (total_edges / (total_nodes * 10) if total_nodes > 0 else 0)
                * 0.4  # Edge complexity
                + (len(results.detected_cycles) / 10) * 0.3  # Cycle complexity
            )
            complexity_score = min(1.0, complexity_score)  # Cap at 1.0

            st.metric(
                "Complexity Score",
                f"{complexity_score:.3f}",
                help="Overall network complexity indicator (0-1)",
            )


def _display_basic_network_statistics(results):
    """
    Display basic network statistics as fallback when dashboard creation fails.
    """
    st.markdown("#### 📊 Basic Network Statistics")

    if results.network_statistics:
        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Network Nodes", results.network_statistics.get("total_nodes", 0))
        with col2:
            st.metric("Network Edges", results.network_statistics.get("total_edges", 0))
        with col3:
            st.metric(
                "Detected Cycles",
                len(results.detected_cycles) if results.detected_cycles else 0,
            )

    # Show basic cycle information
    if results.detected_cycles:
        st.markdown("##### Recent Cycles")
        for i, cycle in enumerate(results.detected_cycles[:3], 1):
            st.write(
                f"{i}. **₹{cycle.total_amount:,.0f}** - {cycle.duration_days} days - {cycle.cycle_type}"
            )

    # Show basic centrality information
    if results.centrality_metrics:
        st.markdown("##### Top Entities by Centrality")
        top_entities = sorted(
            results.centrality_metrics.items(),
            key=lambda x: x[1].get("pagerank", 0),
            reverse=True,
        )[:3]

        for i, (entity, metrics) in enumerate(top_entities, 1):
            display_name = entity[:40] + "..." if len(entity) > 40 else entity
            pagerank = metrics.get("pagerank", 0)
            st.write(f"{i}. **{display_name}** - PageRank: {pagerank:.3f}")


def _run_graph_network_analysis(df: pd.DataFrame, config):
    """
    Execute the graph network analysis with progress tracking.

    Args:
        df: Transaction data DataFrame
        config: Analysis configuration
    """

    # Set analysis in progress
    st.session_state.graph_analysis_state["analysis_in_progress"] = True

    try:
        # Show progress
        progress_bar = st.progress(0)
        status_text = st.empty()

        status_text.text("🔨 Building transaction network...")
        progress_bar.progress(10)

        # Build transaction network
        builder = GraphNetworkBuilder()
        graph = builder.build_transaction_network(df)

        if graph.number_of_nodes() == 0:
            st.warning("⚠️ No valid transaction network could be built from the data.")
            return

        status_text.text(
            f"📊 Analyzing network ({graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges)..."
        )
        progress_bar.progress(30)

        # Add transaction metadata
        builder.add_transaction_metadata(graph, df)

        status_text.text("🔍 Detecting round trip cycles...")
        progress_bar.progress(50)

        # Detect cycles
        detector = NetworkCycleDetector()
        cycle_params = config.get_cycle_detection_params()

        detected_cycles = detector.detect_network_cycles(
            graph,
            min_length=cycle_params["min_length"],
            max_length=cycle_params["max_length"],
            min_amount=cycle_params["min_amount"],
            max_duration_days=cycle_params["max_duration_days"],
            net_flow_threshold=cycle_params["net_flow_threshold"],
        )

        status_text.text("📈 Calculating centrality metrics...")
        progress_bar.progress(70)

        # Calculate centrality metrics
        centrality_metrics = detector.calculate_centrality_metrics(graph)

        status_text.text("🎯 Identifying hub entities...")
        progress_bar.progress(80)

        # Identify hub entities
        hub_entities = detector.identify_hub_entities(
            graph,
            threshold=config.hub_centrality_threshold,
            centrality_metrics=centrality_metrics,
        )

        status_text.text("🔬 Analyzing temporal patterns...")
        progress_bar.progress(90)

        # Detect temporal patterns
        temporal_analysis = detector.detect_temporal_patterns(graph, detected_cycles)

        # Get network statistics
        network_stats = builder.get_graph_statistics(graph)
        network_stats.update(temporal_analysis)

        status_text.text("✅ Analysis complete!")
        progress_bar.progress(100)

        # Create results object
        results = NetworkAnalysisResults(
            detected_cycles=detected_cycles,
            centrality_metrics=centrality_metrics,
            hub_entities=hub_entities,
            network_statistics=network_stats,
            anomaly_scores={},  # Could be enhanced with anomaly detection
            analysis_timestamp=datetime.now(),
            configuration_used=config.to_dict(),
        )

        # Cache results
        st.session_state.graph_analysis_state.update(
            {
                "cached_graph": graph,
                "cached_results": results,
                "last_analysis_scope": st.session_state.get("analysis_scope"),
                "analysis_in_progress": False,
            }
        )

        # Clear progress indicators
        progress_bar.empty()
        status_text.empty()

        st.success(
            f"✅ Analysis completed! Found {len(detected_cycles)} round trip cycles."
        )

    except Exception as e:
        st.error(f"❌ Error during analysis: {str(e)}")
        st.session_state.graph_analysis_state["analysis_in_progress"] = False


def _display_graph_analysis_results(results, config):
    """
    Display focused analysis results showing only suspect entities and relations.

    Args:
        results: Analysis results to display
        config: Analysis configuration used
    """

    if not results.detected_cycles:
        st.info("🔍 No round trip cycles detected in the transaction data.")
        return

    # Summary of findings
    st.markdown("### 🚨 Suspicious Activity Detected")

    col1, col2 = st.columns(2)

    with col1:
        st.metric(
            "Suspect Round Trips",
            len(results.detected_cycles),
            help="High-confidence suspicious round trip patterns",
        )

    with col2:
        total_volume = sum(cycle.total_amount for cycle in results.detected_cycles)
        st.metric(
            "Total Suspect Volume",
            f"₹{total_volume:,.0f}",
            help="Combined volume in suspicious cycles",
        )

    # Get suspect entities involved in cycles
    suspect_entities = set()
    for cycle in results.detected_cycles:
        suspect_entities.update(cycle.path)

    # Show suspect entities with their involvement
    st.markdown("### 🎯 Suspect Entities")

    entity_data = []
    for entity in suspect_entities:
        cycles_involved = [c for c in results.detected_cycles if entity in c.path]
        print("\n-----\n".join([str(c) for c in cycles_involved]))
        total_entity_volume = sum(c.total_amount for c in cycles_involved)
        avg_confidence = sum(c.confidence_score for c in cycles_involved) / len(
            cycles_involved
        )

        entity_data.append(
            {
                "Entity": entity,
                "Cycles Involved": len(cycles_involved),
                "Total Volume": f"₹{total_entity_volume:,.0f}",
                "Avg Confidence": f"{avg_confidence:.2f}",
                "Risk Level": "🔴 High" if avg_confidence >= 0.9 else "🟡 Medium",
            }
        )

    # Sort by involvement and display
    entity_data.sort(key=lambda x: x["Cycles Involved"], reverse=True)
    entity_df = pd.DataFrame(entity_data)
    st.dataframe(entity_df, use_container_width=True)

    # Show suspect cycles
    st.markdown("### 🔄 Suspect Round Trip Patterns")

    for i, cycle in enumerate(
        results.detected_cycles[:10]
    ):  # Show top 10 most suspicious
        with st.expander(
            f"🚨 RT-{i + 1:03d}: {' → '.join(cycle.path[:3])}{'...' if len(cycle.path) > 3 else ''} (₹{cycle.total_amount:,.0f})"
        ):
            # Calculate in/out amounts and timing
            if cycle.transactions:
                # First transaction (money going out from origin)
                first_tx = cycle.transactions[0]
                out_amount = first_tx["amount"]
                out_time = first_tx["date"]

                # Last transaction (money coming back to origin)
                last_tx = cycle.transactions[-1]
                in_amount = last_tx["amount"]
                in_time = last_tx["date"]

                # Calculate percentage difference
                if out_amount > 0:
                    percentage_diff = ((in_amount - out_amount) / out_amount) * 100
                else:
                    percentage_diff = 0

                # Calculate time difference
                time_diff = (in_time - out_time).total_seconds()
                time_diff_days = time_diff / (24 * 3600)
                time_diff_hours = (time_diff % (24 * 3600)) / 3600
                time_diff_minutes = (time_diff % 3600) / 60

            # Top row metrics
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric("Confidence Score", f"{cycle.confidence_score:.2f}")

            with col2:
                st.metric("Cycle Length", len(cycle.path))

            with col3:
                st.metric("Total Amount", f"₹{cycle.total_amount:,.0f}")

            with col4:
                st.metric("Net Flow", f"₹{cycle.net_flow:,.0f}")

            # In/Out Analysis
            if cycle.transactions:
                st.markdown("**💰 In/Out Analysis:**")

                in_out_col1, in_out_col2, in_out_col3 = st.columns(3)

                with in_out_col1:
                    st.metric(
                        "Amount Out",
                        f"₹{out_amount:,.0f}",
                        help="Initial amount leaving the origin entity",
                    )

                with in_out_col2:
                    st.metric(
                        "Amount In",
                        f"₹{in_amount:,.0f}",
                        help="Final amount returning to the origin entity",
                    )

                with in_out_col3:
                    diff_color = "normal"
                    if percentage_diff > 5:
                        diff_color = "inverse"  # Red for gains
                    elif percentage_diff < -5:
                        diff_color = "off"  # Gray for losses

                    st.metric(
                        "Difference",
                        f"{percentage_diff:+.1f}%",
                        delta=f"₹{in_amount - out_amount:+,.0f}",
                        help="Percentage and absolute difference between in and out amounts",
                    )

                # Timing Analysis
                st.markdown("**⏱️ Timing Analysis:**")

                timing_col1, timing_col2, timing_col3 = st.columns(3)

                with timing_col1:
                    st.write(f"**Out Time:** {out_time.strftime('%Y-%m-%d %H:%M:%S')}")

                with timing_col2:
                    st.write(f"**In Time:** {in_time.strftime('%Y-%m-%d %H:%M:%S')}")

                with timing_col3:
                    if time_diff_days >= 1:
                        time_display = f"{time_diff_days:.1f} days"
                    elif time_diff_hours >= 1:
                        time_display = f"{time_diff_hours:.1f} hours"
                    else:
                        time_display = f"{time_diff_minutes:.0f} minutes"

                    st.write(f"**Duration:** {time_display}")

            # Show full path
            st.markdown("**🔄 Transaction Path:**")
            path_display = " → ".join(cycle.path)
            st.code(path_display, language=None)

            # Show detailed transaction flow
            if (
                cycle.transactions and len(cycle.transactions) <= 10
            ):  # Only show for shorter cycles
                st.markdown("**📊 Transaction Details:**")

                tx_data = []
                for j, tx in enumerate(cycle.transactions):
                    tx_data.append(
                        {
                            "Step": j + 1,
                            "From": tx["source"],
                            "To": tx["target"],
                            "Amount": f"₹{tx['amount']:,.0f}",
                            "Date": tx["date"].strftime("%Y-%m-%d %H:%M"),
                            "Type": tx["transaction_type"],
                        }
                    )

                tx_df = pd.DataFrame(tx_data)
                st.dataframe(tx_df, use_container_width=True, hide_index=True)

    # Network visualization focused on suspect entities only
    st.markdown("### 🕸️ Suspect Entity Network")

    graph = st.session_state.graph_analysis_state.get("cached_graph")

    if graph is not None:
        # Create subgraph with only suspect entities and their direct connections
        visualizer = NetworkVisualizer()

        VisualizationConfig(
            highlight_cycles=True,
            show_labels=True,
            node_size_range=(20, 80),
            edge_width_range=(2.0, 10.0),
        )

        # Create focused network visualization
        network_fig = visualizer.create_entity_network_visualization(
            graph=graph,
            cycles=results.detected_cycles,
            centrality_metrics=results.centrality_metrics,
            title=f"Suspect Entity Network - {len(results.detected_cycles)} Suspicious Patterns",
        )

        st.plotly_chart(network_fig, use_container_width=True, height=600)

    else:
        st.error("❌ Network graph not available. Please re-run the analysis.")


def _display_cycle_drill_down(cycle):
    """
    Display detailed drill-down information for a selected cycle.

    Args:
        cycle: The cycle to display details for
    """
    st.markdown(f"##### Round Trip Details: {' → '.join(cycle.path)}")

    # Cycle summary
    summary_col1, summary_col2, summary_col3 = st.columns(3)

    with summary_col1:
        st.metric("Total Amount", f"₹{cycle.total_amount:,.2f}")
        st.metric("Net Flow", f"₹{cycle.net_flow:,.2f}")

    with summary_col2:
        st.metric("Duration", f"{cycle.duration_days} days")
        st.metric("Confidence Score", f"{cycle.confidence_score:.3f}")

    with summary_col3:
        st.metric("Cycle Type", cycle.cycle_type.title())
        st.metric(
            "Cycle Length", getattr(cycle, "cycle_length", len(set(cycle.path)) - 1)
        )

    # In/Out Analysis for drill-down
    if hasattr(cycle, "transactions") and cycle.transactions:
        st.markdown("##### 💰 In/Out Flow Analysis")

        # Calculate in/out amounts and timing
        first_tx = cycle.transactions[0]
        last_tx = cycle.transactions[-1]

        # Handle both dict and object formats
        if isinstance(first_tx, dict):
            out_amount = first_tx.get("amount", 0)
            out_time = first_tx.get("date")
            in_amount = last_tx.get("amount", 0)
            in_time = last_tx.get("date")
        else:
            out_amount = first_tx["amount"]
            out_time = first_tx["date"]
            in_amount = last_tx["amount"]
            in_time = last_tx["date"]

        # Calculate percentage difference
        if out_amount > 0:
            percentage_diff = ((in_amount - out_amount) / out_amount) * 100
        else:
            percentage_diff = 0

        # Calculate time difference if dates are available
        time_display = "N/A"
        if out_time and in_time:
            try:
                if hasattr(out_time, "strftime") and hasattr(in_time, "strftime"):
                    time_diff = (in_time - out_time).total_seconds()
                    time_diff_days = time_diff / (24 * 3600)

                    if time_diff_days >= 1:
                        time_display = f"{time_diff_days:.1f} days"
                    else:
                        time_display = f"{time_diff_days * 24:.1f} hours"
            except:
                time_display = "N/A"

        flow_col1, flow_col2, flow_col3, flow_col4 = st.columns(4)

        with flow_col1:
            st.metric("Amount Out", f"₹{out_amount:,.0f}")

        with flow_col2:
            st.metric("Amount In", f"₹{in_amount:,.0f}")

        with flow_col3:
            st.metric(
                "Difference",
                f"{percentage_diff:+.1f}%",
                delta=f"₹{in_amount - out_amount:+,.0f}",
            )

        with flow_col4:
            st.metric("Time Span", time_display)

    # Transaction details
    st.markdown("##### 💸 Transaction Breakdown")

    if hasattr(cycle, "transactions") and cycle.transactions:
        tx_data = []
        for i, tx in enumerate(cycle.transactions):
            tx_data.append(
                {
                    "Step": i + 1,
                    "From": tx.get("source", "Unknown"),
                    "To": tx.get("target", "Unknown"),
                    "Amount": f"₹{tx.get('amount', 0):,.2f}",
                    "Date": tx.get("date", "").strftime("%Y-%m-%d")
                    if hasattr(tx.get("date"), "strftime")
                    else str(tx.get("date", "")),
                    "Type": tx.get("transaction_type", "Unknown"),
                    "ID": tx.get("transaction_id", "Unknown"),
                }
            )

        tx_df = pd.DataFrame(tx_data)
        st.dataframe(tx_df, use_container_width=True)

    else:
        st.info("Detailed transaction information not available for this cycle.")

    # Path visualization
    st.markdown("##### 🗺️ Transaction Path")

    path_text = " → ".join([f"**{entity}**" for entity in cycle.path])
    st.markdown(path_text)

    # Risk assessment
    st.markdown("##### ⚠️ Risk Assessment")

    risk_factors = []

    if cycle.confidence_score > 0.8:
        risk_factors.append("🔴 High confidence round trip pattern")
    elif cycle.confidence_score > 0.5:
        risk_factors.append("🟡 Medium confidence round trip pattern")
    else:
        risk_factors.append("🟢 Low confidence pattern")

    if cycle.duration_days <= 1:
        risk_factors.append("🔴 Very short duration (same day)")
    elif cycle.duration_days <= 7:
        risk_factors.append("🟡 Short duration (within a week)")

    if cycle.net_flow / cycle.total_amount < 0.05:
        risk_factors.append("🔴 Very low net flow (near-perfect round trip)")

    if cycle.cycle_type == "hub-mediated":
        risk_factors.append("🟡 Involves hub entity (potential facilitator)")

    for factor in risk_factors:
        st.write(factor)


def _handle_export_results(results, config):
    """
    Handle export of analysis results in various formats.

    Args:
        results: Analysis results to export
        config: Analysis configuration
    """
    st.markdown("### 📥 Export Analysis Results")

    export_col1, export_col2 = st.columns(2)

    with export_col1:
        export_format = st.selectbox(
            "Export Format",
            options=["JSON", "CSV", "Excel"],
            help="Choose the format for exporting results",
        )

    with export_col2:
        st.checkbox(
            "Include Visualizations",
            value=True,
            help="Include network visualizations in the export",
        )

    if st.button("📥 Generate Export"):
        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

            if export_format == "JSON":
                # Export as JSON
                export_data = results.to_dict()
                export_json = json.dumps(export_data, indent=2, default=str)

                st.download_button(
                    label="📥 Download JSON Results",
                    data=export_json,
                    file_name=f"graph_analysis_results_{timestamp}.json",
                    mime="application/json",
                )

            elif export_format == "CSV":
                # Export cycles as CSV
                if results.detected_cycles:
                    cycle_data = []
                    for i, cycle in enumerate(results.detected_cycles):
                        cycle_data.append(
                            {
                                "Cycle_ID": f"RT-{i + 1:03d}",
                                "Path": " → ".join(cycle.path),
                                "Total_Amount": cycle.total_amount,
                                "Net_Flow": cycle.net_flow,
                                "Duration_Days": cycle.duration_days,
                                "Confidence_Score": cycle.confidence_score,
                                "Cycle_Type": cycle.cycle_type,
                                "Cycle_Length": getattr(
                                    cycle, "cycle_length", len(set(cycle.path)) - 1
                                ),
                            }
                        )

                    cycle_df = pd.DataFrame(cycle_data)
                    csv_data = cycle_df.to_csv(index=False)

                    st.download_button(
                        label="📥 Download CSV Results",
                        data=csv_data,
                        file_name=f"graph_analysis_cycles_{timestamp}.csv",
                        mime="text/csv",
                    )
                else:
                    st.warning("No cycles to export.")

            elif export_format == "Excel":
                # Export as Excel with multiple sheets
                from io import BytesIO

                buffer = BytesIO()

                with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
                    # Cycles sheet
                    if results.detected_cycles:
                        cycle_data = []
                        for i, cycle in enumerate(results.detected_cycles):
                            cycle_data.append(
                                {
                                    "Cycle_ID": f"RT-{i + 1:03d}",
                                    "Path": " → ".join(cycle.path),
                                    "Total_Amount": cycle.total_amount,
                                    "Net_Flow": cycle.net_flow,
                                    "Duration_Days": cycle.duration_days,
                                    "Confidence_Score": cycle.confidence_score,
                                    "Cycle_Type": cycle.cycle_type,
                                    "Cycle_Length": getattr(
                                        cycle, "cycle_length", len(set(cycle.path)) - 1
                                    ),
                                }
                            )

                        cycle_df = pd.DataFrame(cycle_data)
                        cycle_df.to_excel(
                            writer, sheet_name="Detected_Cycles", index=False
                        )

                    # Hub entities sheet
                    if results.hub_entities and results.centrality_metrics:
                        hub_data = []
                        for hub in results.hub_entities:
                            metrics = results.centrality_metrics.get(hub, {})
                            hub_data.append(
                                {
                                    "Entity": hub,
                                    "Betweenness_Centrality": metrics.get(
                                        "betweenness", 0
                                    ),
                                    "PageRank": metrics.get("pagerank", 0),
                                    "Total_Degree": metrics.get("total_degree", 0),
                                    "In_Degree": metrics.get("in_degree", 0),
                                    "Out_Degree": metrics.get("out_degree", 0),
                                }
                            )

                        hub_df = pd.DataFrame(hub_data)
                        hub_df.to_excel(writer, sheet_name="Hub_Entities", index=False)

                    # Network statistics sheet
                    stats_data = []
                    for key, value in results.network_statistics.items():
                        if isinstance(value, (int, float, str)):
                            stats_data.append({"Metric": key, "Value": value})

                    if stats_data:
                        stats_df = pd.DataFrame(stats_data)
                        stats_df.to_excel(
                            writer, sheet_name="Network_Statistics", index=False
                        )

                buffer.seek(0)

                st.download_button(
                    label="📥 Download Excel Results",
                    data=buffer.getvalue(),
                    file_name=f"graph_analysis_results_{timestamp}.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )

            st.success("✅ Export prepared successfully!")

        except Exception as e:
            st.error(f"❌ Error preparing export: {str(e)}")

    # ============== END GRAPH NETWORK ANALYSIS FUNCTIONS ==============

    def _get_standardized_entity_mappings(self, df: pd.DataFrame) -> dict:
        """
        Helper function to leverage existing standardized entity names for graph nodes.
        Uses the global entity registry to create clean entity-counterparty mappings.

        Args:
            df: DataFrame with entity and counterparty data

        Returns:
            Dictionary mapping original names to standardized names
        """
        mappings = {}

        # Get all unique entity and counterparty names
        all_names = set()
        if "entity_owner" in df.columns:
            all_names.update(df["entity_owner"].dropna().astype(str).unique())
        if "counterparty" in df.columns:
            all_names.update(df["counterparty"].dropna().astype(str).unique())

        # Use existing global entity registry for standardization
        if hasattr(st.session_state, "global_entity_registry"):
            registry = st.session_state.global_entity_registry

            for name in all_names:
                name_clean = str(name).strip()
                if not name_clean:
                    continue

                # Find matching canonical name in registry
                found_match = False
                for canonical_name, registry_entry in registry.items():
                    if (
                        name_clean.upper() == canonical_name.upper()
                        or name_clean.upper()
                        in {alias.upper() for alias in registry_entry["aliases"]}
                    ):
                        # Use the primary alias (first in set) as standardized name
                        std_name = next(iter(registry_entry["aliases"]))
                        mappings[name_clean] = std_name
                        found_match = True
                        break

                if not found_match:
                    # Use original name if no standardization found
                    mappings[name_clean] = name_clean
        else:
            # Fallback: use original names if no registry available
            for name in all_names:
                name_clean = str(name).strip()
                if name_clean:
                    mappings[name_clean] = name_clean

        return mappings

    def get_entity_graph_statistics(self, graph: nx.Graph) -> dict:
        """
        Helper function to calculate basic statistics for the entity graph.

        Args:
            graph: NetworkX graph of entity-counterparty relationships

        Returns:
            Dictionary with graph statistics
        """
        if graph.number_of_nodes() == 0:
            return {
                "total_nodes": 0,
                "total_edges": 0,
                "entity_nodes": 0,
                "counterparty_nodes": 0,
                "total_transaction_volume": 0.0,
                "average_degree": 0.0,
            }

        entity_nodes = [
            n for n, d in graph.nodes(data=True) if d.get("node_type") == "entity"
        ]
        counterparty_nodes = [
            n for n, d in graph.nodes(data=True) if d.get("node_type") == "counterparty"
        ]

        total_volume = sum(d.get("weight", 0) for _, _, d in graph.edges(data=True))
        avg_degree = sum(dict(graph.degree()).values()) / graph.number_of_nodes()

        return {
            "total_nodes": graph.number_of_nodes(),
            "total_edges": graph.number_of_edges(),
            "entity_nodes": len(entity_nodes),
            "counterparty_nodes": len(counterparty_nodes),
            "total_transaction_volume": total_volume,
            "average_degree": avg_degree,
        }


# ============== STREAMLIT APP ==============
st.set_page_config(page_title="Bank Statement Analysis Tool", layout="wide")

# Session state initialization
# Initialize data_store if not present
if "data_store" not in st.session_state:
    st.session_state.data_store = {
        "entities": {},
        "accounts": {},
        "transactions": {},  # Separate from accounts for better querying
        "counterparties": {},
        "analysis_cache": {},
        "user_preferences": {},
        "metadata": {"initialized_at": datetime.now(), "version": "1.0.0"},
    }

# New Data Model for Multi-Entity Support
if "entities" not in st.session_state:
    # Top-level dictionary of all loaded entities
    # 'ENTITY_ID_1': {'name': 'Entity A', 'account_ids': ['ACC_ID_1', 'ACC_ID_2']}
    st.session_state.entities = {}

if "accounts" not in st.session_state:
    # Flat lookup for all accounts, remains largely the same
    # 'ACC_ID_1': { ... account data ..., 'entity_id': 'ENTITY_ID_1' }
    st.session_state.accounts = {}

if "global_entity_registry" not in st.session_state:
    # The key for linking across statements. Maps a canonical name to known aliases.
    # 'JOHN_DOE_CANONICAL': {'primary_entity_id': 'ENTITY_ID_1', 'aliases': {'JOHN DOE', 'J DOE', 'DOE JOHN'}}
    # 'ACME_CORP_CANONICAL': {'primary_entity_id': None, 'aliases': {'ACME CORP', 'ACME CORPORATION'}}
    st.session_state.global_entity_registry = {}

# Initialize UI control state variables
if "show_bank_selector" not in st.session_state:
    st.session_state.show_bank_selector = False

if "show_skip_confirmation" not in st.session_state:
    st.session_state.show_skip_confirmation = False

if "show_clear_confirmation" not in st.session_state:
    st.session_state.show_clear_confirmation = False

# Initialize UI state variables
if "show_skip_confirmation" not in st.session_state:
    st.session_state.show_skip_confirmation = False

if "analysis_scope" not in st.session_state:
    # Controls what data is being analyzed. Can be an account_id, entity_id, or 'all'
    st.session_state.analysis_scope = None

# Column mapping session state
if "df_for_mapping" not in st.session_state:
    st.session_state.df_for_mapping = None
if "show_column_mapping" not in st.session_state:
    st.session_state.show_column_mapping = False


def main():
    # Initialize session state
    initialize_session_state()

    st.title("🏦 Bank Statement Analysis Tool")

    # Show analysis scope info if any data is selected for analysis
    analysis_scope = st.session_state.get("analysis_scope")

    if analysis_scope:
        # Check if we need to force a refresh of the analysis data
        force_refresh = st.session_state.get("force_refresh_analysis", False)
        if force_refresh:
            st.session_state.force_refresh_analysis = False

        # Get the analysis dataframe with the current scope
        df_analysis = get_analysis_dataframe(force_refresh=force_refresh)

        if not df_analysis.empty:
            col1, col2, col3 = st.columns([2, 1, 1])
            with col1:
                if analysis_scope == "all":
                    # All entities case
                    entity_count = len(st.session_state.entities)
                    account_count = len(st.session_state.accounts)
                    scope_display = f"**📊 Analyzing All Data:** {entity_count} entities, {account_count} accounts"
                elif analysis_scope in st.session_state.entities:
                    # Single entity case
                    entity_data = st.session_state.entities[analysis_scope]
                    account_count = len(entity_data["account_ids"])
                    scope_display = f"**📊 Analyzing Entity:** {entity_data['name']} ({account_count} accounts)"
                elif analysis_scope in st.session_state.accounts:
                    # Single account case
                    account_data = st.session_state.accounts[analysis_scope]
                    entity_name = (
                        st.session_state.entities[account_data["entity_id"]]["name"]
                        if account_data.get("entity_id")
                        else "Unknown"
                    )
                    scope_display = f"**📊 Analyzing Account:** {account_data['account_name']} (Entity: {entity_name})"
                else:
                    scope_display = "**📊 Analyzing:** Unknown scope"

                st.markdown(scope_display)

            with col2:
                # Show date range for analysis data
                if not df_analysis.empty and "DATE" in df_analysis.columns:
                    start_date = df_analysis["DATE"].min()
                    end_date = df_analysis["DATE"].max()
                    if pd.notna(start_date) and pd.notna(end_date):
                        date_range = f"{start_date.strftime('%b %Y')} - {end_date.strftime('%b %Y')}"
                        st.caption(f"�a {date_range}")

            with col3:
                # Show transaction count for analysis data
                if not df_analysis.empty:
                    transaction_count = len(df_analysis)
                    st.caption(f"💳 {transaction_count} transactions")

                    # Add a refresh button to force reload data
                    if st.button("🔄 Refresh", key="refresh_analysis_data"):
                        st.session_state.force_refresh_analysis = True
                        # Clear any cached dataframes
                        for key in list(st.session_state.keys()):
                            if key.startswith("analysis_df_"):
                                del st.session_state[key]
                        st.rerun()

            st.divider()

    # Debug information (remove this in production)
    if st.sidebar.checkbox("🐛 Show Debug Info", value=False):
        st.sidebar.write("**Session State Debug:**")
        st.sidebar.write(
            f"show_column_mapping: {st.session_state.get('show_column_mapping', 'Not set')}"
        )
        st.sidebar.write(
            f"df_for_mapping: {'Set' if st.session_state.get('df_for_mapping') is not None else 'Not set'}"
        )
        st.sidebar.write(
            f"mapping_entity_name: {st.session_state.get('mapping_entity_name', 'Not set')}"
        )

    # Show column mapping interface if needed
    if (
        st.session_state.get("show_column_mapping", False)
        and st.session_state.get("df_for_mapping") is not None
    ):
        # Prominent header for column mapping mode
        st.markdown("---")
        st.markdown("# 🔧 Column Mapping Required")
        st.markdown("### Your file needs column mapping to proceed with analysis")
        st.info(
            "📋 **Instructions:** Select the format type that matches your data, then map each of your CSV columns to the required fields below."
        )
        df_mapped, mapping_applied = show_column_mapping_interface(
            st.session_state.df_for_mapping
        )

        if mapping_applied:
            # Process the mapped dataframe
            try:
                # Validate the mapped format
                df_validated, errors, warnings = validate_csv_format(df_mapped)

                if not errors:
                    # Process the validated dataframe (same logic as in sidebar)
                    df = df_validated.copy()

                    # Convert DATE column to datetime using smart parsing
                    df["DATE"], date_format_info = smart_date_parsing(
                        df["DATE"], return_info=True
                    )
                    st.info(f"📅 **Date Format Detected:** {date_format_info}")

                    # Show date parsing enhancement tip if dateutil is not available

                    # Convert DEBIT and CREDIT columns to numeric
                    df["DEBIT"] = (
                        df["DEBIT"]
                        .astype(str)
                        .str.replace(",", "")
                        .replace("nan", pd.NA)
                    )
                    df["CREDIT"] = (
                        df["CREDIT"]
                        .astype(str)
                        .str.replace(",", "")
                        .replace("nan", pd.NA)
                    )
                    df["DEBIT"] = pd.to_numeric(df["DEBIT"], errors="coerce")
                    df["CREDIT"] = pd.to_numeric(df["CREDIT"], errors="coerce")

                    # Get entity metadata from session state
                    entity_name = st.session_state.get("mapping_entity_name", "")
                    account_number = st.session_state.get("mapping_account_number", "")

                    if entity_name:
                        # Process the statement using the new entity-based approach
                        try:
                            # 1. Resolve or create the primary entity
                            entity_id, is_new_entity = resolve_primary_entity(
                                entity_name
                            )

                            # 2. Create and save the account data
                            account_id = create_and_save_account(
                                entity_id, account_number, df
                            )

                            # 3. Update entity's account list
                            st.session_state.entities[entity_id]["account_ids"].append(
                                account_id
                            )

                            # 4. Process counterparties and update global registry
                            update_global_registry_with_counterparties(df)

                        except Exception as e:
                            st.error(f"❌ Error processing statement: {str(e)}")
                            return

                    # Store the processed data (no longer needed for global state)
                    st.session_state.show_column_mapping = False
                    st.session_state.df_for_mapping = None
                    st.session_state.mapping_entity_name = None
                    st.session_state.mapping_account_number = None

                    success_msg = "✅ Column mapping applied successfully!"
                    if entity_name:
                        success_msg += f" Entity: {entity_name}"
                    st.success(success_msg)
                    st.rerun()
                else:
                    st.error("❌ **Still have format errors after mapping:**")
                    for error in errors:
                        st.error(f"• {error}")
            except Exception as e:
                st.error(f"❌ **Error processing mapped data:** {str(e)}")

        # Don't show the rest of the interface until mapping is complete
        return

    # Sidebar (only shown when not in column mapping mode)
    with st.sidebar:
        # Show analysis scope selector
        show_analysis_scope_selector()

        st.header("📁 Upload Statement")

        # Entity Information Section
        st.markdown("#### 👤 Entity Information")

        # Get existing entity names for dropdown
        existing_entities = []
        if st.session_state.entities:
            existing_entities = [
                entity_data["name"]
                for entity_data in st.session_state.entities.values()
            ]
            existing_entities.sort()  # Sort alphabetically

            # Create options for the dropdown
        entity_options = ["➕ Add New Entity"] + existing_entities

        # Show summary if entities exist
        if existing_entities:
            st.caption(f"📊 {len(existing_entities)} existing entities loaded")

        selected_entity_option = st.selectbox(
            "Select Entity or Add New *",
            options=entity_options,
            help="Choose an existing entity or add a new one to prevent naming mistakes",
            key="entity_selection",
        )

        # Handle entity selection
        if selected_entity_option == "➕ Add New Entity":
            # Show text input for new entity
            entity_name = st.text_input(
                "New Entity Name *",
                placeholder="e.g., John Doe, ACME Corp",
                help="Enter the name for the new entity",
                key="new_entity_name_input",
            )
        else:
            # Use selected existing entity
            entity_name = selected_entity_option
            st.info(f"✅ Using existing entity: **{entity_name}**")

        account_number = st.text_input(
            "Account Number",
            placeholder="e.g., 1234567890 (optional)",
            help="Bank account number (optional but recommended for multiple accounts)",
            key="account_number_input",
        )

        # Validation for entity name happens when file is uploaded

        st.divider()

        # Show format help
        with st.expander("📋 CSV Format Requirements", expanded=False):
            show_format_help()

            # Download sample files
            st.write("**Download Sample CSV Files:**")
            col1, col2 = st.columns(2)

            with col1:
                sample_csv_separate = create_sample_csv("separate")
                st.download_button(
                    label="📥 Separate Columns Format",
                    data=sample_csv_separate,
                    file_name="sample_separate_columns.csv",
                    mime="text/csv",
                    help="Download sample with separate DEBIT/CREDIT columns",
                )

            with col2:
                sample_csv_unified = create_sample_csv("unified")
                st.download_button(
                    label="📥 Unified Amount Format",
                    data=sample_csv_unified,
                    file_name="sample_unified_amount.csv",
                    mime="text/csv",
                    help="Download sample with unified AMOUNT and DR_CR columns",
                )

        uploaded_file = st.file_uploader("Choose CSV or PDF file", type=["csv", "pdf"])

        if uploaded_file:
            # Validate entity name is provided
            if not entity_name:
                st.error("❌ Please provide an entity name before uploading a file.")
                return
            try:
                df_raw = None
                if uploaded_file.type == "text/csv":
                    # Read the CSV file
                    df_raw = pd.read_csv(uploaded_file, thousands=",")
                elif uploaded_file.type == "application/pdf":
                    # Save PDF to a temporary location for processing
                    temp_pdf_path = f"temp_{uploaded_file.name}"
                    with open(temp_pdf_path, "wb") as f:
                        f.write(uploaded_file.getbuffer())

                    file_name = uploaded_file.name.split(".")[0].replace(" ", "_")
                    temp_csv_output_path = f"temp_extracted_{file_name}.csv"
                    process_pdf_to_csv(temp_pdf_path, temp_csv_output_path)
                    df_raw = pd.read_csv(temp_csv_output_path, thousands=",")

                    # Clean up temporary files
                    os.remove(temp_pdf_path)
                    os.remove(temp_csv_output_path)
                    st.success("✅ PDF processed successfully!")
                else:
                    st.error("Unsupported file type.")
                    return

                if df_raw is None or df_raw.empty:
                    st.error(
                        "No data extracted from the uploaded file. Please check the file content."
                    )
                    return

                # Show a preview of the uploaded data
                with st.expander("👀 Preview Your Data", expanded=False):
                    st.write("**First 5 rows of your CSV:**")
                    st.dataframe(df_raw.head(), use_container_width=True)
                    st.write(f"**Columns:** {', '.join(df_raw.columns)}")
                    st.write(f"**Total rows:** {len(df_raw)}")

                # Validate format and get standardized column names
                df_validated, errors, warnings = validate_csv_format(df_raw)

                # Show errors if any
                if errors:
                    st.error("❌ **CSV Format Errors:**")
                    for error in errors:
                        st.error(f"• {error}")

                    # Always offer column mapping when there are validation errors
                    st.success(
                        "💡 **Column Mapping Available:** Click the button below to map your columns manually."
                    )

                    # Store the raw data and entity info for column mapping
                    st.session_state.df_for_mapping = df_raw
                    st.session_state.mapping_entity_name = entity_name
                    st.session_state.mapping_account_number = account_number

                    # Provide manual button as fallback
                    if st.button("🔧 Open Column Mapping Interface", type="primary"):
                        st.session_state.show_column_mapping = True
                        st.rerun()

                    # Also try automatic redirect
                    if not st.session_state.get("show_column_mapping", False):
                        st.session_state.show_column_mapping = True
                        st.rerun()  # Force rerun to show column mapping interface

                    return  # Stop processing here to show column mapping

                # Show warnings if any
                if warnings:
                    st.warning("⚠️ **Format Warnings:**")
                    for warning in warnings:
                        st.warning(f"• {warning}")

                # Process the validated dataframe
                df = df_validated.copy()

                # Convert DATE column to datetime using smart parsing
                df["DATE"], date_format_info = smart_date_parsing(
                    df["DATE"], return_info=True
                )
                st.info(f"📅 **Date Format Detected:** {date_format_info}")

                # Convert DEBIT and CREDIT columns to numeric, handling any string values
                # First remove commas from string values, then convert to numeric
                df["DEBIT"] = (
                    df["DEBIT"].astype(str).str.replace(",", "").replace("nan", pd.NA)
                )
                df["CREDIT"] = (
                    df["CREDIT"].astype(str).str.replace(",", "").replace("nan", pd.NA)
                )
                df["DEBIT"] = pd.to_numeric(df["DEBIT"], errors="coerce")
                df["CREDIT"] = pd.to_numeric(df["CREDIT"], errors="coerce")

                # Check for critical data issues
                date_issues = df["DATE"].isna().sum()
                if date_issues > len(df) * 0.1:  # More than 10% invalid dates
                    st.warning(
                        f"⚠️ {date_issues} transactions have invalid dates. These will be excluded from date-based analysis."
                    )

                # Process the statement using the new entity-based approach
                try:
                    # 1. Resolve or create the primary entity
                    entity_id, is_new_entity = resolve_primary_entity(entity_name)

                    # 2. Create and save the account data
                    account_id = create_and_save_account(entity_id, account_number, df)

                    # 3. Update entity's account list
                    if (
                        account_id
                        not in st.session_state.entities[entity_id]["account_ids"]
                    ):
                        st.session_state.entities[entity_id]["account_ids"].append(
                            account_id
                        )

                    # 4. Process counterparties and update global registry
                    update_global_registry_with_counterparties(df)

                    # Show success message
                    if is_new_entity:
                        st.success(
                            f"✅ Created new entity '{entity_name}' and added statement."
                        )
                    else:
                        st.success(
                            f"✅ Added statement to existing entity '{entity_name}'."
                        )

                    # Set analysis scope to the new entity if this is the first account
                    if len(st.session_state.entities[entity_id]["account_ids"]) == 1:
                        st.session_state.analysis_scope = entity_id

                except Exception as e:
                    st.error(f"❌ Error processing statement: {str(e)}")
                    return

                # Show entity info
                entity_info = f"**Entity:** {entity_name}"
                if account_number:
                    entity_info += f" (Account #: {account_number})"
                st.info(entity_info)

                # Show data quality summary
                st.info(
                    f"""
                **Data Quality:**
                - Valid dates: {len(df) - date_issues}/{len(df)}
                - Debit transactions: {df["DEBIT"].notna().sum()}
                - Credit transactions: {df["CREDIT"].notna().sum()}
                """
                )

                # Basic info
                st.markdown("### 📊 Quick Stats")

                # Handle date range display safely
                valid_dates = df["DATE"].dropna()
                if len(valid_dates) > 0:
                    date_min = valid_dates.min()
                    date_max = valid_dates.max()
                    st.write(
                        f"**Date Range:** {date_min.strftime('%Y-%m-%d')} to {date_max.strftime('%Y-%m-%d')}"
                    )
                else:
                    st.write("**Date Range:** Unable to determine (no valid dates)")

                st.write(f"**Total Debits:** ₹{df['DEBIT'].fillna(0).sum():,.0f}")
                st.write(f"**Total Credits:** ₹{df['CREDIT'].fillna(0).sum():,.0f}")
                st.write(
                    f"**Net Balance:** ₹{(df['CREDIT'].fillna(0).sum() - df['DEBIT'].fillna(0).sum()):,.0f}"
                )

            except Exception as e:
                st.error(f"❌ **Error reading CSV file:** {str(e)}")
                st.error(
                    "Please check that your file is a valid CSV and matches the required format."
                )
                return

    # Show accounts summary in sidebar if multiple accounts loaded
    if len(st.session_state.accounts) > 0:
        with st.sidebar:
            st.markdown("### 📈 Accounts Summary")
            active_case = st.session_state.get("active_case", {})
            active_account_ids = active_case.get("account_ids", [])

            for acc_id, acc_data in st.session_state.accounts.items():
                is_active = acc_id in active_account_ids
                status_icon = "✅" if is_active else "📊"

                account_summary = f"{status_icon} **{acc_data['account_name']}**"
                if acc_data["account_number"]:
                    account_summary += f" (*{acc_data['account_number'][-4:]})"

                st.markdown(account_summary)
                st.caption(f"🔸 {acc_data['transaction_count']} transactions")
                st.caption(
                    f"🔸 ₹{acc_data['total_credits']:,.0f} in / ₹{acc_data['total_debits']:,.0f} out"
                )

                if not is_active:
                    st.caption("")  # Add spacing

    # Check if we have data to analyze
    df_analysis = get_analysis_dataframe()

    if not df_analysis.empty:
        tabs = st.tabs(
            [
                "🎯 Counterparty Extraction",
                "�  Entity Merging",
                "🔗 Entity Linking",
                "�  Basic Analytics",
                "�  Time-Based Trends",
                "🕸️ Graph Network Analysis",
                "🔍 Manual Investigation",
            ]
        )

        with tabs[0]:
            counterparty_extraction_tab()
        with tabs[1]:
            entity_merging_tab()
        with tabs[2]:
            entity_linking_tab()
        with tabs[3]:
            basic_analytics_tab()
        with tabs[4]:
            time_based_trends_tab()
        with tabs[5]:
            show_graph_network_analysis()
        with tabs[6]:
            manual_investigation_tab()
    else:
        # Show entity management even when no analysis data
        st.info(
            "👈 Please upload bank statements and select an analysis scope from the sidebar to begin analysis"
        )


def counterparty_extraction_tab():
    """Independent counterparty extraction tab"""
    st.header("🎯 Counterparty Extraction")

    st.info(
        "Extract counterparty names from transaction descriptions using bank-specific patterns. "
        "This step identifies who you transacted with from the raw transaction data."
    )

    # Add prominent info box about bank presets with enhanced visibility
    st.markdown(
        """
    <div style="background-color: #E3F2FD; padding: 15px; border-radius: 5px; border-left: 5px solid #1976D2; margin-bottom: 20px;">
        <h4 style="color: #0D47A1; margin-top: 0;">🏦 Bank Preset Selection - Important!</h4>
        <p>Each bank uses different transaction description formats, requiring different regex patterns for extraction.</p>
        <p><strong>Selecting the correct bank preset significantly improves counterparty name extraction accuracy.</strong></p>
    </div>
    """,
        unsafe_allow_html=True,
    )

    # Initialize enhanced fuzzy matching session state
    if "enhanced_fuzzy_manager" not in st.session_state:
        try:
            from simple_fuzzy_matching import SimpleEntityConsolidationManager

            st.session_state.enhanced_fuzzy_manager = SimpleEntityConsolidationManager()
        except ImportError:
            st.session_state.enhanced_fuzzy_manager = None

    if "enhanced_fuzzy_matches" not in st.session_state:
        st.session_state.enhanced_fuzzy_matches = []
    if "enhanced_fuzzy_candidates" not in st.session_state:
        st.session_state.enhanced_fuzzy_candidates = []

    show_basic_extraction_tab()


def show_basic_extraction_tab():
    """Basic extraction and simple matching tab"""
    st.markdown("### 🎯 Smart Counterparty Extraction")

    col1, col2 = st.columns([1, 2])

    with col1:
        # Enhanced bank preset selector with better visibility
        st.markdown("#### 🏦 Bank Preset Selection")

        # Get the index for recommended preset
        preset_options = [
            "generic",
            "hdfc",
            "sbi",
            "icici",
            "axis",
            "kotak",
            "yes_bank",
            "pnb",
            "federal",
            "indian",
            "jammu_and_kashmir_bank",
        ]

        bank_preset = st.selectbox(
            "Choose your bank:",
            options=preset_options,
            index=0,
            help="Critical: Select your specific bank for optimized extraction patterns. This dramatically improves counterparty name extraction accuracy.",
            format_func=lambda x: {
                "generic": "🏛️ Generic (All Banks)",
                "federal": "Federal Bank",
            }.get(x, x.upper()),
        )

        # Show selected bank preset with visual confirmation
        if bank_preset != "generic":
            st.success(
                f"✅ Selected: **{bank_preset.upper()} Bank** - Using optimized patterns for this bank"
            )
        else:
            st.info(
                "ℹ️ Selected: **Generic** - Using common patterns that work across all banks"
            )

        # Add extraction tips
        with st.expander("💡 Extraction Tips", expanded=False):
            st.markdown("""
            **For best results:**
            1. **Always select your specific bank preset first**
            2. If extraction rate is low (<70%), try different presets
            3. Generic preset works as fallback for unknown formats
            4. You can provide custom names for missed transactions
            5. Review extracted names before proceeding to entity merging
            """)

        if st.button(
            "🎯 Extract Counterparties", type="primary", use_container_width=True
        ):
            extract_counterparties(bank_preset)

    with col2:
        # Only show results if extraction has been performed
        if "name_counts" in st.session_state and "extraction_stats" in st.session_state:
            show_extraction_results()
        else:
            st.info(
                "👆 Click 'Extract Counterparties' to start extracting counterparty names from your transaction data."
            )

            # Show data preview if available
            df_preview = get_analysis_dataframe()
            if not df_preview.empty:
                st.write("**Data Preview:**")
                preview_cols = ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
                available_cols = [
                    col for col in preview_cols if col in df_preview.columns
                ]
                if available_cols:
                    st.dataframe(
                        df_preview[available_cols].head(5), use_container_width=True
                    )
                    st.caption(f"Showing 5 of {len(df_preview)} transactions")
            else:
                st.warning(
                    "No data available. Please upload bank statements and select an analysis scope from the sidebar."
                )


def show_extraction_results():
    """Show extraction results in the basic tab"""
    if "name_counts" in st.session_state:
        total_unique_names = len(st.session_state.name_counts)
        blank_count = len(st.session_state.get("blank_counterparties", []))

        st.success(
            f"**Extraction Complete!** Found {total_unique_names} unique counterparty names"
        )

        col1_sum, col2_sum, col3_sum = st.columns(3)
        with col1_sum:
            st.metric("Total Unique Names", total_unique_names)
        with col2_sum:
            st.metric("Successfully Extracted", total_unique_names)
        with col3_sum:
            # Make missing names more prominent with color coding and enhanced visibility
            if blank_count > 0:
                extraction_stats = st.session_state.get("extraction_stats", {})
                blank_percentage = extraction_stats.get("blank_percentage", 0)

                # Use different styling based on severity with improved visual cues
                if blank_percentage > 30:
                    # Critical - high percentage of missing names
                    st.markdown(
                        f"""
                    <div style="background-color: #FFEBEE; padding: 10px; border-radius: 5px; text-align: center; border: 2px solid #D32F2F;">
                        <div style="font-size: 14px; color: #555;">Missing Names</div>
                        <div style="font-size: 24px; font-weight: bold; color: #D32F2F;">⚠️ {blank_count}</div>
                        <div style="font-size: 12px; color: #D32F2F; font-weight: bold;">Action Required!</div>
                    </div>
                    """,
                        unsafe_allow_html=True,
                    )
                else:
                    # Warning - some missing names
                    st.markdown(
                        f"""
                    <div style="background-color: #FFF8E1; padding: 10px; border-radius: 5px; text-align: center; border: 2px solid #FF8F00;">
                        <div style="font-size: 14px; color: #555;">Missing Names</div>
                        <div style="font-size: 24px; font-weight: bold; color: #FF8F00;">⚠️ {blank_count}</div>
                        <div style="font-size: 12px; color: #FF8F00; font-weight: bold;">Needs attention</div>
                    </div>
                    """,
                        unsafe_allow_html=True,
                    )
            else:
                # Success - no missing names
                st.markdown(
                    f"""
                <div style="background-color: #E8F5E9; padding: 10px; border-radius: 5px; text-align: center; border: 2px solid #2E7D32;">
                    <div style="font-size: 14px; color: #555;">Missing Names</div>
                    <div style="font-size: 24px; font-weight: bold; color: #2E7D32;">✅ {blank_count}</div>
                    <div style="font-size: 12px; color: #2E7D32;">All good!</div>
                </div>
                """,
                    unsafe_allow_html=True,
                )

            # Enhanced extraction success rate feedback with bank preset effectiveness
            total_transactions = len(
                st.session_state.get("df_for_merging", pd.DataFrame())
            )
            extraction_stats = st.session_state.get("extraction_stats", {})
            current_bank_preset = extraction_stats.get("bank_preset", "unknown")

            if total_transactions > 0:
                success_rate = (
                    (total_transactions - blank_count) / total_transactions
                ) * 100

                # Color-coded success rate display
                if success_rate >= 90:
                    st.success(
                        f"🎯 **Excellent Extraction Rate:** {success_rate:.1f}% ({total_transactions - blank_count}/{total_transactions} transactions)"
                    )
                    st.success(
                        f"✅ The **{current_bank_preset.upper()}** preset works perfectly for your data!"
                    )
                elif success_rate >= 70:
                    st.info(
                        f"📊 **Good Extraction Rate:** {success_rate:.1f}% ({total_transactions - blank_count}/{total_transactions} transactions)"
                    )
                    st.info(
                        f"👍 The **{current_bank_preset.upper()}** preset works well for your data."
                    )
                else:
                    st.warning(
                        f"⚠️ **Low Extraction Rate:** {success_rate:.1f}% ({total_transactions - blank_count}/{total_transactions} transactions)"
                    )
                    st.error(
                        f"❌ The **{current_bank_preset.upper()}** preset may not be optimal for your data."
                    )

                    # Provide specific recommendations
                    if current_bank_preset != "generic":
                        st.info(
                            "💡 **Recommendation:** Try the **Generic** preset which uses broader patterns that work across all banks."
                        )
                    else:
                        st.info(
                            "💡 **Recommendation:** Your bank's format may be unusual. Consider providing custom names for missing transactions."
                        )

                # Show breakdown of transaction types if available
                counterparty_transactions = extraction_stats.get(
                    "counterparty_transactions", 0
                )
                if counterparty_transactions > 0:
                    non_counterparty = total_transactions - counterparty_transactions
                    st.caption(
                        f"📋 **Transaction Breakdown:** {counterparty_transactions} counterparty transactions, {non_counterparty} internal/other transactions"
                    )

            # Extraction complete - user can proceed to merging tab
            if total_unique_names > 0:
                st.info(
                    "✅ Extraction complete! Go to the 'Entity Merging' tab to find and merge similar names."
                )

        # Enhanced blank counterparties section with better UX and more prominent highlighting
        if (
            "blank_counterparties" in st.session_state
            and st.session_state.blank_counterparties
        ):
            blank_count = len(st.session_state.blank_counterparties)

            # Prominent alert section with more attention-grabbing design and pulsing animation
            st.markdown(
                """
            <style>
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.4); }
                70% { box-shadow: 0 0 0 10px rgba(244, 67, 54, 0); }
                100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0); }
            }
            .pulse-alert {
                animation: pulse 2s infinite;
                background-color: #FFEBEE; 
                padding: 20px; 
                border-radius: 8px; 
                border-left: 8px solid #F44336;
                margin-bottom: 25px;
                margin-top: 15px;
            }
            </style>
            <div class="pulse-alert">
                <h3 style="color: #D32F2F; margin-top: 0; font-size: 24px;">🚨 Missing Counterparty Names Detected</h3>
                <p style="font-size: 18px; font-weight: bold;">
                    Some transactions have missing counterparty names that need your attention
                </p>
                <p style="font-size: 16px;">
                    These transactions couldn't be automatically processed with the current bank preset.
                </p>
            </div>
            """,
                unsafe_allow_html=True,
            )

            # Quick stats and solutions with improved layout
            col1, col2 = st.columns([3, 2])
            with col1:
                st.markdown("### Why This Happens:")
                st.markdown(
                    "• **Bank Format Mismatch:** Transaction descriptions don't match the selected bank's patterns"
                )
                st.markdown(
                    "• **Non-Standard Formats:** Unusual or custom description formats in your statements"
                )
                st.markdown(
                    "• **Internal Transactions:** Some may be fees, charges, etc. (not actual counterparties)"
                )
                st.markdown(
                    "• **Wrong Bank Preset:** The selected bank preset may not be optimal for your data"
                )

            with col2:
                st.markdown(
                    """
                <div style="background-color: #E3F2FD; padding: 15px; border-radius: 5px; border-left: 5px solid #2196F3;">
                    <h4 style="color: #0D47A1; margin-top: 0;">🎯 Solutions</h4>
                    <ol style="margin-bottom: 0;">
                        <li><strong>Try a different bank preset</strong> ⬆️</li>
                        <li><strong>Provide custom names below</strong> ⬇️</li>
                        <li><strong>Skip non-essential transactions</strong></li>
                    </ol>
                </div>
                """,
                    unsafe_allow_html=True,
                )

                # Quick action buttons with better visibility
                st.markdown("<br>", unsafe_allow_html=True)
                if st.button(
                    "🔄 Try Different Bank Preset",
                    key="try_different_preset",
                    help="Try another bank's patterns that might better match your data",
                    type="primary",
                ):
                    st.session_state.show_bank_selector = True

            # Convert blank counterparties to DataFrame for editing
            blank_df = pd.DataFrame(st.session_state.blank_counterparties)
            # Ensure DESCRIPTION column is string type to avoid column configuration issues
            if "DESCRIPTION" in blank_df.columns:
                blank_df["DESCRIPTION"] = blank_df["DESCRIPTION"].astype(str).fillna("")
            blank_df["CUSTOM_COUNTERPARTY"] = ""  # Add column for custom names

            # Enhanced sample descriptions with analysis
            with st.expander("🔍 Analyze Problematic Descriptions", expanded=False):
                st.write("**Sample descriptions that couldn't be processed:**")
                sample_descriptions = blank_df["DESCRIPTION"].head(10).tolist()

                # Categorize descriptions to help user understand patterns
                internal_patterns = [
                    "CHARGES",
                    "FEE",
                    "SERVICE",
                    "TAX",
                    "INTEREST",
                    "DIVIDEND",
                ]
                cash_patterns = ["CASH", "ATM", "WITHDRAWAL"]
                transfer_patterns = ["NEFT", "RTGS", "IMPS", "UPI"]

                for i, desc in enumerate(sample_descriptions, 1):
                    desc_upper = str(desc).upper()
                    category = "🔄 Transfer"
                    if any(pattern in desc_upper for pattern in internal_patterns):
                        category = "🏦 Bank Internal"
                    elif any(pattern in desc_upper for pattern in cash_patterns):
                        category = "💰 Cash/ATM"

                    st.write(f"{i}. {category} `{desc}`")

                if len(blank_df) > 10:
                    st.write(f"... and {len(blank_df) - 10} more transactions")

                # Pattern analysis
                st.write("**💡 Pattern Analysis:**")
                total_blanks = len(blank_df)
                blank_df.dropna(subset=["DESCRIPTION"])
                print(blank_df["DESCRIPTION"].head())
                internal_count = sum(
                    1
                    for desc in blank_df["DESCRIPTION"]
                    if any(
                        pattern in str(desc).upper() for pattern in internal_patterns
                    )
                )
                cash_count = sum(
                    1
                    for desc in blank_df["DESCRIPTION"]
                    if any(pattern in str(desc).upper() for pattern in cash_patterns)
                )
                transfer_count = sum(
                    1
                    for desc in blank_df["DESCRIPTION"]
                    if any(
                        pattern in str(desc).upper() for pattern in transfer_patterns
                    )
                )

                if internal_count > 0:
                    st.write(
                        f"• {internal_count}/{total_blanks} appear to be internal bank transactions (may not need counterparty names)"
                    )
                if cash_count > 0:
                    st.write(
                        f"• {cash_count}/{total_blanks} appear to be cash/ATM transactions (may not need counterparty names)"
                    )
                if transfer_count > 0:
                    st.write(
                        f"• {transfer_count}/{total_blanks} appear to be transfers but couldn't extract names (try different bank preset)"
                    )

            # Enhanced editable table with better visual design
            st.markdown(
                """
            <div style="background-color: #FFF8E1; padding: 15px; border-radius: 5px; border-left: 5px solid #FFC107; margin-top: 20px;">
                <h3 style="color: #FF8F00; margin-top: 0;">📝 Provide Custom Counterparty Names</h3>
                <p>Edit the table below to add missing counterparty names or leave blank for internal transactions</p>
            </div>
            """,
                unsafe_allow_html=True,
            )

            # Better instructions with visual formatting
            st.markdown(
                """
            <div style="background-color: #F5F5F5; padding: 10px; border-radius: 5px; margin-bottom: 15px;">
                <h4 style="margin-top: 0;">Instructions:</h4>
                <ul>
                    <li><strong>Add names</strong> for actual counterparty transactions (payments to/from other entities)</li>
                    <li><strong>Leave blank</strong> for internal bank transactions (fees, charges, interest, etc.)</li>
                    <li><strong>Use consistent naming</strong> (e.g., 'John Doe' not 'JOHN DOE' or 'john doe')</li>
                    <li><strong>Click "Apply Custom Names"</strong> when finished to save your changes</li>
                </ul>
            </div>
            """,
                unsafe_allow_html=True,
            )

            # Add a quick filter option to help with large datasets
            if len(blank_df) > 10:
                filter_option = st.selectbox(
                    "Filter transactions by type:",
                    options=[
                        "Show All",
                        "Show Only Debits",
                        "Show Only Credits",
                        "Show Only Large Amounts",
                    ],
                    key="blank_filter",
                )

                if filter_option == "Show Only Debits":
                    filtered_df = blank_df[blank_df["DEBIT"] > 0]
                elif filter_option == "Show Only Credits":
                    filtered_df = blank_df[blank_df["CREDIT"] > 0]
                elif filter_option == "Show Only Large Amounts":
                    # Filter for transactions with significant amounts (either debit or credit)
                    large_threshold = max(
                        blank_df["DEBIT"].median() * 2, blank_df["CREDIT"].median() * 2
                    )
                    filtered_df = blank_df[
                        (blank_df["DEBIT"] > large_threshold)
                        | (blank_df["CREDIT"] > large_threshold)
                    ]
                else:
                    filtered_df = blank_df

                st.caption(
                    f"Showing {len(filtered_df)} of {len(blank_df)} transactions"
                )
            else:
                filtered_df = blank_df

            # Enhanced data editor with better visual cues
            edited_blank_df = st.data_editor(
                filtered_df[
                    ["DATE", "DESCRIPTION", "DEBIT", "CREDIT", "CUSTOM_COUNTERPARTY"]
                ],
                column_config={
                    "DATE": st.column_config.DateColumn("Date", width="small"),
                    "DESCRIPTION": st.column_config.TextColumn(
                        "Description", width="large"
                    ),
                    "DEBIT": st.column_config.NumberColumn(
                        "Debit", format="₹%.0f", width="small"
                    ),
                    "CREDIT": st.column_config.NumberColumn(
                        "Credit", format="₹%.0f", width="small"
                    ),
                    "CUSTOM_COUNTERPARTY": st.column_config.TextColumn(
                        "Custom Counterparty Name",
                        help="Enter counterparty name or leave blank for internal transactions",
                        width="medium",
                        required=False,
                    ),
                },
                use_container_width=True,
                hide_index=True,
                key="blank_counterparties_editor",
                num_rows="dynamic",
            )

            # Show progress indicator
            if len(filtered_df) > 0:
                filled_count = sum(
                    1
                    for _, row in edited_blank_df.iterrows()
                    if row["CUSTOM_COUNTERPARTY"].strip()
                )
                progress = filled_count / len(filtered_df)

                st.progress(
                    progress,
                    text=f"Completed: {filled_count}/{len(filtered_df)} ({int(progress * 100)}%)",
                )

                if progress > 0:
                    if progress == 1.0:
                        st.success(
                            "✅ All counterparty names provided! Click 'Apply Custom Names' to save."
                        )
                    else:
                        st.info(
                            f"ℹ️ {filled_count} names provided, {len(filtered_df) - filled_count} still blank"
                        )
                else:
                    st.info(
                        "ℹ️ Start adding counterparty names or leave blank for internal transactions"
                    )

                # Action buttons with better layout and visual hierarchy
                st.markdown("<br>", unsafe_allow_html=True)

                # Primary actions row
                col1, col2 = st.columns(2)
                with col1:
                    if st.button(
                        "💾 Apply Custom Names",
                        type="primary",
                        use_container_width=True,
                    ):
                        # Count how many custom names were provided
                        custom_names_count = sum(
                            1
                            for _, row in edited_blank_df.iterrows()
                            if row["CUSTOM_COUNTERPARTY"].strip()
                        )

                        if custom_names_count == 0:
                            st.warning(
                                "⚠️ No custom names provided. Add names in the table above or skip these transactions."
                            )
                        else:
                            # Apply custom names to the main dataframe
                            df_for_merging = st.session_state.get("df_for_merging")
                            if df_for_merging is not None:
                                applied_count = 0
                                for i, row in edited_blank_df.iterrows():
                                    if row["CUSTOM_COUNTERPARTY"].strip():
                                        # Find the corresponding index in the original blank_df
                                        if i in filtered_df.index:
                                            orig_idx = blank_df.loc[i, "index"]
                                            custom_name = row[
                                                "CUSTOM_COUNTERPARTY"
                                            ].strip()
                                            df_for_merging.at[
                                                orig_idx, "COUNTERPARTY_ORIGINAL"
                                            ] = custom_name
                                            df_for_merging.at[
                                                orig_idx, "counterparty"
                                            ] = custom_name
                                            applied_count += 1

                                # Update session state
                                st.session_state.df_for_merging = df_for_merging

                                # Remove processed blank counterparties
                                remaining_blanks = []
                                processed_indices = set()

                                for i, row in edited_blank_df.iterrows():
                                    if row["CUSTOM_COUNTERPARTY"].strip():
                                        processed_indices.add(i)

                                for i, blank_entry in enumerate(
                                    st.session_state.blank_counterparties
                                ):
                                    if i not in processed_indices:
                                        remaining_blanks.append(blank_entry)

                                st.session_state.blank_counterparties = remaining_blanks

                                # Update extracted_df
                                updated_extracted = df_for_merging[
                                    df_for_merging["COUNTERPARTY_ORIGINAL"] != ""
                                ][
                                    [
                                        "DATE",
                                        "DESCRIPTION",
                                        "COUNTERPARTY_ORIGINAL",
                                        "DEBIT",
                                        "CREDIT",
                                    ]
                                ].reset_index()
                                st.session_state.extracted_df = updated_extracted

                                # Show success message with confetti for completion
                                if len(remaining_blanks) == 0:
                                    st.balloons()
                                    st.success(
                                        "🎉 All counterparty names have been provided! Ready to proceed."
                                    )
                                else:
                                    st.success(
                                        f"✅ Applied {applied_count} custom counterparty names! {len(remaining_blanks)} transactions still need attention."
                                    )

                                st.rerun()

                with col2:
                    if st.button("⏭️ Skip Remaining Blanks", use_container_width=True):
                        st.session_state.show_skip_confirmation = True

                # Secondary actions row
                st.markdown("<br>", unsafe_allow_html=True)
                col1, col2 = st.columns(2)

                with col1:
                    if st.button(
                        "🔄 Try Different Bank Preset", use_container_width=True
                    ):
                        st.session_state.show_bank_selector = True
                        st.info(
                            "💡 Select a different bank preset above and click 'Find Similar Names' again."
                        )

                with col2:
                    if st.button("🧹 Clear All Custom Names", use_container_width=True):
                        # Add confirmation to prevent accidental clearing
                        st.session_state.show_clear_confirmation = True

                # Skip confirmation dialog
                if st.session_state.get("show_skip_confirmation", False):
                    st.markdown(
                        """
                    <div style="background-color: #FFF3E0; padding: 15px; border-radius: 5px; border-left: 5px solid #FF9800; margin-top: 20px;">
                        <h4 style="color: #E65100; margin-top: 0;">⚠️ Confirm Skip</h4>
                        <p>Are you sure you want to skip all remaining transactions with missing counterparty names?</p>
                        <p>They will be <strong>excluded</strong> from counterparty analysis.</p>
                    </div>
                    """,
                        unsafe_allow_html=True,
                    )

                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("✅ Yes, Skip Them", type="primary"):
                            st.session_state.blank_counterparties = []
                            st.session_state.show_skip_confirmation = False
                            st.warning(
                                f"⚠️ Skipped {blank_count} transactions with missing counterparty names. They will be excluded from analysis."
                            )
                            st.rerun()
                    with col2:
                        if st.button("❌ No, Cancel"):
                            st.session_state.show_skip_confirmation = False
                            st.rerun()

                # Clear confirmation dialog
                if st.session_state.get("show_clear_confirmation", False):
                    st.warning(
                        "⚠️ Are you sure you want to clear all custom names you've entered?"
                    )
                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("✅ Yes, Clear All"):
                            st.session_state.show_clear_confirmation = False
                            st.rerun()
                    with col2:
                        if st.button("❌ No, Keep Names"):
                            st.session_state.show_clear_confirmation = False
                            st.rerun()

                # Skip confirmation
                if st.session_state.get("show_skip_confirmation", False):
                    st.warning(
                        "⚠️ **Confirm:** Skip all remaining transactions with missing counterparty names?"
                    )
                    col1, col2 = st.columns(2)
                    with col1:
                        if st.button("✅ Yes, Skip Them", type="primary"):
                            st.session_state.blank_counterparties = []
                            st.session_state.show_skip_confirmation = False
                            st.warning(
                                f"⚠️ Skipped {blank_count} transactions with missing counterparty names. They will be excluded from analysis."
                            )
                            st.rerun()
                    with col2:
                        if st.button("❌ Cancel"):
                            st.session_state.show_skip_confirmation = False
                            st.rerun()

        if "extracted_df" in st.session_state:
            st.subheader("🔍 Verify Extracted counterparty Names")
            st.write("Review and edit the extracted names if needed.")

            edited_df = st.data_editor(
                st.session_state.extracted_df.drop(columns=["index"]),
                column_config={
                    "DATE": st.column_config.DateColumn("Date"),
                    "DESCRIPTION": "Description",
                    "COUNTERPARTY_ORIGINAL": st.column_config.TextColumn(
                        "Extracted Name",
                        help="Edit if incorrect",
                    ),
                    "DEBIT": st.column_config.NumberColumn("Debit", format="₹%.0f"),
                    "CREDIT": st.column_config.NumberColumn("Credit", format="₹%.0f"),
                },
                use_container_width=True,
                hide_index=True,
            )

            if st.button("💾 Apply Edits and Re-analyze", type="primary"):
                # Get the current dataframe for merging
                df_for_merging = st.session_state.get("df_for_merging")
                if df_for_merging is None:
                    st.error(
                        "No data available for editing. Please run 'Find Similar Names' first."
                    )
                    return

                # Apply edits to the dataframe
                for i, row in edited_df.iterrows():
                    orig_idx = st.session_state.extracted_df.at[i, "index"]
                    new_name = row["COUNTERPARTY_ORIGINAL"]
                    df_for_merging.at[orig_idx, "COUNTERPARTY_ORIGINAL"] = new_name
                    df_for_merging.at[orig_idx, "counterparty"] = new_name

                # Store the updated dataframe
                st.session_state.df_for_merging = df_for_merging

                # Re-compute clusters
                all_names = df_for_merging["COUNTERPARTY_ORIGINAL"].dropna().tolist()
                standardizer = st.session_state.standardizer
                # Use the threshold from session state or default
                threshold = st.session_state.get("current_similarity_threshold", 85)
                clusters, name_counts, cluster_scores = standardizer.find_similar_names(
                    all_names, threshold
                )
                st.session_state.clusters = clusters
                st.session_state.name_counts = name_counts
                st.session_state.cluster_scores = cluster_scores

                # Update extracted_df
                updated_extracted = df_for_merging[
                    df_for_merging["COUNTERPARTY_ORIGINAL"] != ""
                ][
                    ["DATE", "DESCRIPTION", "COUNTERPARTY_ORIGINAL", "DEBIT", "CREDIT"]
                ].reset_index()
                st.session_state.extracted_df = updated_extracted

                st.success("✅ Edits applied and re-analyzed!")

        # Show completion message and next steps
        if "name_counts" in st.session_state and "extraction_stats" in st.session_state:
            st.success("✅ Counterparty extraction completed!")

            total_unique_names = len(st.session_state.name_counts)
            st.info(
                f"📊 Extracted {total_unique_names} unique counterparty names. Go to the 'Entity Merging' tab to find and merge similar names."
            )

            # Show extracted counterparties summary
            with st.expander("�n View Extracted Counterparties", expanded=False):
                if "extracted_df" in st.session_state:
                    extracted_df = st.session_state.extracted_df
                    counterparty_counts = extracted_df[
                        "COUNTERPARTY_ORIGINAL"
                    ].value_counts()

                    st.write("**Top 10 Most Frequent Counterparties:**")
                    for name, count in counterparty_counts.head(10).items():
                        st.write(f"• {name}: {count} transactions")

                    if len(counterparty_counts) > 10:
                        st.write(
                            f"... and {len(counterparty_counts) - 10} more counterparties"
                        )


def get_entity_data_for_enhanced_matching():
    """Get entity data for enhanced matching from session state"""
    # Check for sample data first
    if "enhanced_sample_entity_data" in st.session_state:
        return st.session_state.enhanced_sample_entity_data

    # Try to get data from the main application
    if "df_for_merging" in st.session_state:
        df = st.session_state.df_for_merging
        if "counterparty" in df.columns:
            # Extract entity data from the dataframe
            entity_data = {}

            counterparty_stats = (
                df.groupby("counterparty")
                .agg({"DEBIT": ["count", "sum"], "CREDIT": ["count", "sum"]})
                .fillna(0)
            )

            for counterparty in counterparty_stats.index:
                if counterparty and str(counterparty).strip():
                    debit_sum = counterparty_stats.loc[counterparty, ("DEBIT", "sum")]
                    credit_sum = counterparty_stats.loc[counterparty, ("CREDIT", "sum")]
                    debit_count = counterparty_stats.loc[
                        counterparty, ("DEBIT", "count")
                    ]
                    credit_count = counterparty_stats.loc[
                        counterparty, ("CREDIT", "count")
                    ]

                    entity_data[counterparty] = {
                        "transaction_count": int(debit_count + credit_count),
                        "total_volume": float(debit_sum + credit_sum),
                        "debit_volume": float(debit_sum),
                        "credit_volume": float(credit_sum),
                    }

            return entity_data

    return {}


def extract_counterparties(bank_preset="generic"):
    """Extract counterparty names from transaction descriptions only"""
    with st.spinner(
        f"🔍 Extracting counterparties using {bank_preset.upper()} bank preset..."
    ):
        standardizer = CounterpartyStandardizer(
            85, bank_preset
        )  # Default threshold for extraction
        df = get_analysis_dataframe()

        if df is None or df.empty:
            st.error(
                "No data available for analysis. Please select an analysis scope from the sidebar."
            )
            return

        df = df.copy()

        all_names = []
        df["counterparty"] = ""
        df["COUNTERPARTY_ORIGINAL"] = ""
        blank_counterparties = []

        # Track extraction statistics
        total_transactions = len(df)
        counterparty_transactions = 0
        successful_extractions = 0

        # Initialize session state for bank selector if not present
        if "show_bank_selector" not in st.session_state:
            st.session_state.show_bank_selector = False

        # Initialize session state for clear confirmation if not present
        if "show_clear_confirmation" not in st.session_state:
            st.session_state.show_clear_confirmation = False

        # Initialize session state for skip confirmation if not present
        if "show_skip_confirmation" not in st.session_state:
            st.session_state.show_skip_confirmation = False

        # Process each transaction
        for idx, row in df.iterrows():
            desc = row.get("DESCRIPTION", "")
            counterparty_transactions += 1
            name = standardizer.extract_counterparty_name(desc)
            if name:
                all_names.append(name)
                df.at[idx, "COUNTERPARTY_ORIGINAL"] = name
                df.at[idx, "counterparty"] = name
                successful_extractions += 1
            else:
                # Track transactions where counterparty extraction failed
                # Include more details to help with debugging and manual entry
                transaction_type = "Credit" if row.get("CREDIT", 0) > 0 else "Debit"
                amount = (
                    row.get("CREDIT", 0)
                    if transaction_type == "Credit"
                    else row.get("DEBIT", 0)
                )

                blank_counterparties.append(
                    {
                        "index": idx,
                        "DATE": row.get("DATE", ""),
                        "DESCRIPTION": str(desc) if pd.notna(desc) else "",
                        "DEBIT": row.get("DEBIT", 0),
                        "CREDIT": row.get("CREDIT", 0),
                        "transaction_type": transaction_type,
                        "amount": amount,
                    }
                )

        # Sort blank counterparties by amount (descending) to prioritize important transactions
        if blank_counterparties:
            blank_counterparties = sorted(
                blank_counterparties, key=lambda x: x["amount"], reverse=True
            )

        # Store extraction statistics for feedback
        st.session_state.extraction_stats = {
            "total_transactions": total_transactions,
            "counterparty_transactions": counterparty_transactions,
            "successful_extractions": successful_extractions,
            "bank_preset": bank_preset,
            "blank_percentage": (
                len(blank_counterparties) / counterparty_transactions * 100
            )
            if counterparty_transactions > 0
            else 0,
        }

        # Store extracted names for later clustering
        st.session_state.extracted_names = all_names
        st.session_state.name_counts = Counter(all_names)

    # Store the processed dataframe in session state for later use
    st.session_state.df_for_merging = df

    extracted_df = df[df["COUNTERPARTY_ORIGINAL"] != ""][
        ["DATE", "DESCRIPTION", "COUNTERPARTY_ORIGINAL", "DEBIT", "CREDIT"]
    ].reset_index()
    st.session_state.extracted_df = extracted_df

    # Store blank counterparties for highlighting
    st.session_state.blank_counterparties = blank_counterparties

    # Store standardizer for later use in clustering
    st.session_state.standardizer = standardizer


def find_similar_names(threshold):
    """Find similar names using fuzzy matching - separate from extraction"""
    if (
        "extracted_names" not in st.session_state
        or "standardizer" not in st.session_state
    ):
        st.error("Please run counterparty extraction first!")
        return

    standardizer = st.session_state.standardizer
    all_names = st.session_state.extracted_names

    if not all_names:
        st.session_state.clusters = []
        st.session_state.cluster_scores = []
        st.session_state.similarity_threshold = threshold
        return

    # Show progress for large datasets
    total_names = len(set(all_names))

    if total_names > 1000:
        st.info(
            f"🔍 Processing {total_names:,} unique names. This may take a moment..."
        )
        progress_bar = st.progress(0)
        status_text = st.empty()

        # Add progress callback to standardizer
        def progress_callback(current, total, stage="Processing"):
            progress = current / total if total > 0 else 0
            progress_bar.progress(progress)
            status_text.text(f"{stage}: {current:,} / {total:,} names ({progress:.1%})")

        # Temporarily add progress callback to standardizer
        standardizer._progress_callback = progress_callback
    else:
        progress_bar = None
        status_text = None

    with st.spinner(
        f"🔍 Finding similar names with {threshold}% similarity threshold..."
    ):
        try:
            clusters, name_counts, cluster_scores = standardizer.find_similar_names(
                all_names, threshold
            )
        finally:
            # Clean up progress callback
            if hasattr(standardizer, "_progress_callback"):
                delattr(standardizer, "_progress_callback")
            if progress_bar:
                progress_bar.empty()
            if status_text:
                status_text.empty()

        st.session_state.clusters = clusters
        st.session_state.cluster_scores = cluster_scores
        st.session_state.similarity_threshold = threshold

        # Show completion message with performance info
        if total_names > 1000:
            st.success(
                f"✅ Completed! Found {len(clusters)} groups of similar names from {total_names:,} unique names."
            )


def entity_merging_tab():
    """Independent entity merging tab"""
    st.header("🔀 Entity Merging")

    st.info(
        "Find and merge similar counterparty names that refer to the same entity. "
        "This step consolidates variations of the same name (e.g., 'JOHN DOE' and 'J DOE') into a single entity."
    )

    # Check if extraction has been run
    if (
        "name_counts" not in st.session_state
        or "extracted_names" not in st.session_state
    ):
        st.warning("⚠️ Please run counterparty extraction first!")
        st.info(
            "👈 Go to the 'Counterparty Extraction' tab to extract counterparty names from your transaction data."
        )
        return

    # Show extraction summary
    if "extraction_stats" in st.session_state:
        stats = st.session_state.extraction_stats
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Total Transactions", stats.get("total_transactions", 0))
        with col2:
            st.metric("Extracted Names", stats.get("successful_extractions", 0))
        with col3:
            success_rate = (
                stats.get("successful_extractions", 0)
                / stats.get("total_transactions", 1)
            ) * 100
            st.metric("Extraction Rate", f"{success_rate:.1f}%")

    st.divider()

    # Fuzzy matching controls
    st.markdown("### 🎯 Find Similar Names")

    # Performance recommendations for large datasets
    if "extracted_names" in st.session_state:
        total_unique_names = len(set(st.session_state.extracted_names))
        if total_unique_names > 3000:
            st.warning(
                f"⚡ **Performance Note**: You have {total_unique_names:,} unique names. "
                f"For faster processing:\n"
                f"- Use threshold ≥ 80 (higher = faster)\n"
                f"- Consider processing in smaller batches\n"
                f"- Expected processing time: ~{max(1, total_unique_names // 1000)} minutes"
            )

    col1, col2 = st.columns([1, 2])

    with col1:
        similarity_threshold = st.slider(
            "Similarity Threshold",
            min_value=50,
            max_value=100,
            value=85,
            help="Higher values = more strict matching. 85 is recommended for most cases.",
        )

        # Advanced filtering options
        with st.expander("🔧 Advanced Filtering", expanded=False):
            col_filter1, col_filter2 = st.columns(2)

            with col_filter1:
                min_cluster_size = st.number_input(
                    "Min names per group",
                    min_value=2,
                    max_value=10,
                    value=2,
                    help="Only show groups with at least this many similar names",
                )

                hide_surname_only = st.checkbox(
                    "Hide surname-only groups",
                    value=True,
                    help="Automatically hide groups that only contain common surnames",
                )

            with col_filter2:
                min_transactions = st.number_input(
                    "Min transactions per name",
                    min_value=1,
                    max_value=10,
                    value=1,
                    help="Only include names with at least this many transactions",
                )

                auto_expand_limit = st.number_input(
                    "Auto-expand first N groups",
                    min_value=0,
                    max_value=10,
                    value=3,
                    help="Automatically expand the first N groups for easier review",
                )

        # Store advanced settings in session state
        st.session_state.advanced_filters = {
            "min_cluster_size": min_cluster_size,
            "hide_surname_only": hide_surname_only,
            "min_transactions": min_transactions,
            "auto_expand_limit": auto_expand_limit,
        }

        if st.button("🔍 Find Similar Names", type="primary", use_container_width=True):
            find_similar_names(similarity_threshold)

    with col2:
        # Show clustering results if available
        if "clusters" in st.session_state:
            total_unique_names = len(st.session_state.name_counts)
            groups_with_similar = len(
                [c for c in st.session_state.clusters if len(c) > 1]
            )
            names_in_groups = sum(
                len(c) for c in st.session_state.clusters if len(c) > 1
            )

            st.success(f"**Found {groups_with_similar} groups of similar names!**")

            col1_sum, col2_sum, col3_sum = st.columns(3)
            with col1_sum:
                st.metric("Total Unique Names", total_unique_names)
            with col2_sum:
                st.metric("Groups with Similar Names", groups_with_similar)
            with col3_sum:
                st.metric("Names in Similar Groups", names_in_groups)
        else:
            st.info(
                "👆 Click 'Find Similar Names' to identify counterparty names that can be merged."
            )

    st.divider()

    # Show merging interface only if clustering has been done
    if "clusters" in st.session_state:
        display_merge_interface()
    else:
        st.info("Please find similar names first to see the merging interface.")


def display_merge_interface():
    st.subheader("Review & Merge Similar Names")

    # Ensure required session state variables exist
    if "clusters" not in st.session_state:
        st.error("No clusters found. Please run the similarity analysis first.")
        return

    if "name_counts" not in st.session_state:
        st.error("No name counts found. Please run the similarity analysis first.")
        return

    # Initialize cluster_scores if it doesn't exist (for backward compatibility)
    if "cluster_scores" not in st.session_state:
        st.session_state.cluster_scores = [{} for _ in st.session_state.clusters]

    # Add cross-group merging toggle
    st.markdown("### 🔀 Merging Options")
    col1, col2 = st.columns([3, 1])

    with col1:
        cross_group_mode = st.checkbox(
            "🔀 Enable Cross-Group Merging",
            value=False,
            help="Allow merging names across different similarity groups. Useful for handling false positives or entities split across multiple groups.",
        )

    with col2:
        if cross_group_mode:
            st.info("💡 Cross-group mode enabled")
        else:
            st.info("📋 Standard mode")

    if cross_group_mode:
        display_cross_group_merge_interface()
    else:
        display_standard_merge_interface()


def display_standard_merge_interface():
    """Original merge interface - within groups only"""
    merge_count = 0
    temp_mappings = {}

    # Get advanced filter settings
    advanced_filters = st.session_state.get(
        "advanced_filters",
        {
            "min_cluster_size": 2,
            "hide_surname_only": True,
            "min_transactions": 1,
            "auto_expand_limit": 3,
        },
    )

    for i, cluster in enumerate(st.session_state.clusters):
        if len(cluster) > 1:
            # Apply advanced filtering
            if len(cluster) < advanced_filters["min_cluster_size"]:
                continue

            # Filter by minimum transactions
            filtered_cluster = [
                name
                for name in cluster
                if st.session_state.name_counts.get(name, 0)
                >= advanced_filters["min_transactions"]
            ]

            if len(filtered_cluster) < 2:
                continue

            merge_count += 1

            # Get scores for this cluster if available
            cluster_score_dict = {}
            if "cluster_scores" in st.session_state and i < len(
                st.session_state.cluster_scores
            ):
                cluster_score_dict = st.session_state.cluster_scores[i]

            # Sort cluster by scores (highest first), then by transaction count
            sorted_cluster = sorted(
                filtered_cluster,
                key=lambda name: (
                    cluster_score_dict.get(name, 0),  # Score (higher is better)
                    st.session_state.name_counts.get(
                        name, 0
                    ),  # Transaction count (higher is better)
                ),
                reverse=True,
            )

            with st.expander(
                f"Group {merge_count}: {len(sorted_cluster)} similar names",
                expanded=merge_count <= advanced_filters["auto_expand_limit"],
            ):
                # Show all variations with individual selection
                st.write("**Select which names to merge together:**")

                # Create checkboxes for each name in the cluster (now sorted by score)
                selected_names = []
                for j, name in enumerate(sorted_cluster):
                    count = st.session_state.name_counts[name]
                    score = cluster_score_dict.get(
                        name, 100
                    )  # Default to 100 for base names

                    # Create a deterministic unique key using hash of the name and cluster position
                    name_hash = abs(hash(name)) % 10000
                    unique_key = f"checkbox_{i}_{j}_{name_hash}_{merge_count}"

                    # Show score in the checkbox label
                    score_text = f" (score: {score}%)" if score < 100 else ""
                    is_selected = st.checkbox(
                        f"{name} ({count} transactions){score_text}",
                        key=unique_key,
                        value=True,  # Default to selected
                        help=f"Uncheck if this name should NOT be merged with others in this group. Fuzzy match score: {score}%",
                    )
                    if is_selected:
                        selected_names.append(name)

                # Only show merge options if at least 2 names are selected
                if len(selected_names) >= 2:
                    st.write(f"**{len(selected_names)} names selected for merging:**")

                    # Let user choose the canonical name from selected names only
                    # Create unique keys using cluster hash and merge count to avoid duplicates
                    cluster_hash = hash(tuple(sorted(cluster)))
                    select_key = f"select_{i}_{merge_count}_{abs(cluster_hash) % 10000}"
                    custom_key = f"custom_{i}_{merge_count}_{abs(cluster_hash) % 10000}"

                    selected_name = st.selectbox(
                        "Select standard name:",
                        options=selected_names,
                        key=select_key,
                        index=selected_names.index(
                            max(
                                selected_names,
                                key=lambda x: st.session_state.name_counts[x],
                            )
                        ),
                        help="This will be the final name used for all selected variations",
                    )

                    # Or let them type a custom name
                    custom_name = st.text_input(
                        "Or enter custom name:",
                        key=custom_key,
                        placeholder="Leave empty to use selected name",
                        help="Enter a completely new name to use instead of any of the existing ones",
                    )

                    final_name = custom_name if custom_name else selected_name

                    # Store mapping only for selected names
                    for name in selected_names:
                        if name != final_name:
                            temp_mappings[name] = final_name

                    # Show preview of what will be merged
                    if len(selected_names) > 1:
                        st.info(
                            f"✅ Will merge {len(selected_names)} names to: **{final_name}**"
                        )

                elif len(selected_names) == 1:
                    st.info(
                        f"ℹ️ Only 1 name selected - no merging needed for: {selected_names[0]}"
                    )
                else:
                    st.warning("⚠️ No names selected for merging in this group")

    # Show filtering statistics
    total_clusters = len(st.session_state.clusters)
    filtered_out = total_clusters - merge_count

    if filtered_out > 0:
        st.info(
            f"ℹ️ Filtered out {filtered_out} groups based on your settings (showing {merge_count} groups for review)"
        )

    if merge_count > 0:
        # Show summary of all pending merges
        if temp_mappings:
            st.divider()
            st.write("**📋 Merge Summary:**")
            unique_targets = set(temp_mappings.values())
            for target in unique_targets:
                sources = [k for k, v in temp_mappings.items() if v == target]
                if sources:
                    st.write(f"• **{target}** ← {', '.join(sources)}")

            col1, col2 = st.columns([1, 1])
            with col1:
                if st.button("✅ Apply Selected Merges", type="primary"):
                    apply_merges(temp_mappings)
            with col2:
                if st.button("🔄 Reset All Selections"):
                    # Clear the interface by forcing a rerun
                    st.rerun()

            # Add option to proceed without merging
            st.divider()
            if st.button(
                "➡️ Proceed Without Merging",
                help="Keep all counterparty names separate and proceed to analysis",
            ):
                apply_merges(
                    {}
                )  # Apply empty mappings to finalize the counterparty columns
        else:
            st.info("ℹ️ No merges selected. All similar names will remain separate.")

            # Add option to proceed without merging when no merges are selected
            st.divider()
            if st.button(
                "➡️ Proceed Without Merging",
                help="Keep all counterparty names separate and proceed to analysis",
            ):
                apply_merges(
                    {}
                )  # Apply empty mappings to finalize the counterparty columns


def display_cross_group_merge_interface():
    """Enhanced merge interface allowing cross-group merging"""
    st.markdown("### 🔀 Cross-Group Merge Interface")
    st.info(
        "💡 **Cross-Group Mode**: You can now merge names across different similarity groups. This helps handle false positives and entities split across multiple groups."
    )

    # Initialize cross-group merge state
    if "cross_group_merges" not in st.session_state:
        st.session_state.cross_group_merges = {}

    # Get all names from all clusters
    all_names = []
    name_to_group = {}

    for i, cluster in enumerate(st.session_state.clusters):
        for name in cluster:
            all_names.append(name)
            name_to_group[name] = i + 1

    # Sort names alphabetically for easier browsing
    all_names.sort()

    # Create merge groups interface
    st.markdown("#### 📝 Create Custom Merge Groups")
    st.write("Select names from any groups to merge them together:")

    # Dynamic merge group creation
    if "num_merge_groups" not in st.session_state:
        st.session_state.num_merge_groups = 1

    col1, col2 = st.columns([3, 1])
    with col1:
        st.write(
            f"**Managing {st.session_state.num_merge_groups} custom merge group(s)**"
        )
    with col2:
        if st.button("➕ Add Merge Group"):
            st.session_state.num_merge_groups += 1
            st.rerun()

    cross_group_mappings = {}

    for merge_group_idx in range(st.session_state.num_merge_groups):
        with st.expander(
            f"🔀 Custom Merge Group {merge_group_idx + 1}",
            expanded=merge_group_idx == 0,
        ):
            st.write("**Select names to merge together (from any similarity groups):**")

            # Multi-select for names across all groups
            selected_names = st.multiselect(
                "Choose names to merge:",
                options=all_names,
                format_func=lambda name: f"{name} ({st.session_state.name_counts[name]} txns) [Group {name_to_group[name]}]",
                key=f"cross_group_select_{merge_group_idx}",
                help="Select multiple names from any groups to merge them together",
            )

            if len(selected_names) >= 2:
                st.write(f"**{len(selected_names)} names selected for merging:**")

                # Show which groups these names come from
                groups_involved = set(name_to_group[name] for name in selected_names)
                if len(groups_involved) > 1:
                    st.success(
                        f"🔀 Cross-group merge detected! Merging across groups: {sorted(groups_involved)}"
                    )
                else:
                    st.info(f"📋 Within-group merge (Group {list(groups_involved)[0]})")

                # Let user choose the canonical name
                col1, col2 = st.columns(2)

                with col1:
                    selected_canonical = st.selectbox(
                        "Select standard name:",
                        options=selected_names,
                        key=f"cross_canonical_{merge_group_idx}",
                        index=selected_names.index(
                            max(
                                selected_names,
                                key=lambda x: st.session_state.name_counts[x],
                            )
                        ),
                        help="This will be the final name used for all selected variations",
                    )

                with col2:
                    custom_canonical = st.text_input(
                        "Or enter custom name:",
                        key=f"cross_custom_{merge_group_idx}",
                        placeholder="Leave empty to use selected name",
                        help="Enter a completely new name to use instead",
                    )

                final_canonical = (
                    custom_canonical if custom_canonical else selected_canonical
                )

                # Store mappings for this merge group
                for name in selected_names:
                    if name != final_canonical:
                        cross_group_mappings[name] = final_canonical

                # Show preview
                st.info(
                    f"✅ Will merge {len(selected_names)} names to: **{final_canonical}**"
                )

                # Show detailed mapping
                with st.expander("📋 Detailed Mapping Preview", expanded=False):
                    for name in selected_names:
                        group_num = name_to_group[name]
                        count = st.session_state.name_counts[name]
                        if name == final_canonical:
                            st.write(
                                f"• **{name}** ({count} txns) [Group {group_num}] → **TARGET**"
                            )
                        else:
                            st.write(
                                f"• **{name}** ({count} txns) [Group {group_num}] → **{final_canonical}**"
                            )

            elif len(selected_names) == 1:
                st.info("ℹ️ Only 1 name selected - no merging needed")

            # Option to remove this merge group
            if st.session_state.num_merge_groups > 1:
                if st.button(
                    f"🗑️ Remove Group {merge_group_idx + 1}",
                    key=f"remove_group_{merge_group_idx}",
                ):
                    # This is a bit complex to implement cleanly, so we'll just reset
                    st.warning("To remove groups, use the 'Reset All' button below")

    # Show overall summary and controls
    if cross_group_mappings:
        st.divider()
        st.markdown("### 📋 Cross-Group Merge Summary")

        # Group by target name for cleaner display
        target_groups = {}
        for source, target in cross_group_mappings.items():
            if target not in target_groups:
                target_groups[target] = []
            target_groups[target].append(source)

        for target, sources in target_groups.items():
            # Show which original groups are involved
            all_names_in_merge = sources + [target]
            groups_involved = sorted(
                set(name_to_group[name] for name in all_names_in_merge)
            )

            if len(groups_involved) > 1:
                group_indicator = (
                    f"🔀 Cross-group (Groups {', '.join(map(str, groups_involved))})"
                )
            else:
                group_indicator = f"📋 Within-group (Group {groups_involved[0]})"

            st.write(f"• **{target}** ← {', '.join(sources)} {group_indicator}")

        # Action buttons
        col1, col2, col3 = st.columns(3)

        with col1:
            if st.button("✅ Apply Cross-Group Merges", type="primary"):
                apply_merges(cross_group_mappings)

        with col2:
            if st.button("🔄 Reset All Groups"):
                st.session_state.num_merge_groups = 1
                st.session_state.cross_group_merges = {}
                st.rerun()

        with col3:
            if st.button("➡️ Proceed Without Merging"):
                apply_merges({})

    else:
        st.info(
            "ℹ️ No cross-group merges configured. Create merge groups above or switch to standard mode."
        )

        col1, col2 = st.columns(2)
        with col1:
            if st.button("🔄 Reset Groups"):
                st.session_state.num_merge_groups = 1
                st.rerun()
        with col2:
            if st.button("➡️ Proceed Without Merging"):
                apply_merges({})


def apply_merges(mappings):
    # Store mappings in session state
    st.session_state.merge_mappings = mappings

    # Use the dataframe that already has counterparty columns from find_similar_names()
    df = st.session_state.get("df_for_merging")

    if df is None:
        # Fallback: get analysis dataframe and process it
        df = get_analysis_dataframe()
        if df.empty:
            st.error(
                "No data available for analysis. Please select an analysis scope from the sidebar."
            )
            return

    if df is None or df.empty:
        st.error(
            "No data available for analysis. Please select an analysis scope from the sidebar."
        )
        return

    df = df.copy()

    # If counterparty columns don't exist yet, create them
    if "counterparty" not in df.columns:
        standardizer = st.session_state.standardizer
        df["counterparty"] = ""
        df["COUNTERPARTY_ORIGINAL"] = ""

        for idx, row in df.iterrows():
            desc = row.get("DESCRIPTION", "")
            name = standardizer.extract_counterparty_name(desc)
            if name:
                df.at[idx, "COUNTERPARTY_ORIGINAL"] = name
                df.at[idx, "counterparty"] = name

    # Apply mappings to existing counterparty names
    if mappings:
        for idx, row in df.iterrows():
            original_name = row.get("COUNTERPARTY_ORIGINAL", "")
            if original_name in mappings:
                df.at[idx, "counterparty"] = mappings[original_name]

    # TODO: To check Drop rows where counterparty is blank
    df = df[df["counterparty"].astype(str).str.strip() != ""]

    # Store the processed dataframe back in session state
    st.session_state.df_for_merging = df
    print("Merged head")
    print(df["counterparty"].value_counts())
    print("Merged head")

    # Show detailed success message
    if mappings:
        unique_targets = len(set(mappings.values()))
        st.success(
            f"✅ Applied {len(mappings)} name merges into {unique_targets} consolidated counterparties!"
        )

        # Show what was merged
        with st.expander("📋 View Applied Merges", expanded=False):
            merge_summary = {}
            for orig, merged in mappings.items():
                if merged not in merge_summary:
                    merge_summary[merged] = []
                merge_summary[merged].append(orig)

            for target, sources in merge_summary.items():
                st.write(f"**{target}** ← {', '.join(sources)}")
    else:
        st.success(
            "✅ counterparty analysis complete! All counterparty names remain separate."
        )

        # Show summary of identified counterparties
        counterparty_count = (df["counterparty"] != "").sum()
        unique_counterparties = df[df["counterparty"] != ""]["counterparty"].nunique()

        st.info(
            f"📊 Identified {counterparty_count} counterparty transactions across {unique_counterparties} unique counterparties."
        )


def entity_linking_tab():
    st.header("🔗 Entity Linking")
    st.info(
        "This tool helps you link counterparty names from your transactions to the primary entities for whom you have uploaded statements. "
        "For example, if 'ACME CORP' is a primary entity, this tool can find transactions with counterparties like 'ACME Corporation' or 'ACME C.' and suggest merging them."
    )

    df = get_analysis_dataframe()
    if df.empty:
        st.warning(
            "🎯 Please upload statements and select an analysis scope from the sidebar to begin."
        )
        return

    # --- 1. Data Preparation ---
    # Use merged counterparty data if available
    df_analysis = st.session_state.get("df_for_merging", df).copy()
    if (
        "counterparty" not in df_analysis.columns
        or df_analysis["counterparty"].isnull().all()
    ):
        st.error(
            "❌ No counterparty data found. Please run the 'Counterparty Extraction' tab first to extract counterparty names."
        )
        return

    # Get unique counterparties that are not already primary entities
    primary_entity_names = {
        e["name"].upper() for e in st.session_state.entities.values()
    }

    # Correctly filter out empty or NaN counterparty names before getting unique values
    all_counterparties = df_analysis["counterparty"].dropna()
    all_counterparties = all_counterparties[all_counterparties != ""]
    unique_counterparties = all_counterparties.unique()

    # Filter out counterparties that are already a known primary entity
    counterparties_to_link = [
        cp for cp in unique_counterparties if cp.upper() not in primary_entity_names
    ]

    # Get list of primary entity names to use as choices for linking
    entity_choices = sorted([e["name"] for e in st.session_state.entities.values()])

    if not counterparties_to_link:
        st.success(
            "✅ All identified counterparties are already primary entities. No further linking is needed."
        )
        return

    if not entity_choices:
        st.warning(
            "No primary entities found to link to. Please upload statements for your main entities."
        )
        return

    # --- 2. UI for Linking ---
    st.subheader("Suggesting Links")

    similarity_threshold = st.slider(
        "Similarity Score Threshold",
        min_value=50,
        max_value=100,
        value=75,
        help="How similar names must be to be suggested as a match. Higher is stricter.",
    )

    potential_matches = {}
    for cp in counterparties_to_link:
        # Find the best match among primary entities
        best_match = process.extractOne(
            cp, entity_choices, scorer=fuzz.token_sort_ratio
        )
        if best_match and best_match[1] >= similarity_threshold:
            potential_matches[cp] = {"match": best_match[0], "score": best_match[1]}

    if not potential_matches:
        st.info(
            "No potential links found with the current similarity threshold. Try lowering the threshold."
        )
        return

    st.write(
        f"Found **{len(potential_matches)}** potential links between counterparties and primary entities."
    )

    # --- 3. Display and User Confirmation ---
    confirmed_merges = {}
    col_cp, col_arrow, col_entity, col_score, col_action = st.columns([3, 1, 3, 1, 2])

    with col_cp:
        st.write("**Counterparty Name**")
    with col_arrow:
        st.write("")
    with col_entity:
        st.write("**Primary Entity**")
    with col_score:
        st.write("**Score**")
    with col_action:
        st.write("**Action**")

    for cp, match_info in potential_matches.items():
        with st.container():
            col1, col2, col3, col4, col5 = st.columns([3, 1, 3, 1, 2])
            with col1:
                st.write(cp)
            with col2:
                st.write("➡️")
            with col3:
                st.write(f"**{match_info['match']}**")
            with col4:
                st.write(f"`{match_info['score']}`")
            with col5:
                if st.button("Confirm Merge", key=f"merge_{cp}", type="primary"):
                    confirmed_merges[cp] = match_info["match"]
                    st.toast(
                        f"Confirmed merge: {cp} -> {match_info['match']}", icon="✅"
                    )

    # --- 4. Apply Merges ---
    if confirmed_merges:
        st.divider()
        st.subheader("Apply Confirmed Merges")
        st.write("The following merges will be applied to the dataset:")
        for cp, entity in confirmed_merges.items():
            st.write(f"- `{cp}` will be renamed to **{entity}**")

        if st.button("Apply All Confirmed Merges Now"):
            # Get the dataframe again to be safe
            df_to_update = st.session_state.get(
                "df_for_merging", get_analysis_dataframe()
            ).copy()

            # Apply the merges
            df_to_update["counterparty"] = df_to_update["counterparty"].replace(
                confirmed_merges
            )

            # Update the session state
            st.session_state.df_for_merging = df_to_update

            st.success(f"Successfully applied {len(confirmed_merges)} entity links!")
            st.info(
                "The 'Basic Analytics' and 'Manual Investigation' tabs will now use this updated data."
            )

            st.rerun()


def basic_analytics_tab():
    st.header("📊 Basic Transaction Analytics")

    df = get_analysis_dataframe()
    if df.empty:
        st.info("🎯 Select an analysis scope from the sidebar to begin.")
        return

    # Use merged counterparty data if available and extract counterparty names if not
    df_analysis = df.copy()

    # Ensure proper data types to avoid column configuration issues
    if "DESCRIPTION" in df_analysis.columns:
        df_analysis["DESCRIPTION"] = df_analysis["DESCRIPTION"].astype(str).fillna("")
    if "DEBIT" in df_analysis.columns:
        df_analysis["DEBIT"] = pd.to_numeric(df_analysis["DEBIT"], errors="coerce")
    if "CREDIT" in df_analysis.columns:
        df_analysis["CREDIT"] = pd.to_numeric(df_analysis["CREDIT"], errors="coerce")

    merged_df = st.session_state.get("df_for_merging")

    # Check if we need to extract counterparty data
    if "counterparty" not in df_analysis.columns:
        if (
            merged_df is not None
            and not merged_df.empty
            and "counterparty" in merged_df.columns
        ):
            # Try to align merged counterparty data with current scope
            # Create a mapping based on DATE, DESCRIPTION, and amounts to match transactions
            try:
                # Create unique identifiers for transactions
                df_analysis["_temp_id"] = (
                    df_analysis["DATE"].astype(str)
                    + "_"
                    + df_analysis["DESCRIPTION"].astype(str)
                    + "_"
                    + df_analysis["DEBIT"].fillna(0).astype(str)
                    + "_"
                    + df_analysis["CREDIT"].fillna(0).astype(str)
                )
                merged_df["_temp_id"] = (
                    merged_df["DATE"].astype(str)
                    + "_"
                    + merged_df["DESCRIPTION"].astype(str)
                    + "_"
                    + merged_df["DEBIT"].fillna(0).astype(str)
                    + "_"
                    + merged_df["CREDIT"].fillna(0).astype(str)
                )

                # Merge counterparty data based on transaction matching
                counterparty_mapping = merged_df[
                    ["_temp_id", "counterparty", "COUNTERPARTY_ORIGINAL"]
                ].drop_duplicates()
                df_analysis = df_analysis.merge(
                    counterparty_mapping, on="_temp_id", how="left"
                )

                # Clean up temporary columns
                df_analysis = df_analysis.drop("_temp_id", axis=1)

                # Fill missing counterparty values with empty string
                df_analysis["counterparty"] = df_analysis["counterparty"].fillna("")
                df_analysis["COUNTERPARTY_ORIGINAL"] = df_analysis[
                    "COUNTERPARTY_ORIGINAL"
                ].fillna("")

                if df_analysis["counterparty"].notna().any():
                    st.info("✅ Using merged counterparty data for enhanced analysis")

            except Exception as e:
                st.warning(f"Could not align counterparty data: {str(e)}")
                # Fallback: extract counterparty names directly
                df_analysis = extract_counterparty_for_analysis(df_analysis)
        else:
            # Extract counterparty names directly from descriptions
            df_analysis = extract_counterparty_for_analysis(df_analysis)
    else:
        # Counterparty column already exists
        if (
            merged_df is not None
            and not merged_df.empty
            and "counterparty" in merged_df.columns
        ):
            st.info("✅ Using existing counterparty data")

    # Date is already converted when loading, no need to convert again

    # Helper function to categorize transactions as cash or bank
    def categorize_transaction_type(description):
        """Categorize transaction as 'cash' or 'bank' based on description"""
        if pd.isna(description):
            return "bank"

        desc_upper = str(description).upper()
        cash_keywords = ["CASH", "ATM", "WITHDRAWAL", "CHQ"]

        # Check for cash indicators
        if any(keyword in desc_upper for keyword in cash_keywords):
            return "cash"

        # Check for bank transfer indicators
        bank_keywords = ["NEFT", "RTGS", "IMPS", "UPI", "DEPOSIT BY", "TRANSFER"]
        if any(keyword in desc_upper for keyword in bank_keywords):
            return "bank"

        # Default to bank for unclear cases
        return "bank"

    # Add transaction type categorization
    df_analysis["txn_type"] = df_analysis["DESCRIPTION"].apply(
        categorize_transaction_type
    )

    # Overall metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        total_txns = len(df_analysis)
        st.metric("Total Transactions", f"{total_txns:,}")

    with col2:
        total_debit = df_analysis["DEBIT"].fillna(0).sum()
        st.metric("Total Debits", f"₹{total_debit:,.0f}")

    with col3:
        total_credit = df_analysis["CREDIT"].fillna(0).sum()
        st.metric("Total Credits", f"₹{total_credit:,.0f}")

    with col4:
        net_flow = total_credit - total_debit
        st.metric(
            "Net Flow",
            f"₹{net_flow:,.0f}",
            delta=f"{'Inflow' if net_flow > 0 else 'Outflow'}",
        )

    # Cash vs Bank bifurcation
    st.subheader("💰 Cash vs Bank Breakdown")

    # Calculate cash and bank amounts
    cash_txns = df_analysis[df_analysis["txn_type"] == "cash"]
    bank_txns = df_analysis[df_analysis["txn_type"] == "bank"]

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        cash_debit = cash_txns["DEBIT"].fillna(0).sum()
        bank_debit = bank_txns["DEBIT"].fillna(0).sum()
        st.metric("Cash Debits", f"₹{cash_debit:,.0f}")
        st.caption(f"Bank Debits: ₹{bank_debit:,.0f}")

    with col2:
        cash_credit = cash_txns["CREDIT"].fillna(0).sum()
        bank_credit = bank_txns["CREDIT"].fillna(0).sum()
        st.metric("Cash Credits", f"₹{cash_credit:,.0f}")
        st.caption(f"Bank Credits: ₹{bank_credit:,.0f}")

    with col3:
        cash_count = len(cash_txns)
        bank_count = len(bank_txns)
        st.metric("Cash Transactions", f"{cash_count:,}")
        st.caption(f"Bank Transactions: {bank_count:,}")

    with col4:
        cash_net = cash_credit - cash_debit
        bank_net = bank_credit - bank_debit
        st.metric("Cash Net Flow", f"₹{cash_net:,.0f}")
        st.caption(f"Bank Net Flow: ₹{bank_net:,.0f}")

    st.divider()

    # counterparty analysis
    # Ensure counterparty column exists
    # if "counterparty" not in df_analysis.columns:
    #     # Extract counterparty names from descriptions
    #     standardizer = CounterpartyStandardizer(85)
    #     df_analysis["counterparty"] = ""

    #     for idx, row in df_analysis.iterrows():
    #         desc = row.get("DESCRIPTION", "")
    #         name = standardizer.extract_counterparty_name(desc)
    #         if name:
    #             df_analysis.at[idx, "counterparty"] = name

    if "counterparty" in df_analysis.columns:
        st.subheader("🏢 counterparty Analysis")

        df_cp = df_analysis[df_analysis["counterparty"] != ""].copy()

        if len(df_cp) > 0:
            # Calculate stats per counterparty
            cp_stats = (
                df_cp.groupby("counterparty")
                .agg(
                    {
                        "DEBIT": ["count", "sum", "mean", "max"],
                        "CREDIT": ["count", "sum", "mean", "max"],
                        "DATE": ["min", "max"],
                    }
                )
                .round(2)
            )

            # Flatten column names
            cp_stats.columns = [
                "_".join(col).strip() for col in cp_stats.columns.values
            ]

            # Calculate additional metrics
            cp_stats["total_transactions"] = (
                cp_stats["DEBIT_count"] + cp_stats["CREDIT_count"]
            )
            cp_stats["total_volume"] = cp_stats["DEBIT_sum"].fillna(0) + cp_stats[
                "CREDIT_sum"
            ].fillna(0)
            cp_stats["net_flow"] = cp_stats["CREDIT_sum"].fillna(0) - cp_stats[
                "DEBIT_sum"
            ].fillna(0)
            cp_stats["days_active"] = (
                cp_stats["DATE_max"] - cp_stats["DATE_min"]
            ).dt.days + 1
            cp_stats["txn_frequency"] = (
                cp_stats["total_transactions"] / cp_stats["days_active"]
            )

            # Sort by total volume
            cp_stats = cp_stats.sort_values("total_volume", ascending=False)

            # Display options
            col1, col2 = st.columns([1, 3])

            with col1:
                sort_by = st.selectbox(
                    "Sort by:",
                    options=[
                        "total_volume",
                        "total_transactions",
                        "net_flow",
                        "txn_frequency",
                    ],
                    format_func=lambda x: {
                        "total_volume": "Total Volume",
                        "total_transactions": "Transaction Count",
                        "net_flow": "Net Flow",
                        "txn_frequency": "Transaction Frequency",
                    }[x],
                )

                top_n = st.slider("Show top N counterparties:", 5, 50, 10)

            with col2:
                # Bar chart
                top_cp = cp_stats.nlargest(top_n, sort_by)

                fig = px.bar(
                    top_cp.reset_index(),
                    x="counterparty",
                    y=sort_by,
                    title=f"Top {top_n} Counterparties by {sort_by.replace('_', ' ').title()}",
                )
                st.plotly_chart(fig, use_container_width=True)

            # Detailed table
            st.subheader("📋 Detailed counterparty Statistics")

            # Format the display
            display_df = cp_stats.head(top_n).copy()
            display_df["DEBIT_sum"] = display_df["DEBIT_sum"].apply(
                lambda x: f"₹{x:,.0f}" if pd.notna(x) else "-"
            )
            display_df["CREDIT_sum"] = display_df["CREDIT_sum"].apply(
                lambda x: f"₹{x:,.0f}" if pd.notna(x) else "-"
            )
            display_df["total_volume"] = display_df["total_volume"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            display_df["net_flow"] = display_df["net_flow"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            display_df["txn_frequency"] = display_df["txn_frequency"].apply(
                lambda x: f"{x:.1f}/day"
            )

            # Select columns to display
            display_cols = [
                "total_transactions",
                "DEBIT_sum",
                "CREDIT_sum",
                "total_volume",
                "net_flow",
                "days_active",
                "txn_frequency",
            ]

            st.dataframe(
                display_df[display_cols],
                use_container_width=True,
                column_config={
                    "total_transactions": "Total Txns",
                    "DEBIT_sum": "Total Debits",
                    "CREDIT_sum": "Total Credits",
                    "total_volume": "Total Volume",
                    "net_flow": "Net Flow",
                    "days_active": "Days Active",
                    "txn_frequency": "Avg Frequency",
                },
            )

    # Time-based analysis
    st.divider()
    st.subheader("📅 Time-based Analysis")

    col1, col2 = st.columns(2)

    with col1:
        # Daily transaction volume
        daily_volume = (
            df_analysis.groupby(df_analysis["DATE"].dt.date)
            .agg({"DEBIT": "sum", "CREDIT": "sum"})
            .fillna(0)
        )

        fig = go.Figure()
        fig.add_trace(
            go.Scatter(
                x=daily_volume.index,
                y=daily_volume["DEBIT"],
                name="Debits",
                line=dict(color="red"),
            )
        )
        fig.add_trace(
            go.Scatter(
                x=daily_volume.index,
                y=daily_volume["CREDIT"],
                name="Credits",
                line=dict(color="green"),
            )
        )
        fig.update_layout(
            title="Daily Transaction Volume",
            xaxis_title="Date",
            yaxis_title="Amount (₹)",
        )
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        # Transaction frequency heatmap
        df["day_of_week"] = df["DATE"].dt.day_name()
        df["week"] = df["DATE"].dt.isocalendar().week

        heatmap_data = (
            df.groupby(["week", "day_of_week"]).size().reset_index(name="count")
        )

        # Ensure proper day ordering
        day_order = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ]
        heatmap_pivot = heatmap_data.pivot(
            index="week", columns="day_of_week", values="count"
        ).fillna(0)
        heatmap_pivot = heatmap_pivot.reindex(columns=day_order, fill_value=0)

        fig = px.imshow(
            heatmap_pivot.T,
            labels=dict(x="Week", y="Day", color="Transactions"),
            title="Transaction Frequency Heatmap",
        )
        st.plotly_chart(fig, use_container_width=True)


def common_counterparty_analysis(df, show_visualization=False):
    st.subheader("🤝 Common counterparty Analysis")
    st.info(
        "This tool finds counterparties that have transacted with multiple entities, "
        "which can be an indicator of layering or other coordinated financial activities."
    )

    # This analysis is most effective when analyzing multiple entities.
    num_entities = len(st.session_state.get("entities", {}))
    if num_entities < 2:
        st.warning(
            f"⚠️ Only {num_entities} entity loaded. This analysis is most effective with statements from at least two different entities."
        )
        return

    # Use merged counterparty data if available, otherwise use the base dataframe.
    df_analysis = st.session_state.get("df_for_merging", df)

    if (
        "counterparty" not in df_analysis.columns
        or "entity_owner" not in df_analysis.columns
    ):
        st.error(
            "Required columns ('counterparty', 'entity_owner') not found. "
            "Please run 'Counterparty Extraction' first to identify counterparties."
        )
        return

    # Filter out transactions without a counterparty or entity owner
    df_filtered = df_analysis.dropna(subset=["counterparty", "entity_owner"])
    df_filtered = df_filtered[df_filtered["counterparty"] != ""]

    if df_filtered.empty:
        st.info("No counterparty transactions found to analyze.")
        return

    # Find common counterparties
    cp_entities = (
        df_filtered.groupby("counterparty")["entity_owner"].unique().apply(list)
    )
    common_cps = cp_entities[cp_entities.apply(len) > 1]

    if not common_cps.empty:
        st.success(
            f"Found {len(common_cps)} counterparties transacting with multiple entities."
        )

        # Add visualization option
        col1, col2 = st.columns([3, 1])
        with col2:
            show_viz = st.checkbox(
                "🕸️ Show Network Visualization",
                value=show_visualization,
                help="Display common counterparty relationships in an interactive network graph",
            )

        # Prepare data for display
        results = []
        for cp, entities in common_cps.items():
            # Get transaction details for this common counterparty
            cp_txns = df_filtered[df_filtered["counterparty"] == cp]
            total_txns = len(cp_txns)
            total_debit = cp_txns["DEBIT"].sum()
            total_credit = cp_txns["CREDIT"].sum()

            results.append(
                {
                    "counterparty": cp,
                    "Interacted Entities": ", ".join(entities),
                    "Entity Count": len(entities),
                    "Total Transactions": total_txns,
                    "Total Debit": f"₹{total_debit:,.0f}",
                    "Total Credit": f"₹{total_credit:,.0f}",
                }
            )

        results_df = pd.DataFrame(results).sort_values("Entity Count", ascending=False)

        # Display tabular results
        st.dataframe(results_df, use_container_width=True, hide_index=True)

        # Show network visualization if requested
        if show_viz:
            st.divider()
            st.subheader("🕸️ Common Counterparty Network Visualization")
            _display_common_counterparty_network(df_filtered, common_cps)

        # Allow user to select a counterparty to see detailed transactions
        st.divider()
        st.subheader("🔍 Drill-down into Common counterparty Transactions")
        selected_cp = st.selectbox(
            "Select a counterparty to view transactions:",
            options=[""] + list(common_cps.index),
        )

        if selected_cp:
            st.write(f"**Transactions for {selected_cp}**")
            cp_details_df = df_filtered[
                df_filtered["counterparty"] == selected_cp
            ].copy()
            display_cols = [
                "DATE",
                "entity_owner",
                "account_name",
                "DESCRIPTION",
                "DEBIT",
                "CREDIT",
            ]
            cp_details_df["DATE"] = cp_details_df["DATE"].dt.date
            st.dataframe(
                cp_details_df[display_cols], use_container_width=True, hide_index=True
            )

            # Show relationship visualization for selected counterparty
            if show_viz:
                st.markdown("#### 🔗 Relationship Visualization")
                _display_counterparty_relationship_details(df_filtered, selected_cp)

    else:
        st.info("No common counterparties found across the loaded entities.")


def _display_common_counterparty_network(df_filtered, common_cps):
    """
    Display network visualization highlighting common counterparty relationships.
    Shows entities and counterparties with node size and color based on connectivity levels.
    """
    try:
        # Create visualization config with law enforcement styling
        viz_config = VisualizationConfig(
            node_size_range=(20, 60),
            show_labels=True,
            highlight_cycles=False,
            color_scheme="viridis",
        )

        # Create NetworkVisualizer instance
        visualizer = NetworkVisualizer(config=viz_config)

        # Create common counterparty visualization using NetworkVisualizer method
        fig = visualizer.create_common_counterparty_visualization(
            df=df_filtered, title="Common Counterparty Network Analysis"
        )

        # Display the visualization
        st.plotly_chart(fig, use_container_width=True)

        # Display network statistics
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            entity_count = len(df_filtered["entity_owner"].unique())
            st.metric("Total Entities", entity_count)
        with col2:
            st.metric("Common Counterparties", len(common_cps))
        with col3:
            total_relationships = sum(len(entities) for entities in common_cps.values())
            st.metric("Total Relationships", total_relationships)
        with col4:
            avg_connections = (
                total_relationships / len(common_cps) if len(common_cps) > 0 else 0
            )
            st.metric("Avg Connections", f"{avg_connections:.1f}")

        # Display hub entities (those with 3+ counterparty relationships)
        entity_cp_counts = df_filtered.groupby("entity_owner")["counterparty"].nunique()
        hub_entities = entity_cp_counts[entity_cp_counts >= 3]

        if not hub_entities.empty:
            st.markdown("#### 🔴 Hub Entities (3+ Counterparty Relationships)")
            hub_data = []
            for entity, cp_count in hub_entities.items():
                entity_txns = df_filtered[df_filtered["entity_owner"] == entity]
                total_volume = (
                    entity_txns["DEBIT"].fillna(0).sum()
                    + entity_txns["CREDIT"].fillna(0).sum()
                )
                hub_data.append(
                    {
                        "Entity": entity,
                        "Counterparty Count": cp_count,
                        "Total Volume": f"₹{total_volume:,.2f}",
                        "Total Transactions": len(entity_txns),
                    }
                )

            hub_df = pd.DataFrame(hub_data).sort_values(
                "Counterparty Count", ascending=False
            )
            st.dataframe(hub_df, use_container_width=True, hide_index=True)

    except ImportError as e:
        st.error(
            f"❌ Error importing required modules for network visualization: {str(e)}"
        )
    except Exception as e:
        st.error(f"❌ Error creating network visualization: {str(e)}")
        st.info("Please ensure all required data is available and properly formatted.")


def _display_counterparty_relationship_details(df_filtered, selected_cp):
    """
    Display detailed relationship visualization for a selected counterparty.
    Shows transaction volumes and frequencies for each entity relationship.
    """
    try:
        from plotly.subplots import make_subplots

        # Get transactions for selected counterparty
        cp_txns = df_filtered[df_filtered["counterparty"] == selected_cp]

        if cp_txns.empty:
            st.warning("No transaction data found for selected counterparty.")
            return

        # Analyze relationships by entity
        entity_analysis = []
        for entity in cp_txns["entity_owner"].unique():
            entity_txns = cp_txns[cp_txns["entity_owner"] == entity]

            total_debit = entity_txns["DEBIT"].fillna(0).sum()
            total_credit = entity_txns["CREDIT"].fillna(0).sum()
            total_volume = total_debit + total_credit
            transaction_count = len(entity_txns)

            # Calculate date range
            date_range = entity_txns["DATE"].max() - entity_txns["DATE"].min()

            entity_analysis.append(
                {
                    "Entity": entity,
                    "Total Volume": total_volume,
                    "Total Debit": total_debit,
                    "Total Credit": total_credit,
                    "Transaction Count": transaction_count,
                    "Date Range (Days)": date_range.days,
                    "Avg Transaction Size": total_volume / transaction_count
                    if transaction_count > 0
                    else 0,
                }
            )

        analysis_df = pd.DataFrame(entity_analysis)

        # Create subplots for detailed analysis
        fig = make_subplots(
            rows=2,
            cols=2,
            subplot_titles=(
                "Transaction Volume by Entity",
                "Transaction Count by Entity",
                "Average Transaction Size",
                "Transaction Timeline",
            ),
            specs=[
                [{"secondary_y": False}, {"secondary_y": False}],
                [{"secondary_y": False}, {"secondary_y": False}],
            ],
        )

        # Volume by entity
        fig.add_trace(
            go.Bar(
                x=analysis_df["Entity"],
                y=analysis_df["Total Volume"],
                name="Total Volume",
                marker_color="lightblue",
                showlegend=False,
            ),
            row=1,
            col=1,
        )

        # Transaction count by entity
        fig.add_trace(
            go.Bar(
                x=analysis_df["Entity"],
                y=analysis_df["Transaction Count"],
                name="Transaction Count",
                marker_color="lightgreen",
                showlegend=False,
            ),
            row=1,
            col=2,
        )

        # Average transaction size
        fig.add_trace(
            go.Bar(
                x=analysis_df["Entity"],
                y=analysis_df["Avg Transaction Size"],
                name="Avg Transaction Size",
                marker_color="lightcoral",
                showlegend=False,
            ),
            row=2,
            col=1,
        )

        # Transaction timeline
        timeline_data = (
            cp_txns.groupby(["entity_owner", cp_txns["DATE"].dt.date])
            .size()
            .reset_index()
        )
        timeline_data.columns = ["Entity", "Date", "Count"]

        for entity in timeline_data["Entity"].unique():
            entity_timeline = timeline_data[timeline_data["Entity"] == entity]
            fig.add_trace(
                go.Scatter(
                    x=entity_timeline["Date"],
                    y=entity_timeline["Count"],
                    mode="lines+markers",
                    name=entity,
                    showlegend=True,
                ),
                row=2,
                col=2,
            )

        # Update layout
        fig.update_layout(
            title=f"Detailed Analysis: {selected_cp}", height=800, showlegend=True
        )

        # Update axes labels
        fig.update_xaxes(title_text="Entity", row=1, col=1)
        fig.update_yaxes(title_text="Volume (₹)", row=1, col=1)
        fig.update_xaxes(title_text="Entity", row=1, col=2)
        fig.update_yaxes(title_text="Count", row=1, col=2)
        fig.update_xaxes(title_text="Entity", row=2, col=1)
        fig.update_yaxes(title_text="Avg Size (₹)", row=2, col=1)
        fig.update_xaxes(title_text="Date", row=2, col=2)
        fig.update_yaxes(title_text="Transactions", row=2, col=2)

        # Display the visualization
        st.plotly_chart(fig, use_container_width=True)

        # Display summary table
        st.markdown("#### 📊 Relationship Summary")
        summary_df = analysis_df.copy()
        summary_df["Total Volume"] = summary_df["Total Volume"].apply(
            lambda x: f"₹{x:,.2f}"
        )
        summary_df["Total Debit"] = summary_df["Total Debit"].apply(
            lambda x: f"₹{x:,.2f}"
        )
        summary_df["Total Credit"] = summary_df["Total Credit"].apply(
            lambda x: f"₹{x:,.2f}"
        )
        summary_df["Avg Transaction Size"] = summary_df["Avg Transaction Size"].apply(
            lambda x: f"₹{x:,.2f}"
        )

        st.dataframe(summary_df, use_container_width=True, hide_index=True)

    except Exception as e:
        st.error(f"❌ Error creating relationship details: {str(e)}")
        st.info("Displaying basic transaction information instead.")

        # Fallback to simple transaction display
        st.dataframe(
            cp_txns[["DATE", "entity_owner", "DESCRIPTION", "DEBIT", "CREDIT"]],
            use_container_width=True,
            hide_index=True,
        )


def time_based_trends_tab():
    """Enhanced time-based analysis tab for transaction trends"""
    st.header("📈 Time-Based Transaction Trends")

    df = st.session_state.get("df_for_merging")
    if df is None:
        return

    if df.empty:
        st.info("🎯 Select an analysis scope from the sidebar to begin.")
        return

    # Initialize time-based analytics
    if "time_analytics" not in st.session_state:
        st.session_state.time_analytics = TimeBasedAnalytics()

    analytics = st.session_state.time_analytics

    # Configuration options
    st.subheader("⚙️ Analysis Configuration")
    col1, col2, col3 = st.columns(3)

    with col1:
        time_granularity = st.selectbox(
            "Time Granularity",
            options=["daily", "weekly", "monthly", "hourly"],
            index=0,
            help="Choose the time period for aggregating transactions",
        )

    with col2:
        analysis_type = st.selectbox(
            "Analysis Focus",
            options=["comprehensive", "trends_only", "anomalies_only", "patterns_only"],
            index=0,
            help="Choose what aspects to analyze",
        )

    with col3:
        if st.button("🔄 Refresh Analysis", type="primary"):
            # Clear cache and rerun analysis
            if "time_analysis_cache" in st.session_state:
                del st.session_state["time_analysis_cache"]

    # Cache key for analysis results
    cache_key = f"time_analysis_{time_granularity}_{analysis_type}_{len(df)}"

    # Run analysis (with caching)
    if cache_key not in st.session_state.get("time_analysis_cache", {}):
        with st.spinner("🔍 Analyzing transaction trends..."):
            try:
                analysis_results = analytics.analyze_transaction_trends(
                    df, time_granularity=time_granularity
                )

                # Cache results
                if "time_analysis_cache" not in st.session_state:
                    st.session_state.time_analysis_cache = {}
                st.session_state.time_analysis_cache[cache_key] = analysis_results

            except Exception as e:
                st.error(f"❌ Analysis failed: {str(e)}")
                return
    else:
        analysis_results = st.session_state.time_analysis_cache[cache_key]

    if "error" in analysis_results:
        st.error(f"❌ {analysis_results['error']}")
        return

    # Display insights
    st.subheader("💡 Key Insights")
    insights = analytics.generate_trend_insights(analysis_results)

    if insights:
        for insight in insights[:8]:  # Show top 8 insights
            st.info(insight)
    else:
        st.info("No significant insights detected in the current data.")

    # Create visualization tabs
    viz_tabs = st.tabs(
        [
            "📊 Overview Dashboard",
            "📈 Trend Analysis",
            "👥 Counterparty Trends",
            "Mule Account Detection",
            "Anomaly Detection",
            "Pattelrn Analysis",
            "📋 Detailed Metrics",
        ]
    )

    with viz_tabs[0]:
        st.subheader("📊 Transaction Trends Dashboard")
        try:
            dashboard_fig = analytics.create_trend_dashboard(analysis_results)
            st.plotly_chart(dashboard_fig, use_container_width=True)
        except Exception as e:
            st.error(f"Dashboard creation failed: {str(e)}")

    with viz_tabs[1]:
        st.subheader("📈 Detailed Trend Analysis")

        if "trend_analysis" in analysis_results:
            trends = analysis_results["trend_analysis"]

            # Overall assessment
            if "overall_assessment" in trends:
                assessment = trends["overall_assessment"]

                col1, col2 = st.columns(2)
                with col1:
                    st.metric(
                        "Debit Trend",
                        assessment.get("debit_trend_direction", "Unknown"),
                        f"Strength: {assessment.get('debit_trend_strength', 0):.2f}",
                    )

                with col2:
                    st.metric(
                        "Credit Trend",
                        assessment.get("credit_trend_direction", "Unknown"),
                        f"Strength: {assessment.get('credit_trend_strength', 0):.2f}",
                    )

                if assessment.get("trends_aligned"):
                    st.success("✅ Debit and credit trends are aligned")
                else:
                    st.warning("⚠️ Debit and credit trends are diverging")

            # Individual metric trends
            st.subheader("📊 Individual Metric Trends")
            for metric, trend_data in trends.items():
                if isinstance(trend_data, dict) and "slope" in trend_data:
                    with st.expander(f"📈 {metric.replace('_', ' ').title()} Trend"):
                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric("Slope", f"{trend_data['slope']:.2f}")
                        with col2:
                            st.metric("R²", f"{trend_data['r_squared']:.3f}")
                        with col3:
                            st.metric(
                                "Strength", trend_data.get("trend_strength", "Unknown")
                            )

    with viz_tabs[2]:
        st.subheader("👥 Counterparty Trend Analysis")

        # Initialize counterparty analyzer
        if "counterparty_analyzer" not in st.session_state:
            st.session_state.counterparty_analyzer = CounterpartyTrendAnalyzer()

        cp_analyzer = st.session_state.counterparty_analyzer

        # Configuration for counterparty analysis
        col1, col2 = st.columns(2)
        with col1:
            min_transactions = st.slider(
                "Minimum Transactions",
                min_value=2,
                max_value=10,
                value=3,
                help="Minimum number of transactions required to analyze a counterparty",
            )
        with col2:
            risk_threshold = st.slider(
                "Risk Threshold",
                min_value=0.1,
                max_value=1.0,
                value=0.6,
                step=0.1,
                help="Risk score threshold for flagging counterparties",
            )

        # Check if we have counterparty data
        if "counterparty" not in df.columns or df["counterparty"].isna().all():
            st.warning(
                "⚠️ No counterparty data available. Please ensure counterparty extraction has been performed."
            )
        else:
            # Run counterparty analysis
            cp_cache_key = f"cp_analysis_{min_transactions}_{len(df)}"

            if cp_cache_key not in st.session_state.get("time_analysis_cache", {}):
                with st.spinner("🔍 Analyzing counterparty trends..."):
                    try:
                        cp_results = cp_analyzer.analyze_counterparty_trends(
                            df, min_transactions=min_transactions
                        )

                        # Cache results
                        if "time_analysis_cache" not in st.session_state:
                            st.session_state.time_analysis_cache = {}
                        st.session_state.time_analysis_cache[cp_cache_key] = cp_results

                    except Exception as e:
                        st.error(f"❌ Counterparty analysis failed: {str(e)}")
                        cp_results = {}
            else:
                cp_results = st.session_state.time_analysis_cache[cp_cache_key]

            if cp_results:
                # Display insights
                st.subheader("💡 Counterparty Insights")
                cp_insights = cp_analyzer.generate_counterparty_insights(cp_results)
                for insight in cp_insights:
                    st.info(insight)

                # Create dashboard
                st.subheader("📊 Counterparty Dashboard")
                try:
                    cp_dashboard = cp_analyzer.create_counterparty_dashboard(cp_results)
                    st.plotly_chart(cp_dashboard, use_container_width=True)
                except Exception as e:
                    st.error(f"Dashboard creation failed: {str(e)}")

                # High-risk counterparties
                high_risk_cps = cp_analyzer.get_high_risk_counterparties(
                    cp_results, risk_threshold
                )

                if high_risk_cps:
                    st.subheader("🚨 High-Risk Counterparties")

                    for cp in high_risk_cps[:5]:  # Show top 5 high-risk
                        with st.expander(
                            f"🔴 {cp.counterparty_name} (Risk: {cp.risk_score:.2f})"
                        ):
                            col1, col2, col3 = st.columns(3)

                            with col1:
                                st.metric("Transactions", cp.transaction_count)
                                st.metric("Total Volume", f"₹{cp.total_volume:,.2f}")

                            with col2:
                                st.metric("Net Flow", f"₹{cp.net_flow:,.2f}")
                                st.metric("Trend", cp.trend_direction.title())

                            with col3:
                                st.metric("Risk Score", f"{cp.risk_score:.2f}")
                                if cp.velocity_metrics:
                                    txn_per_day = cp.velocity_metrics.get(
                                        "transactions_per_day", 0
                                    )
                                    st.metric("Txn/Day", f"{txn_per_day:.2f}")

                            # Show behavioral changes
                            if cp.behavioral_changes:
                                st.write("**Behavioral Changes:**")
                                for change in cp.behavioral_changes:
                                    severity_icon = (
                                        "🔴" if change["severity"] == "high" else "🟡"
                                    )
                                    st.write(f"{severity_icon} {change['description']}")

                # Export option
                if st.button("📥 Export Counterparty Analysis"):
                    export_df = cp_analyzer.export_counterparty_analysis(cp_results)
                    csv = export_df.to_csv(index=False)
                    st.download_button(
                        label="Download CSV",
                        data=csv,
                        file_name=f"counterparty_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                        mime="text/csv",
                    )
            else:
                st.info(
                    "No counterparties found meeting the minimum transaction criteria."
                )

    with viz_tabs[3]:
        st.subheader("🚨 Mule Account Pattern Detection")

        # Debug information about the data being analyzed
        if not df.empty:
            has_date_column = "DATE" in df.columns
            date_info = (
                f"{df['DATE'].min().strftime('%Y-%m-%d')} to {df['DATE'].max().strftime('%Y-%m-%d')}"
                if has_date_column
                else "No DATE column"
            )

            st.info(f"""
            **Data Being Analyzed:**
            - Total Transactions: {len(df):,}
            - Date Range: {date_info}
            - Columns Available: {", ".join(df.columns)}
            - Individual Transactions: {"✅ Yes" if has_date_column and len(df) > 1 else "❌ No - Need individual transaction data"}
            """)

            if not has_date_column:
                st.error("""
                ❌ **Cannot Perform Multi-Interval Analysis**
                
                The current data appears to be aggregated counterparty summaries, not individual transactions.
                Multi-interval mule detection requires individual transaction records with dates.
                
                **Required Data Format:**
                - Individual transaction rows
                - DATE column with transaction timestamps
                - DEBIT and CREDIT columns with amounts
                """)

        # Initialize mule account detector
        if "mule_detector" not in st.session_state:
            st.session_state.mule_detector = MuleAccountDetector()

        mule_detector = st.session_state.mule_detector

        # Configuration for mule detection (now adaptive)
        st.subheader("🧠 Adaptive Pattern Detection")

        st.info("""
        **Intelligent Detection**: This system automatically adapts to each account's unique transaction patterns.
        Instead of using fixed thresholds, it analyzes the account's own data to identify:
        - Small vs large amounts (relative to the account's typical transactions)
        - Collection vs disbursement patterns  
        - Timing anomalies and suspicious behaviors
        """)

        col1, col2, col3 = st.columns(3)

        with col1:
            min_collections = st.slider(
                "Minimum Collection Transactions",
                min_value=3,
                max_value=15,
                value=5,
                help="Minimum number of credit transactions required for pattern analysis",
            )

        with col2:
            sensitivity = st.selectbox(
                "Detection Sensitivity",
                options=["Low", "Medium", "High"],
                index=1,
                help="Higher sensitivity detects more subtle patterns but may increase false positives",
            )

        with col3:
            pattern_focus = st.selectbox(
                "Pattern Focus",
                options=[
                    "All Patterns",
                    "Classic Mule",
                    "Periodic Only",
                    "Threshold Avoidance",
                ],
                index=0,
                help="Focus detection on specific mule account patterns",
            )

        # Update detector configuration with adaptive parameters
        sensitivity_multipliers = {"Low": 0.8, "Medium": 1.0, "High": 1.2}
        mule_detector.config.update(
            {
                "min_collection_transactions": min_collections,
                "sensitivity_multiplier": sensitivity_multipliers[sensitivity],
                "pattern_focus": pattern_focus.lower().replace(" ", "_"),
            }
        )

        # Get current analysis scope for account identification
        analysis_scope = st.session_state.get("analysis_scope", "Unknown")
        account_name = "Unknown Account"

        if analysis_scope in st.session_state.get("accounts", {}):
            account_data = st.session_state.accounts[analysis_scope]
            account_name = account_data.get("account_name", "Unknown Account")
        elif analysis_scope in st.session_state.get("entities", {}):
            entity_data = st.session_state.entities[analysis_scope]
            account_name = f"Entity: {entity_data.get('name', 'Unknown')}"

        # Run mule account detection
        mule_cache_key = f"mule_detection_adaptive_{min_collections}_{sensitivity}_{pattern_focus}_{len(df)}"

        if mule_cache_key not in st.session_state.get("time_analysis_cache", {}):
            with st.spinner("🔍 Analyzing for mule account patterns..."):
                try:
                    mule_alerts = mule_detector.detect_mule_patterns(
                        df, account_identifier=account_name
                    )

                    # Cache results
                    if "time_analysis_cache" not in st.session_state:
                        st.session_state.time_analysis_cache = {}
                    st.session_state.time_analysis_cache[mule_cache_key] = mule_alerts

                except Exception as e:
                    st.error(f"❌ Mule detection failed: {str(e)}")
                    mule_alerts = []
        else:
            mule_alerts = st.session_state.time_analysis_cache[mule_cache_key]

        # Display results
        if mule_alerts:
            # Summary
            summary = mule_detector.create_mule_detection_summary(mule_alerts)

            st.subheader("🚨 MULE ACCOUNT ALERTS DETECTED")

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Total Alerts", summary["total_alerts"])
            with col2:
                st.metric("Highest Confidence", f"{summary['highest_confidence']:.2f}")
            with col3:
                st.metric("High Confidence", summary["high_confidence_alerts"])
            with col4:
                pattern_types = ", ".join(summary["pattern_types"].keys())
                st.metric("Pattern Types", len(summary["pattern_types"]))

            # Display each alert
            for i, alert in enumerate(mule_alerts):
                severity_color = (
                    "🔴"
                    if alert.confidence_score >= 0.8
                    else "🟡"
                    if alert.confidence_score >= 0.6
                    else "🟢"
                )

                with st.expander(
                    f"{severity_color} Alert {i + 1}: {alert.pattern_type.replace('_', ' ').title()} (Confidence: {alert.confidence_score:.2f})",
                    expanded=alert.confidence_score >= 0.7,
                ):
                    # Alert overview
                    col1, col2 = st.columns(2)
                    with col1:
                        st.write("**Detection Period:**")
                        st.write(
                            f"📅 {alert.detection_period['start_date']} to {alert.detection_period['end_date']}"
                        )
                        st.write(f"⏱️ {alert.detection_period['total_days']} days")
                        st.write(
                            f"🎯 Pattern: {alert.pattern_type.replace('_', ' ').title()}"
                        )

                    with col2:
                        st.write("**Risk Assessment:**")
                        st.write(f"⚠️ Confidence: {alert.confidence_score:.2f}/1.0")
                        if alert.confidence_score >= 0.8:
                            st.error("🚨 HIGH RISK - Immediate action required")
                        elif alert.confidence_score >= 0.6:
                            st.warning("⚠️ MEDIUM RISK - Enhanced monitoring")
                        else:
                            st.info("👀 LOW RISK - Continue monitoring")

                    # Pattern-specific details
                    if alert.pattern_type == "passthrough_mule":
                        st.write("**Pass-Through Analysis:**")
                        disbursement = alert.disbursement_phase

                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric(
                                "Total Inflow",
                                f"₹{disbursement.get('total_credits', 0):,.2f}",
                            )
                            st.metric(
                                "Total Outflow",
                                f"₹{disbursement.get('total_debits', 0):,.2f}",
                            )
                        with col2:
                            st.metric(
                                "Net Flow", f"₹{disbursement.get('net_flow', 0):,.2f}"
                            )
                            st.metric(
                                "Flow Balance",
                                f"{disbursement.get('flow_balance_score', 0) * 100:.1f}%",
                            )
                        with col3:
                            st.metric(
                                "Detection Interval",
                                disbursement.get("detection_interval", "Unknown"),
                            )
                            st.metric(
                                "Pass-Through Level",
                                disbursement.get("pass_through_indicator", "Unknown"),
                            )

                        # Show interval analysis details
                        st.write("**Multi-Interval Analysis:**")
                        st.write(
                            f"🎯 **Primary Detection**: {disbursement.get('interval_analysis', 'N/A')}"
                        )

                        intervals_summary = disbursement.get("intervals_summary", [])
                        if intervals_summary:
                            st.write("**All Time Intervals Analyzed:**")
                            for interval in intervals_summary:
                                interval_type = (
                                    interval["type"].replace("_", " ").title()
                                )
                                ratio = interval["ratio"]
                                suspicion = interval["suspicion"]
                                description = interval["description"]

                                # Color code based on suspicion level
                                if suspicion > 0.8:
                                    color = "🔴"
                                elif suspicion > 0.6:
                                    color = "🟡"
                                else:
                                    color = "🟢"

                                st.write(
                                    f"{color} **{interval_type}**: {ratio:.3f} ratio, {suspicion:.3f} suspicion"
                                )
                                st.write(f"   └─ {description}")

                    elif alert.pattern_type == "classic_mule":
                        st.write("**Collection Phase Analysis:**")
                        collection = alert.collection_phase

                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric(
                                "Total Credits", collection.get("total_credits", 0)
                            )
                            st.metric(
                                "Small Credits", collection.get("small_credits", 0)
                            )
                        with col2:
                            st.metric(
                                "Small Credit Ratio",
                                f"{collection.get('small_credit_ratio', 0) * 100:.1f}%",
                            )
                            st.metric(
                                "Credit Frequency",
                                f"{collection.get('credit_frequency_per_day', 0):.2f}/day",
                            )
                        with col3:
                            st.metric(
                                "Total Credit Amount",
                                f"₹{collection.get('total_credit_amount', 0):,.2f}",
                            )
                            st.metric(
                                "Average Credit",
                                f"₹{collection.get('average_credit_amount', 0):,.2f}",
                            )

                        st.write("**Disbursement Phase Analysis:**")
                        disbursement = alert.disbursement_phase

                        col1, col2, col3 = st.columns(3)
                        with col1:
                            st.metric(
                                "Total Debits", disbursement.get("total_debits", 0)
                            )
                            st.metric(
                                "Large Debits", disbursement.get("large_debits", 0)
                            )
                        with col2:
                            st.metric(
                                "Large Debit Ratio",
                                f"{disbursement.get('large_debit_ratio', 0) * 100:.1f}%",
                            )
                            st.metric(
                                "Debit Frequency",
                                f"{disbursement.get('debit_frequency_per_day', 0):.2f}/day",
                            )
                        with col3:
                            st.metric(
                                "Total Debit Amount",
                                f"₹{disbursement.get('total_debit_amount', 0):,.2f}",
                            )
                            st.metric(
                                "Largest Debit",
                                f"₹{disbursement.get('largest_debit', 0):,.2f}",
                            )

                    # Risk indicators
                    st.write("**Risk Indicators:**")
                    for indicator in alert.risk_indicators:
                        st.write(f"• {indicator}")

                    # Recommendations
                    st.write("**Recommended Actions:**")
                    for recommendation in alert.recommended_actions:
                        st.write(f"• {recommendation}")

            # Export functionality
            st.subheader("📥 Export Mule Detection Results")

            col1, col2 = st.columns(2)
            with col1:
                if st.button("📊 Export Alert Summary"):
                    export_df = mule_detector.export_mule_alerts_to_dataframe(
                        mule_alerts
                    )
                    csv = export_df.to_csv(index=False)
                    st.download_button(
                        label="Download CSV",
                        data=csv,
                        file_name=f"mule_alerts_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
                        mime="text/csv",
                    )

            with col2:
                if st.button("📋 Export Detailed Report"):
                    # Create detailed text report
                    report_text = f"""MULE ACCOUNT DETECTION REPORT
{"=" * 50}

Account: {account_name}
Analysis Date: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
Detection Period: {mule_alerts[0].detection_period["start_date"]} to {mule_alerts[0].detection_period["end_date"]}

SUMMARY:
- Total Alerts: {summary["total_alerts"]}
- Highest Confidence: {summary["highest_confidence"]:.2f}
- High Confidence Alerts: {summary["high_confidence_alerts"]}

DETAILED ALERTS:
"""

                    for i, alert in enumerate(mule_alerts):
                        report_text += f"""
Alert {i + 1}: {alert.pattern_type.replace("_", " ").title()}
Confidence Score: {alert.confidence_score:.2f}
Risk Indicators:
"""
                        for indicator in alert.risk_indicators:
                            report_text += f"  • {indicator}\n"

                        report_text += "Recommendations:\n"
                        for rec in alert.recommended_actions:
                            report_text += f"  • {rec}\n"

                    st.download_button(
                        label="Download Report",
                        data=report_text,
                        file_name=f"mule_detection_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt",
                        mime="text/plain",
                    )

        else:
            st.success("✅ No mule account patterns detected")
            st.info("""
            **🧠 Core Mule Account Definition:**
            
            **💰 PRIMARY INDICATOR: Pass-Through Account (Inflow ≈ Outflow)**
            - Total credits (inflow) approximately equals total debits (outflow)
            - Account acts as temporary holding mechanism for money laundering
            - Net flow ratio close to zero indicates pass-through behavior
            - **This is the fundamental characteristic of a mule account**
            
            **📊 MULTI-INTERVAL ANALYSIS:**
            - **Daily Balancing**: Detects accounts that balance every day
            - **Weekly Balancing**: Detects weekly collection/disbursement cycles
            - **Monthly Balancing**: Detects monthly operational patterns
            - **Rolling Windows**: Detects sophisticated sliding window operations
            - **Requires Individual Transaction Data**: Not aggregated summaries
            
            **🔍 SECONDARY PATTERNS (analyzed if pass-through detected):**
            
            📊 **Classic Mule Pattern**: Asymmetric transaction flows
            - Many small incoming payments → Few large outgoing payments
            - Or vice versa: Few large incoming → Many small outgoing
            
            📅 **Periodic Mule Pattern**: Regular disbursement cycles
            - Weekly, bi-weekly, or monthly disbursement patterns
            - Structured timing indicating coordination
            
            💰 **Threshold Mule Pattern**: Statistical anomalies in amounts
            - Transactions clustered around reporting thresholds
            - Structured amounts to avoid detection
            
            **🎯 Detection Approach:**
            - **Primary Focus**: Balanced inflow/outflow (core mule characteristic)
            - **Adaptive Thresholds**: No fixed amounts - uses account's own patterns
            - **Statistical Rigor**: Analyzes flow ratios and transaction patterns
            - **Layered Detection**: Multiple pattern types for comprehensive coverage
            
            **Current Settings:**
            - Minimum transactions: {min_collections}
            - Sensitivity: {sensitivity}
            - Focus: {pattern_focus}
            """)

    with viz_tabs[4]:
        st.subheader("🔍 Anomaly Detection Results")

        if "anomaly_detection" in analysis_results:
            anomalies = analysis_results["anomaly_detection"]

            # Statistical anomalies
            stat_anomalies = anomalies.get("statistical_anomalies", [])
            if stat_anomalies:
                st.subheader("📊 Statistical Anomalies")
                for anomaly in stat_anomalies:
                    severity_color = "🔴" if anomaly["severity"] == "high" else "🟡"
                    st.warning(
                        f"{severity_color} **{anomaly['metric']}** anomaly on {anomaly['period']}: "
                        f"Value {anomaly['value']:,.2f} (Expected: {anomaly['expected_range'][0]:,.2f} - {anomaly['expected_range'][1]:,.2f})"
                    )

            # Velocity anomalies
            vel_anomalies = anomalies.get("velocity_anomalies", [])
            if vel_anomalies:
                st.subheader("⚡ Velocity Anomalies")
                for anomaly in vel_anomalies:
                    severity_color = "🔴" if anomaly["severity"] == "high" else "🟡"
                    st.warning(
                        f"{severity_color} High transaction velocity on {anomaly['period']}: "
                        f"{anomaly['transaction_count']} transactions (Expected max: {anomaly['expected_max']:.1f})"
                    )

            if not stat_anomalies and not vel_anomalies:
                st.success("✅ No significant anomalies detected")

    # Add comprehensive report generation section
    st.divider()
    st.subheader("📋 Generate Comprehensive Report")

    col1, col2 = st.columns(2)
    with col1:
        entity_name = st.text_input(
            "Entity Name for Report",
            value=st.session_state.get("analysis_scope_name", "Unknown Entity"),
            help="Name of the entity being analyzed for the report",
        )

    with col2:
        report_format = st.selectbox(
            "Report Format",
            options=["Executive Summary", "Detailed Analysis", "JSON Export"],
            help="Choose the format for the generated report",
        )

    if st.button("📊 Generate Comprehensive Report", type="primary"):
        # Initialize report generator
        if "report_generator" not in st.session_state:
            st.session_state.report_generator = TrendReportGenerator()

        report_gen = st.session_state.report_generator

        # Get counterparty results if available
        cp_results_for_report = {}
        if "counterparty_analyzer" in st.session_state:
            cp_cache_key = f"cp_analysis_{min_transactions}_{len(df)}"
            cp_results_for_report = st.session_state.get("time_analysis_cache", {}).get(
                cp_cache_key, {}
            )

        # Get mule detection results if available
        mule_alerts_for_report = []
        if "mule_detector" in st.session_state:
            # Use current adaptive mule detection settings
            min_collections = st.session_state.get("mule_min_collections", 5)
            sensitivity = st.session_state.get("mule_sensitivity", "Medium")
            pattern_focus = st.session_state.get("mule_pattern_focus", "All Patterns")
            mule_cache_key = f"mule_detection_adaptive_{min_collections}_{sensitivity}_{pattern_focus}_{len(df)}"
            mule_alerts_for_report = st.session_state.get(
                "time_analysis_cache", {}
            ).get(mule_cache_key, [])

        try:
            with st.spinner("📋 Generating comprehensive report..."):
                report = report_gen.generate_comprehensive_report(
                    time_analysis_results=analysis_results,
                    counterparty_results=cp_results_for_report,
                    df=df,
                    entity_name=entity_name,
                    mule_alerts=mule_alerts_for_report,
                )

            if report_format == "Executive Summary":
                st.subheader("📋 Executive Summary")
                summary_text = report_gen.create_executive_summary_text(report)
                st.text(summary_text)

                # Download button for summary
                st.download_button(
                    label="📥 Download Executive Summary",
                    data=summary_text,
                    file_name=f"executive_summary_{report.report_id}.txt",
                    mime="text/plain",
                )

            elif report_format == "Detailed Analysis":
                st.subheader("📊 Detailed Analysis Report")

                # Display key sections
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric(
                        "Overall Health Score",
                        f"{report.executive_summary.get('overall_health_score', 0):.1f}/100",
                    )
                with col2:
                    st.metric(
                        "Risk Level",
                        report.risk_assessment.get(
                            "overall_risk_level", "unknown"
                        ).title(),
                    )
                with col3:
                    st.metric(
                        "Total Counterparties",
                        report.counterparty_insights.get("total_counterparties", 0),
                    )

                # Risk Assessment
                with st.expander("🚨 Risk Assessment", expanded=True):
                    risk = report.risk_assessment
                    st.write(
                        f"**Overall Risk Level:** {risk.get('overall_risk_level', 'unknown').title()}"
                    )
                    st.write(f"**Risk Score:** {risk.get('risk_score', 0):.2f}/1.0")

                    if risk.get("risk_factors"):
                        st.write("**Risk Factors:**")
                        for factor in risk["risk_factors"]:
                            st.write(f"• {factor}")

                # Key Metrics
                with st.expander("📊 Key Metrics"):
                    metrics_df = pd.DataFrame([report.key_metrics]).T
                    metrics_df.columns = ["Value"]
                    metrics_df.index.name = "Metric"
                    st.dataframe(metrics_df, use_container_width=True)

                # Recommendations
                with st.expander("💡 Recommendations"):
                    for rec in report.recommendations:
                        st.write(f"• {rec}")

            elif report_format == "JSON Export":
                st.subheader("📄 JSON Export")
                report_dict = report_gen.export_report_to_dict(report)

                # Display formatted JSON
                st.json(report_dict)

                # Download button for JSON
                json_str = json.dumps(report_dict, indent=2, default=str)
                st.download_button(
                    label="📥 Download JSON Report",
                    data=json_str,
                    file_name=f"trend_report_{report.report_id}.json",
                    mime="application/json",
                )

        except Exception as e:
            st.error(f"❌ Report generation failed: {str(e)}")
            import traceback

            st.code(traceback.format_exc())

    with viz_tabs[5]:
        st.subheader("🔄 Pattern Analysis")

        # Seasonal patterns
        if "seasonal_patterns" in analysis_results:
            seasonal = analysis_results["seasonal_patterns"]

            # Recurring cycles
            if "recurring_cycles" in seasonal:
                cycles = seasonal["recurring_cycles"]
                if cycles.get("has_recurring_patterns"):
                    st.success("✅ Recurring patterns detected")
                    for cycle in cycles.get("cycles_detected", []):
                        st.info(
                            f"🔄 {cycle['cycle_length_periods']}-period cycle detected "
                            f"(Strength: {cycle['strength']}, "
                            f"Debit correlation: {cycle['debit_correlation']:.2f}, "
                            f"Credit correlation: {cycle['credit_correlation']:.2f})"
                        )
                else:
                    st.info("No strong recurring patterns detected")

            # Monthly patterns
            if "monthly" in seasonal and seasonal["monthly"].get(
                "pattern_detected", False
            ):
                monthly = seasonal["monthly"]
                st.subheader("📅 Monthly Patterns")
                col1, col2, col3 = st.columns(3)
                with col1:
                    st.metric(
                        "Peak Debit Month", monthly.get("peak_debit_month", "Unknown")
                    )
                with col2:
                    st.metric(
                        "Peak Credit Month", monthly.get("peak_credit_month", "Unknown")
                    )
                with col3:
                    st.metric(
                        "Peak Activity Month",
                        monthly.get("peak_activity_month", "Unknown"),
                    )

        # Cyclical patterns
        if "cyclical_patterns" in analysis_results:
            cyclical = analysis_results["cyclical_patterns"]
            for metric, pattern in cyclical.items():
                if pattern.get("has_cycles"):
                    st.info(
                        f"🔄 {metric.replace('_', ' ').title()} shows cyclical behavior "
                        f"(Frequency: {pattern['cycle_frequency']:.2f}, "
                        f"Strength: {pattern['cycle_strength']:.2f})"
                    )

    with viz_tabs[6]:
        st.subheader("📋 Detailed Metrics")

        # Data summary
        if "data_summary" in analysis_results:
            summary = analysis_results["data_summary"]
            st.subheader("📊 Data Summary")

            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("Total Periods", summary.get("total_periods", 0))
            with col2:
                st.metric(
                    "Date Span (Days)",
                    summary.get("date_range", {}).get("span_days", 0),
                )
            with col3:
                st.metric("Total Transactions", summary.get("transaction_count", 0))
            with col4:
                net_flow = summary.get("net_flow_total", 0)
                st.metric("Net Flow", f"₹{net_flow:,.2f}", delta=None)

        # Velocity analysis
        if "velocity_analysis" in analysis_results:
            velocity = analysis_results["velocity_analysis"]
            st.subheader("⚡ Velocity Metrics")

            col1, col2, col3 = st.columns(3)
            with col1:
                st.metric(
                    "Avg Transactions/Period",
                    f"{velocity.get('average_transactions_per_period', 0):.1f}",
                )
            with col2:
                st.metric(
                    "Max Transactions/Period",
                    velocity.get("max_transactions_per_period", 0),
                )
            with col3:
                st.metric(
                    "Velocity Volatility",
                    f"{velocity.get('velocity_volatility', 0):.1f}",
                )

        # Correlation analysis
        if "correlation_analysis" in analysis_results:
            corr = analysis_results["correlation_analysis"]
            st.subheader("🔗 Correlation Analysis")

            corr_df = pd.DataFrame([corr]).T
            corr_df.columns = ["Correlation"]
            corr_df.index.name = "Metric Pair"
            st.dataframe(corr_df, use_container_width=True)

        # Volatility analysis
        if "volatility_analysis" in analysis_results:
            volatility = analysis_results["volatility_analysis"]
            st.subheader("📊 Volatility Analysis")

            for metric, vol_data in volatility.items():
                with st.expander(f"📈 {metric.replace('_', ' ').title()} Volatility"):
                    col1, col2, col3 = st.columns(3)
                    with col1:
                        st.metric(
                            "Standard Deviation",
                            f"{vol_data.get('standard_deviation', 0):,.2f}",
                        )
                    with col2:
                        st.metric(
                            "Coefficient of Variation",
                            f"{vol_data.get('coefficient_of_variation', 0):.3f}",
                        )
                    with col3:
                        st.metric(
                            "Volatility Trend",
                            vol_data.get("volatility_trend", "Unknown"),
                        )


def manual_investigation_tab():
    st.header("🔍 Manual Investigation Tools")

    df = get_analysis_dataframe()
    if df.empty:
        st.info("🎯 Select an analysis scope from the sidebar to begin.")
        return
    # Date is already converted when loading, no need to convert again

    # AI Mode Toggle
    col1, col2 = st.columns([3, 1])
    with col1:
        st.write("Choose your investigation approach:")
    with col2:
        ai_mode = st.toggle(
            "🤖 AI Enhanced",
            value=False,
            help="Enable AI-powered pattern detection using machine learning algorithms",
        )

    if ai_mode:
        st.info(
            "🤖 **AI Enhanced Mode**: Uses machine learning algorithms for advanced pattern detection. "
            "Requires scikit-learn and networkx libraries for full functionality."
        )

        # AI Investigation type selector
        investigation_type = st.selectbox(
            "Select AI Investigation Type:",
            [
                "Anomaly Detection",
                "AI Graph Pattern Detection",
                "Typology Classification",
                "Combined AI Analysis",
                "Round-trip Analysis",
                "Cash Flow Analysis",
                "High-value Transactions",
                "Rapid Movement Detection",
                "Transfer Pattern Detection",
                "Custom Filter",
            ],
        )
    else:
        # Standard Investigation type selector
        investigation_type = st.selectbox(
            "Select Investigation Type:",
            [
                "Common counterparty Analysis",
                "Round-trip Analysis",
                "Cash Flow Analysis",
                "High-value Transactions",
                "Rapid Movement Detection",
                "Transfer Pattern Detection",
                "Custom Filter",
            ],
        )

    st.divider()

    # Route to appropriate analysis function
    if investigation_type == "Common counterparty Analysis":
        common_counterparty_analysis(df, show_visualization=False)
    elif investigation_type == "Round-trip Analysis":
        round_trip_analysis(df)
    elif investigation_type == "Cash Flow Analysis":
        cash_flow_analysis(df)
    elif investigation_type == "High-value Transactions":
        high_value_analysis(df)
    elif investigation_type == "Rapid Movement Detection":
        rapid_movement_analysis(df)
    elif investigation_type == "Transfer Pattern Detection":
        transfer_pattern_analysis(df)
    elif investigation_type == "Custom Filter":
        custom_filter_analysis(df)


def round_trip_analysis(df):
    st.subheader("🔄 Round-trip Transaction Analysis")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    col1, col2, col3 = st.columns(3)

    with col1:
        amount_tolerance = st.slider(
            "Amount Match Tolerance (%)",
            min_value=0,
            max_value=20,
            value=5,
            help="How closely amounts must match",
        )

    with col2:
        day_window = st.slider(
            "Time Window (days)",
            min_value=1,
            max_value=90,
            value=30,
            help="Maximum days between transactions",
        )

    with col3:
        min_amount = st.number_input(
            "Minimum Amount (₹)", min_value=0, value=10000, step=5000
        )

    if st.button("🔍 Find Round-trips"):
        find_roundtrips(df_analysis, amount_tolerance, day_window, min_amount)


def find_roundtrips(df, tolerance, days, min_amount):
    results = []

    if "counterparty" in df.columns:
        counterparties = [c for c in df["counterparty"].dropna().unique() if c]
        for cp in counterparties:
            cp_df = df[df["counterparty"] == cp].copy()

            debits = cp_df[
                (cp_df["DEBIT"].notna()) & (cp_df["DEBIT"] >= min_amount)
            ].sort_values("DATE")
            credits = cp_df[
                (cp_df["CREDIT"].notna()) & (cp_df["CREDIT"] >= min_amount)
            ].sort_values("DATE")
            credits_used = set()

            for debit_idx, debit in debits.iterrows():
                for credit_idx, credit in credits.iterrows():
                    if credit_idx in credits_used:
                        continue
                    if credit["DATE"] > debit["DATE"]:
                        days_diff = (credit["DATE"] - debit["DATE"]).days
                        if days_diff <= days:
                            amount_diff = (
                                abs(debit["DEBIT"] - credit["CREDIT"])
                                / debit["DEBIT"]
                                * 100
                            )
                            if amount_diff <= tolerance:
                                results.append(
                                    {
                                        "counterparty": cp,
                                        "Outgoing Amount": f"₹{debit['DEBIT']:,.0f}",
                                        "Outgoing Date": debit["DATE"].date(),
                                        "Incoming Amount": f"₹{credit['CREDIT']:,.0f}",
                                        "Incoming Date": credit["DATE"].date(),
                                        "Days Gap": days_diff,
                                        "Amount Difference": f"{amount_diff:.1f}%",
                                    }
                                )
                                credits_used.add(credit_idx)
                                break  # Move to next debit after first match

    # Optionally, you could record unmatched debits if needed
    if results:
        st.success(f"Found {len(results)} potential round-trip transactions")
        st.dataframe(pd.DataFrame(results), use_container_width=True)
    else:
        st.info("No round-trip transactions found with current parameters")


def cash_flow_analysis(df):
    st.subheader("💵 Cash Transaction Analysis")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    # Add entity_owner column if not present (needed for network visualization)
    if "entity_owner" not in df_analysis.columns:
        current_scope = st.session_state.get("analysis_scope")
        if current_scope and current_scope in st.session_state.entities:
            entity_name = st.session_state.entities[current_scope]["name"]
            df_analysis["entity_owner"] = entity_name

    col1, col2 = st.columns(2)

    with col1:
        cash_keywords = st.text_area(
            "Cash Keywords (one per line):",
            value="CASH\nATM\nWITHDRAWAL\nCHQ",
            height=100,
        )
        keywords = [k.strip() for k in cash_keywords.split("\n") if k.strip()]

    with col2:
        threshold = st.number_input(
            "Large Cash Threshold (₹)", min_value=0, value=50000, step=10000
        )

    # Find cash transactions
    pattern = "|".join(keywords)
    cash_mask = df_analysis["DESCRIPTION"].str.contains(pattern, case=False, na=False)
    cash_txns = df_analysis[cash_mask].copy()

    if len(cash_txns) > 0:
        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Total Cash Transactions", len(cash_txns))
        with col2:
            st.metric("Total Cash Out", f"₹{cash_txns['DEBIT'].fillna(0).sum():,.0f}")
        with col3:
            st.metric("Total Cash In", f"₹{cash_txns['CREDIT'].fillna(0).sum():,.0f}")

        # Large cash transactions
        large_cash = cash_txns[
            (cash_txns["DEBIT"] > threshold) | (cash_txns["CREDIT"] > threshold)
        ]

        # Frequency Analysis
        st.subheader("📊 Cash Transaction Frequency & Patterns")

        # Monthly frequency
        cash_txns["Month"] = cash_txns["DATE"].dt.to_period("M")
        monthly_freq = cash_txns.groupby("Month").size()

        col1, col2 = st.columns(2)

        with col1:
            st.write("**Monthly Frequency**")
            monthly_chart = monthly_freq.reset_index()
            monthly_chart["Month"] = monthly_chart["Month"].astype(str)
            st.bar_chart(monthly_chart.set_index("Month"))

            # Average transactions per month
            avg_monthly = monthly_freq.mean()
            st.metric("Avg Cash Txns/Month", f"{avg_monthly:.1f}")

        with col2:
            st.write("**Day of Week Pattern**")
            cash_txns["DayOfWeek"] = cash_txns["DATE"].dt.day_name()
            dow_freq = cash_txns["DayOfWeek"].value_counts()
            dow_order = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ]
            dow_freq = dow_freq.reindex(
                [day for day in dow_order if day in dow_freq.index]
            )
            st.bar_chart(dow_freq)

        # Time-based patterns
        st.write("**Temporal Patterns**")
        col1, col2, col3 = st.columns(3)

        with col1:
            # Date range analysis
            date_range = (cash_txns["DATE"].max() - cash_txns["DATE"].min()).days
            st.metric("Analysis Period (Days)", date_range)

        with col2:
            # Average frequency
            if date_range > 0:
                avg_freq = len(cash_txns) / (date_range / 30)  # per month
                st.metric("Frequency (Txns/Month)", f"{avg_freq:.1f}")

        with col3:
            # Peak activity day
            peak_day = dow_freq.idxmax() if not dow_freq.empty else "N/A"
            st.metric("Peak Activity Day", peak_day)

        # Amount patterns
        st.write("**Amount Patterns**")
        col1, col2 = st.columns(2)

        with col1:
            # Common amounts (rounded to nearest 1000)
            cash_amounts = pd.concat(
                [cash_txns["DEBIT"].dropna(), cash_txns["CREDIT"].dropna()]
            )

            if not cash_amounts.empty:
                rounded_amounts = (cash_amounts / 1000).round() * 1000
                common_amounts = rounded_amounts.value_counts().head(5)
                st.write("**Most Common Amounts (₹)**")
                for amount, count in common_amounts.items():
                    st.write(f"₹{amount:,.0f}: {count} times")

        with col2:
            # Amount distribution
            if not cash_amounts.empty:
                st.write("**Amount Statistics**")
                st.write(f"Average: ₹{cash_amounts.mean():,.0f}")
                st.write(f"Median: ₹{cash_amounts.median():,.0f}")
                st.write(f"Max: ₹{cash_amounts.max():,.0f}")
                st.write(f"Min: ₹{cash_amounts.min():,.0f}")

        if len(large_cash) > 0:
            st.warning(
                f"⚠️ Found {len(large_cash)} cash transactions above ₹{threshold:,}"
            )

            display_df = large_cash[["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]].copy()
            display_df["DATE"] = display_df["DATE"].dt.date
            display_df["Amount"] = display_df.apply(
                lambda x: (
                    f"₹{x['DEBIT']:,.0f}"
                    if pd.notna(x["DEBIT"])
                    else f"₹{x['CREDIT']:,.0f}"
                ),
                axis=1,
            )
            display_df["Type"] = display_df.apply(
                lambda x: "Withdrawal" if pd.notna(x["DEBIT"]) else "Deposit", axis=1
            )

            st.dataframe(
                display_df[["DATE", "Type", "Amount", "DESCRIPTION"]],
                use_container_width=True,
            )

    else:
        st.info("No cash transactions found with the specified keywords.")


def _display_cash_network_statistics(graph, cash_entities, threshold):
    """
    Display statistics about the cash transaction network.

    Args:
        graph: NetworkX graph with cash transaction metadata
        cash_entities: Set of entities involved in cash transactions
        threshold: Large cash transaction threshold
    """
    st.markdown("##### 📊 Cash Network Statistics")

    # Calculate statistics
    total_nodes = graph.number_of_nodes()
    total_edges = graph.number_of_edges()
    cash_heavy_nodes = sum(
        1 for node in graph.nodes() if graph.nodes[node].get("is_cash_heavy", False)
    )
    cash_edges = sum(
        1 for _, _, data in graph.edges(data=True) if data.get("is_cash_edge", False)
    )

    # Display metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        st.metric("Total Entities", total_nodes)
    with col2:
        st.metric("Cash-Heavy Entities", cash_heavy_nodes)
    with col3:
        st.metric("Cash Transaction Links", cash_edges)
    with col4:
        st.metric("Total Network Links", total_edges)

    # Show cash-heavy entities details
    if cash_heavy_nodes > 0:
        st.markdown("##### 🎯 Cash-Heavy Entities")
        cash_heavy_data = []

        for node in graph.nodes():
            node_data = graph.nodes[node]
            if node_data.get("is_cash_heavy", False):
                cash_heavy_data.append(
                    {
                        "Entity": node,
                        "Cash Volume": f"₹{node_data.get('total_cash_volume', 0):,.2f}",
                        "Cash Transactions": node_data.get("cash_transaction_count", 0),
                        "Total Connections": graph.degree(node),
                    }
                )

        if cash_heavy_data:
            cash_df = pd.DataFrame(cash_heavy_data)
            st.dataframe(cash_df, use_container_width=True)

    # Proximity analysis
    st.markdown("##### 🔍 Cash Transaction Proximity Analysis")

    # Find entities that are connected to cash-heavy entities but are not cash-heavy themselves
    proximity_entities = set()
    for node in graph.nodes():
        if not graph.nodes[node].get("is_cash_heavy", False):
            # Check if connected to any cash-heavy entity
            neighbors = set(graph.predecessors(node)) | set(graph.successors(node))
            for neighbor in neighbors:
                if graph.nodes[neighbor].get("is_cash_heavy", False):
                    proximity_entities.add(node)
                    break

    if proximity_entities:
        st.info(
            f"🔍 Found {len(proximity_entities)} entities in proximity to cash-heavy entities"
        )

        proximity_data = []
        for entity in list(proximity_entities)[:10]:  # Show top 10
            node_data = graph.nodes[entity]
            proximity_data.append(
                {
                    "Entity": entity,
                    "Connections": graph.degree(entity),
                    "Cash Volume": f"₹{node_data.get('total_cash_volume', 0):,.2f}",
                    "Status": "Proximity to Cash Activity",
                }
            )

        if proximity_data:
            proximity_df = pd.DataFrame(proximity_data)
            st.dataframe(proximity_df, use_container_width=True)
    else:
        st.info("No entities found in proximity to cash-heavy entities")


def high_value_analysis(df):
    st.subheader("💰 High-value Transaction Analysis")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    # Calculate percentiles
    all_amounts = pd.concat(
        [df_analysis["DEBIT"].dropna(), df_analysis["CREDIT"].dropna()]
    )

    col1, col2 = st.columns(2)

    with col1:
        percentile = st.slider(
            "Percentile Threshold",
            min_value=80,
            max_value=99,
            value=95,
            help="Show transactions above this percentile",
        )

        threshold = np.percentile(all_amounts, percentile)
        st.info(f"Threshold amount: ₹{threshold:,.0f}")

    with col2:
        filter_type = st.radio(
            "Transaction Type:", ["All", "Debits Only", "Credits Only"]
        )

    # Filter high-value transactions
    if filter_type == "All":
        high_value = df_analysis[
            (df_analysis["DEBIT"] > threshold) | (df_analysis["CREDIT"] > threshold)
        ]
    elif filter_type == "Debits Only":
        high_value = df_analysis[df_analysis["DEBIT"] > threshold]
    else:
        high_value = df_analysis[df_analysis["CREDIT"] > threshold]

    if len(high_value) > 0:
        st.write(f"Found {len(high_value)} high-value transactions")

        # Summary by counterparty
        if "counterparty" in df_analysis.columns:
            cp_summary = (
                high_value.groupby("counterparty")
                .agg({"DEBIT": ["count", "sum"], "CREDIT": ["count", "sum"]})
                .fillna(0)
            )

            cp_summary.columns = [
                "Debit_Count",
                "Debit_Total",
                "Credit_Count",
                "Credit_Total",
            ]
            cp_summary["Total_Count"] = (
                cp_summary["Debit_Count"] + cp_summary["Credit_Count"]
            )
            cp_summary["Total_Volume"] = (
                cp_summary["Debit_Total"] + cp_summary["Credit_Total"]
            )
            cp_summary = cp_summary.sort_values("Total_Volume", ascending=False)

            st.write("**Summary by counterparty:**")
            st.dataframe(cp_summary, use_container_width=True)

        # Detailed transactions
        with st.expander("View Detailed Transactions"):
            display_df = high_value[["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]].copy()
            display_df["DATE"] = display_df["DATE"].dt.date
            st.dataframe(display_df, use_container_width=True)


def rapid_movement_analysis(df, show_visualization=False):
    st.subheader("⚡ Rapid Money Movement Detection")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    col1, col2, col3 = st.columns(3)

    with col1:
        time_window = st.slider(
            "Time Window (hours)", min_value=1, max_value=72, value=24
        )

    with col2:
        amount_match = st.slider(
            "Amount Match Tolerance (%)", min_value=0, max_value=20, value=10
        )

    with col3:
        min_amount = st.number_input(
            "Minimum Amount (₹)", min_value=0, value=50000, step=10000
        )

    # Add visualization option
    col_viz1, col_viz2 = st.columns([3, 1])
    with col_viz2:
        show_viz = st.checkbox(
            "🕸️ Show Network Visualization",
            value=show_visualization,
            help="Display rapid movement patterns in an interactive network graph",
        )

    if st.button("🔍 Detect Rapid Movements"):
        detect_rapid_movements(
            df_analysis, time_window, amount_match, min_amount, show_viz
        )


def detect_rapid_movements(df, hours, tolerance, min_amount, show_visualization=False):
    df_with_index = df.reset_index()
    df_sorted = df_with_index.sort_values(by=["DATE", "index"])
    rapid_patterns = []

    # Track which transactions have already been matched to ensure 1:1 matching
    matched_in_transactions = set()
    matched_out_transactions = set()

    # Prepare counterparty extractor fallback if needed
    cp_extractor = None
    if "counterparty" not in df.columns:
        try:
            cp_extractor = CounterpartyStandardizer()
        except Exception:
            cp_extractor = None

    for i in range(len(df_sorted) - 1):
        curr = df_sorted.iloc[i]

        # Skip if this IN transaction has already been matched
        if i in matched_in_transactions:
            continue

        if pd.notna(curr["CREDIT"]) and curr["CREDIT"] >= min_amount:
            best_match = None
            best_match_index = None
            best_amount_diff = float("inf")

            # Find the best matching OUT transaction within the time window
            for j in range(i + 1, min(i + 20, len(df_sorted))):
                next_txn = df_sorted.iloc[j]

                # Skip if this OUT transaction has already been matched
                if j in matched_out_transactions:
                    continue

                if pd.notna(next_txn["DEBIT"]):
                    time_diff = (next_txn["DATE"] - curr["DATE"]).total_seconds() / 3600

                    if time_diff <= hours:
                        amount_diff = (
                            abs(curr["CREDIT"] - next_txn["DEBIT"])
                            / curr["CREDIT"]
                            * 100
                        )

                        if amount_diff <= tolerance and amount_diff < best_amount_diff:
                            best_match = next_txn
                            best_match_index = j
                            best_amount_diff = amount_diff

            # If we found a best match, record it and mark both transactions as matched
            if best_match is not None:
                matched_in_transactions.add(i)
                matched_out_transactions.add(best_match_index)

                time_diff = (best_match["DATE"] - curr["DATE"]).total_seconds() / 3600

                # Capture counterparties if the processed dataframe has that column
                if "counterparty" in df_sorted.columns:
                    cp_in = curr.get("counterparty", "") or ""
                    cp_out = best_match.get("counterparty", "") or ""
                else:
                    # Fallback to regex extraction from description
                    if cp_extractor:
                        cp_in = (
                            cp_extractor.extract_counterparty_name(curr["DESCRIPTION"])
                            or ""
                        )
                        cp_out = (
                            cp_extractor.extract_counterparty_name(
                                best_match["DESCRIPTION"]
                            )
                            or ""
                        )
                    else:
                        cp_in = cp_out = ""

                rapid_patterns.append(
                    {
                        "In Date": curr["DATE"],
                        "In Amount": f"₹{curr['CREDIT']:,.0f}",
                        "In CP": cp_in,
                        "In Description": curr["DESCRIPTION"][:50],
                        "Out Date": best_match["DATE"],
                        "Out Amount": f"₹{best_match['DEBIT']:,.0f}",
                        "Out CP": cp_out,
                        "Out Description": best_match["DESCRIPTION"][:50],
                        "Hours Gap": f"{time_diff:.1f}",
                        "Amount Diff": f"{best_amount_diff:.1f}%",
                    }
                )

    if rapid_patterns:
        rapid_df = pd.DataFrame(rapid_patterns)

        st.warning(f"⚠️ Found {len(rapid_df)} rapid money movements")
        st.dataframe(rapid_df, use_container_width=True)

        # Highlight repeated party pairs if counterparty columns are present
        if {"In CP", "Out CP"}.issubset(rapid_df.columns):
            pair_counts = (
                rapid_df.groupby(["In CP", "Out CP"])
                .size()
                .reset_index(name="Occurrences")
            )
            repeated_pairs = pair_counts[pair_counts["Occurrences"] >= 2].sort_values(
                "Occurrences", ascending=False
            )

            if len(repeated_pairs) > 0:
                st.subheader("🔁 Repeated Rapid Movements Between Parties")
                st.dataframe(repeated_pairs, use_container_width=True)
            else:
                st.info("No repeated party pairs detected within current parameters")

    else:
        st.info("No rapid movements detected with current parameters")


def transfer_pattern_analysis(df, show_visualization=False):
    st.subheader("🔗 Transfer Pattern Detection")
    st.write(
        "Finds patterns where money is received from one counterparty and a similar amount is sent to another within a short period."
    )

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    col1, col2, col3 = st.columns(3)

    with col1:
        time_window = st.slider(
            "Time Window (days)",
            min_value=1,
            max_value=30,
            value=7,
            key="tp_time_window",
            help="Max days between receiving and sending funds.",
        )
        min_amount = st.number_input(
            "Minimum Amount (₹)",
            min_value=1000,
            value=10000,
            step=1000,
            key="tp_min_amount",
        )

    with col2:
        percentage_match = st.slider(
            "Percentage of Funds Transferred (%)",
            min_value=50,
            max_value=100,
            value=90,
            key="tp_percentage",
            help="The percentage of incoming funds that are transferred out.",
        )
        deviance = st.slider(
            "Deviance Tolerance (%)",
            min_value=0,
            max_value=20,
            value=10,
            key="tp_deviance",
            help="Allowed variance from the transfer percentage.",
        )

    with col3:
        min_occurrences = st.number_input(
            "Minimum Occurrences",
            min_value=2,
            value=3,
            step=1,
            key="tp_min_occurrences",
            help="How many times the pattern must repeat to be flagged.",
        )

    # Add visualization option
    col_viz1, col_viz2 = st.columns([3, 1])
    with col_viz2:
        show_viz = st.checkbox(
            "🕸️ Show Network Visualization",
            value=show_visualization,
            help="Display transfer patterns in an interactive network graph",
        )

    if st.button("🔍 Find Transfer Patterns"):
        with st.spinner("Analyzing transaction flows..."):
            find_transfer_patterns(
                df_analysis,
                time_window,
                percentage_match,
                deviance,
                min_amount,
                min_occurrences,
                show_viz,
            )


def find_transfer_patterns(
    df,
    time_window,
    percentage_match,
    deviance,
    min_amount,
    min_occurrences,
    show_visualization=False,
):
    if "counterparty" not in df.columns or df["counterparty"].nunique() < 2:
        st.warning(
            "This analysis requires at least two counterparties. Please merge names first."
        )
        return

    df_sorted = df.sort_values("DATE").reset_index(drop=True)

    credits = df_sorted[
        (df_sorted["CREDIT"].notna())
        & (df_sorted["CREDIT"] >= min_amount)
        & (df_sorted["counterparty"] != "")
    ].copy()
    debits = df_sorted[
        (df_sorted["DEBIT"].notna())
        & (df_sorted["DEBIT"] >= min_amount)
        & (df_sorted["counterparty"] != "")
    ].copy()

    potential_patterns = []
    used_debits = (
        set()
    )  # Track which debits have already been matched to prevent double-counting

    # IMPORTANT: Each credit transaction should only match to ONE debit transaction
    # to avoid the logical error of one inflow creating multiple outflows
    for _, credit_txn in credits.iterrows():
        credit_amount = credit_txn["CREDIT"]
        credit_date = credit_txn["DATE"]
        source_cp = credit_txn["counterparty"]

        time_limit = credit_date + timedelta(days=time_window)
        lower_bound = credit_amount * (percentage_match - deviance) / 100
        upper_bound = credit_amount * (percentage_match + deviance) / 100

        candidate_debits = debits[
            (debits["DATE"] > credit_date)
            & (debits["DATE"] <= time_limit)
            & (debits["DEBIT"] >= lower_bound)
            & (debits["DEBIT"] <= upper_bound)
            & (debits["counterparty"] != source_cp)
            & (~debits.index.isin(used_debits))  # Exclude already matched debits
        ]

        if len(candidate_debits) > 0:
            # Find the best match: closest amount and earliest date
            candidate_debits = candidate_debits.copy()
            candidate_debits["amount_diff"] = abs(
                candidate_debits["DEBIT"] - credit_amount
            )
            candidate_debits["date_diff"] = (
                candidate_debits["DATE"] - credit_date
            ).dt.days

            # Score: prioritize amount match (70%) and time proximity (30%)
            candidate_debits["match_score"] = (
                1 - candidate_debits["amount_diff"] / credit_amount
            ) * 0.7 + (1 - candidate_debits["date_diff"] / time_window) * 0.3

            # Select the best match
            best_match = candidate_debits.loc[candidate_debits["match_score"].idxmax()]
            used_debits.add(best_match.name)  # Mark this debit as used

            dest_cp = best_match["counterparty"]
            potential_patterns.append(
                {
                    "Source": source_cp,
                    "Destination": dest_cp,
                    "In Date": credit_txn["DATE"].date(),
                    "In Amount": credit_txn["CREDIT"],
                    "Out Date": best_match["DATE"].date(),
                    "Out Amount": best_match["DEBIT"],
                    "Days Gap": (best_match["DATE"] - credit_txn["DATE"]).days,
                    "% Transferred": (best_match["DEBIT"] / credit_txn["CREDIT"]) * 100,
                }
            )

    if not potential_patterns:
        st.info(
            "No individual transfer links found. Cannot identify repeated patterns."
        )
        return

    patterns_df = pd.DataFrame(potential_patterns)
    pattern_groups = patterns_df.groupby(["Source", "Destination"])

    final_results = []
    for (source, destination), group in pattern_groups:
        if len(group) >= min_occurrences:
            summary = {
                "Source": source,
                "Destination": destination,
                "Occurrences": len(group),
                "Avg. In Amount": group["In Amount"].mean(),
                "Avg. Out Amount": group["Out Amount"].mean(),
                "Avg. % Transferred": group["% Transferred"].mean(),
                "First Occurrence": group["In Date"].min(),
                "Last Occurrence": group["Out Date"].max(),
                "details": group.to_dict("records"),
            }
            final_results.append(summary)

    if not final_results:
        st.info(
            f"No transfer patterns found with at least {min_occurrences} occurrences."
        )
        return

    st.success(f"Found {len(final_results)} repeated transfer patterns.")
    results_df = pd.DataFrame(final_results).sort_values("Occurrences", ascending=False)

    st.subheader("Repeated Transfer Patterns Summary")
    display_summary_df = results_df.copy()
    display_summary_df["Avg. In Amount"] = display_summary_df["Avg. In Amount"].apply(
        lambda x: f"₹{x:,.0f}"
    )
    display_summary_df["Avg. Out Amount"] = display_summary_df["Avg. Out Amount"].apply(
        lambda x: f"₹{x:,.0f}"
    )
    display_summary_df["Avg. % Transferred"] = display_summary_df[
        "Avg. % Transferred"
    ].apply(lambda x: f"{x:.1f}%")

    st.dataframe(
        display_summary_df[
            [
                "Source",
                "Destination",
                "Occurrences",
                "Avg. In Amount",
                "Avg. Out Amount",
                "Avg. % Transferred",
                "First Occurrence",
                "Last Occurrence",
            ]
        ],
        use_container_width=True,
    )

    st.subheader("Detailed Transactions for Each Pattern")
    for _, row in results_df.iterrows():
        with st.expander(
            f"Pattern: {row['Source']} -> {row['Destination']} ({row['Occurrences']} times)"
        ):
            details_df = pd.DataFrame(row["details"])
            details_df["In Amount"] = details_df["In Amount"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            details_df["Out Amount"] = details_df["Out Amount"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            details_df["% Transferred"] = details_df["% Transferred"].apply(
                lambda x: f"{x:.1f}%"
            )
            st.dataframe(
                details_df[
                    [
                        "In Date",
                        "In Amount",
                        "Out Date",
                        "Out Amount",
                        "Days Gap",
                        "% Transferred",
                    ]
                ],
                use_container_width=True,
            )


def custom_filter_analysis(df):
    st.subheader("🔧 Custom Filter Analysis")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = st.session_state.get("df_for_merging")
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    col1, col2 = st.columns(2)

    with col1:
        # Date range filter
        date_range = st.date_input(
            "Date Range",
            value=(df_analysis["DATE"].min(), df_analysis["DATE"].max()),
            min_value=df_analysis["DATE"].min(),
            max_value=df_analysis["DATE"].max(),
        )

        # Amount range
        amount_min = st.number_input("Min Transaction Amount", value=0)
        amount_max = st.number_input(
            "Max Transaction Amount",
            value=int(df_analysis[["DEBIT", "CREDIT"]].max().max()),
        )

    with col2:
        # Description filter
        desc_filter = st.text_input("Description Contains (case-insensitive):")

        # Transaction type
        txn_type = st.selectbox("Transaction Type", ["All", "Debits", "Credits"])

    # Apply filters
    filtered_df = df_analysis.copy()

    # Date filter - handle empty tuple case
    if len(date_range) == 2:
        filtered_df = filtered_df[
            (filtered_df["DATE"].dt.date >= date_range[0])
            & (filtered_df["DATE"].dt.date <= date_range[1])
        ]

    # Amount filter
    if txn_type == "All":
        filtered_df = filtered_df[
            (
                (filtered_df["DEBIT"] >= amount_min)
                & (filtered_df["DEBIT"] <= amount_max)
            )
            | (
                (filtered_df["CREDIT"] >= amount_min)
                & (filtered_df["CREDIT"] <= amount_max)
            )
        ]
    elif txn_type == "Debits":
        filtered_df = filtered_df[
            (filtered_df["DEBIT"] >= amount_min) & (filtered_df["DEBIT"] <= amount_max)
        ]
    else:
        filtered_df = filtered_df[
            (filtered_df["CREDIT"] >= amount_min)
            & (filtered_df["CREDIT"] <= amount_max)
        ]

    # Description filter
    if desc_filter:
        filtered_df = filtered_df[
            filtered_df["DESCRIPTION"].str.contains(desc_filter, case=False, na=False)
        ]

    # Display results
    st.write(f"**Found {len(filtered_df)} transactions matching filters**")

    if len(filtered_df) > 0:
        # Summary stats
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Debits", f"₹{filtered_df['DEBIT'].fillna(0).sum():,.0f}")
        with col2:
            st.metric("Total Credits", f"₹{filtered_df['CREDIT'].fillna(0).sum():,.0f}")
        with col3:
            st.metric(
                "Avg Transaction",
                f"₹{filtered_df[['DEBIT', 'CREDIT']].mean().mean():,.0f}",
            )
        with col4:
            if "counterparty" in filtered_df.columns:
                st.metric(
                    "Unique Counterparties", filtered_df["counterparty"].nunique()
                )

        # Show data
        display_cols = ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
        if "counterparty" in filtered_df.columns:
            display_cols.insert(2, "counterparty")

        st.dataframe(
            filtered_df[display_cols].sort_values("DATE", ascending=False),
            use_container_width=True,
        )


if __name__ == "__main__":
    main()
