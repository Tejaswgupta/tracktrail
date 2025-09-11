import os
import io
import csv
import shutil
import tempfile
import logging
import fitz
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post(
    "/extract/pdf-to-csv",
    summary="Extract PDF tables to CSV (content)",
    description="Upload a PDF and receive extracted statement tables as CSV content with enhanced extraction methods.",
    responses={
        200: {"description": "CSV content returned as text/csv"},
        400: {"description": "Invalid input"},
        415: {"description": "Unsupported Media Type"},
        500: {"description": "Extraction failed"},
    },
)
async def extract_pdf_to_csv(
    file: UploadFile = File(...), extraction_method: str = "auto"
) -> Response:
    if not file:
        raise HTTPException(status_code=400, detail="No file uploaded")

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=415, detail="Only PDF uploads are supported")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            shutil.copyfileobj(file.file, tmp)
            tmp_path = tmp.name

        logger.info(f"Processing PDF: {file.filename}")

        try:
            test_doc = fitz.open(tmp_path)
            if test_doc.needs_pass:
                test_doc.close()
                raise HTTPException(
                    status_code=400, detail="Password-protected PDFs not supported"
                )
            test_doc.close()
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid PDF file: {str(e)}")

        from utils.digital_pdf_extraction import (
            extract_tables_from_pdf,
            is_statement_table,
        )

        extracted_data = extract_tables_from_pdf(tmp_path, method=extraction_method)
        logger.info(f"Extracted {len(extracted_data)} tables from PDF")

        filtered_rows = []
        reference_data_col_count = None
        statement_csv_header = [
            "Date",
            "Tran Id",
            "Ref Num",
            "Particulars",
            "Debit Amt.",
            "Credit Amt.",
            "Balance Amt.",
        ]
        expected_columns = len(statement_csv_header)

        if extracted_data:
            extracted_data.sort(
                key=lambda x: (x.get("confidence", 0), x.get("page", 0)), reverse=True
            )

        for item in extracted_data:
            table_data = item.get("data", [])
            if not table_data:
                continue

            logger.info(
                f"Analyzing table on page {item.get('page', 'unknown')} with {len(table_data)} rows"
            )

            is_stmt, has_header_row = is_statement_table(
                table_data, reference_data_col_count
            )

            if not is_stmt:
                logger.info(
                    f"Skipped table on page {item.get('page')} (not a statement table)"
                )
                continue

            logger.info(
                f"Found statement table on page {item.get('page')} with header: {has_header_row}"
            )

            if has_header_row:
                if len(table_data) > 1 and reference_data_col_count is None:
                    reference_data_col_count = len(table_data[1])
                    logger.info(
                        f"Set reference column count: {reference_data_col_count}"
                    )

                for row in table_data[1:]:
                    if row and any(cell and str(cell).strip() for cell in row):
                        filtered_rows.append({"page": item["page"], "data": row})
            else:
                if reference_data_col_count is None:
                    logger.warning(
                        f"Data table on page {item.get('page')} found before header table"
                    )
                    if len(table_data) > 0 and len(table_data[0]) >= 3:
                        reference_data_col_count = len(table_data[0])

                for row in table_data:
                    if row and any(cell and str(cell).strip() for cell in row):
                        filtered_rows.append({"page": item.get("page", 1), "data": row})

        logger.info(f"Filtered to {len(filtered_rows)} data rows")

        if not filtered_rows:
            logger.warning("No valid statement data found")
            return Response(content="", media_type="text/csv")

        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_ALL)
        writer.writerow(statement_csv_header)

        for row_item in filtered_rows:

            row = [
                (
                    str(cell).encode("utf-8", "ignore").decode("utf-8")
                    if cell is not None
                    else ""
                )
                for cell in row_item["data"]
            ]

            if len(row) > expected_columns:
                row = row[:expected_columns]
            elif len(row) < expected_columns:
                row.extend([""] * (expected_columns - len(row)))

            writer.writerow(row)

        csv_content = output.getvalue()
        logger.info(f"Generated CSV with {len(filtered_rows)} rows")

        return Response(content=csv_content, media_type="text/csv")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"PDF extraction failed: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail=f"Failed to extract tables from PDF: {str(e)}"
        )
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
