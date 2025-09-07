"""
Database service layer for financial analysis API.
Provides high-level database operations for entity transactions and metadata.
"""

import logging
from typing import List, Optional, Dict, Any
from datetime import datetime

import pandas as pd
import polars as pl

from app.core.database import db_manager
from app.core.exceptions import DatabaseError, EntityNotFoundError, ValidationError

logger = logging.getLogger(__name__)


class DatabaseService:
    """
    High-level database service for entity and transaction operations.

    This service provides a clean interface for database operations required
    by the analysis endpoints, with proper error handling and data validation.
    """

    def __init__(self):
        self.db_manager = db_manager

    async def get_entity_transactions(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        convert_to_polars: bool = True,
    ) -> pl.DataFrame | pd.DataFrame:
        """
        Fetch transactions for specified entities with optional date filtering.

        Args:
            entity_ids: List of entity IDs to fetch transactions for
            date_from: Optional start date filter
            date_to: Optional end date filter
            convert_to_polars: Whether to convert result to Polars DataFrame

        Returns:
            DataFrame containing transaction data (Polars or Pandas)

        Raises:
            ValidationError: If input parameters are invalid
            EntityNotFoundError: If entities don't exist
            DatabaseError: If database operation fails
        """
        try:

            if not entity_ids:
                raise ValidationError("Entity IDs list cannot be empty")

            if len(entity_ids) > 50:
                raise ValidationError("Maximum 50 entities allowed per request")

            if date_from and date_to and date_from > date_to:
                raise ValidationError("Start date cannot be after end date")

            for entity_id in entity_ids:
                if not isinstance(entity_id, str) or len(entity_id.strip()) == 0:
                    raise ValidationError(f"Invalid entity ID format: {entity_id}")

            logger.info(f"Fetching transactions for {len(entity_ids)} entities")

            df = await self.db_manager.get_entity_transactions(
                entity_ids=entity_ids, date_from=date_from, date_to=date_to
            )

            if convert_to_polars and not df.empty:
                df = pl.from_pandas(df)
            elif convert_to_polars and df.empty:

                df = pl.DataFrame()

            logger.info(
                f"Successfully retrieved {len(df) if hasattr(df, '__len__') else 0} transactions"
            )
            return df

        except (ValidationError, EntityNotFoundError) as e:

            raise
        except Exception as e:
            logger.error(f"Failed to fetch entity transactions: {str(e)}")
            raise DatabaseError(f"Failed to fetch transactions: {str(e)}")

    async def validate_entity_exists(self, entity_id: str) -> bool:
        """
        Check if an entity exists in the database.

        Args:
            entity_id: Entity ID to validate

        Returns:
            True if entity exists, False otherwise

        Raises:
            ValidationError: If entity ID format is invalid
            DatabaseError: If database operation fails
        """
        try:

            if not isinstance(entity_id, str) or len(entity_id.strip()) == 0:
                raise ValidationError(f"Invalid entity ID format: {entity_id}")

            return await self.db_manager.validate_entity_exists(entity_id)

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Entity validation failed for {entity_id}: {str(e)}")
            raise DatabaseError(f"Entity validation failed: {str(e)}")

    async def validate_entities_exist(self, entity_ids: List[str]) -> Dict[str, bool]:
        """
        Validate multiple entities exist in the database.

        Args:
            entity_ids: List of entity IDs to validate

        Returns:
            Dictionary mapping entity IDs to existence status

        Raises:
            ValidationError: If input parameters are invalid
            DatabaseError: If database operation fails
        """
        try:
            if not entity_ids:
                raise ValidationError("Entity IDs list cannot be empty")

            results = {}
            for entity_id in entity_ids:
                results[entity_id] = await self.validate_entity_exists(entity_id)

            return results

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Batch entity validation failed: {str(e)}")
            raise DatabaseError(f"Batch entity validation failed: {str(e)}")

    async def get_entity_metadata(self, entity_ids: List[str]) -> Dict[str, Any]:
        """
        Get metadata for specified entities.

        Args:
            entity_ids: List of entity IDs

        Returns:
            Dictionary containing entity metadata with additional validation info

        Raises:
            ValidationError: If input parameters are invalid
            DatabaseError: If database operation fails
        """
        try:

            if not entity_ids:
                raise ValidationError("Entity IDs list cannot be empty")

            if len(entity_ids) > 50:
                raise ValidationError("Maximum 50 entities allowed per request")

            for entity_id in entity_ids:
                if not isinstance(entity_id, str) or len(entity_id.strip()) == 0:
                    raise ValidationError(f"Invalid entity ID format: {entity_id}")

            logger.info(f"Fetching metadata for {len(entity_ids)} entities")

            metadata = await self.db_manager.get_entity_metadata(entity_ids)

            missing_entities = metadata.get("missing_entities", [])
            if missing_entities:
                logger.warning(f"Missing entities found: {missing_entities}")

            metadata.update(
                {
                    "validation_status": {
                        "all_entities_found": len(missing_entities) == 0,
                        "found_count": metadata.get("total_count", 0),
                        "missing_count": len(missing_entities),
                        "success_rate": (
                            metadata.get("total_count", 0) / len(entity_ids)
                        )
                        * 100,
                    },
                    "timestamp": datetime.utcnow().isoformat(),
                }
            )

            return metadata

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Failed to fetch entity metadata: {str(e)}")
            raise DatabaseError(f"Failed to fetch entity metadata: {str(e)}")

    async def get_transaction_count(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
    ) -> Dict[str, int]:
        """
        Get transaction count for entities without fetching full data.

        Args:
            entity_ids: List of entity IDs
            date_from: Optional start date filter
            date_to: Optional end date filter

        Returns:
            Dictionary mapping entity IDs to transaction counts

        Raises:
            ValidationError: If input parameters are invalid
            DatabaseError: If database operation fails
        """
        try:

            if not entity_ids:
                raise ValidationError("Entity IDs list cannot be empty")

            df = await self.get_entity_transactions(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return {entity_id: 0 for entity_id in entity_ids}

            if "entity_id" in df.columns:
                counts = df.groupby("entity_id").size().to_dict()
            else:

                total_count = len(df)
                counts = {
                    entity_id: total_count // len(entity_ids)
                    for entity_id in entity_ids
                }

            for entity_id in entity_ids:
                if entity_id not in counts:
                    counts[entity_id] = 0

            return counts

        except ValidationError:
            raise
        except Exception as e:
            logger.error(f"Failed to get transaction counts: {str(e)}")
            raise DatabaseError(f"Failed to get transaction counts: {str(e)}")

    async def health_check(self) -> Dict[str, Any]:
        """
        Perform database health check.

        Returns:
            Dictionary containing health status information

        Raises:
            DatabaseError: If health check fails
        """
        try:
            health_status = await self.db_manager.health_check()

            health_status.update(
                {
                    "service_name": "database_service",
                    "service_version": "1.0.0",
                    "capabilities": [
                        "entity_transactions",
                        "entity_validation",
                        "entity_metadata",
                        "transaction_counts",
                    ],
                }
            )

            return health_status

        except Exception as e:
            logger.error(f"Database health check failed: {str(e)}")
            raise DatabaseError(f"Database health check failed: {str(e)}")


database_service = DatabaseService()


async def get_database_service() -> DatabaseService:
    """
    Dependency injection function for FastAPI.

    Returns:
        DatabaseService instance
    """
    return database_service
