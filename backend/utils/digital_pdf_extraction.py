import csv  # Added for CSV operations
import re

import fitz
from fitz import Document


def extract_tables_from_pdf(pdf_path: str):
    """
    Extracts tables from a given PDF file using PyMuPDF.

    Args:
        pdf_path (str): The path to the PDF file.

    Returns:
        list: A list of extracted tables. Each table is represented as a list
              of lists, where inner lists are rows and contain cell strings.
              Returns an empty list if no tables are found or an error occurs.
    """
    all_extracted_tables = []
    try:
        document = Document(pdf_path)
        print(f"Opened document: {pdf_path}")

        for page_num in range(len(document)):
            page = document.load_page(page_num)
            print(f"\nProcessing Page {page_num + 1}...")

            # find_tables() returns a list of Table objects
            tables = page.find_tables()

            if tables.tables:  # Check if tables were found on the page
                print(f"Found {len(tables.tables)} table(s) on Page {page_num + 1}.")
                for i, table in enumerate(tables.tables):
                    print(f"  Table {i + 1} (Page {page_num + 1}):")
                    # table.extract() extracts the data as a list of lists
                    table_data = table.extract()
                    all_extracted_tables.append(
                        {
                            "page": page_num + 1,
                            "table_number": i + 1,
                            "data": table_data,
                        }
                    )
                    # Optionally print the table data for inspection
                    for row in table_data:
                        print(f"    {row}")
            else:
                print(f"No tables found on Page {page_num + 1} using default settings.")

        document.close()
        return all_extracted_tables

    except fitz.FileNotFoundError:
        print(f"Error: PDF file not found at {pdf_path}")
        return []
    except Exception as e:
        print(f"An error occurred: {e}")
        return []


# Modified function to save all tables to a single CSV
def save_tables_to_single_csv(
    extracted_data_rows: list,
    output_filename: str = "all_extracted_tables.csv",
    header_row: list = None,
):
    """
    Saves a list of extracted data rows into a single CSV file.
    Uses a provided header row.

    Args:
        extracted_data_rows (list): A list of dictionaries, where each dictionary
                                 contains 'page' and 'data' (a single row).
        output_filename (str): The name of the single output CSV file.
        header_row (list): The list of header strings for the CSV. This is the definitive header.
    """
    if not extracted_data_rows:
        print("No data rows to save to CSV.")
        return

    try:
        with open(output_filename, "w", newline="", encoding="utf-8") as csvfile:
            csv_writer = csv.writer(csvfile)

            if header_row:
                csv_writer.writerow(header_row)
            else:
                print(
                    "Error: No header row provided for CSV. Cannot save without headers."
                )
                return

            for item in extracted_data_rows:
                page_num = item["page"]
                row = item["data"]

                # Ensure all elements are strings and handle None
                formatted_row = [str(cell) if cell is not None else "" for cell in row]
                csv_writer.writerow(
                    [page_num] + formatted_row
                )  # Only page_num is prepended

        print(f"Saved all extracted tables to {output_filename}")
    except Exception as e:
        print(f"Error saving all tables to {output_filename}: {e}")


