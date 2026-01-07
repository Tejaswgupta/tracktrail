"use client";

import {
  inferBankPresetFromBankName,
  type BankPreset,
} from "@/constants/banks";
import { accountsService } from "@/services/database";
import { fileUploadService, type UploadProgress } from "@/services/fileUpload";
import { transactionExtractorService } from "@/services/transactionExtractor";
import { ColumnMapping, CSVValidationResult } from "@/utils/csvValidator";
import { useEffect, useState } from "react";
import ProgressStepper from "./upload-wizard/ProgressStepper";
import Step1FileUpload from "./upload-wizard/Step1FileUpload";
import Step2ColumnMapping from "./upload-wizard/Step2ColumnMapping";
import Step3BankSelection from "./upload-wizard/Step3BankSelection";
import Step4Review from "./upload-wizard/Step4Review";

interface UploadStatementModalWizardProps {
  accountId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

const STEPS = [
  { id: 1, name: "File", description: "Select file" },
  { id: 2, name: "Columns", description: "Map columns" },
  { id: 3, name: "Bank", description: "Choose bank" },
  { id: 4, name: "Review", description: "Review & submit" },
];

export default function UploadStatementModalWizard({
  accountId,
  onClose,
  onUploadComplete,
}: UploadStatementModalWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
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

  const [csvValidation, setCsvValidation] =
    useState<CSVValidationResult | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(
    null
  );
  const [deletedRows, setDeletedRows] = useState<number[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  useEffect(() => {
    const fetchAccountAndInferBank = async () => {
      if (!accountId) return;

      setIsLoadingAccount(true);
      try {
        const account = await accountsService.getById(accountId);
        if (account?.bank_name) {
          const inferredBankPreset = inferBankPresetFromBankName(
            account.bank_name
          );
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

  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setError(null);
    setCsvValidation(null);
    setColumnMapping(null);
    setIsProcessingFile(false);

    if (!selectedFile) return;

    if (selectedFile.type === "text/csv") {
      setIsProcessingFile(true);
      try {
        const validation = await fileUploadService.validateCSV(selectedFile);
        setCsvValidation(validation);

        if (validation.isValid && validation.suggestedMapping) {
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
        console.error("CSV validation error:", error);
        setError(
          error instanceof Error ? error.message : "Failed to validate CSV"
        );
      } finally {
        setIsProcessingFile(false);
      }
    } else if (
      selectedFile.type ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      selectedFile.type === "application/vnd.ms-excel"
    ) {
      setIsProcessingFile(true);
      try {
        const validation = await fileUploadService.validateExcel(selectedFile);
        setCsvValidation(validation);

        if (validation.isValid && validation.suggestedMapping) {
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
        console.error("Excel validation error:", error);
        setError(
          error instanceof Error ? error.message : "Failed to validate Excel"
        );
      } finally {
        setIsProcessingFile(false);
      }
    } else if (selectedFile.type === "application/pdf") {
      setIsProcessingFile(false);
    }
  };

  const handleProcessPDF = async (file: File) => {
    setIsProcessingFile(true);
    setError(null);

    try {
      const validation = await transactionExtractorService.previewPDFColumns(
        file
      );
      setCsvValidation(validation);

      if (validation.isValid && validation.suggestedMapping) {
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
      console.error("PDF processing error:", error);
      setError(
        error instanceof Error ? error.message : "Failed to process PDF"
      );
    } finally {
      setIsProcessingFile(false);
    }
  };

  const handleColumnMappingComplete = (
    mapping: ColumnMapping,
    rowsToDelete: number[]
  ) => {
    setColumnMapping(mapping);
    setDeletedRows(rowsToDelete);
    setCurrentStep(3);
  };

  const handleBankChange = (bankPreset: BankPreset) => {
    setSelectedBank(bankPreset);
  };

  const handleSubmit = async () => {
    if (!file) {
      setError("Please select a file to upload");
      return;
    }

    if (!selectedBank) {
      setError("Please select a bank type");
      return;
    }

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

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return !!file && !isProcessingFile;
      case 2:
        // For PDFs, we need column mapping after processing
        if (file && file.type === "application/pdf") {
          return !!columnMapping;
        }
        return !!columnMapping;
      case 3:
        return !!selectedBank;
      case 4:
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep < 4) {
      // If we have a PDF file and moving from step 1, process it first
      if (currentStep === 1 && file && file.type === "application/pdf") {
        await handleProcessPDF(file);
      }
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleEdit = (step: number) => {
    setCurrentStep(step);
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-6 border w-full max-w-4xl shadow-lg rounded-md bg-white mb-10">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-medium text-gray-900">
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

        {/* Progress Stepper */}
        <div className="mb-12">
          <ProgressStepper steps={STEPS} currentStep={currentStep} />
        </div>

        {/* Step Content */}
        <div className="min-h-[400px]">
          {currentStep === 1 && (
            <Step1FileUpload
              file={file}
              onFileSelect={handleFileSelect}
              disabled={isUploading}
              isProcessing={isProcessingFile}
            />
          )}

          {currentStep === 2 && (
            <Step2ColumnMapping
              validationResult={csvValidation}
              columnMapping={columnMapping}
              onMappingComplete={handleColumnMappingComplete}
              disabled={isUploading}
            />
          )}

          {currentStep === 3 && (
            <Step3BankSelection
              file={file}
              columnMapping={columnMapping}
              selectedBank={selectedBank}
              onBankChange={handleBankChange}
              disabled={isUploading}
            />
          )}

          {currentStep === 4 && (
            <Step4Review
              file={file}
              columnMapping={columnMapping}
              selectedBank={selectedBank}
              statementPeriodFrom={statementPeriodFrom}
              statementPeriodTo={statementPeriodTo}
              onEdit={handleEdit}
            />
          )}
        </div>

        {/* Statement Period (Optional) - Shown on Review Step */}
        {currentStep === 4 && (
          <div className="mt-6 grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
            <div>
              <label
                htmlFor="periodFrom"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Statement Period From (Optional)
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
                Statement Period To (Optional)
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
        )}

        {/* Upload Progress */}
        {uploadProgress && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress.percentage}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-6 rounded-md bg-red-50 p-4">
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

        {/* Navigation Buttons */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-200 mt-6">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 1 || isUploading}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Back
          </button>

          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>

            {currentStep < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext() || isUploading}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isUploading}
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
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Uploading...
                  </>
                ) : (
                  "Upload Statement(s)"
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
