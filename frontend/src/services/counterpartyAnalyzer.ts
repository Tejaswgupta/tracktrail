import { Transaction } from "@/types/database";
import {
  CounterpartyStandardizer,
  type StandardizationResult,
} from "./counterpartyStandardizer";
import { transactionExtractorService } from "./transactionExtractor";

export interface CounterpartyAnalysisResult {
  standardization: StandardizationResult;
  bankPreset: string;
  extractionStats: {
    totalTransactions: number;
    extractedCounterparties: number;
    extractionRate: number;
  };
}

export class CounterpartyAnalyzer {
  private standardizer: CounterpartyStandardizer;
  private bankPreset: string;

  constructor(
    similarityThreshold: number = 85,
    bankPreset: string = "generic"
  ) {
    this.standardizer = new CounterpartyStandardizer(similarityThreshold);
    this.bankPreset = bankPreset;

    // Set the bank preset in the transaction extractor
    transactionExtractorService.setBankPreset(bankPreset);
  }

  setBankPreset(preset: string) {
    this.bankPreset = preset;
    transactionExtractorService.setBankPreset(preset);
  }

  /**
   * Analyze counterparties from a list of transactions
   */
  analyzeCounterparties(
    transactions: Transaction[],
    useAdvanced: boolean = false
  ): CounterpartyAnalysisResult {
    // Extract counterparty names from transactions
    const counterpartyNames: string[] = [];
    let extractedCount = 0;

    for (const transaction of transactions) {
      let counterparty = transaction.counterparty_merged;

      // If no counterparty is already extracted, try to extract from description
      if (!counterparty && transaction.description) {
        counterparty = transactionExtractorService.extractCounterparty(
          transaction.description,
          this.bankPreset
        );
      }

      if (counterparty) {
        counterpartyNames.push(counterparty);
        extractedCount++;
      }
    }

    // Standardize the extracted names using advanced or basic method
    const standardization = useAdvanced
      ? this.standardizer.findSimilarNamesAdvanced(counterpartyNames)
      : this.standardizer.findSimilarNames(counterpartyNames);

    return {
      standardization,
      bankPreset: this.bankPreset,
      extractionStats: {
        totalTransactions: transactions.length,
        extractedCounterparties: extractedCount,
        extractionRate:
          transactions.length > 0
            ? (extractedCount / transactions.length) * 100
            : 0,
      },
    };
  }

  /**
   * Comprehensive analysis that includes both counterparty analysis and date normalization
   */
  analyzeTransactions(
    transactions: Transaction[],
    options: {
      useAdvanced?: boolean;
      normalizeDates?: boolean;
      extractCounterparties?: boolean;
    } = {}
  ): {
    transactions: Transaction[];
    analysis: CounterpartyAnalysisResult;
    dateStats: {
      totalDates: number;
      parsedDates: number;
      parseRate: number;
      unparsedDates: string[];
    };
  } {
    const {
      useAdvanced = false,
      normalizeDates = true,
      extractCounterparties = true,
    } = options;

    let processedTransactions = [...transactions];

    // Normalize dates if requested
    let dateStats = {
      totalDates: 0,
      parsedDates: 0,
      parseRate: 0,
      unparsedDates: [] as string[],
    };

    // Analyze counterparties
    const analysis = extractCounterparties
      ? this.analyzeCounterparties(processedTransactions, useAdvanced)
      : {
          standardization: {
            clusters: [],
            mappings: {},
            totalProcessed: 0,
          },
          bankPreset: this.bankPreset,
          extractionStats: {
            totalTransactions: transactions.length,
            extractedCounterparties: 0,
            extractionRate: 0,
          },
        };

    return {
      transactions: processedTransactions,
      analysis,
      dateStats,
    };
  }

  /**
   * Apply standardization to transactions, updating their counterparty fields
   */
  applyStandardization(
    transactions: Transaction[],
    mappings: Record<string, string>
  ): Transaction[] {
    return transactions.map((transaction) => {
      if (transaction.counterparty_merged) {
        const standardized = this.standardizer.getStandardizedName(
          transaction.counterparty_merged,
          mappings
        );

        return {
          ...transaction,
          counterparty_merged: standardized,
          counterparty_original: transaction.counterparty_merged, // Preserve original
        };
      }
      return transaction;
    });
  }

  /**
   * Get available bank presets
   */
  static getAvailableBankPresets(): Record<string, string> {
    return {
      generic: "Generic",
      axis: "Axis Bank",
      federal: "Federal Bank",
      indian: "Indian Bank",
      jammu_and_kashmir_bank: "Jammu & Kashmir Bank",
      idfc: "IDFC First Bank",
    };
  }


  /**
   * Find similar counterparties for a given query (useful for UI suggestions)
   */
  findSimilarCounterparties(
    query: string,
    transactions: Transaction[],
    limit: number = 10
  ): Array<{ name: string; score: number }> {
    // Extract unique counterparty names from transactions
    const counterparties = new Set<string>();

    transactions.forEach((transaction) => {
      if (transaction.counterparty_merged) {
        counterparties.add(transaction.counterparty_merged);
      }
    });

    return this.standardizer.findSimilarCounterparties(
      query,
      Array.from(counterparties),
      limit
    );
  }

  /**
   * Recommend bank preset based on transaction descriptions
   */
  static recommendBankPreset(transactions: Transaction[]): string {
    const descriptions = transactions
      .map((t) => t.description)
      .filter((d) => d && typeof d === "string")
      .join(" ")
      .toUpperCase();

    // Simple heuristics based on common patterns
    if (
      descriptions.includes("INB/RTGS") ||
      descriptions.includes("INB/NEFT")
    ) {
      return "axis";
    }

    if (descriptions.includes("NEFT-") || descriptions.includes("RTGS-")) {
      return "jammu_and_kashmir_bank";
    }

    if (descriptions.includes("TFR:") || descriptions.includes("BBYT:")) {
      return "federal";
    }

    if (
      descriptions.includes("TRANSFER TO") ||
      descriptions.includes("TRANSFER FROM")
    ) {
      return "indian";
    }

    return "generic";
  }
}

// Export a default instance for convenience
export const counterpartyAnalyzer = new CounterpartyAnalyzer();
