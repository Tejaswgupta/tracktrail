/**
 * AML Backend API Client Service
 *
 * This service provides a client interface for all backend AML analysis endpoints.
 * It handles authentication, error handling, retry logic, and data transformation.
 */

import type {
  AIResponse,
  AMLError,
  AMLErrorCode,
  BackendAnalysisRequest,
  BackendAnalysisResponse,
  BackendErrorResponse,
  CashFlowRequest,
  CashFlowResult,
  CounterpartyTrendsRequest,
  CounterpartyTrendsResult,
  CycleDetectionRequest,
  CycleDetectionResult,
  MuleAccountRequest,
  MuleAccountResult,
  RapidMovementRequest,
  RapidMovementResult,
  TimeTrendsRequest,
  TimeTrendsResult,
  TransferPatternRequest,
  TransferPatternResult,
} from "@/types/amlBackend";

// Configuration for the API client
interface AMLBackendClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  authToken?: string;
}

// Default configuration
const DEFAULT_CONFIG: AMLBackendClientConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  timeout: 30000, // 30 seconds
  maxRetries: 3,
  retryDelay: 1000, // 1 second
};

// Error messages mapping
const ERROR_MESSAGES: Record<AMLErrorCode, string> = {
  VALIDATION_ERROR: "Please check your input parameters and try again.",
  ENTITY_NOT_FOUND: "The selected entity could not be found.",
  DATABASE_ERROR: "Database temporarily unavailable. Please try again later.",
  ANALYSIS_ERROR: "Analysis failed. Please check your data and try again.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
};

/**
 * Custom error class for AML API errors
 */
class AMLBackendError extends Error implements AMLError {
  public code: AMLErrorCode;
  public details?: Record<string, any>;

  constructor(
    code: AMLErrorCode,
    message?: string,
    details?: Record<string, any>
  ) {
    super(message || ERROR_MESSAGES[code]);
    this.name = "AMLBackendError";
    this.code = code;
    this.details = details;
  }
}

/**
 * AML Backend API Client
 */
export class AMLBackendClient {
  private config: AMLBackendClientConfig;

  constructor(config?: Partial<AMLBackendClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    data: any,
    options: RequestInit = {}
  ): Promise<BackendAnalysisResponse<T>> {
    const url = `${this.config.baseUrl}${endpoint}`;

    const requestOptions: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.authToken && {
          Authorization: `Bearer ${this.config.authToken}`,
        }),
        ...options.headers,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(this.config.timeout),
      ...options,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(url, requestOptions);

        if (!response.ok) {
          const errorData: BackendErrorResponse = await response.json();
          throw new AMLBackendError(
            errorData.error_code as AMLErrorCode,
            errorData.message,
            errorData.details
          );
        }

        const result: BackendAnalysisResponse<T> = await response.json();
        return result;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on validation errors or client errors
        if (
          error instanceof AMLBackendError &&
          (error.code === "VALIDATION_ERROR" ||
            error.code === "ENTITY_NOT_FOUND")
        ) {
          throw error;
        }

        // Don't retry on the last attempt
        if (attempt === this.config.maxRetries) {
          break;
        }

        // Wait before retrying with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // If we get here, all retries failed
    if (lastError instanceof AMLBackendError) {
      throw lastError;
    }

    // Handle network or other errors
    throw new AMLBackendError(
      "INTERNAL_ERROR",
      `Request failed after ${this.config.maxRetries + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`,
      { originalError: lastError?.message || "Unknown error" }
    );
  }

  async analyzeAIllm(params: BackendAnalysisRequest): Promise<BackendAnalysisResponse<AIResponse>> {
    return this.makeRequest<AIResponse>(
      "/api/v1/analyze/ai-llm",
      params
    );
  }

  /**
   * Analyze cash flow patterns for specified entities
   */
  async analyzeCashFlow(
    params: CashFlowRequest
  ): Promise<BackendAnalysisResponse<CashFlowResult>> {
    return this.makeRequest<CashFlowResult>(
      "/api/v1/analyze/cash-flow",
      params
    );
  }

  /**
   * Analyze counterparty trends for specified entities
   */
  async analyzeCounterpartyTrends(
    params: CounterpartyTrendsRequest
  ): Promise<BackendAnalysisResponse<CounterpartyTrendsResult>> {
    return this.makeRequest<CounterpartyTrendsResult>(
      "/api/v1/analyze/counterparty-trends",
      params
    );
  }

  /**
   * Detect mule accounts for specified entities
   */
  async analyzeMuleAccounts(
    params: MuleAccountRequest
  ): Promise<BackendAnalysisResponse<MuleAccountResult>> {
    return this.makeRequest<MuleAccountResult>(
      "/api/v1/analyze/mule-accounts",
      params
    );
  }

  /**
   * Detect cycles and round trips for specified entities
   * - Single entity: Round trip detection
   * - Multiple entities: Network cycle detection
   */
  async analyzeCycles(
    params: CycleDetectionRequest
  ): Promise<BackendAnalysisResponse<CycleDetectionResult>> {
    return this.makeRequest<CycleDetectionResult>(
      "/api/v1/analyze/cycles",
      params
    );
  }

  /**
   * Analyze rapid movements for specified entities
   */
  async analyzeRapidMovements(
    params: RapidMovementRequest
  ): Promise<BackendAnalysisResponse<RapidMovementResult>> {
    return this.makeRequest<RapidMovementResult>(
      "/api/v1/analyze/rapid-movements",
      params
    );
  }

  /**
   * Analyze time trends for specified entities
   */
  async analyzeTimeTrends(
    params: TimeTrendsRequest
  ): Promise<BackendAnalysisResponse<TimeTrendsResult>> {
    return this.makeRequest<TimeTrendsResult>(
      "/api/v1/analyze/time-trends",
      params
    );
  }

  /**
   * Analyze transfer patterns for specified entities
   */
  async analyzeTransferPatterns(
    params: TransferPatternRequest
  ): Promise<BackendAnalysisResponse<TransferPatternResult>> {
    return this.makeRequest<TransferPatternResult>(
      "/api/v1/analyze/transfer-patterns",
      params
    );
  }

  /**
   * Update authentication token
   */
  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AMLBackendClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AMLBackendClientConfig {
    return { ...this.config };
  }

  /**
   * Health check for the backend service
   */
  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await fetch(`${this.config.baseUrl}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(5000), // 5 second timeout for health check
      });

      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      throw new AMLBackendError(
        "INTERNAL_ERROR",
        "Backend service is not available",
        { originalError: (error as Error).message }
      );
    }
  }
}

// Export a default instance
export const amlBackendClient = new AMLBackendClient();

// Export the error class and types
export { AMLBackendError };
export type { AMLBackendClientConfig };

