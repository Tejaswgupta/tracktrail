"""
Database connectivity and connection management for Supabase.
Provides connection pooling and database operations.
"""

import asyncio
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
from contextlib import asynccontextmanager

import pandas as pd
from supabase import create_client, Client
from postgrest.exceptions import APIError

from app.core.config import settings
from app.core.exceptions import DatabaseError, EntityNotFoundError


logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages Supabase database connections and operations."""
    
    def __init__(self):
        self._client: Optional[Client] = None
        self._connection_pool: Dict[str, Client] = {}
        self._pool_size = settings.database_pool_size
        self._max_overflow = settings.database_max_overflow
        self._timeout = settings.database_timeout
        self._active_connections = 0
        self._lock = asyncio.Lock()
    
    async def initialize(self) -> None:
        """Initialize the database connection pool."""
        try:
            # Create primary client
            self._client = create_client(
                settings.supabase_url,
                settings.supabase_key
            )
            
            # Test connection
            await self.health_check()
            
            # Initialize connection pool
            for i in range(self._pool_size):
                client = create_client(
                    settings.supabase_url,
                    settings.supabase_key
                )
                self._connection_pool[f"conn_{i}"] = client
            
            logger.info(f"Database connection pool initialized with {self._pool_size} connections")
            
        except Exception as e:
            logger.error(f"Failed to initialize database connection: {str(e)}")
            raise DatabaseError(f"Database initialization failed: {str(e)}")
    
    async def close(self) -> None:
        """Close all database connections."""
        async with self._lock:
            self._connection_pool.clear()
            self._client = None
            self._active_connections = 0
            logger.info("Database connections closed")
    
    @asynccontextmanager
    async def get_connection(self):
        """Get a database connection from the pool."""
        async with self._lock:
            if not self._client:
                raise DatabaseError("Database not initialized")
            
            # Try to get connection from pool
            if self._connection_pool:
                conn_id, client = self._connection_pool.popitem()
                self._active_connections += 1
            elif self._active_connections < self._pool_size + self._max_overflow:
                # Create new connection if under limit
                client = create_client(
                    settings.supabase_url,
                    settings.supabase_key
                )
                conn_id = f"overflow_{self._active_connections}"
                self._active_connections += 1
            else:
                raise DatabaseError("Connection pool exhausted")
        
        try:
            yield client
        finally:
            async with self._lock:
                self._active_connections -= 1
                # Return connection to pool if it's a regular pool connection
                if conn_id.startswith("conn_"):
                    self._connection_pool[conn_id] = client
    
    async def health_check(self) -> Dict[str, Any]:
        """Check database connectivity and return health status."""
        try:
            if not self._client:
                raise DatabaseError("Database not initialized")
            
            # Simple query to test connection
            result = self._client.table("entities").select("count", count="exact").limit(1).execute()
            
            return {
                "status": "healthy",
                "connection_pool_size": len(self._connection_pool),
                "active_connections": self._active_connections,
                "timestamp": datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Database health check failed: {str(e)}")
            return {
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
    
    async def get_entity_transactions(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None
    ) -> pd.DataFrame:
        """
        Fetch transactions for specified entities with optional date filtering.
        
        Args:
            entity_ids: List of entity IDs to fetch transactions for
            date_from: Optional start date filter
            date_to: Optional end date filter
            
        Returns:
            DataFrame containing transaction data with standardized column names
            
        Raises:
            DatabaseError: If database operation fails
            EntityNotFoundError: If entities don't exist
        """
        try:
            async with self.get_connection() as client:
                # Build query with proper joins and column selection
                query = client.table("transactions").select(
                    """
                    transaction_id,
                    entity_id,
                    account_id,
                    tx_date,
                    description,
                    amount,
                    direction,
                    counterparty_merged,
                    balance,
                    original_index,
                    entities!inner(entity_id, entity_name, entity_type),
                    accounts!inner(account_id, account_number, account_name, bank_name)
                    """
                ).in_("entity_id", entity_ids).order("tx_date").order("original_index")
                
                # Add date filters if provided
                if date_from:
                    query = query.gte("tx_date", date_from.date().isoformat())
                if date_to:
                    query = query.lte("tx_date", date_to.date().isoformat())
                
                # Execute query
                result = query.execute()
                
                if not result.data:
                    # Check if entities exist
                    entity_check = client.table("entities").select("entity_id").in_("entity_id", entity_ids).execute()
                    if not entity_check.data:
                        raise EntityNotFoundError(f"No entities found for IDs: {entity_ids}")
                    
                    # Entities exist but no transactions
                    return pd.DataFrame()
                
                # Convert to DataFrame and standardize column names
                df = pd.DataFrame(result.data)
                
                # Map database columns to expected analysis service columns
                df = self._standardize_transaction_columns(df)
                
                logger.info(f"Retrieved {len(df)} transactions for {len(entity_ids)} entities")
                
                return df
                
        except APIError as e:
            logger.error(f"Supabase API error: {str(e)}")
            raise DatabaseError(f"Database query failed: {str(e)}")
        except Exception as e:
            logger.error(f"Unexpected database error: {str(e)}")
            raise DatabaseError(f"Database operation failed: {str(e)}")
    
    def _standardize_transaction_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Standardize transaction DataFrame columns for analysis services.
        
        Args:
            df: Raw DataFrame from database
            
        Returns:
            DataFrame with standardized column names
        """
        try:
            # Create standardized columns expected by analysis services
            df['DATE'] = pd.to_datetime(df['tx_date'])
            df['DESCRIPTION'] = df['description'].fillna('')
            df['counterparty'] = df['counterparty_merged'].fillna('')
            
            # Create DEBIT and CREDIT columns based on direction and amount
            df['DEBIT'] = df.apply(
                lambda row: row['amount'] if row['direction'] == 'DR' else 0.0, 
                axis=1
            )
            df['CREDIT'] = df.apply(
                lambda row: row['amount'] if row['direction'] == 'CR' else 0.0, 
                axis=1
            )
            
            # Add additional useful columns
            df['transaction_id'] = df['transaction_id']
            df['entity_id'] = df['entity_id']
            df['account_id'] = df['account_id']
            df['balance'] = df['balance'].fillna(0.0)
            df['original_index'] = df['original_index'].fillna(0)
            
            # Extract entity and account information from nested objects
            if 'entities' in df.columns and not df['entities'].isna().all():
                df['entity_name'] = df['entities'].apply(
                    lambda x: x.get('entity_name', '') if isinstance(x, dict) else ''
                )
                df['entity_type'] = df['entities'].apply(
                    lambda x: x.get('entity_type', '') if isinstance(x, dict) else ''
                )
            else:
                df['entity_name'] = ''
                df['entity_type'] = ''
            
            if 'accounts' in df.columns and not df['accounts'].isna().all():
                df['account_number'] = df['accounts'].apply(
                    lambda x: x.get('account_number', '') if isinstance(x, dict) else ''
                )
                df['account_name'] = df['accounts'].apply(
                    lambda x: x.get('account_name', '') if isinstance(x, dict) else ''
                )
                df['bank_name'] = df['accounts'].apply(
                    lambda x: x.get('bank_name', '') if isinstance(x, dict) else ''
                )
            else:
                df['account_number'] = ''
                df['account_name'] = ''
                df['bank_name'] = ''
            
            return df
            
        except Exception as e:
            logger.error(f"Column standardization failed: {str(e)}")
            # Return original DataFrame if standardization fails
            return df
    
    async def validate_entity_exists(self, entity_id: str) -> bool:
        """
        Check if an entity exists in the database.
        
        Args:
            entity_id: Entity ID to validate
            
        Returns:
            True if entity exists, False otherwise
            
        Raises:
            DatabaseError: If database operation fails
        """
        try:
            async with self.get_connection() as client:
                result = client.table("entities").select("id").eq("id", entity_id).limit(1).execute()
                return len(result.data) > 0
                
        except APIError as e:
            logger.error(f"Entity validation failed: {str(e)}")
            raise DatabaseError(f"Entity validation failed: {str(e)}")
    
    async def get_entity_metadata(self, entity_ids: List[str]) -> Dict[str, Any]:
        """
        Get metadata for specified entities.
        
        Args:
            entity_ids: List of entity IDs
            
        Returns:
            Dictionary containing entity metadata
            
        Raises:
            DatabaseError: If database operation fails
        """
        try:
            async with self.get_connection() as client:
                result = client.table("entities").select("*").in_("id", entity_ids).execute()
                
                entities = {entity["id"]: entity for entity in result.data}
                
                return {
                    "entities": entities,
                    "total_count": len(entities),
                    "requested_count": len(entity_ids),
                    "missing_entities": [eid for eid in entity_ids if eid not in entities]
                }
                
        except APIError as e:
            logger.error(f"Entity metadata retrieval failed: {str(e)}")
            raise DatabaseError(f"Entity metadata retrieval failed: {str(e)}")


# Global database manager instance
db_manager = DatabaseManager()


async def get_database() -> DatabaseManager:
    """Dependency to get database manager instance."""
    return db_manager


async def init_database() -> None:
    """Initialize database connection on startup."""
    await db_manager.initialize()


async def close_database() -> None:
    """Close database connections on shutdown."""
    await db_manager.close()