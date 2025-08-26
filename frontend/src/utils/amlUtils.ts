import type { Transaction } from "@/types/database";

export interface TransactionFlow {
  from: string;
  to: string;
  amount: number;
  date: Date;
  transaction: Transaction;
}

export interface EntityNetwork {
  entities: Set<string>;
  connections: Map<string, Set<string>>;
  flows: TransactionFlow[];
  totalAmount: number;
}

export interface TimeSeriesPoint {
  date: string;
  amount: number;
  count: number;
  direction: "DR" | "CR";
}

export interface VelocityMetrics {
  entity: string;
  hourlyVelocity: number;
  dailyVelocity: number;
  weeklyVelocity: number;
  peakHour: number;
  peakDay: string;
  consistencyScore: number; // 0-1, higher means more consistent pattern
}

export interface StructuringIndicators {
  entity: string;
  transactionsJustBelow: number; // Count of transactions just below reporting thresholds
  averageAmount: number;
  standardDeviation: number;
  suspiciousPatterns: string[];
  structuringScore: number; // 0-1
}

export class AMLUtils {
  // Indian regulatory thresholds
  static readonly THRESHOLDS = {
    CASH_TRANSACTION_REPORT: 1000000, // 10 lakh INR
    SUSPICIOUS_TRANSACTION_REPORT: 1000000, // 10 lakh INR
    CROSS_BORDER_REPORT: 500000, // 5 lakh INR
    HIGH_VALUE_TRANSACTION: 2000000, // 20 lakh INR
    STRUCTURING_THRESHOLD: 950000, // Just below 10 lakh
    RAPID_SUCCESSION_HOURS: 24,
    SMURFING_MAX_AMOUNT: 50000, // 50k INR
  };

  /**
   * Build a network graph of entity relationships based on transactions
   */
  static buildEntityNetwork(transactions: Transaction[]): EntityNetwork {
    const entities = new Set<string>();
    const connections = new Map<string, Set<string>>();
    const flows: TransactionFlow[] = [];
    let totalAmount = 0;

    for (const transaction of transactions) {
      if (!transaction.counterparty_merged) continue;

      const accountHolder = "ACCOUNT_HOLDER"; // This would be dynamic in real implementation
      const counterparty = transaction.counterparty_merged;

      entities.add(accountHolder);
      entities.add(counterparty);

      // Build connections
      if (!connections.has(accountHolder))
        connections.set(accountHolder, new Set());
      if (!connections.has(counterparty))
        connections.set(counterparty, new Set());

      connections.get(accountHolder)!.add(counterparty);
      connections.get(counterparty)!.add(accountHolder);

      // Create flow
      const flow: TransactionFlow = {
        from: transaction.direction === "DR" ? accountHolder : counterparty,
        to: transaction.direction === "DR" ? counterparty : accountHolder,
        amount: transaction.amount,
        date: new Date(transaction.tx_date),
        transaction,
      };

      flows.push(flow);
      totalAmount += transaction.amount;
    }

    return {
      entities,
      connections,
      flows,
      totalAmount,
    };
  }

  /**
   * Calculate velocity metrics for rapid movement detection
   */
  static calculateVelocityMetrics(
    entity: string,
    transactions: Transaction[]
  ): VelocityMetrics {
    if (transactions.length === 0) {
      return {
        entity,
        hourlyVelocity: 0,
        dailyVelocity: 0,
        weeklyVelocity: 0,
        peakHour: 0,
        peakDay: "",
        consistencyScore: 0,
      };
    }

    const sortedTxns = transactions.sort(
      (a, b) => new Date(a.tx_date).getTime() - new Date(b.tx_date).getTime()
    );
    const firstDate = new Date(sortedTxns[0].tx_date);
    const lastDate = new Date(sortedTxns[sortedTxns.length - 1].tx_date);

    const totalHours = Math.max(
      1,
      (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60)
    );
    const totalDays = Math.max(1, totalHours / 24);
    const totalWeeks = Math.max(1, totalDays / 7);
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);

