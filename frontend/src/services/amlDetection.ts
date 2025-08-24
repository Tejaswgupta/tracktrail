import type { Transaction } from "@/types/database";
import { AMLDataTransformer } from "@/utils/amlDataTransformer";
import { amlBackendClient, AMLBackendError } from "./amlBackendClient";

export interface AMLAlert {
  id: string;
  type:
    | "smurfing"
    | "round_tripping"
    | "rapid_movement"
    | "transfer_pattern"
    | "common_counterparty";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  transactions: Transaction[];
  entities: string[];
  score: number;
  metadata: Record<string, any>;
  detectedAt: Date;
}

export interface AMLAnalysisResult {
  alerts: AMLAlert[];
  summary: {
    totalAlerts: number;
    criticalAlerts: number;
    highRiskEntities: string[];
    riskScore: number;
  };
}

// Configuration interfaces for each detection type
export interface SmurfingConfig {
  maxTransactionAmount: number;
  minTransactionCount: number;
  maxTimeSpanDays: number;
  minFrequency: number;
  excludeWeekends: boolean;
  structuringThreshold: number;
}

export interface RoundTrippingConfig {
  maxTimeSpanHours: number;
  minReturnRatio: number;
  minAmount: number;
}

export interface RapidMovementConfig {
  // maxTimeSpanHours: number;
  // minVelocity: number;
  // minTransactionCount: number;
  percentageThreshold: number;
  timeWindowHours: number;
  amountMatchTolerance: number;
  minAmount?: number;
}

export interface TransferPatternConfig {
  maxCircularTimeSpan: number;
  minLayeringDepth: number;
  minConcentrationRatio: number;
  maxNetworkDepth: number;
  minCircularAmount: number;
}

export interface CommonCounterpartyConfig {
  minEntityCount: number;
  minTotalAmount: number;
  suspiciousKeywords: string[];
  riskCategories: string[];
  timeWindowDays: number;
}

export interface AMLDetectionConfig {
  roundTripping: RoundTrippingConfig;
  rapidMovement: RapidMovementConfig;
}

// Individual detection result interfaces
export interface SmurfingResult {
  alerts: AMLAlert[];
  patterns: Array<{
    entity: string;
    transactions: Transaction[];
    totalAmount: number;
    averageAmount: number;
    frequency: number;
    timeSpan: number;
    suspiciousScore: number;
  }>;
  summary: {
    totalPatterns: number;
    highRiskPatterns: number;
    totalAmount: number;
  };
}

export interface RoundTrippingResult {
  alerts: AMLAlert[];
  patterns: Array<{
    entities: string[];
    transactions: Transaction[];
    totalAmount: number;
    timeSpan: number;
    returnRatio: number;
    suspiciousScore: number;
  }>;
  summary: {
    totalPatterns: number;
    avgReturnRatio: number;
    totalAmount: number;
  };
}

export interface RapidMovementResult {
  alerts: AMLAlert[];
  patterns: Array<{
    entity: string;
    transactions: Transaction[];
    totalAmount: number;
    timeSpan: number;
    velocity: number;
    suspiciousScore: number;
  }>;
  summary: {
    totalPatterns: number;
    maxVelocity: number;
    totalAmount: number;
  };
}

export interface TransferPatternResult {
  alerts: AMLAlert[];
  patterns: Array<{
    pattern: "circular" | "layering" | "concentration" | "dispersion";
    entities: string[];
    transactions: Transaction[];
    depth: number;
    suspiciousScore: number;
  }>;
  summary: {
    totalPatterns: number;
    circularPatterns: number;
    layeringPatterns: number;
  };
}

export interface CommonCounterpartyResult {
  alerts: AMLAlert[];
  patterns: Array<{
    counterparty: string;
    entities: string[];
    transactions: Transaction[];
    totalAmount: number;
    suspiciousScore: number;
  }>;
  summary: {
    totalCounterparties: number;
    highRiskCounterparties: number;
    totalAmount: number;
  };
}

// Loading state interface
export interface AMLLoadingState {
  isLoading: boolean;
  operation?: string;
  progress?: number;
}

// Error handling interface
export interface AMLErrorState {
  hasError: boolean;
  error?: AMLBackendError;
  retryCount?: number;
}

class AMLDetectionService {
  // Default configuration
  private readonly defaultConfig: AMLDetectionConfig = {
    roundTripping: {
      maxTimeSpanHours: 72,
      minReturnRatio: 0.7,
      minAmount: 100000,
    },
    rapidMovement: {
      percentageThreshold: 10,
      timeWindowHours: 24,
      amountMatchTolerance: 5,
      minAmount: 100000,
    },
  };

