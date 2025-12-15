import logging
import re
from typing import Dict, List, Tuple

import fitz
import tabula

logger = logging.getLogger(__name__)


class PDFExtractor:
    def __init__(self, method: str = "both"):
        """
        Initialize PDFExtractor with specified extraction method.

        Args:
            method (str): Extraction method to use. Options are:
                - "tabula": Use only Tabula-py library
                - "pymupdf": Use only PyMuPDF library
                - "both": Try both methods (default behavior)
        """
        self.extraction_methods = []

        if method == "tabula":
            self.extraction_methods.append("tabula")
        elif method == "pymupdf":
            self.extraction_methods.append("pymupdf")
        elif method == "both":
            self.extraction_methods.append("tabula")
            self.extraction_methods.append("pymupdf")
        else:
            # Default to both if invalid method specified
            self.extraction_methods.append("tabula")
            self.extraction_methods.append("pymupdf")


def extract_tables_from_pdf(
    pdf_path: str, method: str = "auto", extraction_method: str = "both"
) -> List[Dict]:
    """Extract tables from PDF using specified method or auto-detection with bank-specific handling"""

    extractor = PDFExtractor(method=extraction_method)

    if method == "auto":
        # Test each method on first few pages to find the best one
        best_method = None
        max_tables_found = 0

        for extraction_method in extractor.extraction_methods:
            try:
                logger.info(f"Testing extraction method: {extraction_method} on first 5 pages")
                result = _extract_with_method_limited(pdf_path, extraction_method, max_pages=5)

                if result and len(result) > 0:
                    logger.info(f"Method {extraction_method} found {len(result)} tables in first 5 pages")
                    if len(result) > max_tables_found:
                        max_tables_found = len(result)
                        best_method = extraction_method
                else:
                    logger.info(f"Method {extraction_method} found no tables in first 5 pages")
            except Exception as e:
                logger.warning(f"Method {extraction_method} failed during testing: {str(e)}")
                continue

        if best_method:
            logger.info(f"Using best method: {best_method} (found {max_tables_found} tables in test)")
            result = _extract_with_method(pdf_path, best_method)
            
            # Validate that tables are properly formatted
            if result:
                valid_tables = []
                for table in result:
                    table_data = table.get("data", [])
                    if table_data and len(table_data) > 0:
                        col_count = len(table_data[0])
                        if col_count >= 5:  # Bank statements need at least 5 columns
                            valid_tables.append(table)
                
                if valid_tables:
                    logger.info(f"Best method returned {len(valid_tables)} valid tables")
                    return valid_tables
                else:
                    logger.info(f"Best method returned {len(result)} tables but all were malformed")
                    # Fall through to try full extraction with all methods
            
        # If no best method or best method failed, try full extraction
            logger.info("No method found tables in first 5 pages, trying full processing with all methods")
            # Fallback: try each method on full document
            all_results = []
            for extraction_method in extractor.extraction_methods:
                try:
                    logger.info(f"Trying full extraction with method: {extraction_method}")
                    result = _extract_with_method(pdf_path, extraction_method)
                    if result and len(result) > 0:
                        logger.info(f"Extracted {len(result)} tables with {extraction_method}")
                        all_results.extend(result)
                except Exception as e:
                    logger.warning(f"Method {extraction_method} failed: {str(e)}")
                    continue

            # Check if we got valid tables (enough columns)
            if all_results:
                logger.info(f"Checking if {len(all_results)} extracted tables are properly formatted...")
                valid_tables = []
                for table in all_results:
                    table_data = table.get("data", [])
                    if table_data and len(table_data) > 0:
                        col_count = len(table_data[0])
                        if col_count >= 5:  # Bank statements need at least 5 columns
                            valid_tables.append(table)
                        else:
                            logger.warning(f"Skipping malformed table with only {col_count} columns")
                
                if valid_tables:
                    logger.info(f"Found {len(valid_tables)} valid tables out of {len(all_results)}")
                    return valid_tables
                else:
                    logger.info(f"All {len(all_results)} tables were malformed (too few columns)")
            
            logger.info("All table methods failed or returned malformed tables, trying text-based extraction fallback")
            # Text-based extraction fallback for PDFs without table structures
            try:
                result = _extract_text_based(pdf_path)
                if result and len(result) > 0:
                    logger.info(f"Successfully extracted {len(result)} tables using text-based parsing")
                    return result
            except Exception as e:
                logger.warning(f"Text-based extraction also failed: {str(e)}")
            
            logger.info("All extraction methods failed")
            return []
    else:
        return _extract_with_method(pdf_path, method)


def _extract_with_method(pdf_path: str, method: str) -> List[Dict]:
    """Extract tables using specified method"""
    if method == "tabula":
        return _extract_with_tabula(pdf_path)
    elif method == "pymupdf":
        return _extract_with_pymupdf(pdf_path)
    else:
        raise ValueError(f"Extraction method '{method}' not available")


