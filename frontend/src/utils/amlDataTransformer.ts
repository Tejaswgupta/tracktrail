/**
 * AML Data Transformation Utilities
 *
 * This module provides transformation functions to convert between frontend and backend data formats
 * for AML analysis. It ensures type safety and proper data mapping between the two systems.
 */

import type {
  RapidMovementResult,
  RoundTrippingResult,
} from "@/services/amlDetection";
import type {
  BackendTransaction,
  CashFlowResult,
  CounterpartyTrendsResult,
  CycleDetectionResult,
  TransferPatternResult,
} from "@/types/amlBackend";
import type { Transaction } from "@/types/database";

// Define AMLAlert type locally to avoid circular imports
interface AMLAlert {
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

/**
 * AML Data Transformer Class
 *
 * Handles all data transformations between frontend and backend formats
 */
export class AMLDataTransformer {
  static transformBackendTransaction(
    backendTxn: BackendTransaction
  ): Transaction {
    return {
      transaction_id: backendTxn.id,
      account_id: "", // Not provided by backend
      entity_id: backendTxn.entity_id,
      statement_id: "", // Not provided by backend
      tx_date: backendTxn.date,
      description: backendTxn.description,
      amount:
        backendTxn.type === "debit" ? -backendTxn.amount : backendTxn.amount,
      direction: backendTxn.type === "debit" ? "DR" : "CR",
      counterparty_merged: backendTxn.counterparty,
      created_at: new Date().toISOString(),
      created_by: "system",
      original_index: 0, //TODO: Fix this by fetching original_id from backend
    };
  }