  // Loading and error state management
  private loadingState: AMLLoadingState = { isLoading: false };
  private errorState: AMLErrorState = { hasError: false };

  // Event listeners for state changes
  private loadingListeners: Array<(state: AMLLoadingState) => void> = [];
  private errorListeners: Array<(state: AMLErrorState) => void> = [];

  /**
   * Detect round tripping patterns using backend cycle detection API
   * Handles both simple bilateral (A→B→A) and complex multi-entity patterns (A→B→C→A)
   */
  async detectRoundTripping(
    transactions: Transaction[],
    selectedEntityIds: string[],
    config: RoundTrippingConfig = this.defaultConfig.roundTripping
  ): Promise<RoundTrippingResult> {
    this.setLoadingState({
      isLoading: true,
      operation: "Round Tripping Detection",
    });

    try {
      // Transform frontend config to backend request

      // Call backend API
      const backendResponse = await amlBackendClient.analyzeCycles({
        entity_ids: selectedEntityIds,
        min_amount_threshold: config.minAmount,
        time_window_hours: config.maxTimeSpanHours,
      });

      // Transform backend response to frontend format
      const result = AMLDataTransformer.transformCycleDetectionResult(
        backendResponse.data,
        transactions
      );

      this.setLoadingState({ isLoading: false });
      return result;
    } catch (error) {
      this.handleError(error as Error);

      // Return empty result on error to maintain interface compatibility
      return {
        alerts: [],
        patterns: [],
        summary: {
          totalPatterns: 0,
          avgReturnRatio: 0,
          totalAmount: 0,
        },
      };
    }
  }

  /**
   * Detect rapid movement patterns using backend rapid movement API
   */
  async detectRapidMovement(
    selectedEntityIds: string[],
    config: RapidMovementConfig = this.defaultConfig.rapidMovement
  ): Promise<RapidMovementResult> {
    this.setLoadingState({
      isLoading: true,
      operation: "Rapid Movement Detection",
    });

    try {
      // Call backend API
      const backendResponse = await amlBackendClient.analyzeRapidMovements({
        time_threshold_minutes: config.timeWindowHours * 60,
        amount_threshold: config.minAmount || 0,
        tolerance_percentage: config.amountMatchTolerance,
        entity_ids: selectedEntityIds,
      });

      console.log(`backend Response`, backendResponse);

      // For testing: if backend returns an error or no data, use mock alert
      let responseData = backendResponse.data;

      // Transform backend response to frontend format
      // Handle both structured results and direct alert arrays
      const result =
        AMLDataTransformer.transformRapidMovementResult(responseData);

      this.setLoadingState({ isLoading: false });
      return result;
    } catch (error) {
      this.handleError(error as Error);

      // Return empty result on error to maintain interface compatibility
      return {
        alerts: [],
        patterns: [],
        summary: {
          totalPatterns: 0,
          maxVelocity: 0,
          totalAmount: 0,
        },
      };
    }
  }

  // State management methods
  private setLoadingState(state: AMLLoadingState): void {
    this.loadingState = state;
    this.loadingListeners.forEach((listener) => listener(state));
  }

  private clearError(): void {
    this.errorState = { hasError: false };
    this.errorListeners.forEach((listener) => listener(this.errorState));
  }

  private handleError(error: Error): void {
    const amlError =
      error instanceof AMLBackendError
        ? error
        : new AMLBackendError("INTERNAL_ERROR", error.message);

    this.errorState = {
      hasError: true,
      error: amlError,
      retryCount: (this.errorState.retryCount || 0) + 1,
    };

    this.setLoadingState({ isLoading: false });
    this.errorListeners.forEach((listener) => listener(this.errorState));
  }

  // Public state access methods
  public onLoadingStateChange(
    listener: (state: AMLLoadingState) => void
  ): () => void {
    this.loadingListeners.push(listener);
    return () => {
      const index = this.loadingListeners.indexOf(listener);
      if (index > -1) {
        this.loadingListeners.splice(index, 1);
      }
    };
  }

  public onErrorStateChange(
    listener: (state: AMLErrorState) => void
  ): () => void {
    this.errorListeners.push(listener);
    return () => {
      const index = this.errorListeners.indexOf(listener);
      if (index > -1) {
        this.errorListeners.splice(index, 1);
      }
    };
  }

  public getLoadingState(): AMLLoadingState {
    return { ...this.loadingState };
  }

  public getErrorState(): AMLErrorState {
    return { ...this.errorState };
  }
}

// Export a default instance
export const amlDetectionService = new AMLDetectionService();
