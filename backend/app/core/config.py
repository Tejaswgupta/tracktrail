"""
Configuration management for FastAPI application.
Handles environment-based configuration without pydantic.
"""

import os
from typing import List
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings with environment variable support."""

    def __init__(self):

        self.app_name = os.getenv("APP_NAME", "Financial Analysis API")
        self.app_version = os.getenv("APP_VERSION", "1.0.0")
        self.debug = os.getenv("DEBUG", "false").lower() == "true"

        self.api_v1_prefix = os.getenv("API_V1_PREFIX", "/api/v1")

        self.supabase_url = os.getenv(
            "SUPABASE_URL", "https://bouniuqsbzluhnqrgses.supabase.co"
        )
        self.supabase_key = os.getenv(
            "SUPABASE_ANON_KEY",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvdW5pdXFzYnpsdWhucXJnc2VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MDM5MDEsImV4cCI6MjA3MDk3OTkwMX0.UM0a1ibnB-3CWmSqMaIhLypa3vlB7smp6ts0xhWGtMY",
        )
        self.database_pool_size = int(os.getenv("DATABASE_POOL_SIZE", "10"))
        self.database_max_overflow = int(os.getenv("DATABASE_MAX_OVERFLOW", "20"))
        self.database_timeout = int(os.getenv("DATABASE_TIMEOUT", "30"))

        cors_origins_str = os.getenv("CORS_ORIGINS", "*")
        self.cors_origins = self._parse_cors_origins(cors_origins_str)
        self.max_request_size = int(os.getenv("MAX_REQUEST_SIZE", "10485760"))

        self.max_entities_per_request = int(os.getenv("MAX_ENTITIES_PER_REQUEST", "50"))
        self.max_date_range_days = int(os.getenv("MAX_DATE_RANGE_DAYS", "365"))

        self.enable_metrics = os.getenv("ENABLE_METRICS", "true").lower() == "true"
        self.log_level = self._validate_log_level(os.getenv("LOG_LEVEL", "INFO"))

        self._validate_positive_ints()

    def _parse_cors_origins(self, origins_str: str) -> List[str]:
        """Parse CORS origins from string."""
        if origins_str == "*":
            return ["*"]
        return [origin.strip() for origin in origins_str.split(",")]

    def _validate_log_level(self, level: str) -> str:
        """Validate log level."""
        valid_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        level_upper = level.upper()
        if level_upper not in valid_levels:
            raise ValueError(f"Log level must be one of: {valid_levels}")
        return level_upper

    def _validate_positive_ints(self):
        """Validate positive integer values."""
        positive_int_fields = [
            ("database_pool_size", self.database_pool_size),
            ("database_max_overflow", self.database_max_overflow),
            ("database_timeout", self.database_timeout),
            ("max_request_size", self.max_request_size),
            ("max_entities_per_request", self.max_entities_per_request),
            ("max_date_range_days", self.max_date_range_days),
        ]

        for field_name, value in positive_int_fields:
            if value <= 0:
                raise ValueError(f"{field_name} must be positive, got: {value}")


settings = Settings()
