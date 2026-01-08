/**
 * Flowchart Chain Service - Client for backend flowchart chain analysis
 */

import type {
  FlowchartChainData,
  FlowchartChainRequest,
  FlowchartChainResponse,
} from "@/types/flowchartChain";

interface FlowchartServiceConfig {
  baseUrl: string;
  timeout: number;
}

const DEFAULT_CONFIG: FlowchartServiceConfig = {
  baseUrl: process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000",
  timeout: 60000, // 60 seconds for potentially large analyses
};

class FlowchartChainService {
  private config: FlowchartServiceConfig;

  constructor(config: Partial<FlowchartServiceConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Analyze flowchart chains for a case
   */
  async analyzeFlowchartChains(
    request: FlowchartChainRequest
  ): Promise<FlowchartChainData> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/api/v1/analyze/flowchart-chains`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message ||
            errorData.detail?.message ||
            `Failed to analyze flowchart chains: ${response.statusText}`
        );
      }

      const result: FlowchartChainResponse = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.message || "Failed to analyze flowchart chains");
      }

      return result.data;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error(
            "Flowchart chain analysis request timed out. Please try with fewer transactions or narrower filters."
          );
        }
        throw error;
      }
      throw new Error(
        "An unexpected error occurred during flowchart chain analysis"
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Format time window for display
   */
  formatTimeWindow(milliseconds: number): string {
    if (!Number.isFinite(milliseconds)) {
      return "No limit";
    }

    if (milliseconds <= 0) {
      return "Immediate";
    }

    const hours = milliseconds / (60 * 60 * 1000);
    const days = hours / 24;

    if (days >= 1 && days % 1 === 0) {
      return `${Math.round(days)} day${Math.round(days) === 1 ? "" : "s"}`;
    }

    if (hours >= 1 && hours % 1 === 0) {
      return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
    }

    const minutes = milliseconds / (60 * 1000);
    return `${Math.round(minutes)} minute${
      Math.round(minutes) === 1 ? "" : "s"
    }`;
  }
}

// Export singleton instance
export const flowchartChainService = new FlowchartChainService();

// Export class for custom instances
;
