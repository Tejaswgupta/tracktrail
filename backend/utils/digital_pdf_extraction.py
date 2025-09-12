import csv
import re
import fitz
import logging
from typing import List, Dict, Tuple, Optional
import pandas as pd

try:
    import camelot
    CAMELOT_AVAILABLE = True
except ImportError:
    CAMELOT_AVAILABLE = False

try:
    import tabula

    TABULA_AVAILABLE = True
except ImportError:
    TABULA_AVAILABLE = False

logger = logging.getLogger(__name__)


class PDFExtractor:
    def __init__(self):
        self.extraction_methods = []
        if CAMELOT_AVAILABLE:
            self.extraction_methods.append("camelot")
        if TABULA_AVAILABLE:
            self.extraction_methods.append("tabula")
        self.extraction_methods.append("pymupdf")



def extract_tables_from_pdf(pdf_path: str, method: str = "auto") -> List[Dict]:
    """Extract tables from PDF using specified method or auto-detection with bank-specific handling"""

    extractor = PDFExtractor()

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
        return _extract_from_text(pdf_path)
    else:
        return _extract_with_method(pdf_path, method)




def _extract_with_method(pdf_path: str, method: str) -> List[Dict]:
    """Extract tables using specified method"""
    if method == "camelot" and CAMELOT_AVAILABLE:
        return _extract_with_camelot(pdf_path)
    elif method == "tabula" and TABULA_AVAILABLE:
        return _extract_with_tabula(pdf_path)
    elif method == "pymupdf":
        return _extract_with_pymupdf(pdf_path)
    else:
        raise ValueError(f"Extraction method '{method}' not available")


def _extract_with_camelot(pdf_path: str) -> List[Dict]:
    """Extract tables using Camelot library"""
    try:
        tables = camelot.read_pdf(pdf_path, pages="all", flavor="lattice")
        if not tables or len(tables) == 0:
            tables = camelot.read_pdf(pdf_path, pages="all", flavor="stream")

        extracted_data = []
        for i, table in enumerate(tables):
            df = table.df
            table_data = df.values.tolist()

            if not df.columns.empty:
                headers = df.columns.tolist()
                table_data.insert(0, headers)

            extracted_data.append(
                {
                    "page": table.page,
                    "table_number": i + 1,
                    "data": table_data,
                    "confidence": (
                        getattr(table, "accuracy", 0.0)
                        if hasattr(table, "accuracy")
                        else 0.0
                    ),
                }
            )

        return extracted_data
    except Exception as e:
        logger.error(f"Camelot extraction failed: {str(e)}")
        return []


def _extract_with_tabula(pdf_path: str) -> List[Dict]:
    """Extract tables using Tabula library"""
    try:
        dfs = tabula.read_pdf(pdf_path, pages="all", multiple_tables=True)

        extracted_data = []
        current_page = 1

        for i, df in enumerate(dfs):
            if df.empty:
                continue

            table_data = df.values.tolist()
            headers = df.columns.tolist()
            table_data.insert(0, headers)

            extracted_data.append(
                {
                    "page": current_page,
                    "table_number": i + 1,
                    "data": table_data,
                    "confidence": 0.8,
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
                    text_tables = _extract_table_from_text_layout(page, page_num + 1)
                    all_extracted_tables.extend(text_tables)
            else:
                text_tables = _extract_table_from_text_layout(page, page_num + 1)
                all_extracted_tables.extend(text_tables)

        document.close()
        return all_extracted_tables
    except Exception as e:
        logger.error(f"PyMuPDF extraction failed: {str(e)}")
        return []


def _extract_table_from_text_layout(page, page_num: int) -> List[Dict]:
    """Extract table data from text layout when structured tables aren't found"""
    try:
        text = page.get_text()
        lines = text.split("\n")

        potential_rows = []
        for line in lines:
            if not line.strip():
                continue

            if _looks_like_table_row(line):
                parsed_columns = _parse_generic_row(line)
                if len(parsed_columns) >= 4 and any(
                    col.strip() for col in parsed_columns
                ):
                    potential_rows.append(parsed_columns)

        if len(potential_rows) > 3:
            return [
                {
                    "page": page_num,
                    "table_number": 1,
                    "data": potential_rows,
                    "confidence": 0.6,
                }
            ]

        return []
    except Exception as e:
        logger.error(f"Text layout extraction failed: {str(e)}")
        return []





def _looks_like_table_row(line: str) -> bool:
    """Determine if a line looks like a bank statement table row"""
    date_patterns = [
        r"\b\d{1,2}-\d{1,2}-\d{4}\b",
        r"\b\d{1,2}/\d{1,2}/\d{4}\b",
        r"\b\d{1,2}\.\d{1,2}\.\d{4}\b",
    ]

    amount_patterns = [
        r"\b\d+,\d+\.\d{2}(?:CR|DR)?\b",
        r"\b\d+\.\d{2}(?:CR|DR)?\b",
        r"\b\d+,\d+(?:CR|DR)?\b",
    ]

    transaction_patterns = [
        r"[A-Z]\d{8,}",
        r"NEFT|RTGS|IMPS",
        r"NET@\d+",
        r"EPFO|DTAX|GSTX",
    ]

    has_date = any(re.search(pattern, line) for pattern in date_patterns)
    has_amount = any(re.search(pattern, line) for pattern in amount_patterns)
    has_transaction = any(re.search(pattern, line) for pattern in transaction_patterns)

    return has_date and (has_amount or has_transaction)


def _extract_from_text(pdf_path: str) -> List[Dict]:
    """Fallback text-based extraction method"""

    try:
        document = fitz.Document(pdf_path)
        all_text_data = []

        for page_num in range(len(document)):
            page = document.load_page(page_num)
            text = page.get_text()

            lines = [line.strip() for line in text.split("\n") if line.strip()]

            table_rows = []
            for line in lines:
                if _looks_like_table_row(line):
                    parsed_columns = _parse_generic_row(line)
                    if len(parsed_columns) >= 4 and any(
                        col.strip() for col in parsed_columns
                    ):
                        table_rows.append(parsed_columns)

            if table_rows:
                all_text_data.append(
                    {
                        "page": page_num + 1,
                        "table_number": 1,
                        "data": table_rows,
                        "confidence": 0.4,
                    }
                )

        document.close()
        return all_text_data
    except Exception as e:
        logger.error(f"Text extraction failed: {str(e)}")
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
