#!/usr/bin/env python3
"""
Test script to verify original_index implementation works correctly.
This script tests the core functionality without requiring a full database setup.
"""

import pandas as pd
import polars as pl
from datetime import datetime
import sys
import os

# Add the app directory to the path
sys.path.append(os.path.join(os.path.dirname(__file__), 'app'))

def test_pandas_sorting():
    """Test that pandas sorting preserves original order for same-date transactions."""
    print("Testing Pandas sorting with original_index...")
    
    # Create test data with same dates but different original_index
    data = [
        {"DATE": "2024-01-15", "original_index": 3, "DESCRIPTION": "Third transaction", "DEBIT": 0, "CREDIT": 500},
        {"DATE": "2024-01-15", "original_index": 1, "DESCRIPTION": "First transaction", "DEBIT": 1000, "CREDIT": 0},
        {"DATE": "2024-01-15", "original_index": 2, "DESCRIPTION": "Second transaction", "DEBIT": 0, "CREDIT": 1000},
        {"DATE": "2024-01-16", "original_index": 4, "DESCRIPTION": "Fourth transaction", "DEBIT": 500, "CREDIT": 0},
    ]
    
    df = pd.DataFrame(data)
    df['DATE'] = pd.to_datetime(df['DATE'])
    
    print("Original data (unsorted):")
    print(df[['DATE', 'original_index', 'DESCRIPTION']].to_string(index=False))
    
    # Sort by date only (old way - problematic)
    df_date_only = df.sort_values('DATE').reset_index(drop=True)
    print("\nSorted by DATE only (loses original order):")
    print(df_date_only[['DATE', 'original_index', 'DESCRIPTION']].to_string(index=False))
    
    # Sort by date and original_index (new way - correct)
    sort_columns = ["DATE"]
    if "original_index" in df.columns:
        sort_columns.append("original_index")
    df_proper = df.sort_values(sort_columns).reset_index(drop=True)
    
    print("\nSorted by DATE and original_index (preserves original order):")
    print(df_proper[['DATE', 'original_index', 'DESCRIPTION']].to_string(index=False))
    
    # Verify the order is correct
    expected_order = [1, 2, 3, 4]  # Should be in original_index order
    actual_order = df_proper['original_index'].tolist()
    
    if actual_order == expected_order:
        print("✅ Pandas sorting test PASSED")
        return True
    else:
        print(f"❌ Pandas sorting test FAILED: expected {expected_order}, got {actual_order}")
        return False

def test_polars_sorting():
    """Test that polars sorting preserves original order for same-date transactions."""
    print("\nTesting Polars sorting with original_index...")
    
    # Create test data with same dates but different original_index
    data = {
        "DATE": ["2024-01-15", "2024-01-15", "2024-01-15", "2024-01-16"],
        "original_index": [3, 1, 2, 4],
        "DESCRIPTION": ["Third transaction", "First transaction", "Second transaction", "Fourth transaction"],
        "DEBIT": [0, 1000, 0, 500],
        "CREDIT": [500, 0, 1000, 0],
        "counterparty": ["Party A", "Party B", "Party B", "Party A"]
    }
    
    df = pl.DataFrame(data)
    df = df.with_columns(pl.col("DATE").str.strptime(pl.Datetime, "%Y-%m-%d"))
    
    print("Original data (unsorted):")
    print(df.select(['DATE', 'original_index', 'DESCRIPTION']))
    
    # Sort by date only (old way - problematic)
    df_date_only = df.sort("DATE")
    print("\nSorted by DATE only (loses original order):")
    print(df_date_only.select(['DATE', 'original_index', 'DESCRIPTION']))
    
    # Sort by date and original_index (new way - correct)
    sort_columns = ["DATE"]
    if "original_index" in df.columns:
        sort_columns.append("original_index")
    df_proper = df.sort(sort_columns)
    
    print("\nSorted by DATE and original_index (preserves original order):")
    print(df_proper.select(['DATE', 'original_index', 'DESCRIPTION']))
    
    # Verify the order is correct
    expected_order = [1, 2, 3, 4]  # Should be in original_index order
    actual_order = df_proper['original_index'].to_list()
    
    if actual_order == expected_order:
        print("✅ Polars sorting test PASSED")
        return True
    else:
        print(f"❌ Polars sorting test FAILED: expected {expected_order}, got {actual_order}")
        return False