# --- Add this function to filter statement tables ---
def is_statement_table(table_data, reference_col_count=None):
    """
    Returns True if the table_data matches the expected structure of a bank statement table.
    Also returns a boolean indicating if the table itself likely contains headers.
    """
    if not table_data or len(table_data) < 1:  # Can be 1 if just headers
        return False, False  # Not a statement table, no headers

    # Check if the current table's first row looks like a header
    current_first_row = [str(cell).strip().lower() for cell in table_data[0]]
    header_keywords = [
        "date",
        "description",
        "amount",
        "balance",
        "withdrawal",
        "deposit",
        "narration",
        "particulars",
        "cheque",
        "ref",
        "transaction",
        "trans date",
        "value date",
        "type",
        "credit",
        "debit",
        "remarks",
        "particulars",
        "dr cr",
        "dr/cr", 
        "drcr",
        "debit credit",
        "transaction type",
        "cr dr",
        "cr/dr",
    ]
    # A row is considered a likely header if it has at least 3 keywords and reasonable number of columns (>3)
    header_matches = sum(
        any(hk in h for hk in header_keywords) for h in current_first_row
    )
    is_likely_header_row = header_matches >= 3 and len(current_first_row) > 3

    # Check for date-like patterns in the first column of actual data rows
    # Updated regex to include '.' as a separator for dates (e.g., DD.MM.YYYY)
    date_pattern = re.compile(
        r"\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b|\b\d{2,4}[-/.]\d{1,2}[-/.]\d{1,2}\b"
    )

    # Determine where data rows start for this specific table
    start_data_row_index = 1 if is_likely_header_row else 0

    # Need at least one row after potential header for it to be a valid statement table
    # This also handles cases where a table is just a header row without data
    if len(table_data) <= start_data_row_index:
        return False, False  # Only header or empty table, not a full statement table

    date_like_rows_count = 0
    for row_idx in range(start_data_row_index, len(table_data)):
        row = table_data[row_idx]
        if row and len(row) > 0 and date_pattern.search(str(row[0]).strip()):
            date_like_rows_count += 1

    # Heuristic for sufficient date-like rows: at least 1/3 of the data rows
    min_date_rows = max(1, (len(table_data) - start_data_row_index) // 3)

    # Primary check: Does it have enough date-like rows?
    has_sufficient_date_rows = date_like_rows_count >= min_date_rows

    # Secondary check: Column count consistency if reference provided (for data-only tables)
    col_count_compatible = True
    if reference_col_count is not None:
        # Get column count of the first *data* row (if available)
        current_data_col_count = (
            len(table_data[start_data_row_index])
            if len(table_data) > start_data_row_index
            else 0
        )
        # Allow +/- 2 columns difference for flexibility
        col_count_compatible = abs(current_data_col_count - reference_col_count) <= 2

    # Combined logic:
    # 1. It's a statement table if it has a likely header AND sufficient data rows.
    # 2. OR, if it doesn't have a likely header, but is compatible with the reference column count AND has sufficient data rows.
    if (is_likely_header_row and has_sufficient_date_rows) or (
        not is_likely_header_row
        and reference_col_count is not None
        and col_count_compatible
        and has_sufficient_date_rows
    ):
        return True, is_likely_header_row

    return False, False


def process_pdf_to_csv(
    pdf_file_path: str, output_csv_path: str = "bank_statement_all_tables.csv"
) -> None:
    """
    Process a PDF file to extract statement tables and save them to a CSV file.

    Args:
        pdf_file_path: Path to the PDF file to process
        output_csv_path: Path to save the output CSV (default: "bank_statement_all_tables.csv")
    """
    print(f"Attempting to extract tables from: {pdf_file_path}")
    extracted_data = extract_tables_from_pdf(pdf_file_path)

    filtered_tables_for_csv = []
    statement_csv_header = None
    reference_data_col_count = None  # To track expected number of columns for data rows

    for item in extracted_data:
        is_statement, has_header_row = is_statement_table(
            item["data"], reference_data_col_count
        )

        if is_statement:
            table_data = item["data"]
            if has_header_row:
                if statement_csv_header is None:  # Only set header once
                    statement_csv_header = ["Page"] + [
                        str(cell) if cell is not None else "" for cell in table_data[0]
                    ]

                if len(table_data) > 1 and reference_data_col_count is None:
                    reference_data_col_count = len(table_data[1])

                for row in table_data[1:]:
                    filtered_tables_for_csv.append({"page": item["page"], "data": row})
            else:
                if reference_data_col_count is None:
                    print(
                        f"Warning: Data table on page {item['page']} identified before reference header/column count was established. Skipping."
                    )
                    continue

                for row in table_data:
                    filtered_tables_for_csv.append({"page": item["page"], "data": row})
        else:
            print(
                f"Skipped table on page {item['page']} (did not match statement rules)"
            )

    if filtered_tables_for_csv and statement_csv_header:
        print("\n--- Extraction Summary (Filtered) ---")
        print(
            f"Found {len(filtered_tables_for_csv)} data rows across statement tables."
        )

        print("\n--- Saving to Single CSV ---")
        save_tables_to_single_csv(
            filtered_tables_for_csv,
            output_csv_path,
            statement_csv_header,
        )
    else:
        print(
            "\nNo statement tables were extracted or an error occurred (or no header table was found)."
        )


# if __name__ == "__main__":
#     # loop through all the pdfs in the directory and its subdirectories, and extract the tables.
#     import os

#     root_dir = "/Users/tejasw/Downloads/06-03 ALL DETAILS - urgent"
#     for subdir, dirs, files in os.walk(root_dir):
#         for file in files:
#             if file.lower().endswith(".pdf"):
#                 pdf_path = os.path.join(subdir, file)
#                 print(f"\nProcessing: {pdf_path}")

#                 # Create output directory structure
#                 relative_path = os.path.relpath(subdir, root_dir)
#                 output_dir = os.path.join("output", relative_path)
#                 os.makedirs(output_dir, exist_ok=True)

#                 # Generate output CSV path
#                 output_csv = os.path.join(
#                     output_dir, f"{os.path.splitext(file)[0]}.csv"
#                 )

#                 try:
#                     process_pdf_to_csv(pdf_path, output_csv)
#                 except Exception as e:
#                     print(f"Error processing {pdf_path}: {str(e)}")


if __name__ == "__main__":
    process_pdf_to_csv(
        "/Users/tejasw/Downloads/BGDL 2 (1).pdf",
        "output/BGDL 2 (1).csv",
    )
