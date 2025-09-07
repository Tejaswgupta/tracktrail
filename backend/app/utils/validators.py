"""
Custom validators for the FastAPI financial analysis service.

This module contains validation functions for entity IDs, dates, and other
common data types used across the API.
"""

import re
import uuid
from datetime import datetime, timedelta, timezone
from time import timezone
from typing import Any, Optional

from pydantic import ValidationError


def validate_entity_id(entity_id: str) -> str:
    """
    Validate entity ID format.

    Entity IDs should be valid UUID v4 format.

    Args:
        entity_id: The entity ID to validate

    Returns:
        str: The validated entity ID

    Raises:
        ValueError: If the entity ID format is invalid
    """
    if not isinstance(entity_id, str):
        raise ValueError("Entity ID must be a string")

    entity_id = entity_id.strip()

    if not entity_id:
        raise ValueError("Entity ID cannot be empty")

    try:

        uuid_obj = uuid.UUID(entity_id)

        if uuid_obj.version != 4:
            raise ValueError("Entity ID must be a valid UUID v4")

        return str(uuid_obj)

    except ValueError as e:
        if "badly formed hexadecimal UUID string" in str(e):
            raise ValueError(
                "Entity ID must be a valid UUID format (e.g., 550e8400-e29b-41d4-a716-446655440000)"
            )
        raise ValueError(f"Invalid entity ID format: {str(e)}")


def validate_iso_datetime(date_string: str) -> datetime:
    """
    Validate and parse ISO format datetime string.

    Args:
        date_string: ISO format datetime string

    Returns:
        datetime: Parsed datetime object

    Raises:
        ValueError: If the datetime format is invalid
    """
    if not isinstance(date_string, str):
        raise ValueError("Date must be a string")

    date_string = date_string.strip()

    if not date_string:
        raise ValueError("Date string cannot be empty")

    iso_formats = [
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
        "%Y-%m-%d",
    ]

    for fmt in iso_formats:
        try:
            parsed_date = datetime.strptime(date_string, fmt)

            if parsed_date.tzinfo is None:
                parsed_date = parsed_date.replace(tzinfo=None)

            return parsed_date

        except ValueError:
            continue

    raise ValueError(
        f"Invalid datetime format: {date_string}. "
        "Expected ISO format like '2024-01-15T10:30:00Z' or '2024-01-15'"
    )


def validate_amount(amount: Any) -> float:
    """
    Validate monetary amount.

    Args:
        amount: Amount to validate

    Returns:
        float: Validated amount

    Raises:
        ValueError: If the amount is invalid
    """
    try:
        amount_float = float(amount)
    except (ValueError, TypeError):
        raise ValueError("Amount must be a valid number")

    if amount_float < 0:
        raise ValueError("Amount cannot be negative")

    if amount_float > 1_000_000_000_000:
        raise ValueError("Amount exceeds maximum allowed value")

    if round(amount_float, 2) != amount_float:
        raise ValueError("Amount cannot have more than 2 decimal places")

    return amount_float


def validate_percentage(percentage: Any) -> float:
    """
    Validate percentage value (0-100).

    Args:
        percentage: Percentage to validate

    Returns:
        float: Validated percentage

    Raises:
        ValueError: If the percentage is invalid
    """
    try:
        percentage_float = float(percentage)
    except (ValueError, TypeError):
        raise ValueError("Percentage must be a valid number")

    if percentage_float < 0 or percentage_float > 100:
        raise ValueError("Percentage must be between 0 and 100")

    return percentage_float


def validate_risk_score(score: Any) -> float:
    """
    Validate risk score (0.0-1.0).

    Args:
        score: Risk score to validate

    Returns:
        float: Validated risk score

    Raises:
        ValueError: If the risk score is invalid
    """
    try:
        score_float = float(score)
    except (ValueError, TypeError):
        raise ValueError("Risk score must be a valid number")

    if score_float < 0.0 or score_float > 1.0:
        raise ValueError("Risk score must be between 0.0 and 1.0")

    return score_float


def validate_entity_id_list(entity_ids: list) -> list:
    """
    Validate a list of entity IDs.

    Args:
        entity_ids: List of entity IDs to validate

    Returns:
        list: List of validated entity IDs

    Raises:
        ValueError: If any entity ID is invalid
    """
    if not isinstance(entity_ids, list):
        raise ValueError("Entity IDs must be provided as a list")

    if not entity_ids:
        raise ValueError("At least one entity ID must be provided")

    if len(entity_ids) > 50:
        raise ValueError("Cannot process more than 50 entities at once")

    validated_ids = []
    for i, entity_id in enumerate(entity_ids):
        try:
            validated_id = validate_entity_id(entity_id)
            validated_ids.append(validated_id)
        except ValueError as e:
            raise ValueError(f"Invalid entity ID at position {i}: {str(e)}")

    if len(set(validated_ids)) != len(validated_ids):
        raise ValueError("Duplicate entity IDs are not allowed")

    return validated_ids


def validate_time_window(hours: Any) -> int:
    """
    Validate time window in hours.

    Args:
        hours: Time window in hours

    Returns:
        int: Validated time window

    Raises:
        ValueError: If the time window is invalid
    """
    try:
        hours_int = int(hours)
    except (ValueError, TypeError):
        raise ValueError("Time window must be a valid integer")

    if hours_int < 1:
        raise ValueError("Time window must be at least 1 hour")

    if hours_int > 8760:
        raise ValueError("Time window cannot exceed 1 year (8760 hours)")

    return hours_int


def sanitize_string_input(input_string: str, max_length: int = 255) -> str:
    """
    Sanitize string input by removing potentially harmful characters.

    Args:
        input_string: String to sanitize
        max_length: Maximum allowed length

    Returns:
        str: Sanitized string

    Raises:
        ValueError: If the string is invalid
    """
    if not isinstance(input_string, str):
        raise ValueError("Input must be a string")

    sanitized = input_string.strip()

    if not sanitized:
        raise ValueError("String cannot be empty after trimming")

    if len(sanitized) > max_length:
        raise ValueError(f"String length cannot exceed {max_length} characters")

    harmful_patterns = [
        r"[<>\"'%;()&+]",
        r"(script|javascript|vbscript)",
        r"(union|select|insert|update|delete|drop|create|alter)",
    ]

    for pattern in harmful_patterns:
        if re.search(pattern, sanitized, re.IGNORECASE):
            raise ValueError("String contains potentially harmful characters")

    return sanitized
