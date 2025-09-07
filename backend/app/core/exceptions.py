"""
Custom exception hierarchy for API error handling.
Provides structured error handling with proper HTTP status codes.
"""

from typing import Optional, Dict, Any
from fastapi import HTTPException, status


class APIException(Exception):
    """Base exception class for all API-related errors."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.details = details or {}
        super().__init__(self.message)


class ValidationError(APIException):
    """Raised when request validation fails."""

    def __init__(
        self,
        message: str = "Request validation failed",
        field_errors: Optional[Dict[str, str]] = None,
        **kwargs
    ):
        details = {"field_errors": field_errors or {}}
        super().__init__(message, "VALIDATION_ERROR", details, **kwargs)


class EntityNotFoundError(APIException):
    """Raised when requested entity does not exist."""

    def __init__(
        self,
        message: str = "Entity not found",
        entity_ids: Optional[list] = None,
        **kwargs
    ):
        details = {"entity_ids": entity_ids or []}
        super().__init__(message, "ENTITY_NOT_FOUND", details, **kwargs)


class DatabaseError(APIException):
    """Raised when database operations fail."""

    def __init__(
        self,
        message: str = "Database operation failed",
        operation: Optional[str] = None,
        **kwargs
    ):
        details = {"operation": operation} if operation else {}
        super().__init__(message, "DATABASE_ERROR", details, **kwargs)


class AnalysisError(APIException):
    """Raised when analysis processing fails."""

    def __init__(
        self,
        message: str = "Analysis processing failed",
        analysis_type: Optional[str] = None,
        **kwargs
    ):
        details = {"analysis_type": analysis_type} if analysis_type else {}
        super().__init__(message, "ANALYSIS_ERROR", details, **kwargs)


class ServiceUnavailableError(APIException):
    """Raised when service is temporarily unavailable."""

    def __init__(
        self,
        message: str = "Service temporarily unavailable",
        service_name: Optional[str] = None,
        **kwargs
    ):
        details = {"service_name": service_name} if service_name else {}
        super().__init__(message, "SERVICE_UNAVAILABLE", details, **kwargs)


class RateLimitError(APIException):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
        **kwargs
    ):
        details = {"retry_after": retry_after} if retry_after else {}
        super().__init__(message, "RATE_LIMIT_EXCEEDED", details, **kwargs)


class AuthenticationError(APIException):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed", **kwargs):
        super().__init__(message, "AUTHENTICATION_ERROR", {}, **kwargs)


class AuthorizationError(APIException):
    """Raised when authorization fails."""

    def __init__(
        self,
        message: str = "Insufficient permissions",
        required_permissions: Optional[list] = None,
        **kwargs
    ):
        details = {"required_permissions": required_permissions or []}
        super().__init__(message, "AUTHORIZATION_ERROR", details, **kwargs)


def create_http_exception(exc: APIException) -> HTTPException:
    """Convert APIException to FastAPI HTTPException with appropriate status code."""

    status_code_mapping = {
        ValidationError: status.HTTP_422_UNPROCESSABLE_ENTITY,
        EntityNotFoundError: status.HTTP_404_NOT_FOUND,
        DatabaseError: status.HTTP_500_INTERNAL_SERVER_ERROR,
        AnalysisError: status.HTTP_500_INTERNAL_SERVER_ERROR,
        ServiceUnavailableError: status.HTTP_503_SERVICE_UNAVAILABLE,
        RateLimitError: status.HTTP_429_TOO_MANY_REQUESTS,
        AuthenticationError: status.HTTP_401_UNAUTHORIZED,
        AuthorizationError: status.HTTP_403_FORBIDDEN,
    }

    status_code = status_code_mapping.get(
        type(exc), status.HTTP_500_INTERNAL_SERVER_ERROR
    )

    if status_code >= 500:
        detail = {
            "success": False,
            "error_code": exc.error_code,
            "message": "Internal server error" if status_code == 500 else exc.message,
            "timestamp": None,
        }
    else:
        detail = {
            "success": False,
            "error_code": exc.error_code,
            "message": exc.message,
            "details": exc.details,
            "timestamp": None,
        }

    return HTTPException(status_code=status_code, detail=detail)


async def validation_exception_handler(request, exc: ValidationError):
    """Handle validation errors."""
    return create_http_exception(exc)


async def entity_not_found_exception_handler(request, exc: EntityNotFoundError):
    """Handle entity not found errors."""
    return create_http_exception(exc)


async def database_exception_handler(request, exc: DatabaseError):
    """Handle database errors."""
    return create_http_exception(exc)


async def analysis_exception_handler(request, exc: AnalysisError):
    """Handle analysis errors."""
    return create_http_exception(exc)


async def service_unavailable_exception_handler(request, exc: ServiceUnavailableError):
    """Handle service unavailable errors."""
    return create_http_exception(exc)


async def rate_limit_exception_handler(request, exc: RateLimitError):
    """Handle rate limit errors."""
    http_exc = create_http_exception(exc)

    if exc.details.get("retry_after"):
        http_exc.headers = {"Retry-After": str(exc.details["retry_after"])}
    return http_exc


async def authentication_exception_handler(request, exc: AuthenticationError):
    """Handle authentication errors."""
    return create_http_exception(exc)


async def authorization_exception_handler(request, exc: AuthorizationError):
    """Handle authorization errors."""
    return create_http_exception(exc)


async def generic_api_exception_handler(request, exc: APIException):
    """Handle generic API exceptions."""
    return create_http_exception(exc)


EXCEPTION_HANDLERS = {
    ValidationError: validation_exception_handler,
    EntityNotFoundError: entity_not_found_exception_handler,
    DatabaseError: database_exception_handler,
    AnalysisError: analysis_exception_handler,
    ServiceUnavailableError: service_unavailable_exception_handler,
    RateLimitError: rate_limit_exception_handler,
    AuthenticationError: authentication_exception_handler,
    AuthorizationError: authorization_exception_handler,
    APIException: generic_api_exception_handler,
}
