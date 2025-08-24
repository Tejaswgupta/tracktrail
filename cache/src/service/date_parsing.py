import pandas as pd
from dateutil import parser as dateutil_parser


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