  /**
   * Transform backend CycleDetectionResult to frontend RoundTrippingResult
   */
  static transformCycleDetectionResult(
    backendResult: CycleDetectionResult,
    _originalTransactions: Transaction[]
  ): RoundTrippingResult {
    const alerts: AMLAlert[] = [];
    const patterns: RoundTrippingResult["patterns"] = [];

    // Transform round trips (for single entity analysis)
    if (backendResult.results.round_trips) {
      for (const roundTrip of backendResult.results.round_trips) {
        const frontendTransactions = [
          this.transformBackendTransaction(roundTrip.outbound_transaction),
          this.transformBackendTransaction(roundTrip.return_transaction),
        ];

        const pattern = {
          entities: ["ACCOUNT_HOLDER", roundTrip.counterparty],
          transactions: frontendTransactions,
          totalAmount:
            roundTrip.outbound_transaction.amount +
            roundTrip.return_transaction.amount,
          timeSpan: roundTrip.time_span_hours,
          returnRatio: roundTrip.return_ratio,
          suspiciousScore: roundTrip.return_ratio > 0.7 ? 0.8 : 0.6,
        };

        patterns.push(pattern);

        // Create alert if suspicious
        if (pattern.suspiciousScore > 0.6) {
          alerts.push({
            id: `round_trip_${roundTrip.counterparty}_${Date.now()}`,
            type: "round_tripping",
            severity: pattern.suspiciousScore > 0.8 ? "high" : "medium",
            title: `Round Tripping - ${roundTrip.counterparty}`,
            description: `Bilateral money flow pattern: ₹${pattern.totalAmount.toLocaleString()} circulated with ${
              roundTrip.counterparty
            } within ${roundTrip.time_span_hours.toFixed(1)} hours (${(
              roundTrip.return_ratio * 100
            ).toFixed(1)}% return ratio)`,
            transactions: frontendTransactions,
            entities: pattern.entities,
            score: pattern.suspiciousScore,
            metadata: {
              totalAmount: pattern.totalAmount,
              returnRatio: roundTrip.return_ratio,
              timeSpan: roundTrip.time_span_hours,
              patternType: "Bilateral",
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    // Transform cycles (for multi-entity analysis)
    if (backendResult.results.cycles) {
      for (const cycle of backendResult.results.cycles) {
        const frontendTransactions = cycle.transactions.map((t) =>
          this.transformBackendTransaction(t)
        );

        const pattern = {
          entities: cycle.entities,
          transactions: frontendTransactions,
          totalAmount: cycle.total_amount,
          timeSpan: 0, // Backend doesn't provide this directly
          returnRatio: 0.9, // Estimated for cycles
          suspiciousScore: cycle.confidence_score,
        };

        patterns.push(pattern);

        // Create alert if suspicious
        if (cycle.confidence_score > 0.6) {
          alerts.push({
            id: `cycle_${cycle.cycle_id}`,
            type: "round_tripping",
            severity: cycle.confidence_score > 0.8 ? "high" : "medium",
            title: `Multi-Entity Round Tripping - ${cycle.entities.join(
              " → "
            )}`,
            description: `Complex circular money flow pattern: ₹${cycle.total_amount.toLocaleString()} circulated through ${
              cycle.entities.length
            } entities (${cycle.cycle_type})`,
            transactions: frontendTransactions,
            entities: cycle.entities,
            score: cycle.confidence_score,
            metadata: {
              totalAmount: cycle.total_amount,
              cycleLength: cycle.cycle_length,
              cycleType: cycle.cycle_type,
              patternType: "Multi-Entity",
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    const avgReturnRatio =
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.returnRatio, 0) / patterns.length
        : 0;
    const totalAmount = patterns.reduce((sum, p) => sum + p.totalAmount, 0);

    return {
      alerts,
      patterns,
      summary: {
        totalPatterns: patterns.length,
        avgReturnRatio,
        totalAmount,
      },
    };
  }

  /**
   * Transform backend RapidMovementResult to frontend RapidMovementResult
   * Handles multiple response formats from the backend
   */
  static transformRapidMovementResult(backendResult: any): RapidMovementResult {
    console.log(`backend result:`, backendResult);

    // Handle direct alert format (when backend returns alerts directly)
    if (Array.isArray(backendResult)) {
      return this.transformDirectAlertsToRapidMovementResult(backendResult);
    }

    // Handle case where backendResult is a single alert object
    if (
      backendResult &&
      backendResult.id &&
      backendResult.type === "rapid_movement"
    ) {
      return this.transformDirectAlertsToRapidMovementResult([backendResult]);
    }

    // Handle structured backend result format (expected format)
    if (
      backendResult &&
      backendResult.results &&
      backendResult.results.rapid_movements
    ) {
      return this.transformStructuredRapidMovementResult(backendResult);
    }

    // Handle case where the data is nested in a data property
    if (backendResult && backendResult.data) {
      return this.transformRapidMovementResult(backendResult.data);
    }

    // Return empty result if no recognizable format
    console.warn("Unrecognized backend result format:", backendResult);
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

  /**
   * Transform direct alert objects to RapidMovementResult
   */
  static transformDirectAlertsToRapidMovementResult(
    alertsData: any[]
  ): RapidMovementResult {
    const alerts: AMLAlert[] = [];
    const patterns: RapidMovementResult["patterns"] = [];
    let totalAmount = 0;
    let maxVelocity = 0;

    for (const alertData of alertsData) {
      // Ensure we have the required structure
      if (!alertData.transactions || !Array.isArray(alertData.transactions)) {
        console.warn("Alert missing transactions array:", alertData);
        continue;
      }

      // Transform transactions to proper format
      const transactions: Transaction[] = alertData.transactions.map(
        (tx: any) => ({
          transaction_id:
            tx.transaction_id || `tx_${Date.now()}_${Math.random()}`,
          account_id: tx.account_id || "unknown",
          entity_id: tx.entity_id || "unknown",
          statement_id: tx.statement_id || "unknown",
          tx_date: tx.tx_date,
          description: tx.description || "",
          amount: tx.amount,
          direction: tx.direction,
          counterparty_merged: tx.counterparty_merged || "",
          created_at: tx.created_at || new Date().toISOString(),
          created_by: tx.created_by || "system",
        })
      );

      // Extract metadata with safe defaults
      const metadata = alertData.metadata || {};

      // Calculate velocity from metadata or derive from transactions
      const velocity = metadata.velocity || 0;
      maxVelocity = Math.max(maxVelocity, velocity);

      const alertTotalAmount = metadata.totalAmount || 0;
      totalAmount += alertTotalAmount;

      // Create pattern
      const pattern = {
        entity: alertData.entities?.[0] || "unknown",
        transactions: transactions,
        totalAmount: alertTotalAmount,
        timeSpan: metadata.timeSpan || 0,
        velocity: velocity,
        suspiciousScore: alertData.score || 0,
      };

      patterns.push(pattern);

      // Extract transaction data for table display
      const creditTx = transactions.find((t) => t.direction === "CR");
      const debitTx = transactions.find((t) => t.direction === "DR");

      // Create alert with proper typing and safe metadata extraction
      const alert: AMLAlert = {
        id: alertData.id,
        type: "rapid_movement",
        severity: this.getSeverityFromScore(alertData.score || 0),
        title: alertData.title || "Rapid Movement Detected",
        description: alertData.description || "",
        transactions: transactions,
        entities: alertData.entities || [],
        score: alertData.score || 0,
        metadata: {
          ...metadata,
          // Ensure we have the required fields for table display with safe fallbacks
          inDate:
            metadata.inDate || creditTx?.tx_date || new Date().toISOString(),
          inAmount: metadata.inAmount || creditTx?.amount || 0,
          inCounterparty:
            metadata.inCounterparty ||
            creditTx?.counterparty_merged ||
            "Unknown",
          inDescription: metadata.inDescription || creditTx?.description || "",
          outDate:
            metadata.outDate || debitTx?.tx_date || new Date().toISOString(),
          outAmount: metadata.outAmount || Math.abs(debitTx?.amount || 0),
          outCounterparty:
            metadata.outCounterparty ||
            debitTx?.counterparty_merged ||
            "Unknown",
          outDescription: metadata.outDescription || debitTx?.description || "",
          amountDifference: metadata.amountDifference || 0,
          timeSpan: metadata.timeSpan || 0,
          velocity: velocity,
          totalAmount: alertTotalAmount,
        },
        detectedAt: new Date(alertData.detectedAt || Date.now()),
      };

      alerts.push(alert);
    }

    return {
      alerts,
      patterns,
      summary: {
        totalPatterns: patterns.length,
        maxVelocity,
        totalAmount,
      },
    };
  }

  /**
   * Transform structured backend result format
   */
  static transformStructuredRapidMovementResult(
    backendResult: import("@/types/amlBackend").RapidMovementResult
  ): RapidMovementResult {
    const alerts: AMLAlert[] = [];
    const patterns: RapidMovementResult["patterns"] = [];
    let totalAmount = 0;
    let maxVelocity = 0;

    for (const movement of backendResult.results.rapid_movements) {
      // Calculate velocity (amount per hour)
      const velocity = movement.in_amount / movement.hours_gap;
      maxVelocity = Math.max(maxVelocity, velocity);
      totalAmount += movement.in_amount;

      // Create mock transactions for the pattern
      const inTransaction: Transaction = {
        transaction_id: `in_${Date.now()}_${Math.random()}`,
        account_id: "unknown",
        entity_id: "unknown",
        statement_id: "unknown",
        tx_date: movement.in_date,
        description: movement.in_description,
        amount: movement.in_amount,
        direction: "CR",
        counterparty_merged: movement.in_counterparty,
        created_at: new Date().toISOString(),
        created_by: "system",
        original_index: 0, //TODO: Add original index
      };

      const outTransaction: Transaction = {
        transaction_id: `out_${Date.now()}_${Math.random()}`,
        account_id: "unknown",
        entity_id: "unknown",
        statement_id: "unknown",
        tx_date: movement.out_date,
        description: movement.out_description,
        amount: -movement.out_amount,
        direction: "DR",
        counterparty_merged: movement.out_counterparty,
        created_at: new Date().toISOString(),
        created_by: "system",
        original_index: 0, //TODO: Add original index
      };

      const pattern = {
        entity: "unknown",
        transactions: [inTransaction, outTransaction],
        totalAmount: movement.in_amount,
        timeSpan: movement.hours_gap,
        velocity: velocity,
        suspiciousScore:
          movement.hours_gap <= 6 ? 0.9 : movement.hours_gap <= 24 ? 0.8 : 0.6,
      };

      patterns.push(pattern);

      alerts.push({
        id: `rapid_movement_${
          movement.in_counterparty
        }_${Date.now()}_${Math.random()}`,
        type: "rapid_movement",
        severity: this.getSeverityFromScore(pattern.suspiciousScore),
        title: "Rapid Money Movement Detected",
        description: `₹${movement.in_amount.toLocaleString()} received and ₹${movement.out_amount.toLocaleString()} sent within ${
          movement.hours_gap
        } hours`,
        transactions: [inTransaction, outTransaction],
        entities: [movement.in_counterparty, movement.out_counterparty],
        score: pattern.suspiciousScore,
        metadata: {
          totalAmount: movement.in_amount,
          velocity: velocity,
          timeSpan: movement.hours_gap,
          transactionCount: 2,
          amountDifference: movement.amount_difference_percent,
          inDate: movement.in_date,
          inAmount: movement.in_amount,
          inCounterparty: movement.in_counterparty,
          inDescription: movement.in_description,
          outDate: movement.out_date,
          outAmount: movement.out_amount,
          outCounterparty: movement.out_counterparty,
          outDescription: movement.out_description,
        },
        detectedAt: new Date(),
      });
    }

    return {
      alerts,
      patterns,
      summary: {
        totalPatterns: patterns.length,
        maxVelocity,
        totalAmount,
      },
    };
  }

  /**
   * Transform backend CashFlowResult and TransferPatternResult to frontend SmurfingResult
   */
  static transformSmurfingResult(
    cashFlowResult: CashFlowResult,
    transferPatternResult: TransferPatternResult,
    originalTransactions: Transaction[]
  ): {
    alerts: Array<{
      id: string;
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      title: string;
      description: string;
      transactions: Transaction[];
      entities: string[];
      score: number;
      metadata: Record<string, any>;
      detectedAt: Date;
    }>;
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
  } {
    const alerts: any[] = [];
    const patterns: any[] = [];

    // Process cash flow patterns for smurfing indicators
    if (cashFlowResult.results.cash_patterns) {
      for (const cashPattern of cashFlowResult.results.cash_patterns) {
        if (cashPattern.risk_score > 0.6) {
          alerts.push({
            id: `smurfing_cash_${cashPattern.pattern_type}_${Date.now()}`,
            type: "smurfing",
            severity: cashPattern.risk_score > 0.8 ? "high" : "medium",
            title: `Potential Smurfing - ${cashPattern.pattern_type}`,
            description: `Detected ${cashPattern.pattern_type} pattern with ${
              cashPattern.frequency
            } transactions totaling ₹${cashPattern.total_amount.toLocaleString()}`,
            transactions: originalTransactions.filter(
              (t) => t.direction === "CR" && Math.abs(t.amount) < 50000
            ), // Approximate filtering
            entities: [
              ...new Set(originalTransactions.map((t) => t.entity_id)),
            ],
            score: cashPattern.risk_score,
            metadata: {
              patternType: cashPattern.pattern_type,
              frequency: cashPattern.frequency,
              totalAmount: cashPattern.total_amount,
              riskScore: cashPattern.risk_score,
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    // Process transfer patterns for structuring indicators
    if (transferPatternResult.results.patterns_detected) {
      for (const transferPattern of transferPatternResult.results
        .patterns_detected) {
        if (
          transferPattern.pattern_type === "structuring" &&
          transferPattern.confidence_score > 0.6
        ) {
          const frontendTransactions = transferPattern.transactions.map((t) =>
            this.transformBackendTransaction(t)
          );

          alerts.push({
            id: `smurfing_structuring_${transferPattern.pattern_id}`,
            type: "smurfing",
            severity:
              transferPattern.confidence_score > 0.8 ? "high" : "medium",
            title: "Potential Structuring - Multiple Small Transactions",
            description: `Detected structuring pattern with ${
              transferPattern.entities.length
            } entities and ₹${transferPattern.total_amount.toLocaleString()} total amount`,
            transactions: frontendTransactions,
            entities: transferPattern.entities,
            score: transferPattern.confidence_score,
            metadata: {
              patternType: "structuring",
              networkDepth: transferPattern.network_depth,
              totalAmount: transferPattern.total_amount,
              patternStrength: transferPattern.pattern_strength,
            },
            detectedAt: new Date(),
          });
        }
      }
    }

    const highRiskPatterns = alerts.filter((a) => a.severity === "high").length;
    const totalAmount = alerts.reduce(
      (sum, a) => sum + (a.metadata.totalAmount || 0),
      0
    );

    return {
      alerts,
      patterns,
      summary: {
        totalPatterns: alerts.length,
        highRiskPatterns,
        totalAmount,
      },
    };
  }

  /**
   * Transform backend CounterpartyTrendsResult to frontend CommonCounterpartyResult
   */
  static transformCounterpartyTrendsResult(
    backendResult: CounterpartyTrendsResult,
    originalTransactions: Transaction[]
  ): {
    alerts: Array<{
      id: string;
      type: string;
      severity: "low" | "medium" | "high" | "critical";
      title: string;
      description: string;
      transactions: Transaction[];
      entities: string[];
      score: number;
      metadata: Record<string, any>;
      detectedAt: Date;
    }>;
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
  } {
    const alerts: any[] = [];
    const patterns: any[] = [];

    for (const counterparty of backendResult.results.counterparties) {
      if (counterparty.risk_score > 0.6) {
        const relatedTransactions = originalTransactions.filter(
          (t) => t.counterparty_merged === counterparty.counterparty_name
        );

        const pattern = {
          counterparty: counterparty.counterparty_name,
          entities: [...new Set(relatedTransactions.map((t) => t.entity_id))],
          transactions: relatedTransactions,
          totalAmount: counterparty.total_amount,
          suspiciousScore: counterparty.risk_score,
        };

        patterns.push(pattern);

        alerts.push({
          id: `common_counterparty_${
            counterparty.counterparty_name
          }_${Date.now()}`,
          type: "common_counterparty",
          severity: counterparty.risk_score > 0.8 ? "high" : "medium",
          title: `High-Risk Counterparty - ${counterparty.counterparty_name}`,
          description: `Counterparty with ${
            counterparty.transaction_count
          } transactions totaling ₹${counterparty.total_amount.toLocaleString()} across multiple entities`,
          transactions: relatedTransactions,
          entities: pattern.entities,
          score: counterparty.risk_score,
          metadata: {
            counterpartyName: counterparty.counterparty_name,
            transactionCount: counterparty.transaction_count,
            totalAmount: counterparty.total_amount,
            velocityScore: counterparty.velocity_score,
            relationshipStrength: counterparty.relationship_strength,
            trendDirection: counterparty.trend_direction,
          },
          detectedAt: new Date(),
        });
      }
    }

    const highRiskCounterparties = patterns.filter(
      (p) => p.suspiciousScore > 0.8
    ).length;
    const totalAmount = patterns.reduce((sum, p) => sum + p.totalAmount, 0);

    return {
      alerts,
      patterns,
      summary: {
        totalCounterparties:
          backendResult.results.summary.total_counterparties_analyzed,
        highRiskCounterparties,
        totalAmount,
      },
    };
  }

  /**
   * Validate that transactions array is not empty and contains required fields
   */
  static validateTransactions(transactions: Transaction[]): void {
    if (!transactions || transactions.length === 0) {
      throw new Error("Transactions array cannot be empty");
    }

    const requiredFields = [
      "transaction_id",
      "entity_id",
      "tx_date",
      "amount",
      "direction",
    ];

    for (const transaction of transactions) {
      for (const field of requiredFields) {
        if (
          !(field in transaction) ||
          transaction[field as keyof Transaction] === undefined
        ) {
          throw new Error(`Transaction missing required field: ${field}`);
        }
      }
    }
  }

  /**
   * Get severity level from numeric score
   */
  static getSeverityFromScore(
    score: number
  ): "low" | "medium" | "high" | "critical" {
    if (score >= 0.9) return "critical";
    if (score >= 0.7) return "high";
    if (score >= 0.5) return "medium";
    return "low";
  }
}

// Export default instance for convenience
export const amlDataTransformer = AMLDataTransformer;
