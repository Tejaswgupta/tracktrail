import {
  ColumnMapping,
  CSVValidationResult,
  validateCSVFile,
} from "@/utils/csvValidator";
import { createClient } from "@/utils/supabase/client";
import { statementsService, transactionsService } from "./database";
import { transactionExtractorService } from "./transactionExtractor";

const supabase = createClient();

/**
 * Clean cell values by removing HTML tags, styling, and normalizing whitespace
 */
function cleanCellValue(cellValue: any): string {
  if (cellValue === null || cellValue === undefined) {
    return '';
  }

  // Convert to string
  const stringValue = String(cellValue);

  // Remove HTML tags
  const withoutHTML = stringValue.replace(/<[^>]*>/g, '');

  // Remove common styling artifacts and extra whitespace
  const cleaned = withoutHTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface StatementUploadData {
  accountId: string;
  file: File;
  statementPeriodFrom?: string;
  statementPeriodTo?: string;
  columnMapping?: ColumnMapping;
  bankPreset?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export const fileUploadService = {
  // Validate CSV file structure
  async validateCSV(file: File): Promise<CSVValidationResult> {
    if (file.type !== "text/csv") {
      throw new Error("File must be a CSV file");
    }

    return await validateCSVFile(file);
  },

  // Validate Excel file structure
  async validateExcel(file: File): Promise<CSVValidationResult> {
    const allowedTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];

    if (!allowedTypes.includes(file.type)) {
      throw new Error("File must be an Excel file (.xlsx or .xls)");
    }

    try {
      // Dynamically import xlsx
      const XLSX = await import('xlsx');

      // Read the Excel file
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });

      // Get the first sheet
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("Excel file has no sheets");
      }

      const worksheet = workbook.Sheets[firstSheetName];

      // Convert sheet to JSON first to clean the data, then to CSV
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

      // Clean HTML tags and styling from cell values
      const cleanedData = jsonData.map((row: any) =>
        Array.isArray(row) ? row.map(cell => cleanCellValue(cell)) : row
      );

      // Convert cleaned data back to CSV
      const csvText = XLSX.utils.aoa_to_sheet(cleanedData) ?
        XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(cleanedData)) : '';

      if (!csvText || !csvText.trim()) {
        throw new Error("Excel sheet is empty");
      }

      // Create a temporary CSV File object for validation
      const csvBlob = new Blob([csvText], { type: 'text/csv' });
      const csvFile = new File([csvBlob], 'temp.csv', { type: 'text/csv' });

      // Validate using existing CSV validation logic
      return await validateCSVFile(csvFile);
    } catch (error) {
      console.error("Excel validation error:", error);
      throw new Error(
        error instanceof Error ? error.message : "Failed to validate Excel file"
      );
    }
  },

  async uploadStatement({
    accountId,
    file,
    statementPeriodFrom,
    statementPeriodTo,
    columnMapping,
    bankPreset,
    onProgress,
  }: StatementUploadData) {
    // Get current user from Supabase auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error("Authentication required");
    }

    try {
      // Validate file type
      const allowedTypes = [
        "application/pdf",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      if (!allowedTypes.includes(file.type)) {
        throw new Error(
          "Invalid file type. Please upload PDF, CSV, or Excel files only."
        );
      }

      // Validate file size (max 50MB)
      const maxSize = 50 * 1024 * 1024;
      if (file.size > maxSize) {
        throw new Error("File size too large. Maximum allowed size is 50MB.");
      }

      // Generate unique file path
      const fileExt = file.name.split(".").pop();
      const fileName = `${accountId}/${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${fileExt}`;

      // Upload file to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("bank-statements")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get file type from MIME type
      const getFileType = (
        mimeType: string
      ): "pdf" | "csv" | "xlsx" | "xls" => {
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
            return "pdf"; // fallback
        }
      };

      // Create database record
      const statement = await statementsService.create({
        account_id: accountId,
        file_name: file.name,
        file_type: getFileType(file.type),
        file_size: file.size,
        statement_period_from: statementPeriodFrom,
        statement_period_to: statementPeriodTo,
        processing_status: "processing",
        processing_progress: 0,
        transaction_count: 0,
        uploaded_by: user.id,
      });

      if (onProgress) {
        onProgress({
          loaded: file.size * 0.2,
          total: file.size,
          percentage: 20,
        });
      }

      // Extract transactions from the uploaded file
      try {
        console.log("Starting transaction extraction for account:", accountId);

        // Get account details to find entity_id
        const { data: account, error: accountError } = await supabase
          .from("accounts")
          .select("entity_id")
          .eq("account_id", accountId)
          .single();

        if (accountError || !account) {
          console.error("Account lookup error:", accountError);
          throw new Error("Account not found");
        }

        console.log("Found account with entity_id:", account.entity_id);

        // Update progress to show extraction started (non-blocking)
        try {
          await statementsService.updateProcessingStatus(
            statement.statement_id,
            "processing",
            30
          );
        } catch (e) {
          console.warn("Could not update status (non-critical):", e);
        }

        if (onProgress) {
          onProgress({
            loaded: file.size * 0.3,
            total: file.size,
            percentage: 30,
          });
        }

        console.log(
          "Extracting transactions from file:",
          file.name,
          "type:",
          file.type,
          "bank preset:",
          bankPreset
        );

        // Set bank preset if provided
        if (bankPreset) {
          transactionExtractorService.setBankPreset(bankPreset);
        }

        const extractionResult =
          await transactionExtractorService.extractFromFile(
            file,
            accountId,
            account.entity_id,
            columnMapping
          );

        console.log("Extraction result:", {
          transactionCount: extractionResult.transactions.length,
          errorCount: extractionResult.errors.length,
          summary: extractionResult.summary,
        });

        // Update progress after extraction (non-blocking)
        try {
          await statementsService.updateProcessingStatus(
            statement.statement_id,
            "processing",
            60
          );
        } catch (e) {
          console.warn("Could not update status (non-critical):", e);
        }

        if (onProgress) {
          onProgress({
            loaded: file.size * 0.6,
            total: file.size,
            percentage: 60,
          });
        }

        // Save extracted transactions to database
        if (extractionResult.transactions.length > 0) {
          console.log(
            "Saving",
            extractionResult.transactions.length,
            "transactions to database"
          );

          // Ensure all dates are properly formatted before inserting
          const transactionsToInsert = extractionResult.transactions.map(
            (tx) => {
              // Validate and re-parse the date to ensure it's in proper ISO format

              return {
                account_id: accountId,
                entity_id: account.entity_id,
                statement_id: statement.statement_id,
                tx_date: tx.tx_date,
                description: tx.description || "",
                amount: tx.amount,
                direction: tx.direction,
                counterparty_merged: tx.counterparty_merged,
                balance: tx.balance,
                original_index: tx.original_index,
                created_by: user?.id || "",
              };
            }
          );

          const savedTransactions = await transactionsService.createBatch(
            transactionsToInsert
          );
          console.log(
            "Successfully saved",
            savedTransactions.length,
            "transactions"
          );

          // Update progress after saving transactions (non-blocking)
          try {
            await statementsService.updateProcessingStatus(
              statement.statement_id,
              "processing",
              90
            );
          } catch (e) {
            console.warn("Could not update status (non-critical):", e);
          }

          if (onProgress) {
            onProgress({
              loaded: file.size * 0.9,
              total: file.size,
              percentage: 90,
            });
          }
        }

        // Update statement with final status and transaction count (non-blocking)
        try {
          await statementsService.updateProcessingStatus(
            statement.statement_id,
            extractionResult.errors.length > 0 ? "completed" : "completed",
            100
          );
        } catch (e) {
          console.warn("Could not update status (non-critical):", e);
        }

        // Update transaction count (non-blocking, may fail due to CORS)
        try {
          const { error: updateError } = await supabase
            .from("bank_statements")
            .update({ transaction_count: extractionResult.transactions.length })
            .eq("statement_id", statement.statement_id);

          if (updateError) {
            console.warn("Failed to update transaction count:", updateError);
          }
        } catch (error) {
          console.warn("Could not update transaction count (non-critical):", error);
        }

        if (onProgress) {
          onProgress({ loaded: file.size, total: file.size, percentage: 100 });
        }

        return {
          ...statement,
          processing_status: "completed" as const,
          processing_progress: 100,
          transaction_count: extractionResult.transactions.length,
          extraction_summary: extractionResult.summary,
          extraction_errors: extractionResult.errors,
        };
      } catch (extractionError) {
        console.error("Transaction extraction failed:", extractionError);

        // Update statement status to error
        await statementsService.updateProcessingStatus(
          statement.statement_id,
          "error",
          100
        );

        // Still return the statement record, but with error status
        return {
          ...statement,
          processing_status: "error" as const,
          processing_progress: 100,
          extraction_error:
            extractionError instanceof Error
              ? extractionError.message
              : "Unknown extraction error",
        };
      }
    } catch (error) {
      console.error("Upload error:", error);
      throw error;
    }
  },

  async deleteStatement(filePath: string) {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("bank-statements")
        .remove([filePath]);

      if (storageError) {
        console.warn("Failed to delete file from storage:", storageError);
      }

      // Delete from database (this would need to be implemented in statementsService)
      // await statementsService.delete(statementId);
    } catch (error) {
      console.error("Delete error:", error);
      throw error;
    }
  },

  getFileUrl(filePath: string) {
    const { data } = supabase.storage
      .from("bank-statements")
      .getPublicUrl(filePath);

    return data.publicUrl;
  },
};
