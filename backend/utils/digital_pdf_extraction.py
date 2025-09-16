import re
import fitz
import logging
from typing import List, Dict, Tuple
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
        for extraction_method in extractor.extraction_methods:
            try:
                logger.info(f"Trying extraction method: {extraction_method}")
                result = _extract_with_method(pdf_path, extraction_method)
                if result and len(result) > 0:
                    logger.info(
                        f"Successfully extracted {len(result)} tables with {extraction_method}"
                    )
                    return result
                else:
                    logger.warning(f"No tables found with {extraction_method}")
            except Exception as e:
                logger.warning(f"Method {extraction_method} failed: {str(e)}")
                continue

        logger.info("All table methods failed, trying text-based extraction")
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
            for row in table["data"]:
                table_data.append([cell["text"] for cell in row])

            extracted_data.append(
                {
                    "page": table["page"],
                    "table_number": i + 1,
                    "data": table_data,
                    "confidence": 0.0,
                }
            )

        return extracted_data
    except Exception as e:
        logger.error(f"Tabula extraction failed: {str(e)}")
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
                pass

        document.close()
        return all_extracted_tables
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed: {str(e)}")
        return []


def is_statement_table(table_data, reference_col_count=None) -> Tuple[bool, bool]:
    """
    Determine if table data represents a bank statement table
    Returns: (is_statement_table, has_header_row)
    """
    if not table_data or len(table_data) < 1:
        return False, False

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
