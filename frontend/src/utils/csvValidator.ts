export interface RequiredColumns {
  DATE: string;
  DESCRIPTION: string;
  DEBIT: string;
  CREDIT: string;
  AMOUNT?: string; // Optional unified amount column
  DIRECTION?: string; // Optional direction (Dr/Cr) column when using unified amount
}

export interface CSVValidationResult {
  isValid: boolean;
  headers: string[];
  requiredColumns: RequiredColumns;
  missingColumns: string[];
  suggestedMapping?: Record<string, string>;
  previewData?: Record<string, string>[];
}

export interface ColumnMapping {
  DATE: string;
  DESCRIPTION: string;
  DEBIT: string;
  CREDIT: string;
  AMOUNT?: string;
  DIRECTION?: string;
}

/**
 * Parse CSV file and return headers and preview data
 */
export async function parseCSVFile(file: File): Promise<{
  headers: string[];
  data: Record<string, string>[];
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split("\n").filter((line) => line.trim());

        if (lines.length === 0) {
          reject(new Error("CSV file is empty"));
          return;
        }

        // Parse headers
        const headers = parseCSVLine(lines[0]);

        // Parse first few rows for preview (max 5 rows)
        const data: Record<string, string>[] = [];
        const previewRows = Math.min(5, lines.length - 1);

        for (let i = 1; i <= previewRows; i++) {
          if (lines[i]) {
            const values = parseCSVLine(lines[i]);
            const row: Record<string, string> = {};

            headers.forEach((header, index) => {
              row[header] = values[index] || "";
            });

            data.push(row);
          }
        }

        resolve({ headers, data });
      } catch (error) {
        reject(new Error("Failed to parse CSV file"));
      }
    };

    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Validate CSV columns against required structure
 */
export function validateCSVColumns(headers: string[]): CSVValidationResult {
  const normalizedHeaders = headers.map((h) => h.toUpperCase().trim());

  // Required column patterns - ordered by priority (most specific first)
  const requiredPatterns = {
    DATE: [
      "DATE",
      "TXN DATE",
      "TRANSACTION DATE",
      "VALUE DATE",
      "POSTING DATE",
      "TXN_DATE",
      "TRANSACTION_DATE",
      "VALUE_DATE",
      "POSTING_DATE",
    ],
    DESCRIPTION: [
      "DESCRIPTION",
      "PARTICULARS",
      "NARRATION",
      "DETAILS",
      "TRANSACTION DETAILS",
      "TXN DETAILS",
      "TRANSACTION_DETAILS",
      "TXN_DETAILS",
    ],
    DEBIT: [
      "DEBIT",
      "DR",
      "DEBIT AMOUNT",
      "WITHDRAWAL",
      "OUTGOING",
      "DEBIT_AMOUNT",
      "DR_AMOUNT",
    ],
    CREDIT: [
      "CREDIT",
      "CR",
      "CREDIT AMOUNT",
      "DEPOSIT",
      "INCOMING",
      "CREDIT_AMOUNT",
      "CR_AMOUNT",
    ],
    AMOUNT: [
      "AMOUNT",
      "TRANSACTION AMOUNT",
      "TXN AMOUNT",
      "TRANSACTION_AMOUNT",
      "TXN_AMOUNT",
    ],
    DIRECTION: [
      "DR/CR",
      "DR - CR",
      "DR CR",
      "CR/DR",
      "CREDIT/DEBIT",
      "DEBIT/CREDIT",
      "TYPE",
      "TRANSACTION TYPE",
      "TXN TYPE",
      "DR_CR",
      "DRCR",
    ],
  };

  const foundColumns: Partial<RequiredColumns> = {};
  const suggestedMapping: Record<string, string> = {};

  // Try to find exact matches first
  for (const [required, patterns] of Object.entries(requiredPatterns)) {
    for (const pattern of patterns) {
      const matchIndex = normalizedHeaders.findIndex((h) => h === pattern);
      if (matchIndex !== -1) {
        foundColumns[required as keyof RequiredColumns] = headers[matchIndex];
        suggestedMapping[required] = headers[matchIndex];
        break;
      }
    }
  }

  // Try partial matches for missing columns with better precision
  for (const [required, patterns] of Object.entries(requiredPatterns)) {
    if (!foundColumns[required as keyof RequiredColumns]) {
      for (const pattern of patterns) {
        const matchIndex = normalizedHeaders.findIndex((h) => {
          // For DATE column, be more specific to avoid matching NO_DATE, UPDATE_DATE, etc.
          if (required === "DATE") {
            return (
              h === pattern ||
              h.endsWith(" DATE") ||
              h.startsWith("DATE ") ||
              (h.includes("DATE") &&
                !h.includes("NO_DATE") &&
                !h.includes("UPDATE_DATE") &&
                !h.includes("CREATE_DATE"))
            );
          }
          // For other columns, consider non-alphanumeric boundaries around the pattern.
          // This handles headers like "AMOUNT(INR)", "TXN_AMOUNT", "AMOUNT-INR", etc.
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const boundaryRegex = new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`);
          return boundaryRegex.test(h);
        });
        if (matchIndex !== -1) {
          foundColumns[required as keyof RequiredColumns] = headers[matchIndex];
          suggestedMapping[required] = headers[matchIndex];
          break;
        }
      }
    }
  }

  // Check if we have the minimum required columns
  const hasDate = !!foundColumns.DATE;
  const hasDescription = !!foundColumns.DESCRIPTION;
  const hasDebit = !!foundColumns.DEBIT;
  const hasCredit = !!foundColumns.CREDIT;
  const hasAmount = !!foundColumns.AMOUNT;
  const hasDirection = !!foundColumns.DIRECTION;

  // Valid if we have DATE, DESCRIPTION, and either (DEBIT+CREDIT) or AMOUNT
  const isValid =
    hasDate && hasDescription && ((hasDebit && hasCredit) || hasAmount);

  const missingColumns: string[] = [];
  if (!hasDate) missingColumns.push("DATE");
  if (!hasDescription) missingColumns.push("DESCRIPTION");
  if (!hasAmount && !hasDebit) missingColumns.push("DEBIT");
  if (!hasAmount && !hasCredit) missingColumns.push("CREDIT");
  // Note: When using unified AMOUNT, DIRECTION is recommended but not strictly required

  return {
    isValid,
    headers,
    requiredColumns: foundColumns as RequiredColumns,
    missingColumns,
    suggestedMapping:
      Object.keys(suggestedMapping).length > 0 ? suggestedMapping : undefined,
  };
}

/**
 * Validate and parse CSV file completely
 */
export async function validateCSVFile(
  file: File
): Promise<CSVValidationResult> {
  const { headers, data } = await parseCSVFile(file);
  const validation = validateCSVColumns(headers);

  return {
    ...validation,
    previewData: data,
  };
}
