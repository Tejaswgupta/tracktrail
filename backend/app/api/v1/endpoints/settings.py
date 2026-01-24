"""
Settings endpoints for workspace-specific admin tooling.
"""

import io
import json
import logging
from pathlib import Path
from typing import Optional

import polars as pl
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.core.exceptions import DatabaseError, ValidationError
from app.models.requests import RegexCreateRequest
from app.models.responses import (
    RegexEntry,
    RegexGenerateResponse,
    RegexListResponse,
)
from app.services.regex_service import RegexService, get_regex_service

from regex_generator import generate_regex_with_iterative_agent

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/settings",
    tags=["Settings"],
    responses={
        400: {"description": "Bad request"},
        403: {"description": "Forbidden"},
        500: {"description": "Internal server error"},
    },
)

@router.get(
    "/bank-header-mappings",
    summary="Return supported bank header mappings for statement ingestion",
)
async def list_bank_header_mappings() -> dict:
    mapping_path = (
        Path(__file__).resolve().parents[4] / "bank_header_mappings.json"
    )
    if not mapping_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Bank header mappings file not found.",
        )

    try:
        with mapping_path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except json.JSONDecodeError as exc:
        logger.error("Failed to parse bank header mappings: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Bank header mappings are invalid.",
        )


@router.post(
    "/regex/generate",
    response_model=RegexGenerateResponse,
    summary="Generate regex patterns from a workspace CSV",
)
async def generate_regex_from_csv(
    workspace_id: str = Form(...),
    regex_name: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    description_column: str = Form("description"),
    csv_file: UploadFile = File(...),
) -> RegexGenerateResponse:
    """
    Accepts a CSV file containing transaction descriptions, runs the
    regex_generator tool, and returns pattern candidates in JSON form.
    """
    if csv_file.content_type not in {"text/csv", "application/vnd.ms-excel"}:
        logger.debug("CSV file content type: %s", csv_file.content_type)

    try:
        payload = await csv_file.read()
        df = pl.read_csv(io.BytesIO(payload))
    except Exception as exc:
        logger.error("Failed to read CSV (%s): %s", csv_file.filename, exc)
        raise HTTPException(
            status_code=400,
            detail="Unable to parse uploaded CSV. Please ensure the file is valid and has headers.",
        )

    if description_column not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Column '{description_column}' not found in CSV headers.",
        )

    patterns = generate_regex_with_iterative_agent(df, description_column)
    if not patterns:
        raise HTTPException(
            status_code=500,
            detail="Regex generation did not return any patterns. Please try again with different data.",
        )

    return RegexGenerateResponse(
        workspace_id=workspace_id,
        name=regex_name,
        description=description,
        patterns=patterns,
    )


@router.get(
    "/regex",
    response_model=RegexListResponse,
    summary="List saved regex configurations for a workspace",
)
async def list_workspace_regex(
    workspace_id: str,
    regex_service: RegexService = Depends(get_regex_service),
) -> RegexListResponse:
    try:
        entries = await regex_service.list_patterns(workspace_id)
        return RegexListResponse(workspace_id=workspace_id, entries=entries)
    except DatabaseError as exc:
        logger.error("Error listing regex entries for %s: %s", workspace_id, exc)
        raise HTTPException(status_code=500, detail="Unable to load regex configurations.")


@router.post(
    "/regex",
    response_model=RegexEntry,
    summary="Persist a generated regex collection for the workspace",
)
async def save_regex_configuration(
    payload: RegexCreateRequest,
    regex_service: RegexService = Depends(get_regex_service),
) -> RegexEntry:
    try:
        entry = await regex_service.create_pattern(
            workspace_id=payload.workspace_id,
            name=payload.name,
            patterns=payload.patterns,
            description=payload.description,
            source_csv=payload.source_csv,
            created_by=payload.created_by,
        )
        return entry
    except (DatabaseError, ValidationError) as exc:
        logger.error("Error saving regex entry: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Unable to persist regex configuration. Please try again.",
        )