def _extract_with_method_limited(pdf_path: str, method: str, max_pages: int = 5) -> List[Dict]:
    """Extract tables using specified method but limit to first few pages for testing"""
    if method == "tabula":
        return _extract_with_tabula_limited(pdf_path, max_pages)
    elif method == "pymupdf":
        return _extract_with_pymupdf_limited(pdf_path, max_pages)
    else:
        raise ValueError(f"Extraction method '{method}' not available")


def _extract_with_tabula(pdf_path: str) -> List[Dict]:
    """Extract tables using Tabula-py library"""
    try:
        tables = tabula.read_pdf(
            pdf_path, pages="all", output_format="json", lattice=True
        )
        if not tables or len(tables) == 0:
            tables = tabula.read_pdf(
                pdf_path, pages="all", output_format="json", stream=True
            )

        extracted_data = []
        for i, table in enumerate(tables):
            table_data = []
            for row in table.get("data", []):
                table_data.append([cell["text"] for cell in row])

            extracted_data.append(
                {
                    "page": table.get("page", i + 1),
                    "table_number": i + 1,
                    "data": table_data,
                    "confidence": 0.0,
                }
            )

        return extracted_data
    except Exception as e:
        logger.error(f"Tabula extraction failed: {str(e)}")
        return []


def _extract_with_tabula_limited(pdf_path: str, max_pages: int = 5) -> List[Dict]:
    """Extract tables using Tabula-py library limited to first few pages"""
    try:
        # Limit pages to first max_pages (e.g., "1-5")
        pages_range = f"1-{max_pages}"
        tables = tabula.read_pdf(
            pdf_path, pages=pages_range, output_format="json", lattice=True
        )
        if not tables or len(tables) == 0:
            tables = tabula.read_pdf(
                pdf_path, pages=pages_range, output_format="json", stream=True
            )

        extracted_data = []
        for i, table in enumerate(tables):
            table_data = []
            for row in table.get("data", []):
                table_data.append([cell["text"] for cell in row])

            extracted_data.append(
                {
                    "page": table.get("page", i + 1),
                    "table_number": i + 1,
                    "data": table_data,
                    "confidence": 0.0,
                }
            )

        return extracted_data
    except Exception as e:
        logger.error(f"Tabula limited extraction failed: {str(e)}")
        return []


def _extract_with_pymupdf(pdf_path: str) -> List[Dict]:
    """Extract tables using PyMuPDF library with bank-specific handling"""

    all_extracted_tables = []
    try:
        document = fitz.Document(pdf_path)
        logger.info(f"Opened document: {pdf_path}")

        for page_num in range(len(document)):
            page = document.load_page(page_num)
            logger.info(f"Processing Page {page_num + 1}...")

            tables = page.find_tables()

            if tables.tables:
                logger.info(
                    f"Found {len(tables.tables)} table(s) on Page {page_num + 1}."
                )

                tables_processed = False
                for i, table in enumerate(tables.tables):
                    table_data = table.extract()

                    if table_data and len(table_data[0]) >= 7:
                        all_extracted_tables.append(
                            {
                                "page": page_num + 1,
                                "table_number": i + 1,
                                "data": table_data,
                                "confidence": 0.7,
                            }
                        )
                        tables_processed = True

                if not tables_processed:
                    logger.info(
                        f"Structured tables found but poorly formatted, using text parsing for page {page_num + 1}"
                    )
            else:
                print('No tables found using PyMuPDF table detection.')
                pass

        document.close()
        return all_extracted_tables
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed: {str(e)}")
        return []


def _extract_with_pymupdf_limited(pdf_path: str, max_pages: int = 5) -> List[Dict]:
    """Extract tables using PyMuPDF library limited to first few pages"""

    all_extracted_tables = []
    try:
        document = fitz.Document(pdf_path)
        logger.info(f"Opened document for testing: {pdf_path}")

        # Limit to first max_pages
        total_pages = min(len(document), max_pages)

        for page_num in range(total_pages):
            page = document.load_page(page_num)
            logger.info(f"Testing Page {page_num + 1}...")

            tables = page.find_tables()

            if tables.tables:
                logger.info(
                    f"Found {len(tables.tables)} table(s) on Page {page_num + 1}."
                )

                tables_processed = False
                for i, table in enumerate(tables.tables):
                    table_data = table.extract()

                    if table_data and len(table_data[0]) >= 7:
                        all_extracted_tables.append(
                            {
                                "page": page_num + 1,
                                "table_number": i + 1,
                                "data": table_data,
                                "confidence": 0.7,
                            }
                        )
                        tables_processed = True

                if not tables_processed:
                    logger.info(
                        f"Structured tables found but poorly formatted on page {page_num + 1}"
                    )
            else:
                logger.debug(f"No tables found on page {page_num + 1}")

        document.close()
        return all_extracted_tables
    except Exception as e:
        logger.error(f"PyMuPDF limited extraction failed: {str(e)}")
        return []




