#!/usr/bin/env python3
"""
Markdown Table to CSV Converter

This script extracts markdown tables from .md files and converts them to CSV format.
Only tables containing a date column are processed and concatenated into a single output file.
"""

import argparse
import csv
import os
import re
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple


class MarkdownTableParser:
    """Parser for extracting and converting markdown tables to CSV."""

    def __init__(self):
        # Regex pattern to match markdown tables
        self.table_pattern = re.compile(
            r"(\|[^\n]*\|\n(?:\|[-\s:]*\|[-\s:]*\|\n)?(?:\|[^\n]*\|\n)*)", re.MULTILINE
        )

        # Common date column patterns (case insensitive)
        self.date_patterns = [
            r"\bdate\b",
            r"\bdt\b",
            r"\btransaction\s*date\b",
            r"\bvalue\s*date\b",
            r"\bposting\s*date\b",
            r"\btxn\s*date\b",
        ]

        # Date format patterns for validation
        self.date_formats = [
            r"\d{1,2}[-/]\d{1,2}[-/]\d{2,4}",  # DD-MM-YYYY, DD/MM/YYYY
            r"\d{2,4}[-/]\d{1,2}[-/]\d{1,2}",  # YYYY-MM-DD, YYYY/MM/DD
            r"\d{1,2}\s+\w{3}\s+\d{2,4}",  # DD MMM YYYY
            r"\w{3}\s+\d{1,2},?\s+\d{2,4}",  # MMM DD, YYYY
        ]

    def extract_tables(self, content: str) -> List[str]:
        """Extract all markdown tables from content."""
        tables = []
        matches = self.table_pattern.findall(content)

        for match in matches:
            # Clean up the table text
            table_text = match.strip()
            if table_text:
                tables.append(table_text)

        return tables

    def parse_table(self, table_text: str) -> Tuple[List[str], List[List[str]]]:
        """Parse a markdown table into headers and rows."""
        lines = [line.strip() for line in table_text.split("\n") if line.strip()]

        if len(lines) < 2:
            return [], []

        # Extract headers
        header_line = lines[0]
        headers = [cell.strip() for cell in header_line.split("|")[1:-1]]

        # Skip separator line (usually line 1)
        separator_idx = 1
        if len(lines) > 1 and re.match(r"^\|[\s\-:]+\|$", lines[1]):
            separator_idx = 1
        else:
            separator_idx = 0  # No separator line found

        # Extract data rows
        rows = []
        for line in lines[separator_idx + 1 :]:
            if line.startswith("|") and line.endswith("|"):
                # Skip lines that look like separators (contain only dashes, spaces, colons)
                if re.match(r"^\|[\s\-:]+\|$", line):
                    continue

                # Also skip lines where all cells contain only dashes
                cells = [cell.strip() for cell in line.split("|")[1:-1]]
                if all(re.match(r"^[\s\-:]*$", cell) for cell in cells):
                    continue

                if len(cells) == len(headers):  # Ensure row matches header count
                    rows.append(cells)

        return headers, rows

    def has_date_column(self, headers: List[str]) -> bool:
        """Check if the table has a date column."""
        for header in headers:
            header_lower = header.lower().strip()
            for pattern in self.date_patterns:
                if re.search(pattern, header_lower, re.IGNORECASE):
                    return True
        return False

    def find_date_column_index(self, headers: List[str]) -> Optional[int]:
        """Find the index of the date column."""
        for i, header in enumerate(headers):
            header_lower = header.lower().strip()
            for pattern in self.date_patterns:
                if re.search(pattern, header_lower, re.IGNORECASE):
                    return i
        return None

    def validate_date_data(self, rows: List[List[str]], date_col_idx: int) -> bool:
        """Validate that the date column contains actual date data."""
        if date_col_idx is None or date_col_idx >= len(rows[0]) if rows else True:
            return False

        date_count = 0
        total_rows = len(rows)

        for row in rows:
            if date_col_idx < len(row):
                cell_value = row[date_col_idx].strip()
                if cell_value and cell_value not in ["", "-", "N/A", "n/a"]:
                    # Check if it matches any date pattern
                    for date_pattern in self.date_formats:
                        if re.search(date_pattern, cell_value):
                            date_count += 1
                            break

        # Consider valid if at least 30% of rows have date-like data
        return date_count >= (total_rows * 0.3) if total_rows > 0 else False

    def process_file(self, file_path: str) -> List[Tuple[List[str], List[List[str]]]]:
        """Process a single markdown file and extract valid tables."""
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
        except Exception as e:
            print(f"Error reading file {file_path}: {e}")
            return []

        tables = self.extract_tables(content)
        valid_tables = []

        for table_text in tables:
            headers, rows = self.parse_table(table_text)

            if not headers or not rows:
                continue

            # Check if table has a date column
            if self.has_date_column(headers):
                date_col_idx = self.find_date_column_index(headers)

                # Validate that the date column actually contains date data
                if self.validate_date_data(rows, date_col_idx):
                    valid_tables.append((headers, rows))
                    print(f"Found valid table with {len(rows)} rows in {file_path}")
                else:
                    print(
                        f"Skipping table in {file_path}: date column found but no valid date data"
                    )
            else:
                print(f"Skipping table in {file_path}: no date column found")

        return valid_tables

    def write_csv(
        self, output_file: str, all_tables: List[Tuple[List[str], List[List[str]]]]
    ):
        """Write all tables to a single CSV file."""
        if not all_tables:
            print("No valid tables found to write.")
            return

        try:
            with open(output_file, "w", newline="", encoding="utf-8") as csvfile:
                writer = csv.writer(csvfile)

                # Write header from first table
                first_headers = all_tables[0][0]
                writer.writerow(first_headers)

                # Write all rows from all tables
                total_rows = 0
                for headers, rows in all_tables:
                    # If headers don't match, we need to align them
                    if headers != first_headers:
                        print(
                            f"Warning: Header mismatch detected. Attempting to align columns."
                        )
                        # For now, we'll skip mismatched tables
                        # In a more robust implementation, we could try to align columns
                        continue

                    for row in rows:
                        writer.writerow(row)
                        total_rows += 1

                print(f"Successfully wrote {total_rows} rows to {output_file}")

        except Exception as e:
            print(f"Error writing CSV file: {e}")


