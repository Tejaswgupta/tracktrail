/**
 * AML Backend API Client Service
 *
 * This service provides a consolidated client interface for all backend AML analysis endpoints.
 * It uses axios for HTTP requests with retry logic, error handling, and data transformation.
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
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
  timeout: 180000, // 3 minutes (matches your backend timeout requirements)
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
 * AML Backend API Client (Consolidated)
 */
export class AMLBackendClient {
  private config: AMLBackendClientConfig;
  private axiosInstance: AxiosInstance;

  constructor(config?: Partial<AMLBackendClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Create axios instance with configuration
    this.axiosInstance = axios.create({
      baseURL: `${this.config.baseUrl}/api/v1`,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Setup axios interceptors for logging and auth
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // Add authentication if available
        if (this.config.authToken) {
          config.headers.Authorization = `Bearer ${this.config.authToken}`;
        }
        
        console.log('AML API Request:', config.method?.toUpperCase(), config.url);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.axiosInstance.interceptors.response.use(
      (response) => {
        console.log('AML API Response:', response.status, response.config.url);
        return response;
      },
      (error) => {
        console.error('AML API Error:', error.response?.status, error.response?.data);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Make HTTP request with retry logic and error handling
   */
  private async makeRequest<T>(
    endpoint: string,
    data: any
  ): Promise<BackendAnalysisResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await this.axiosInstance.post<BackendAnalysisResponse<T>>(endpoint, data);
        return response.data;
      } catch (error) {
        lastError = error as Error;

        // Handle axios errors
        if (axios.isAxiosError(error)) {
          if (error.response) {
            const errorData: BackendErrorResponse = error.response.data;
            throw new AMLBackendError(
              errorData.error_code as AMLErrorCode,
              errorData.message,
              errorData.details
            );
          }
        }

        // Don't retry on validation errors or client errors
        if (
          error instanceof AMLBackendError &&
          (error.code === "VALIDATION_ERROR" || error.code === "ENTITY_NOT_FOUND")
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

  // API Methods

  async analyzeAIllm(params: BackendAnalysisRequest): Promise<BackendAnalysisResponse<AIResponse>> {
    return this.makeRequest<AIResponse>("/analyze/ai-llm", params);
  }

  async analyzeCashFlow(params: CashFlowRequest): Promise<BackendAnalysisResponse<CashFlowResult>> {
    return this.makeRequest<CashFlowResult>("/analyze/cash-flow", params);
  }

  async analyzeCounterpartyTrends(params: CounterpartyTrendsRequest): Promise<BackendAnalysisResponse<CounterpartyTrendsResult>> {
    return this.makeRequest<CounterpartyTrendsResult>("/analyze/counterparty-trends", params);
  }

  async analyzeMuleAccounts(params: MuleAccountRequest): Promise<BackendAnalysisResponse<MuleAccountResult>> {
    return this.makeRequest<MuleAccountResult>("/analyze/mule-accounts", params);
  }

  /**
   * Detect cycles and round trips for specified entities
   * - Single entity: Round trip detection
   * - Multiple entities: Network cycle detection
   */
  async analyzeCycles(params: CycleDetectionRequest): Promise<BackendAnalysisResponse<CycleDetectionResult>> {
    return this.makeRequest<CycleDetectionResult>("/analyze/cycles", params);
  }

  async analyzeRapidMovements(params: RapidMovementRequest): Promise<BackendAnalysisResponse<RapidMovementResult>> {
    return this.makeRequest<RapidMovementResult>("/analyze/rapid-movements", params);
  }

  async analyzeTimeTrends(params: TimeTrendsRequest): Promise<BackendAnalysisResponse<TimeTrendsResult>> {
    return this.makeRequest<TimeTrendsResult>("/analyze/time-trends", params);
  }

  async analyzeTransferPatterns(params: TransferPatternRequest): Promise<BackendAnalysisResponse<TransferPatternResult>> {
    return this.makeRequest<TransferPatternResult>("/analyze/transfer-patterns", params);
  }

  // Configuration and utility methods

  setAuthToken(token: string): void {
    this.config.authToken = token;
  }

  updateConfig(config: Partial<AMLBackendClientConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): AMLBackendClientConfig {
    return { ...this.config };
  }

  async healthCheck(): Promise<{ status: string; timestamp: string }> {
    try {
      const response = await this.axiosInstance.get("/health");
      return response.data;
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
