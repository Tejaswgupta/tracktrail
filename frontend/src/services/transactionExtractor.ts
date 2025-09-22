export interface ExtractedTransaction {
  tx_date: string;
  description: string;
  amount: number;
  direction: "DR" | "CR";
  counterparty_merged?: string;
  balance?: number;
  original_index: number;
}

export interface ExtractionResult {
  transactions: ExtractedTransaction[];
  errors: string[];
  summary: {
    totalTransactions: number;
    totalCredits: number;
    totalDebits: number;
    dateRange: {
      from: string;
      to: string;
    };
  };
}

import type { ColumnMapping, CSVValidationResult } from "@/utils/csvValidator";
import { validateCSVColumns } from "@/utils/csvValidator";
import { amlBackendClient } from "./amlBackendClient";
import { parseAndConvertToISO } from "./dateParser";

export const transactionExtractorService = {
  bankPreset: "generic" as string,
  customRegexPattern: null as RegExp | null,

  setBankPreset(preset: string) {
    this.bankPreset = preset;
  },

  setCustomRegexPattern(pattern: string | null) {
    if (pattern) {
      try {
        this.customRegexPattern = new RegExp(pattern, 'i');
      } catch (error) {
        console.error("Invalid regex pattern:", error);
        this.customRegexPattern = null;
      }
    } else {
      this.customRegexPattern = null;
    }
  },

  getAvailableBanks() {
    return [
      {
        value: "generic",
        label: "Generic Bank",
        description: "Standard format for most banks",
      },
      {
        value: "axis",
        label: "Axis Bank",
        description: "Optimized for Axis Bank statements",
      },
      {
        value: "federal",
        label: "Federal Bank",
        description: "Optimized for Federal Bank statements",
      },
      {
        value: "indian",
        label: "Indian Bank",
        description: "Optimized for Indian Bank statements",
      },
      {
        value: "jammu_and_kashmir_bank",
        label: "Jammu & Kashmir Bank",
        description: "Optimized for J&K Bank statements",
      },
    ];
  },

  async extractFromFile(
    file: File,
    accountId: string,
    entityId: string,
    columnMapping?: ColumnMapping
  ): Promise<ExtractionResult> {
    const fileType = this.getFileType(file.type);
    console.log(`fileType`, fileType);

    switch (fileType) {
      case "csv":
        return this.extractFromCSV(file, accountId, entityId, columnMapping);
      case "xlsx":
      case "xls":
        return this.extractFromExcel(file, accountId, entityId);
      case "pdf":
        return this.extractFromPDF(file, accountId, entityId, columnMapping);
      default:
        throw new Error(`Unsupported file type: ${fileType}`);
    }
  },

  getFileType(mimeType: string): "pdf" | "csv" | "xlsx" | "xls" {
    switch (mimeType) {
      case "application/pdf":
        return "pdf";
      case "text/csv":
        return "csv";
      case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        return "xlsx";
      case "application/vnd.ms-excel":
        return "xls";
      default:
        return "pdf";
    }
  },

  async extractFromCSV(
    file: File,
    accountId: string,
    entityId: string,
    columnMapping?: ColumnMapping
  ): Promise<ExtractionResult> {
    console.log("Starting CSV extraction for file:", file.name);

    const text = await file.text();
    const lines = text.split("\n").filter((line) => line.trim());

    if (lines.length === 0) {
      throw new Error("CSV file is empty");
    }

    console.log(`CSV has ${lines.length} lines (including header)`);

    const transactions: ExtractedTransaction[] = [];
    const errors: string[] = [];

    // Parse header row to get column indices
    const headers = this.parseCSVColumns(lines[0]);
    console.log("CSV headers:", headers);

    let columnIndices: Record<string, number> = {};

    if (columnMapping) {
      // Use provided column mapping with exact string matching
      columnIndices = {
        DATE: headers.findIndex((h) => h.trim() === columnMapping.DATE.trim()),
        DESCRIPTION: headers.findIndex(
          (h) => h.trim() === columnMapping.DESCRIPTION.trim()
        ),
        DEBIT: columnMapping.DEBIT
          ? headers.findIndex((h) => h.trim() === columnMapping.DEBIT.trim())
          : -1,
        CREDIT: columnMapping.CREDIT
          ? headers.findIndex((h) => h.trim() === columnMapping.CREDIT.trim())
          : -1,
        AMOUNT: columnMapping.AMOUNT
          ? headers.findIndex((h) => h.trim() === columnMapping.AMOUNT?.trim())
          : -1,
        DIRECTION: columnMapping.DIRECTION
          ? headers.findIndex((h) => h.trim() === columnMapping.DIRECTION?.trim())
          : -1,
      };
      console.log("Using column mapping:", columnIndices);
      console.log("Column mapping details:", {
        DATE: `"${columnMapping.DATE}" -> index ${columnIndices.DATE}`,
        DESCRIPTION: `"${columnMapping.DESCRIPTION}" -> index ${columnIndices.DESCRIPTION}`,
        DEBIT: columnMapping.DEBIT
          ? `"${columnMapping.DEBIT}" -> index ${columnIndices.DEBIT}`
          : "not mapped",
        CREDIT: columnMapping.CREDIT
          ? `"${columnMapping.CREDIT}" -> index ${columnIndices.CREDIT}`
          : "not mapped",
        AMOUNT: columnMapping.AMOUNT
          ? `"${columnMapping.AMOUNT}" -> index ${columnIndices.AMOUNT}`
          : "not mapped",
        DIRECTION: columnMapping.DIRECTION
          ? `"${columnMapping.DIRECTION}" -> index ${columnIndices.DIRECTION}`
          : "not mapped",
      });

      // Validate that required columns were found
      if (columnIndices.DATE === -1) {
        throw new Error(
          `Date column "${
            columnMapping.DATE
          }" not found in CSV headers: ${headers.join(", ")}`
        );
      }
      if (columnIndices.DESCRIPTION === -1) {
        throw new Error(
          `Description column "${
            columnMapping.DESCRIPTION
          }" not found in CSV headers: ${headers.join(", ")}`
        );
      }
      if (
        columnIndices.AMOUNT === -1 &&
        (columnIndices.DEBIT === -1 || columnIndices.CREDIT === -1)
      ) {
        const missingCols: string[] = [];
        if (columnMapping.DEBIT && columnIndices.DEBIT === -1)
          missingCols.push(`"${columnMapping.DEBIT}"`);
        if (columnMapping.CREDIT && columnIndices.CREDIT === -1)
          missingCols.push(`"${columnMapping.CREDIT}"`);
        if (columnMapping.AMOUNT && columnIndices.AMOUNT === -1)
          missingCols.push(`"${columnMapping.AMOUNT}"`);
        throw new Error(
          `Amount columns not found: ${missingCols.join(
            ", "
          )} in CSV headers: ${headers.join(", ")}`
        );
      }
    } else {
      // Use default column order (legacy behavior)
      columnIndices = {
        DATE: 0,
        DESCRIPTION: 1,
        DEBIT: 2,
        CREDIT: 3,
        AMOUNT: -1,
        DIRECTION: -1,
      };
      console.log("Using default column mapping:", columnIndices);
    }

    // Skip header row
    const dataLines = lines.slice(1);

    for (let i = 0; i < dataLines.length; i++) {
      try {
        const transaction = this.parseCSVLineWithMapping(
          dataLines[i],
          i + 2,
          columnIndices,
          i + 1 // Pass original index (1-based)
        );
        if (transaction) {
          transactions.push(transaction);
        }
      } catch (error) {
        const errorMsg = `Line ${i + 2}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`;
        console.warn("CSV parsing error:", errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(
      `Extracted ${transactions.length} transactions with ${errors.length} errors`
    );
    return this.buildExtractionResult(transactions, errors);
  },

  parseCSVLineWithMapping(
    line: string,
    lineNumber: number,
    columnIndices: Record<string, number>,
    originalIndex: number
  ): ExtractedTransaction | null {
    if (!line.trim()) {
      return null; // Skip completely empty lines
    }

    const columns = this.parseCSVColumns(line);

    // Extract values using column mapping
    const dateStr =
      columnIndices.DATE >= 0 && columns[columnIndices.DATE]
        ? columns[columnIndices.DATE].trim()
        : "";
    const description =
      columnIndices.DESCRIPTION >= 0 && columns[columnIndices.DESCRIPTION]
        ? columns[columnIndices.DESCRIPTION].trim()
        : "";

    if (!dateStr || !description) {
      return null; // Skip empty rows
    }

    const txDate = parseAndConvertToISO(dateStr);
    console.log(`dateStr`, dateStr, txDate);
    if (!txDate) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    let amount = 0;
    let direction: "DR" | "CR" = "DR";

    // Handle different amount formats
    if (columnIndices.AMOUNT >= 0 && columns[columnIndices.AMOUNT]) {
      // Single amount column
      const amountStr = columns[columnIndices.AMOUNT].trim();
      const parsedAmount = this.parseAmount(amountStr);

      if (parsedAmount === 0) {
        throw new Error(`Invalid amount: "${amountStr}"`);
      }

      // If a direction column is mapped, prefer it
      let directionFromCol: "DR" | "CR" | null = null;
      if (columnIndices.DIRECTION !== undefined && columnIndices.DIRECTION >= 0) {
        const rawDir = columns[columnIndices.DIRECTION]?.trim() || "";
        directionFromCol = this.parseDirection(rawDir);
      }

      if (directionFromCol) {
        direction = directionFromCol;
        amount = Math.abs(parsedAmount);
      } else {
        // Fall back to sign-based inference
        if (parsedAmount > 0) {
          amount = parsedAmount;
          direction = "CR";
        } else {
          amount = Math.abs(parsedAmount);
          direction = "DR";
        }
      }
    } else if (columnIndices.DEBIT >= 0 && columnIndices.CREDIT >= 0) {
      // Separate debit/credit columns
      const debitStr = columns[columnIndices.DEBIT]?.trim() || "";
      const creditStr = columns[columnIndices.CREDIT]?.trim() || "";

      const debitAmount = this.parseAmount(debitStr);
      const creditAmount = this.parseAmount(creditStr);

      if (debitAmount > 0) {
        amount = debitAmount;
        direction = "DR";
      } else if (creditAmount > 0) {
        amount = creditAmount;
        direction = "CR";
      } else {
        throw new Error(
          `No valid amount found - Debit: "${debitStr}", Credit: "${creditStr}"`
        );
      }
    } else {
      throw new Error("No amount columns found or mapped");
    }

    const counterparty = this.extractCounterparty(
      description,
      this.bankPreset);

    console.log(
      `Parsed line ${lineNumber}: date=${txDate}, desc="${description}", amount=${amount}, direction=${direction}, counterparty="${counterparty}"`
    );

    return {
      tx_date: txDate,
      description,
      amount,
      direction,
      counterparty_merged: counterparty,
      balance: undefined, // Balance extraction can be added later if needed
      original_index: originalIndex,
    };
  },

  parseCSVLine(
    line: string,
    lineNumber: number,
    originalIndex: number = lineNumber - 1
  ): ExtractedTransaction | null {
    // Handle CSV parsing with proper quote handling
    const columns = this.parseCSVColumns(line);

    if (columns.length < 4) {
      throw new Error(
        `Insufficient columns (expected at least 4, got ${columns.length})`
      );
    }

    // Common CSV formats:
    // Date, Description, Debit, Credit, Balance
    // Date, Description, Amount, Type, Balance
    // Date, Particulars, Debit, Credit, Balance

    const dateStr = columns[0]?.trim();
    const description = columns[1]?.trim();

    if (!dateStr || !description) {
      return null; // Skip empty rows
    }

    const txDate = parseAndConvertToISO(dateStr);
    if (!txDate) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    let amount = 0;
    let direction: "DR" | "CR" = "DR";
    let balance: number | undefined;

    // Try to detect format and parse amount
    if (columns.length >= 5) {
      // Format: Date, Description, Debit, Credit, Balance
      const debitStr = columns[2]?.trim();
      const creditStr = columns[3]?.trim();
      const balanceStr = columns[4]?.trim();

      const debitAmount = this.parseAmount(debitStr);
      const creditAmount = this.parseAmount(creditStr);

      if (debitAmount > 0) {
        amount = debitAmount;
        direction = "DR";
      } else if (creditAmount > 0) {
        amount = creditAmount;
        direction = "CR";
      } else {
        throw new Error("No valid amount found in debit or credit columns");
      }

      balance = this.parseAmount(balanceStr);
    } else if (columns.length >= 4) {
      // Format: Date, Description, Amount, Type/Direction
      const amountStr = columns[2]?.trim();
      const typeStr = columns[3]?.trim().toLowerCase();

      amount = this.parseAmount(amountStr);
      if (amount === 0) {
        throw new Error("Invalid amount");
      }

      // Detect direction from type column or amount sign
      if (typeStr.includes("credit") || typeStr.includes("cr") || amount > 0) {
        direction = "CR";
        amount = Math.abs(amount);
      } else {
        direction = "DR";
        amount = Math.abs(amount);
      }
    }

    return {
      tx_date: txDate,
      description,
      amount,
      direction,
      counterparty_merged: this.extractCounterparty(
        description,
        this.bankPreset
      ),
      balance,
      original_index: originalIndex,
    };
  },

  parseCSVColumns(line: string): string[] {
    const columns: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // Handle escaped double quotes within a quoted field
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i++; // Skip the escaped quote
        } else {
          // Toggle quote state; do not add the quote itself
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        columns.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    columns.push(current);
    // Trim, remove surrounding quotes, and unescape double quotes
    return columns.map((col) => {
      let v = col.trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1);
      }
      return v.replace(/""/g, '"').trim();
    });
  },

  // Split CSV text into rows while respecting quoted fields that may contain newlines
  splitCSVRows(csvText: string): string[] {
    const rows: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const ch = csvText[i];
      if (ch === '"') {
        // Handle escaped quote within a quoted field
        const next = csvText[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = !inQuotes;
          current += ch;
        }
      } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        rows.push(current);
        current = "";
        // swallow CRLF pair
        if (ch === '\r' && csvText[i + 1] === '\n') {
          i++;
        }
      } else {
        current += ch;
      }
    }

    if (current.length > 0) {
      rows.push(current);
    }

    return rows.filter((l) => l.trim().length > 0);
  },

  // Preview PDF extraction to obtain headers and suggested mapping before full upload
  async previewPDFColumns(file: File): Promise<CSVValidationResult> {
    // Reuse the backend PDF->CSV endpoint to get a CSV snapshot and validate headers
    const formData = new FormData();
    formData.append("file", file, file.name);

    const baseUrl = amlBackendClient.getConfig().baseUrl;
    const response = await fetch(`${baseUrl}/api/v1/extract/pdf-to-csv`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      throw new Error(
        `PDF preview extraction failed (${response.status}): ${errText || response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/csv")) {
      const body = await response.text().catch(() => "");
      throw new Error(`Unexpected content-type from preview: ${contentType}. Body: ${body}`);
    }

    let csvText = await response.text();
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
    const lines = this.splitCSVRows(csvText);
    if (lines.length === 0) throw new Error("No CSV content returned from PDF extraction");

    const headers = this.parseCSVColumns(lines[0]);

    // Build preview data (up to 5 rows)
    const previewData: Record<string, string>[] = [];
    const previewRows = Math.min(5, Math.max(0, lines.length - 1));
    for (let i = 1; i <= previewRows; i++) {
      const values = this.parseCSVColumns(lines[i] || "");
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });
      previewData.push(row);
    }

    const validation = validateCSVColumns(headers);
    return {
      ...validation,
      previewData,
    };
  },

  // Preview transaction extraction with a specific bank preset
  async previewTransactions(
    file: File,
    bankPreset: string,
    columnMapping?: ColumnMapping
  ): Promise<ExtractionResult> {
    try {
      // Set bank preset
      this.setBankPreset(bankPreset);
      console.log(`Previewing transactions with bank preset:`,bankPreset,file,columnMapping);
      

      // For PDF files, we need to first convert to CSV
      if (file.type === "application/pdf") {
        console.log(`processing pdf file for preview`, file);
        // Get CSV from PDF using the backend
        const formData = new FormData();
        formData.append("file", file, file.name);

        const baseUrl = amlBackendClient.getConfig().baseUrl;
        const response = await fetch(`${baseUrl}/api/v1/extract/pdf-to-csv`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          let errText = "";
          try {
            errText = await response.text();
          } catch {}
          throw new Error(
            `PDF extraction failed (${response.status}): ${errText || response.statusText}`
          );
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/csv")) {
          const body = await response.text().catch(() => "");
          throw new Error(`Unexpected content-type: ${contentType}. Body: ${body}`);
        }

        let csvText = await response.text();
        if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
        const lines = this.splitCSVRows(csvText);

        if (lines.length === 0) {
          throw new Error("No CSV content returned from PDF extraction");
        }

        // Parse headers
        const headers = this.parseCSVColumns(lines[0]);

        // Determine column indices either from provided mapping or via auto-detection
        let columnIndices: Record<string, number> = {} as Record<string, number>;
        if (columnMapping) {
          // Use provided column mapping with exact string matching
          columnIndices = {
            DATE: headers.findIndex((h) => h.trim() === columnMapping.DATE.trim()),
            DESCRIPTION: headers.findIndex(
              (h) => h.trim() === columnMapping.DESCRIPTION.trim()
            ),
            DEBIT: columnMapping.DEBIT
              ? headers.findIndex((h) => h.trim() === columnMapping.DEBIT.trim())
              : -1,
            CREDIT: columnMapping.CREDIT
              ? headers.findIndex((h) => h.trim() === columnMapping.CREDIT.trim())
              : -1,
            AMOUNT: columnMapping.AMOUNT
              ? headers.findIndex((h) => h.trim() === columnMapping.AMOUNT?.trim())
              : -1,
            DIRECTION: columnMapping.DIRECTION
              ? headers.findIndex((h) => h.trim() === columnMapping.DIRECTION?.trim())
              : -1,
          };

          // Validate that required columns were found
          if (columnIndices.DATE === -1) {
            throw new Error(
              `Date column "${columnMapping.DATE}" not found in extracted headers: ${headers.join(", ")}`
            );
          }
          if (columnIndices.DESCRIPTION === -1) {
            throw new Error(
              `Description column "${columnMapping.DESCRIPTION}" not found in extracted headers: ${headers.join(", ")}`
            );
          }
          if (
            columnIndices.AMOUNT === -1 &&
            (columnIndices.DEBIT === -1 || columnIndices.CREDIT === -1)
          ) {
            const missingCols: string[] = [];
            if (columnMapping.DEBIT && columnIndices.DEBIT === -1)
              missingCols.push(`"${columnMapping.DEBIT}"`);
            if (columnMapping.CREDIT && columnIndices.CREDIT === -1)
              missingCols.push(`"${columnMapping.CREDIT}"`);
            if (columnMapping.AMOUNT && columnIndices.AMOUNT === -1)
              missingCols.push(`"${columnMapping.AMOUNT}"`);
            throw new Error(
              `Amount columns not found: ${missingCols.join(", ")}. Headers: ${headers.join(", ")}`
            );
          }
        } else {
          // Auto-detect using CSV validator
          const validation = validateCSVColumns(headers);

          if (!validation.isValid) {
            const missing = validation.missingColumns.join(", ");
            throw new Error(`Extracted CSV missing required columns: ${missing}. Headers: ${headers.join(", ")}`);
          }

          columnIndices = {
            DATE: headers.findIndex(
              (h) => h.trim() === validation.requiredColumns.DATE.trim()
            ),
            DESCRIPTION: headers.findIndex(
              (h) => h.trim() === validation.requiredColumns.DESCRIPTION.trim()
            ),
            DEBIT:
              validation.requiredColumns.DEBIT
                ? headers.findIndex(
                    (h) => h.trim() === validation.requiredColumns.DEBIT!.trim()
                  )
                : -1,
            CREDIT:
              validation.requiredColumns.CREDIT
                ? headers.findIndex(
                    (h) => h.trim() === validation.requiredColumns.CREDIT!.trim()
                  )
                : -1,
            AMOUNT:
              validation.requiredColumns.AMOUNT
                ? headers.findIndex(
                    (h) => h.trim() === validation.requiredColumns.AMOUNT!.trim()
                  )
                : -1,
            DIRECTION:
              validation.requiredColumns.DIRECTION
                ? headers.findIndex(
                    (h) => h.trim() === validation.requiredColumns.DIRECTION!.trim()
                  )
                : -1,
          };
        }

        // Parse rows into transactions (up to 5 for preview)
        const transactions: ExtractedTransaction[] = [];
        const errors: string[] = [];
        console.log("lines.length", lines.length);
        //shuffle hte transactions
        lines.sort(() => Math.random() - 0.5);

        for (let i = 1; i < Math.min(50, lines.length); i++) {
          try {
            const tx = this.parseCSVLineWithMapping(
              lines[i],
              i + 1,
              columnIndices,
              i // original index (0-based here); display as 1-based
            );
            if (tx) transactions.push(tx);
          } catch (err) {
            errors.push(
              `Line ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`
            );
          }
        }

        return this.buildExtractionResult(transactions, errors);
      } else if (file.type === "text/csv") {
        // For CSV files, directly extract transactions
        console.log(`processing csv file for preview`, file);
        const text = await file.text();
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length === 0) {
          throw new Error("CSV file is empty");
        }

        const transactions: ExtractedTransaction[] = [];
        const errors: string[] = [];


        // Parse header row to get column indices
        console.log(`headers`,lines[0])
        const headers = this.parseCSVColumns(lines[0]);

        let columnIndices: Record<string, number> = {};

        if (columnMapping) {
          // Use provided column mapping with exact string matching
          columnIndices = {
            DATE: headers.findIndex((h) => h.trim() === columnMapping.DATE.trim()),
            DESCRIPTION: headers.findIndex(
              (h) => h.trim() === columnMapping.DESCRIPTION.trim()
            ),
            DEBIT: columnMapping.DEBIT
              ? headers.findIndex((h) => h.trim() === columnMapping.DEBIT.trim())
              : -1,
            CREDIT: columnMapping.CREDIT
              ? headers.findIndex((h) => h.trim() === columnMapping.CREDIT.trim())
              : -1,
            AMOUNT: columnMapping.AMOUNT
              ? headers.findIndex((h) => h.trim() === columnMapping.AMOUNT?.trim())
              : -1,
            DIRECTION: columnMapping.DIRECTION
              ? headers.findIndex((h) => h.trim() === columnMapping.DIRECTION?.trim())
              : -1,
          };

          // Validate that required columns were found
          if (columnIndices.DATE === -1) {
            throw new Error(
              `Date column "${columnMapping.DATE}" not found in CSV headers: ${headers.join(", ")}`
            );
          }
          if (columnIndices.DESCRIPTION === -1) {
            throw new Error(
              `Description column "${columnMapping.DESCRIPTION}" not found in CSV headers: ${headers.join(", ")}`
            );
          }
          if (
            columnIndices.AMOUNT === -1 &&
            (columnIndices.DEBIT === -1 || columnIndices.CREDIT === -1)
          ) {
            const missingCols: string[] = [];
            if (columnMapping.DEBIT && columnIndices.DEBIT === -1)
              missingCols.push(`"${columnMapping.DEBIT}"`);
            if (columnMapping.CREDIT && columnIndices.CREDIT === -1)
              missingCols.push(`"${columnMapping.CREDIT}"`);
            if (columnMapping.AMOUNT && columnIndices.AMOUNT === -1)
              missingCols.push(`"${columnMapping.AMOUNT}"`);
            throw new Error(
              `Amount columns not found: ${missingCols.join(", ")} in CSV headers: ${headers.join(", ")}`
            );
          }
        } else {
          // Use default column order (legacy behavior) or auto-detect
          const validation = validateCSVColumns(headers);
          if (validation.isValid && validation.suggestedMapping) {
            const mapping = validation.suggestedMapping;
            columnIndices = {
              DATE: headers.findIndex((h) => h.trim() === mapping.DATE.trim()),
              DESCRIPTION: headers.findIndex((h) => h.trim() === mapping.DESCRIPTION.trim()),
              DEBIT: mapping.DEBIT
                ? headers.findIndex((h) => h.trim() === mapping.DEBIT.trim())
                : -1,
              CREDIT: mapping.CREDIT
                ? headers.findIndex((h) => h.trim() === mapping.CREDIT.trim())
                : -1,
              AMOUNT: mapping.AMOUNT
                ? headers.findIndex((h) => h.trim() === mapping.AMOUNT?.trim())
                : -1,
              DIRECTION: mapping.DIRECTION
                ? headers.findIndex((h) => h.trim() === mapping.DIRECTION?.trim())
                : -1,
            };
          } else {
            // Fallback to default column order
            columnIndices = {
              DATE: 0,
              DESCRIPTION: 1,
              DEBIT: 2,
              CREDIT: 3,
              AMOUNT: -1,
              DIRECTION: -1,
            };
          }
        }

        // Parse rows into transactions (up to 5 for preview)
        const dataLines = lines.slice(1);
        for (let i = 0; i < Math.min(50, dataLines.length); i++) {
          try {
            const transaction = this.parseCSVLineWithMapping(
              dataLines[i],
              i + 2,
              columnIndices,
              i + 1 // Pass original index (1-based)
            );
            if (transaction) {
              transactions.push(transaction);
            }
          } catch (error) {
            const errorMsg = `Line ${i + 2}: ${
              error instanceof Error ? error.message : "Unknown error"
            }`;
            errors.push(errorMsg);
          }
        }

        console.log(`transactions`,transactions, errors);

        return this.buildExtractionResult(transactions, errors);
      } else {
        throw new Error(`Unsupported file type for preview: ${file.type}`);
      }
    } catch (error) {
      return {
        transactions: [],
        errors: [error instanceof Error ? error.message : "Unknown preview error"],
        summary: {
          totalTransactions: 0,
          totalCredits: 0,
          totalDebits: 0,
          dateRange: { from: "", to: "" },
        },
      };
    }
  },

  async extractFromExcel(
    file: File,
    accountId: string,
    entityId: string
  ): Promise<ExtractionResult> {
    // For now, return a placeholder - would need a library like xlsx to parse Excel files
    return {
      transactions: [],
      errors: ["Excel file processing not yet implemented"],
      summary: {
        totalTransactions: 0,
        totalCredits: 0,
        totalDebits: 0,
        dateRange: { from: "", to: "" },
      },
    };
  },

  async extractFromPDF(
    file: File,
    accountId: string,
    entityId: string,
    columnMapping?: ColumnMapping
  ): Promise<ExtractionResult> {
    try {
      // 1) Send PDF to backend for extraction
      const formData = new FormData();
      formData.append("file", file, file.name);

      const baseUrl = amlBackendClient.getConfig().baseUrl;
      console.log(`baseUrl`, baseUrl);
      const response = await fetch(`${baseUrl}/api/v1/extract/pdf-to-csv`, {
        method: "POST",
        body: formData,
        // Keep a generous timeout since PDF parsing may take longer
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        let errText = "";
        try {
          errText = await response.text();
        } catch {}
        throw new Error(
          `PDF extraction failed (${response.status}): ${errText || response.statusText}`
        );
      }

      // 2) Validate content-type and read CSV content returned by backend
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/csv")) {
        const body = await response.text().catch(() => "");
        throw new Error(`Unexpected content-type: ${contentType}. Body: ${body}`);
      }

      let csvText = await response.text();
      // Strip UTF-8 BOM if present
      if (csvText.charCodeAt(0) === 0xfeff) {
        csvText = csvText.slice(1);
      }
      // Split into lines while respecting quoted newlines
      const lines = this.splitCSVRows(csvText);

      console.log(`lines`, lines)

      if (lines.length === 0) {
        throw new Error("No CSV content returned from PDF extraction");
      }

      // 3) Parse headers
      const headers = this.parseCSVColumns(lines[0]);
      console.log(`headers`, headers)

      // 4) Determine column indices either from provided mapping or via auto-detection
      let columnIndices: Record<string, number> = {} as Record<string, number>;
      if (columnMapping) {
        // Use provided column mapping with exact string matching (same as CSV flow)
        columnIndices = {
          DATE: headers.findIndex((h) => h.trim() === columnMapping.DATE.trim()),
          DESCRIPTION: headers.findIndex(
            (h) => h.trim() === columnMapping.DESCRIPTION.trim()
          ),
          DEBIT: columnMapping.DEBIT
            ? headers.findIndex((h) => h.trim() === columnMapping.DEBIT.trim())
            : -1,
          CREDIT: columnMapping.CREDIT
            ? headers.findIndex((h) => h.trim() === columnMapping.CREDIT.trim())
            : -1,
          AMOUNT: columnMapping.AMOUNT
            ? headers.findIndex((h) => h.trim() === columnMapping.AMOUNT?.trim())
            : -1,
          DIRECTION: columnMapping.DIRECTION
            ? headers.findIndex((h) => h.trim() === columnMapping.DIRECTION?.trim())
            : -1,
        };

        console.log("Using PDF column mapping:", columnIndices);
        console.log("PDF column mapping details:", {
          DATE: `"${columnMapping.DATE}" -> index ${columnIndices.DATE}`,
          DESCRIPTION: `"${columnMapping.DESCRIPTION}" -> index ${columnIndices.DESCRIPTION}`,
          DEBIT: columnMapping.DEBIT
            ? `"${columnMapping.DEBIT}" -> index ${columnIndices.DEBIT}`
            : "not mapped",
          CREDIT: columnMapping.CREDIT
            ? `"${columnMapping.CREDIT}" -> index ${columnIndices.CREDIT}`
            : "not mapped",
          AMOUNT: columnMapping.AMOUNT
            ? `"${columnMapping.AMOUNT}" -> index ${columnIndices.AMOUNT}`
            : "not mapped",
          DIRECTION: columnMapping.DIRECTION
            ? `"${columnMapping.DIRECTION}" -> index ${columnIndices.DIRECTION}`
            : "not mapped",
        });

        // Validate that required columns were found
        if (columnIndices.DATE === -1) {
          throw new Error(
            `Date column "${columnMapping.DATE}" not found in extracted headers: ${headers.join(", ")}`
          );
        }
        if (columnIndices.DESCRIPTION === -1) {
          throw new Error(
            `Description column "${columnMapping.DESCRIPTION}" not found in extracted headers: ${headers.join(", ")}`
          );
        }
        if (
          columnIndices.AMOUNT === -1 &&
          (columnIndices.DEBIT === -1 || columnIndices.CREDIT === -1)
        ) {
          const missingCols: string[] = [];
          if (columnMapping.DEBIT && columnIndices.DEBIT === -1)
            missingCols.push(`"${columnMapping.DEBIT}"`);
          if (columnMapping.CREDIT && columnIndices.CREDIT === -1)
            missingCols.push(`"${columnMapping.CREDIT}"`);
          if (columnMapping.AMOUNT && columnIndices.AMOUNT === -1)
            missingCols.push(`"${columnMapping.AMOUNT}"`);
          throw new Error(
            `Amount columns not found: ${missingCols.join(", ")}. Headers: ${headers.join(", ")}`
          );
        }
      } else {
        // Auto-detect using CSV validator
        const validation = validateCSVColumns(headers);
        console.log(`validation`, validation);

        if (!validation.isValid) {
          const missing = validation.missingColumns.join(", ");
          return {
            transactions: [],
            errors: [
              `Extracted CSV missing required columns: ${missing}. Headers: ${headers.join(", ")}`,
            ],
            summary: {
              totalTransactions: 0,
              totalCredits: 0,
              totalDebits: 0,
              dateRange: { from: "", to: "" },
            },
          };
        }

        columnIndices = {
          DATE: headers.findIndex(
            (h) => h.trim() === validation.requiredColumns.DATE.trim()
          ),
          DESCRIPTION: headers.findIndex(
            (h) => h.trim() === validation.requiredColumns.DESCRIPTION.trim()
          ),
          DEBIT:
            validation.requiredColumns.DEBIT
              ? headers.findIndex(
                  (h) => h.trim() === validation.requiredColumns.DEBIT!.trim()
                )
              : -1,
          CREDIT:
            validation.requiredColumns.CREDIT
              ? headers.findIndex(
                  (h) => h.trim() === validation.requiredColumns.CREDIT!.trim()
                )
              : -1,
          AMOUNT:
            validation.requiredColumns.AMOUNT
              ? headers.findIndex(
                  (h) => h.trim() === validation.requiredColumns.AMOUNT!.trim()
                )
              : -1,
          DIRECTION:
            validation.requiredColumns.DIRECTION
              ? headers.findIndex(
                  (h) => h.trim() === validation.requiredColumns.DIRECTION!.trim()
                )
              : -1,
        };
      }

      console.log(`columnIndices`, columnIndices);

      // 5) Parse rows into transactions
      const transactions: ExtractedTransaction[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        try {
          const tx = this.parseCSVLineWithMapping(
            lines[i],
            i + 1,
            columnIndices,
            i // original index (0-based here); display as 1-based
          );
          console.log(`tx`, tx);
          if (tx) transactions.push(tx);
        } catch (err) {
          errors.push(
            `Line ${i + 1}: ${err instanceof Error ? err.message : "Unknown error"}`
          );
        }
      }

      return this.buildExtractionResult(transactions, errors);
    } catch (error) {
      return {
        transactions: [],
        errors: [error instanceof Error ? error.message : "Unknown PDF extraction error"],
        summary: {
          totalTransactions: 0,
          totalCredits: 0,
          totalDebits: 0,
          dateRange: { from: "", to: "" },
        },
      };
    }
  },

  parseAmount(amountStr: string): number {
    if (!amountStr) return 0;

    // Detect parentheses to indicate negative amounts, e.g., (123.45)
    const isParenNegative = /\(.*\)/.test(amountStr);

    // Remove currency symbols, commas, spaces, and parentheses for parsing
    const cleanAmount = amountStr
      .replace(/[₹$€£,\s]/g, "")
      .replace(/[()]/g, "")
      .trim();

    // Remove any remaining non-numeric characters except dot and minus
    const numericOnly = cleanAmount.replace(/[^0-9.\-]/g, "");

    const amount = parseFloat(numericOnly);
    if (isNaN(amount)) return 0;
    return isParenNegative ? -amount : amount;
  },

  parseDirection(value: string): "DR" | "CR" | null {
    if (!value) return null;
    const v = value.trim().toUpperCase();

    // Normalize common variations
    if (v === "DR" || v === "DEBIT" || v === "D" || v.includes("WITHDRAW")) {
      return "DR";
    }
    if (v === "CR" || v === "CREDIT" || v === "C" || v.includes("DEPOSIT") || v.includes("RECEIV")) {
      return "CR";
    }
    // Sometimes column contains values like "Dr"/"Cr" within a combined header; attempt to parse tokens
    if (/(^|\b)DR(\b|$)/.test(v)) return "DR";
    if (/(^|\b)CR(\b|$)/.test(v)) return "CR";
    return null;
  },

  extractCounterparty(
    description: string,
    bankPreset: string = "generic"
  ): string | undefined {
    console.log(`Extracting counterparty from description:`, description, bankPreset);
    if (
      !description ||
      typeof description !== "string" ||
      !description.trim()
    ) {
      return undefined;
    }

    // Clean up description - normalize whitespace
    const cleanDesc = description.replace(/\s+/g, " ").trim().toLowerCase();

    // Use custom regex pattern if provided
    if (this.customRegexPattern) {
      const match = cleanDesc.match(this.customRegexPattern);
      if (match && match[1]) {
        const extracted = match[1].trim();
        return extracted;
      }
      return undefined;
    }

    // Bank-specific regex patterns based on Python implementation
    const bankPatterns: Record<string, RegExp[]> = {
      generic: [
        /UPI\/([^\/]+)\/[^\/]+\/?/i, // UPI/COUNTERPARTY/number/optional
        /(?:NEFT|RTGS)\/[^\/]+\/([^\/\n]+)\/?/i,
        /POS\/([^\/\n]+)\/?/i,
        /IMPS(?:-[A-Z]+)?\/[^\/]+\/[^\/]+\/([^\/\n]+)\/?/i,
        /(?:.*\/)?([^\/\n]+)$/i, // General fallback: last segment after slash
      ],
      axis: [
        // INB/RTGS/{ref}/{name}/... (MOST SPECIFIC FIRST)
        /^INB\/RTGS\/[^\/]+\/([^\/]+)\//i,
        /^INB\/RTGS\/[^\/]+\/([^\/]+)$/i,
        // INB/NEFT/{ref}/{name}/...
        /^INB\/NEFT\/[^\/]+\/([^\/]+)\//i,
        /^INB\/NEFT\/[^\/]+\/([^\/]+)$/i,
        // INB/IFT/{name}/TPARTY TRANSFER
        /^INB\/IFT\/([^\/]+)\/TPARTY TRANSFER/i,
        // RTGS patterns
        /^RTGS\/[^\/]+\/[^\/]+\/([^\/]+)\/[^\/]+/i,
        /^RTGS\/[^\/]+\/[^\/]+\/([^\/]+)$/i,
        /^RTGS\/[^\/]+\/([^\/]+)\/[^\/]+/i,
        /^RTGS\/[^\/]+\/([^\/]+)$/i,
        // NEFT patterns
        /^NEFT\/RETURN\/[^\/]+\/[^\/]+\/([^\/]+)/i,
        /^NEFT\/[^\/]+\/([^\/]+)\/[^\/]+\/\/ATTN\/\/INB/i,
        /^NEFT\/IC\/[^\/]+\/([^\/]+)/i,
        /^NEFT\/[^\/]+\/([^\/]+)\/[^\/]+\/\/URGENT\//i,
        // IMPS patterns
        /^IMPS\/P2A\/[^\/]+\/([^\/]+)\/[^\/]+\//i,
        /^IMPS\/P2A\/[^\/]+\/\/[^\/]+\/[^\/]+\/([^\/]+)/i,
        /^IMPS\/P2A\/[^\/]+\/\/([^\/]+)/i,
        // GENERAL INB PATTERN (NOW LAST)
        /^INB\/[^\/]+\/([^\/]+)\//i,
        /^INB\/[^\/]+\/\/([^\/]+)/i,
        // Other patterns
        /^DD ISSUED\/[^\/]+\/([^,]+), PAYABLE AT/i,
        /^ICONN REF\/[^\/]+\/([^\/]+)\//i,
        /^BY CASH DEPOSIT[^\/]+\/[^\/]+\/[^\/]+\/[^\/]+\/([^\/]+)$/i,
        /^SAK\/CASH WDL\/[^\/]+\/[^\/]+\/[^\/]+\/WD BY(.+)$/i,
        /^BRN-CLG-CHQ PAID TO ([^ \/]+)/i,
      ],
      federal: [
        /^(?:RTG|NFT|FTIMPS|IFN\/CHRG|CHRG|dd\sissue|DD:|BBYT:|TFR:?)\/?:?\s*(?:IFI\/\d+\/)?([^\/,:\n]+)/i,
        /^(ALLOYS?|LLP|BANK|ICICI|SBI|HDFC|PAYMENT?|Pymt|SELF)$/i,
        /^(?:TFR:|ID\s*:\s*\[[^\]]*\]\s*:|BillId\s*:\s*\[[^\]]*\]\s*:)\s*"?([^",:\n\/]+?)"?$/i,
        /^FT?\s*IMPS\/IFI\/\d+\/([^\/]+)\/SUPP/i,
      ],
      indian: [
        /\/[A-Z]{3,}\/([^\/-]+)(?:\/-)?$/i,
        /RTGS\s+\S+\s+(.+)$/i,
        /^TRANSFER (?:TO|FROM) \d+ [^\/]*?\/P[Aa]y\/([^\/\r\n"]+?)(?:\/|$)/i,
        /^TRANSFER (?:TO|FROM) \d+ [^\/]*?\/IMPS\/P2A\/\d+\/ \/P[Aa]y\/([^\/]+?)\s*\/BRANCH/i,
        /\s([A-Z][A-Z0-9 &]+)$/,
        /FROM (\d{8,15})$/i,
        /^TRANSFER TO (\d{8,15})/i,
        /Paid to SELF \/BRANCH\s*:\s*([^\/]+)/i,
      ],
      jammu_and_kashmir_bank: [
        /^UPI\/[A-Z]+\/\d+\/[CD]R\/([^\/]+)\/P2M/i, // UPI
        /^NEFT-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])/i, // NEFT
        /^RTGS-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])/i, // RTGS
        /^mTFR\/\d+\/([A-Za-z][A-Za-z\s]*[A-Za-z])/i, // IMPS/mTFR
      ],
    };

    // Get patterns for the selected bank preset
    const patterns = bankPatterns[bankPreset] || bankPatterns.generic;
    console.log(`Using patterns for bank preset "${bankPreset}":`, patterns);

    for (const pattern of patterns) {
      const match = cleanDesc.match(pattern);
    
      console.log(`Trying pattern:`, pattern, `Match:`, match);
      if (match && match[1]) {
        const extracted = match[1].trim();

        // Filter out invalid extractions
        return extracted;
      }
    }

    return undefined;
  },



  buildExtractionResult(
    transactions: ExtractedTransaction[],
    errors: string[]
  ): ExtractionResult {
    let totalCredits = 0;
    let totalDebits = 0;
    let minDate = "";
    let maxDate = "";

    transactions.forEach((tx) => {
      if (tx.direction === "CR") {
        totalCredits += tx.amount;
      } else {
        totalDebits += tx.amount;
      }

      if (!minDate || tx.tx_date < minDate) {
        minDate = tx.tx_date;
      }
      if (!maxDate || tx.tx_date > maxDate) {
        maxDate = tx.tx_date;
      }
    });

    return {
      transactions,
      errors,
      summary: {
        totalTransactions: transactions.length,
        totalCredits,
        totalDebits,
        dateRange: {
          from: minDate,
          to: maxDate,
        },
      },
    };
  },

  async testRegexPattern(
    file: File,
    regexPattern: string,
    bankPreset: string = "generic"
  ): Promise<{ extracted: number; failed: number }> {
    try {
      // Save the current bank preset and custom regex
      const originalBankPreset = this.bankPreset;
      const originalCustomRegex = this.customRegexPattern;
      
      // Set the new values for testing
      this.setBankPreset(bankPreset);
      this.setCustomRegexPattern(regexPattern);
      
      // Extract transactions using the preview method
      const result = await this.previewTransactions(file, bankPreset);
      
      // Restore the original values
      this.setBankPreset(originalBankPreset);
      this.customRegexPattern = originalCustomRegex;
      
      // Return the counts
      return {
        extracted: result.transactions.length,
        failed: result.errors.length
      };
    } catch (error) {
      console.error("Error testing regex pattern:", error);
      return { extracted: 0, failed: 0 };
    }
  },

  testRegexOnDescriptions(
    descriptions: string[],
    regexPattern: string
  ): { extracted: number; failed: number } {
    try {
      // Create regex pattern
      const pattern = new RegExp(regexPattern, 'i');
      
      let extracted = 0;
      let failed = 0;
      
      // Test pattern on each description
      for (const description of descriptions) {
        try {
          const match = description.match(pattern);
          if (match && match[1]) {
            const extractedName = match[1].trim();
          
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
        }
      }
      
      return { extracted, failed };
    } catch (error) {
      console.error("Invalid regex pattern:", error);
      return { extracted: 0, failed: 0 };
    }
  },
};