    // Calculate velocities
    const hourlyVelocity = totalAmount / totalHours;
    const dailyVelocity = totalAmount / totalDays;
    const weeklyVelocity = totalAmount / totalWeeks;

    // Find peak activity patterns
    const hourlyActivity = new Map<number, number>();
    const dailyActivity = new Map<string, number>();

    for (const transaction of transactions) {
      const date = new Date(transaction.tx_date);
      const hour = date.getHours();
      const dayKey = date.toISOString().split("T")[0];

      hourlyActivity.set(
        hour,
        (hourlyActivity.get(hour) || 0) + transaction.amount
      );
      dailyActivity.set(
        dayKey,
        (dailyActivity.get(dayKey) || 0) + transaction.amount
      );
    }

    const peakHour = Array.from(hourlyActivity.entries()).reduce(
      (max, [hour, amount]) =>
        amount > (hourlyActivity.get(max) || 0) ? hour : max,
      0
    );

    const peakDay = Array.from(dailyActivity.entries()).reduce(
      (max, [day, amount]) =>
        amount > (dailyActivity.get(max[0]) || 0) ? [day, amount] : max,
      ["", 0]
    )[0];

    // Calculate consistency score (lower variance = higher consistency)
    const dailyAmounts = Array.from(dailyActivity.values());
    const avgDaily =
      dailyAmounts.reduce((sum, amt) => sum + amt, 0) / dailyAmounts.length;
    const variance =
      dailyAmounts.reduce((sum, amt) => sum + Math.pow(amt - avgDaily, 2), 0) /
      dailyAmounts.length;
    const consistencyScore = Math.max(0, 1 - Math.sqrt(variance) / avgDaily);

