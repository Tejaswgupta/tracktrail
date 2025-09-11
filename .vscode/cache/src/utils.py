import pandas as pd


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