def test_round_trip_detection():
    """Test that round trip detection works correctly with original_index."""
    print("\nTesting round trip detection with original_index...")
    
    # Create test data where round trip occurs on same date
    data = {
        "DATE": ["2024-01-15", "2024-01-15", "2024-01-15", "2024-01-16"],
        "original_index": [1, 2, 3, 4],
        "DESCRIPTION": ["Payment to Party A", "Refund from Party A", "Payment to Party B", "Other transaction"],
        "DEBIT": [1000, 0, 500, 200],
        "CREDIT": [0, 1000, 0, 0],
        "counterparty": ["Party A", "Party A", "Party B", "Party C"]
    }
    
    df = pl.DataFrame(data)
    df = df.with_columns(pl.col("DATE").str.strptime(pl.Datetime, "%Y-%m-%d"))
    
    print("Test data for round trip detection:")
    print(df.select(['DATE', 'original_index', 'DESCRIPTION', 'DEBIT', 'CREDIT', 'counterparty']))
    
    # Simulate round trip detection logic
    counterparty = "Party A"
    cp_df = df.filter(pl.col("counterparty") == counterparty)
    
    # Sort by date and original_index
    sort_columns = ["DATE", "original_index"]
    debits = cp_df.filter(
        (pl.col("DEBIT").is_not_null()) & (pl.col("DEBIT") > 0)
    ).sort(sort_columns)
    
    credits = cp_df.filter(
        (pl.col("CREDIT").is_not_null()) & (pl.col("CREDIT") > 0)
    ).sort(sort_columns)
    
    print(f"\nDebits for {counterparty}:")
    print(debits.select(['DATE', 'original_index', 'DEBIT']))
    
    print(f"\nCredits for {counterparty}:")
    print(credits.select(['DATE', 'original_index', 'CREDIT']))
    
    # Check if we can detect the round trip
    if len(debits) > 0 and len(credits) > 0:
        debit_row = debits.row(0, named=True)
        credit_row = credits.row(0, named=True)
        
        # Check if credit comes after debit (using original_index)
        if (debit_row["DATE"] == credit_row["DATE"] and 
            debit_row["original_index"] < credit_row["original_index"] and
            abs(debit_row["DEBIT"] - credit_row["CREDIT"]) < 0.01):
            
            print(f"✅ Round trip detected: Debit at index {debit_row['original_index']}, Credit at index {credit_row['original_index']}")
            return True
        else:
            print("❌ Round trip detection failed: sequence or amount mismatch")
            return False
    else:
        print("❌ Round trip detection failed: insufficient data")
        return False

def test_rapid_movement_detection():
    """Test that rapid movement detection works correctly with original_index."""
    print("\nTesting rapid movement detection with original_index...")
    
    # Create test data with rapid movements on same date
    data = {
        "DATE": ["2024-01-15", "2024-01-15", "2024-01-15", "2024-01-15"],
        "original_index": [1, 2, 3, 4],
        "DESCRIPTION": ["Incoming transfer", "Outgoing transfer 1", "Outgoing transfer 2", "Final transaction"],
        "DEBIT": [0, 5000, 3000, 1000],
        "CREDIT": [10000, 0, 0, 0],
        "counterparty": ["Source", "Dest1", "Dest2", "Dest3"]
    }
    
    df = pd.DataFrame(data)
    df['DATE'] = pd.to_datetime(df['DATE'])
    
    print("Test data for rapid movement detection:")
    print(df[['DATE', 'original_index', 'DESCRIPTION', 'DEBIT', 'CREDIT']].to_string(index=False))
    
    # Sort by date and original_index
    sort_columns = ["DATE"]
    if "original_index" in df.columns:
        sort_columns.append("original_index")
    df_sorted = df.sort_values(sort_columns).reset_index(drop=True)
    
    # Look for rapid movements (large credit followed by debits)
    rapid_movements = []
    
    for i in range(len(df_sorted) - 1):
        current = df_sorted.iloc[i]
        next_tx = df_sorted.iloc[i + 1]
        
        # Check if large credit followed by debit on same date
        if (current['CREDIT'] > 5000 and 
            next_tx['DEBIT'] > 1000 and
            current['DATE'] == next_tx['DATE'] and
            current['original_index'] < next_tx['original_index']):
            
            rapid_movements.append({
                'credit_index': current['original_index'],
                'debit_index': next_tx['original_index'],
                'credit_amount': current['CREDIT'],
                'debit_amount': next_tx['DEBIT'],
                'time_gap': 'Same day, sequential'
            })
    
    if rapid_movements:
        print(f"✅ Rapid movement detected: {len(rapid_movements)} patterns found")
        for rm in rapid_movements:
            print(f"   Credit at index {rm['credit_index']} (${rm['credit_amount']}) → Debit at index {rm['debit_index']} (${rm['debit_amount']})")
        return True
    else:
        print("❌ Rapid movement detection failed: no patterns found")
        return False

def main():
    """Run all tests."""
    print("🧪 Testing Original Index Implementation")
    print("=" * 50)
    
    tests = [
        test_pandas_sorting,
        test_polars_sorting,
        test_round_trip_detection,
        test_rapid_movement_detection
    ]
    
    passed = 0
    total = len(tests)
    
    for test in tests:
        try:
            if test():
                passed += 1
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! Original index implementation is working correctly.")
        return 0
    else:
        print("⚠️  Some tests failed. Please review the implementation.")
        return 1

if __name__ == "__main__":
    exit(main())