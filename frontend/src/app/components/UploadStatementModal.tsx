"use client";

import { fileUploadService, type UploadProgress } from "@/services/fileUpload";
import { transactionExtractorService, type ExtractionResult } from "@/services/transactionExtractor";
import { accountsService } from "@/services/database";
import { ColumnMapping, CSVValidationResult } from "@/utils/csvValidator";
import { BANK_PRESETS, inferBankPresetFromBankName, type BankPreset } from "@/constants/banks";
import { useState, useEffect } from "react";
import BankSelector from "./BankSelector";
import CSVColumnMapper from "./CSVColumnMapper";
import PreviewDataDisplay from "./PreviewDataDisplay";

interface UploadStatementModalProps {
  accountId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

export default function UploadStatementModal({
  accountId,
  onClose,
  onUploadComplete,
}: UploadStatementModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [statementPeriodFrom, setStatementPeriodFrom] = useState("");
  const [statementPeriodTo, setStatementPeriodTo] = useState("");
  const [selectedBank, setSelectedBank] = useState<BankPreset>("generic");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);

  // CSV validation states
  const [showColumnMapper, setShowColumnMapper] = useState(false);
  const [csvValidation, setCsvValidation] =
    useState<CSVValidationResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(
    null
  );

  // Fetch account details and infer bank preset on component mount
  useEffect(() => {
    const fetchAccountAndInferBank = async () => {
      if (!accountId) return;

      setIsLoadingAccount(true);
      try {
        const account = await accountsService.getById(accountId);
        if (account?.bank_name) {
          const inferredBankPreset = inferBankPresetFromBankName(account.bank_name);
          console.log(`Inferred bank preset "${inferredBankPreset}" from bank name "${account.bank_name}"`);
          setSelectedBank(inferredBankPreset);
        }
      } catch (error) {
        console.error("Error fetching account details:", error);
      } finally {
        setIsLoadingAccount(false);
      }
    };

    fetchAccountAndInferBank();
  }, [accountId]);