def _extract_text_based(pdf_path: str) -> List[Dict]:
    """
    Extract bank statement data from text-based PDF (no table structures)
    This is a fallback method for PDFs where table detection fails
    """
    try:
        document = fitz.Document(pdf_path)
        logger.info(f"Starting text-based extraction for: {pdf_path}")
        
        all_transactions = []
        
        # Common date patterns for Indian bank statements
        date_pattern = r'\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b'
        
        for page_num in range(len(document)):
            page = document[page_num]
            text = page.get_text()
            
            # Split into lines
            lines = text.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line or len(line) < 10:  # Skip very short lines
                    continue
                
                # Check if line starts with or contains a date (likely a transaction)
                if re.search(date_pattern, line):
                    # Split by multiple spaces (common in bank PDFs)
                    parts = re.split(r'\s{2,}', line)
                    
                    # Only keep lines with enough data (at least 4 columns)
                    if len(parts) >= 4:
                        all_transactions.append(parts)
        
        document.close()
        
        if not all_transactions:
            logger.info("No transactions found using text-based extraction")
            return []
        
        logger.info(f"Extracted {len(all_transactions)} transaction rows from text")
        
        # Format as a single table structure compatible with existing code
        return [{
            "page": 1,  # Aggregate all pages
            "table_number": 1,
            "data": all_transactions,
            "confidence": 0.6,  # Lower confidence for text-based extraction
        }]
        
    except Exception as e:
        logger.error(f"Text-based extraction failed: {str(e)}")
        return []


def is_statement_table(table_data, reference_col_count=None) -> Tuple[bool, bool]:

    """
    Determine if table data represents a bank statement table
    Returns: (is_statement_table, has_header_row)
    """
    if not table_data or len(table_data) < 1:
        return False, False

    # If reference_col_count is provided, use it for additional validation
    if reference_col_count is not None:
        # Check if the table has roughly the same number of columns as reference
        first_data_row = 1 if len(table_data) > 1 else 0
        if len(table_data) > first_data_row and len(table_data[first_data_row]) > 0:
            current_col_count = len(table_data[first_data_row])
            # Allow some flexibility in column count (±2 columns)
            if abs(current_col_count - reference_col_count) > 2:
                logger.debug(f"Column count mismatch: expected ~{reference_col_count}, got {current_col_count}")
                # Don't reject immediately, but consider this in final decision

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
        "reference",
        "transaction",
        "trans",
        "value",
        "type",
        "credit",
        "debit",
        "remarks",
        "dr",
        "cr",
        "serial",
        "s.no",
        "sno",
        "tran",
        "id",
        "brought",
        "forward",
        "closing",
        "opening",
        "charges",
        "transfer",
        "payment",
        "receipt",
    ]

    first_row = [str(cell).strip().lower() for cell in table_data[0]]
    header_matches = sum(
        any(keyword in cell for keyword in header_keywords) for cell in first_row
    )

    min_header_matches = max(1, len(first_row) // 4)
    is_likely_header_row = (
        header_matches >= min_header_matches
        and len(first_row) >= 3
        and len(first_row) <= 15
    )

    date_patterns = [
        r"\b\d{1,2}-\d{1,2}-\d{4}\b",
        r"\b\d{1,2}/\d{1,2}/\d{4}\b",
        r"\b\d{1,2}\.\d{1,2}\.\d{4}\b",
    ]

    start_data_row_index = 1 if is_likely_header_row else 0

    if len(table_data) <= start_data_row_index:
        return False, False

    valid_rows = 0
    total_data_rows = len(table_data) - start_data_row_index

    for row_idx in range(start_data_row_index, len(table_data)):
        row = table_data[row_idx]
        if not row or len(row) == 0:
            continue

        first_cell = str(row[0]).strip()
        has_date = any(re.search(pattern, first_cell) for pattern in date_patterns)

        transaction_indicators = [
            "brought",
            "forward",
            "balance",
            "total",
            "closing",
            "rtgs",
            "neft",
            "imps",
        ]
        has_transaction_indicator = any(
            indicator in str(row).lower() for indicator in transaction_indicators
        )

        has_amounts = any(
            re.search(r"\d+[,.]?\d*\.?\d*(?:CR|DR)?", str(cell)) for cell in row if cell
        )

        if has_date or has_transaction_indicator or has_amounts:
            valid_rows += 1

    min_valid_rows = max(1, total_data_rows // 3)
    has_sufficient_valid_rows = valid_rows >= min_valid_rows

    is_statement_table = has_sufficient_valid_rows and (
        is_likely_header_row or valid_rows >= 3
    )

    return is_statement_table, is_likely_header_row
