"""
PDF extraction endpoints for converting uploaded bank statement PDFs to CSV content.
"""
import os
import io
import csv
import shutil
import tempfile
import logging

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/extract/pdf-to-csv",
    summary="Extract PDF tables to CSV (content)",
    description="Upload a PDF and receive extracted statement tables as CSV content (not a file).",
    responses={
        200: {"description": "CSV content returned as text/csv"},
        400: {"description": "Invalid input"},
        415: {"description": "Unsupported Media Type"},
        500: {"description": "Extraction failed"},
    },
)
async def extract_pdf_to_csv(file: UploadFile = File(...)) -> Response:
    """
    Accept a PDF upload, extract bank-statement-like tables and return CSV content.

    - Validates that the upload is a PDF
    - Uses PyMuPDF-based utilities to detect tables and filter for statement-like ones
    - Returns a text/csv response body (no file saved)
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    # Basic content-type check (some browsers may send application/octet-stream)
    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Only PDF uploads are supported")

    tmp_path = None
    try:
        # Persist upload to a temp file for PyMuPDF
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        # Lazy import to avoid importing heavy deps at startup
        from utils.digital_pdf_extraction import (
            extract_tables_from_pdf,
            is_statement_table,
        )

        # Extract all tables from the PDF
        extracted_data = extract_tables_from_pdf(tmp_path)

        # Filter for statement-like tables and prepare rows for CSV
        filtered_rows = []
        statement_csv_header = None
        reference_data_col_count = None

        for item in extracted_data:
            table_data = item.get("data", [])
            is_stmt, has_header_row = is_statement_table(
                table_data, reference_data_col_count
            )
            if not is_stmt:
                continue

            if has_header_row:
                if statement_csv_header is None:
                    statement_csv_header = ["Page"] + [
                        str(cell) if cell is not None else "" for cell in table_data[0]
                    ]
                if len(table_data) > 1 and reference_data_col_count is None:
                    reference_data_col_count = len(table_data[1])
                for row in table_data[1:]:
                    filtered_rows.append({"page": item["page"], "data": row})
            else:
                if reference_data_col_count is None:
                    # Skip data-only tables until we have a reference column count from a headered table
                    continue
                for row in table_data:
                    filtered_rows.append({"page": item["page"], "data": row})

        # If nothing usable found, return empty CSV content
        if not filtered_rows or not statement_csv_header:
            return Response(content="", media_type="text/csv")

        # Build CSV content in-memory
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(statement_csv_header)
        for row_item in filtered_rows:
            row = [str(cell) if cell is not None else "" for cell in row_item["data"]]
            writer.writerow([row_item["page"]] + row)

        csv_content = output.getvalue()
        return Response(content=csv_content, media_type="text/csv")

    except HTTPException:
        # Pass through explicit HTTP errors
        raise
    except Exception as e:
        logger.error(f"PDF extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to extract tables from PDF")
    finally:
        # Cleanup temp file
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except Exception:
            pass