  const handleBankChange = (bankPreset: BankPreset) => {
    setSelectedBank(bankPreset);
    // Reset preview when bank changes
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      setCsvValidation(null);
      setColumnMapping(null);
      setShowColumnMapper(false);

      // If it's a CSV file, validate it immediately
      if (selectedFile.type === "text/csv") {
        try {
          console.log("Validating CSV file:", selectedFile.name);
          const validation = await fileUploadService.validateCSV(selectedFile);
          console.log("CSV validation result:", validation);
          setCsvValidation(validation);

          if (!validation.isValid) {
            console.log("CSV validation failed, showing column mapper");
            setShowColumnMapper(true);
          } else {
            console.log("CSV validation passed");
            // Automatically use the suggested mapping if available
            if (validation.suggestedMapping) {
              console.log(
                "Using suggested mapping:",
                validation.suggestedMapping
              );

              // Validate that the suggested mapping has all required properties
              const mapping = validation.suggestedMapping;
              if (
                mapping.DATE &&
                mapping.DESCRIPTION &&
                ((mapping.DEBIT && mapping.CREDIT) || mapping.AMOUNT)
              ) {
                setColumnMapping({
                  DATE: mapping.DATE,
                  DESCRIPTION: mapping.DESCRIPTION,
                  DEBIT: mapping.DEBIT,
                  CREDIT: mapping.CREDIT,
                  AMOUNT: mapping.AMOUNT,
                  DIRECTION: mapping.DIRECTION,
                });
              }
            }
          }
        } catch (error) {
          console.error("CSV validation error:", error);
          setError(
            error instanceof Error ? error.message : "Failed to validate CSV"
          );
        }
      } else if (selectedFile.type === "application/pdf") {
        // For PDFs, run a preview to get headers and suggested mapping
        try {
          console.log("Previewing PDF columns:", selectedFile.name);
          const validation = await transactionExtractorService.previewPDFColumns(
            selectedFile
          );
          console.log("PDF preview validation result:", validation);
          setCsvValidation(validation);

          if (!validation.isValid) {
            console.log("PDF column detection incomplete, showing column mapper");
            setShowColumnMapper(true);
          } else if (validation.suggestedMapping) {
            const mapping = validation.suggestedMapping;
            if (
              mapping.DATE &&
              mapping.DESCRIPTION &&
              ((mapping.DEBIT && mapping.CREDIT) || mapping.AMOUNT)
            ) {
              setColumnMapping({
                DATE: mapping.DATE,
                DESCRIPTION: mapping.DESCRIPTION,
                DEBIT: mapping.DEBIT,
                CREDIT: mapping.CREDIT,
                AMOUNT: mapping.AMOUNT,
                DIRECTION: mapping.DIRECTION,
              });
            }
          }
        } catch (error) {
          console.error("PDF preview error:", error);
          setError(
            error instanceof Error
              ? error.message
              : "Failed to preview PDF columns"
          );
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    if (!selectedBank) {
      setError("Please select a bank type");
      return;
    }

    // For CSV/PDF files, check if column mapping is required when validation failed
    if (
      (file.type === "text/csv" || file.type === "application/pdf") &&
      csvValidation &&
      !csvValidation.isValid &&
      !columnMapping
    ) {
      setError("Please map the columns before uploading");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(null);

    try {
      await fileUploadService.uploadStatement({
        accountId,
        file,
        statementPeriodFrom: statementPeriodFrom || undefined,
        statementPeriodTo: statementPeriodTo || undefined,
        columnMapping: columnMapping || undefined,
        bankPreset: selectedBank,
        onProgress: setUploadProgress,
      });

      onUploadComplete();
      onClose();
    } catch (error) {
      console.error("Upload failed:", error);
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
    }
  };

  const handleColumnMappingComplete = (mapping: ColumnMapping) => {
    setColumnMapping(mapping);
    setShowColumnMapper(false);
    setError(null);
  };

  const handleColumnMappingCancel = () => {
    setShowColumnMapper(false);
    setFile(null);
    setCsvValidation(null);
    setColumnMapping(null);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "pdf":
        return (
          <svg
            className="w-8 h-8 text-red-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "csv":
        return (
          <svg
            className="w-8 h-8 text-green-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              clipRule="evenodd"
            />
          </svg>
        );
      case "xlsx":
      case "xls":
        return (
          <svg
            className="w-8 h-8 text-blue-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"
              clipRule="evenodd"
            />
          </svg>
        );
      default:
        return (
          <svg
            className="w-8 h-8 text-gray-500"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
              clipRule="evenodd"
            />
          </svg>
        );
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-lg shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            Upload Bank Statement
          </h3>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {showColumnMapper && csvValidation ? (
          <CSVColumnMapper
            validationResult={csvValidation}
            onMappingComplete={handleColumnMappingComplete}
            onCancel={handleColumnMappingCancel}
            initialMapping={columnMapping || undefined}
          />
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* File Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bank Statement File *
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md hover:border-gray-400 transition-colors">
                <div className="space-y-1 text-center">
                  {file ? (
                    <div className="flex flex-col items-center">
                      {getFileIcon(file.name)}
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-900">
                          {file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFile(null)}
                        className="mt-2 text-xs text-red-600 hover:text-red-800"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <>
                      <svg
                        className="mx-auto h-12 w-12 text-gray-400"
                        stroke="currentColor"
                        fill="none"
                        viewBox="0 0 48 48"
                      >
                        <path
                          d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <div className="flex text-sm text-gray-600">
                        <label
                          htmlFor="file-upload"
                          className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                        >
                          <span>Upload a file</span>
                          <input
                            id="file-upload"
                            name="file-upload"
                            type="file"
                            className="sr-only"
                            accept=".pdf,.csv,.xlsx,.xls"
                            onChange={handleFileChange}
                            disabled={isUploading}
                          />
                        </label>
                        <p className="pl-1">or drag and drop</p>
                      </div>
                      <p className="text-xs text-gray-500">
                        PDF, CSV, Excel files up to 50MB
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Bank Selection */}
            <BankSelector
              selectedBank={selectedBank}
              onBankChange={handleBankChange}
              disabled={isUploading || isLoadingAccount}
              // extractedData={previewData?.transactions || null}
            />

            {/* Bank inference info */}
            {isLoadingAccount && (
              <div className="rounded-md bg-blue-50 p-4">
                <div className="flex">
                  <svg
                    className="animate-spin h-5 w-5 text-blue-400 mr-2"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  <div className="ml-2">
                    <p className="text-sm text-blue-800">
                      Automatically detecting bank type from account information...
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!isLoadingAccount && selectedBank !== "generic" && (
              <div className="rounded-md bg-green-50 p-4">
                <div className="flex">
                  <svg
                    className="h-5 w-5 text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-green-800">
                      Bank type automatically detected: {selectedBank && BANK_PRESETS[selectedBank]}
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      You can change this if needed
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Statement Period */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="periodFrom"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Statement Period From
                </label>
                <input
                  type="date"
                  id="periodFrom"
                  value={statementPeriodFrom}
                  onChange={(e) => setStatementPeriodFrom(e.target.value)}
                  disabled={isUploading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label
                  htmlFor="periodTo"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Statement Period To
                </label>
                <input
                  type="date"
                  id="periodTo"
                  value={statementPeriodTo}
                  onChange={(e) => setStatementPeriodTo(e.target.value)}
                  disabled={isUploading}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Upload Progress */}
            {uploadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percentage}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <svg
                    className="h-5 w-5 text-red-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!file || isUploading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  "Upload Statement"
                )}
              </button>
            </div>
          </form>
        )}

        {/* Validation Success Message for CSV/PDF */}
        {(file?.type === "text/csv" || file?.type === "application/pdf") &&
          csvValidation?.isValid &&
          !showColumnMapper && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="flex items-start justify-between">
                <div className="flex">
                  <svg
                    className="h-5 w-5 text-green-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-green-800">
                      File format validated successfully! All required columns found.
                    </p>
                    <p className="text-xs text-green-700 mt-1">
                      A column mapping was auto-applied. You can adjust it if needed.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowColumnMapper(true)}
                  className="ml-4 inline-flex items-center px-3 py-1.5 border border-green-300 rounded-md text-xs font-medium text-green-800 bg-white hover:bg-green-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                >
                  Change mapping
                </button>
              </div>
            </div>
          )}

        {/* Column Mapping Success Message */}
            {columnMapping && (
              <div className="rounded-md bg-blue-50 p-4">
                <div className="flex">
                  <svg
                    className="h-5 w-5 text-blue-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <div className="ml-3">
                    <p className="text-sm text-blue-800">
                      Column mapping configured successfully! Ready to upload.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Preview Data */}
              <PreviewDataDisplay 
              file={file}
              bankPreset={selectedBank}
              columnMapping={columnMapping}
              csvValidation={csvValidation}
              />

           
      </div>
    </div>
  );
}