def main():
    """Main function to handle command line arguments and process files."""
    parser = argparse.ArgumentParser(
        description="Convert markdown tables to CSV format. Only tables with date columns are processed."
    )
    parser.add_argument(
        "input", help="Input markdown file or directory containing .md files"
    )
    parser.add_argument(
        "-o",
        "--output",
        default="output.csv",
        help="Output CSV file name (default: output.csv)",
    )
    parser.add_argument(
        "-r",
        "--recursive",
        action="store_true",
        help="Process .md files recursively in subdirectories",
    )

    args = parser.parse_args()

    # Initialize parser
    md_parser = MarkdownTableParser()

    # Collect input files
    input_files = []
    input_path = Path(args.input)

    if input_path.is_file():
        if input_path.suffix.lower() == ".md":
            input_files.append(str(input_path))
        else:
            print(f"Error: {args.input} is not a markdown file")
            return
    elif input_path.is_dir():
        if args.recursive:
            input_files.extend([str(p) for p in input_path.rglob("*.md")])
        else:
            input_files.extend([str(p) for p in input_path.glob("*.md")])
    else:
        print(f"Error: {args.input} does not exist")
        return

    if not input_files:
        print("No markdown files found to process")
        return

    print(f"Processing {len(input_files)} markdown file(s)...")

    # Process all files
    all_tables = []
    for file_path in input_files:
        print(f"\nProcessing: {file_path}")
        tables = md_parser.process_file(file_path)
        all_tables.extend(tables)

    # Write output
    if all_tables:
        md_parser.write_csv(args.output, all_tables)
        print(f"\nConversion complete! Output saved to: {args.output}")
        print(f"Total tables processed: {len(all_tables)}")
    else:
        print("\nNo valid tables with date columns found in the input files.")


if __name__ == "__main__":
    main()
