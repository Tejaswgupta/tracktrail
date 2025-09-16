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

interface AMLBackendClientConfig {
  baseUrl: string;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  authToken?: string;
}

const DEFAULT_CONFIG: AMLBackendClientConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  timeout: 300, // in seconds
  maxRetries: 3,
  retryDelay: 1000,
};

const ERROR_MESSAGES: Record<AMLErrorCode, string> = {
  VALIDATION_ERROR: "Please check your input parameters and try again.",
  ENTITY_NOT_FOUND: "The selected entity could not be found.",
  DATABASE_ERROR: "Database temporarily unavailable. Please try again later.",
  ANALYSIS_ERROR: "Analysis failed. Please check your data and try again.",
  INTERNAL_ERROR: "An unexpected error occurred. Please try again later.",
};

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

export class AMLBackendClient {
  private config: AMLBackendClientConfig;

  constructor(config?: Partial<AMLBackendClientConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeout: number, //in seconds
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout*1000);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async makeRequest<T>(
    endpoint: string,
    data: any
  ): Promise<BackendAnalysisResponse<T>> {
    let lastError: Error | null = null;
    const url = `${this.config.baseUrl}/api/v1${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (this.config.authToken) {
      headers.Authorization = `Bearer ${this.config.authToken}`;
    }

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        console.log('AML API Request:', 'POST', url);

        const response = await this.fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
          },
          this.config.timeout
        );

        console.log('AML API Response:', response.status, url);

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
      } catch (error: unknown) {
        if (error instanceof Error) {
          lastError = error;

          if (error instanceof TypeError && error.message.includes('fetch')) {
            console.error('AML API Network Error:', error.message);
          } else if ((error as any).name === 'AbortError') {
            lastError = new Error(`Request timeout after ${this.config.timeout}ms`);
          } else {
            console.error('AML API Error:', error);
          }

          if (
            error instanceof AMLBackendError &&
            (error.code === "VALIDATION_ERROR" || error.code === "ENTITY_NOT_FOUND")
          ) {
            throw error;
          }

          if (attempt === this.config.maxRetries) {
            break;
          }

          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          lastError = new Error('Unknown error occurred');
          console.error('AML API Unknown Error:', error);
          
          if (attempt === this.config.maxRetries) {
            break;
          }

          const delay = this.config.retryDelay * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    if (lastError instanceof AMLBackendError) {
      throw lastError;
    }

    throw new AMLBackendError(
      "INTERNAL_ERROR",
      `Request failed after ${this.config.maxRetries + 1} attempts: ${
        lastError?.message || "Unknown error"
      }`,
      { originalError: lastError?.message || "Unknown error" }
    );
  }

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
      const response = await this.fetchWithTimeout(
        `${this.config.baseUrl}/api/v1/health`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(this.config.authToken && { Authorization: `Bearer ${this.config.authToken}` }),
          },
        },
        this.config.timeout
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new AMLBackendError(
        "INTERNAL_ERROR",
        "Backend service is not available",
        { originalError: errorMessage }
      );
    }
  }
}

export const amlBackendClient = new AMLBackendClient();
export { AMLBackendError };
export type { AMLBackendClientConfig };