    return {
      entity,
      hourlyVelocity,
      dailyVelocity,
      weeklyVelocity,
      peakHour,
      peakDay,
      consistencyScore,
    };
  }

  /**
   * Detect structuring patterns (transactions designed to avoid reporting thresholds)
   */
  static detectStructuring(
    entity: string,
    transactions: Transaction[]
  ): StructuringIndicators {
    const suspiciousPatterns: string[] = [];
    let structuringScore = 0;

    // Count transactions just below thresholds
    const transactionsJustBelow = transactions.filter(
      (t) =>
        t.amount >= this.THRESHOLDS.STRUCTURING_THRESHOLD &&
        t.amount < this.THRESHOLDS.CASH_TRANSACTION_REPORT
    ).length;

    if (transactionsJustBelow >= 3) {
      suspiciousPatterns.push(
        `${transactionsJustBelow} transactions just below ₹10L threshold`
      );
      structuringScore += 0.4;
    }

    // Calculate statistical measures
    const amounts = transactions.map((t) => t.amount);
    const averageAmount =
      amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, amt) => sum + Math.pow(amt - averageAmount, 2), 0) /
      amounts.length;
    const standardDeviation = Math.sqrt(variance);

    // Check for unusual clustering around thresholds
    const thresholdRanges = [
      { min: 45000, max: 55000, name: "₹50K range" },
      { min: 90000, max: 110000, name: "₹1L range" },
      { min: 450000, max: 550000, name: "₹5L range" },
      { min: 900000, max: 1100000, name: "₹10L range" },
    ];

    for (const range of thresholdRanges) {
      const countInRange = transactions.filter(
        (t) => t.amount >= range.min && t.amount <= range.max
      ).length;
      const percentageInRange = countInRange / transactions.length;

      if (percentageInRange > 0.3 && countInRange >= 5) {
        suspiciousPatterns.push(
          `${countInRange} transactions clustered in ${range.name}`
        );
        structuringScore += 0.2;
      }
    }

    // Check for round number bias (structuring often uses round numbers)
    const roundNumbers = transactions.filter((t) => {
      const amount = t.amount;
      return (
        amount % 10000 === 0 || amount % 50000 === 0 || amount % 100000 === 0
      );
    }).length;

    const roundNumberRatio = roundNumbers / transactions.length;
    if (roundNumberRatio > 0.6) {
      suspiciousPatterns.push(
        `${(roundNumberRatio * 100).toFixed(1)}% transactions are round numbers`
      );
      structuringScore += 0.2;
    }

    // Check for time-based patterns (structuring often happens in bursts)
    const timeGroups = this.groupTransactionsByTimeWindow(transactions, 24); // 24-hour windows
    const largeBursts = timeGroups.filter((group) => group.length >= 5).length;

    if (largeBursts >= 2) {
      suspiciousPatterns.push(
        `${largeBursts} time periods with 5+ transactions`
      );
      structuringScore += 0.2;
    }

    return {
      entity,
      transactionsJustBelow,
      averageAmount,
      standardDeviation,
      suspiciousPatterns,
      structuringScore: Math.min(structuringScore, 1),
    };
  }

  /**
   * Generate time series data for transaction analysis
   */
  static generateTimeSeries(
    transactions: Transaction[],
    granularity: "hour" | "day" | "week" = "day"
  ): TimeSeriesPoint[] {
    const timeSeriesMap = new Map<
      string,
      { amount: number; count: number; credits: number; debits: number }
    >();

    for (const transaction of transactions) {
      const date = new Date(transaction.tx_date);
      let key: string;

      switch (granularity) {
        case "hour":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(date.getDate()).padStart(2, "0")} ${String(
            date.getHours()
          ).padStart(2, "0")}:00`;
          break;
        case "week":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split("T")[0];
          break;
        case "day":
        default:
          key = date.toISOString().split("T")[0];
          break;
      }

      if (!timeSeriesMap.has(key)) {
        timeSeriesMap.set(key, { amount: 0, count: 0, credits: 0, debits: 0 });
      }

      const point = timeSeriesMap.get(key)!;
      point.amount += transaction.amount;
      point.count += 1;

      if (transaction.direction === "CR") {
        point.credits += transaction.amount;
      } else {
        point.debits += transaction.amount;
      }
    }

    // Convert to array and sort by date
    const timeSeries: TimeSeriesPoint[] = [];
    for (const [date, data] of timeSeriesMap) {
      timeSeries.push({
        date,
        amount: data.amount,
        count: data.count,
        direction: data.credits > data.debits ? "CR" : "DR",
      });
    }

    return timeSeries.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Find unusual transaction patterns using statistical analysis
   */
  static findAnomalousTransactions(transactions: Transaction[]): Transaction[] {
    if (transactions.length < 10) return []; // Need sufficient data for statistical analysis

    const amounts = transactions.map((t) => t.amount);
    const mean = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const variance =
      amounts.reduce((sum, amt) => sum + Math.pow(amt - mean, 2), 0) /
      amounts.length;
    const stdDev = Math.sqrt(variance);

    // Use z-score to identify outliers (transactions more than 2 standard deviations from mean)
    const anomalousTransactions = transactions.filter((transaction) => {
      const zScore = Math.abs(transaction.amount - mean) / stdDev;
      return zScore > 2; // More than 2 standard deviations
    });

    return anomalousTransactions;
  }

  /**
   * Calculate Benford's Law compliance for fraud detection
   */
  static calculateBenfordsLaw(
    transactions: Transaction[]
  ): { digit: number; expected: number; actual: number; deviation: number }[] {
    // Benford's Law: P(d) = log10(1 + 1/d) for first digit d
    const benfordsExpected = [
      0, 30.1, 17.6, 12.5, 9.7, 7.9, 6.7, 5.8, 5.1, 4.6,
    ]; // Index 0 unused

    const firstDigitCounts = new Array(10).fill(0);
    let totalTransactions = 0;

    for (const transaction of transactions) {
      const firstDigit = parseInt(transaction.amount.toString().charAt(0));
      if (firstDigit >= 1 && firstDigit <= 9) {
        firstDigitCounts[firstDigit]++;
        totalTransactions++;
      }
    }

    const results: any = [];
    for (let digit = 1; digit <= 9; digit++) {
      const actual =
        totalTransactions > 0
          ? (firstDigitCounts[digit] / totalTransactions) * 100
          : 0;
      const expected = benfordsExpected[digit];
      const deviation = Math.abs(actual - expected);

      results.push({
        digit,
        expected,
        actual,
        deviation,
      });
    }

    return results;
  }

  /**
   * Group transactions by time windows
   */
  private static groupTransactionsByTimeWindow(
    transactions: Transaction[],
    windowHours: number
  ): Transaction[][] {
    const windows: Transaction[][] = [];
    const sortedTxns = transactions.sort(
      (a, b) => new Date(a.tx_date).getTime() - new Date(b.tx_date).getTime()
    );

    let currentWindow: Transaction[] = [];
    let windowStart: Date | null = null;

    for (const transaction of sortedTxns) {
      const txDate = new Date(transaction.tx_date);

      if (!windowStart) {
        windowStart = txDate;
        currentWindow = [transaction];
      } else {
        const hoursDiff =
          (txDate.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

        if (hoursDiff <= windowHours) {
          currentWindow.push(transaction);
        } else {
          if (currentWindow.length > 0) windows.push(currentWindow);
          windowStart = txDate;
          currentWindow = [transaction];
        }
      }
    }

    if (currentWindow.length > 0) windows.push(currentWindow);
    return windows;
  }

  /**
   * Calculate risk score for an entity based on multiple factors
   */
  static calculateEntityRiskScore(
    entity: string,
    transactions: Transaction[]
  ): {
    entity: string;
    riskScore: number;
    riskFactors: string[];
    recommendations: string[];
  } {
    const riskFactors: string[] = [];
    const recommendations: string[] = [];
    let riskScore = 0;

    // High volume risk
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    if (totalAmount > 50000000) {
      // 5 crore
      riskScore += 20;
      riskFactors.push("High transaction volume (>₹5 crore)");
      recommendations.push("Enhanced due diligence required");
    }

    // High frequency risk
    const avgDailyTransactions = transactions.length / 30; // Assuming 30-day period
    if (avgDailyTransactions > 10) {
      riskScore += 15;
      riskFactors.push("High transaction frequency");
      recommendations.push("Monitor for structuring patterns");
    }

    // Cash-heavy transactions
    const cashTransactions = transactions.filter(
      (t) =>
        t.description?.toUpperCase().includes("CASH") ||
        t.description?.toUpperCase().includes("ATM")
    ).length;
    const cashRatio = cashTransactions / transactions.length;

    if (cashRatio > 0.5) {
      riskScore += 25;
      riskFactors.push("High cash transaction ratio");
      recommendations.push("Verify source of cash transactions");
    }

    // Structuring indicators
    const structuring = this.detectStructuring(entity, transactions);
    if (structuring.structuringScore > 0.5) {
      riskScore += 30;
      riskFactors.push("Potential structuring detected");
      recommendations.push("File STR if patterns persist");
    }

    // Velocity risk
    const velocity = this.calculateVelocityMetrics(entity, transactions);
    if (velocity.hourlyVelocity > 1000000) {
      // 10 lakh per hour
      riskScore += 20;
      riskFactors.push("High velocity transactions");
      recommendations.push("Monitor for rapid movement patterns");
    }

    // Anomalous transactions
    const anomalous = this.findAnomalousTransactions(transactions);
    if (anomalous.length > transactions.length * 0.1) {
      // More than 10% anomalous
      riskScore += 15;
      riskFactors.push("High number of anomalous transactions");
      recommendations.push("Investigate unusual transaction amounts");
    }

    return {
      entity,
      riskScore: Math.min(riskScore, 100),
      riskFactors,
      recommendations,
    };
  }
}

export default AMLUtils;
