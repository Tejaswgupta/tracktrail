"""
Service layer for managing workspace regex patterns.
"""

import logging
from typing import List, Dict, Any, Optional

from postgrest.exceptions import APIError

from app.core.database import db_manager
from app.core.exceptions import DatabaseError

logger = logging.getLogger(__name__)


class RegexService:
    """Handles database operations for workspace regex patterns."""

    def __init__(self) -> None:
        self._db_manager = db_manager

    async def list_patterns(
        self, workspace_id: str, active_only: bool = True
    ) -> List[Dict[str, Any]]:
        """Return list of regex entries for a workspace."""
        if not workspace_id:
            raise DatabaseError("Workspace ID is required", operation="list_regex")

        try:
            async with self._db_manager.get_connection() as client:
                query = (
                    client.table("workspace_regex_patterns")
                    .select("*")
                    .eq("workspace_id", workspace_id)
                    .order("created_at", desc=True)
                )
                if active_only:
                    query = query.eq("is_active", True)

                result = query.execute()
                return result.data or []
        except APIError as e:
            logger.error("Failed to list workspace regex patterns: %s", e)
            raise DatabaseError(
                "Unable to fetch regex patterns",
                operation="list_regex",
            )
        except Exception as exc:
            logger.error("Unexpected error listing regex patterns: %s", exc)
            raise DatabaseError(
                "Unable to fetch regex patterns",
                operation="list_regex",
            )

    async def create_pattern(
        self,
        workspace_id: str,
        name: str,
        patterns: List[str],
        description: Optional[str] = None,
        source_csv: Optional[str] = None,
        created_by: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Insert a new regex entry for the workspace."""
        if not workspace_id or not name or not patterns:
            raise DatabaseError(
                "workspace_id, name, and patterns are required",
                operation="create_regex",
            )

        payload = {
            "workspace_id": workspace_id,
            "name": name,
            "description": description,
            "source_csv": source_csv,
            "patterns": patterns,
            "created_by": created_by,
            "is_active": True,
        }

        try:
            async with self._db_manager.get_connection() as client:
                result = (
                    client.table("workspace_regex_patterns")
                    .insert(payload)
                    .select("*")
                    .single()
                    .execute()
                )
                if not result.data:
                    raise DatabaseError(
                        "Regex insert returned no data",
                        operation="create_regex",
                    )
                return result.data
        except APIError as e:
            logger.error("Failed to save regex pattern: %s", e)
            raise DatabaseError(
                "Unable to persist regex pattern",
                operation="create_regex",
            )
        except Exception as exc:
            logger.error("Unexpected error creating regex pattern: %s", exc)
            raise DatabaseError(
                "Unable to persist regex pattern",
                operation="create_regex",
            )


regex_service = RegexService()


async def get_regex_service() -> RegexService:
    return regex_service
