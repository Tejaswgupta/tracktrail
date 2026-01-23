"use client";

import {
  inferBankPresetFromBankName,
  type BankPreset,
} from "@/constants/banks";
import { accountsService, entitiesService } from "@/services/database";
import { fileUploadService, type UploadProgress } from "@/services/fileUpload";
import { transactionExtractorService } from "@/services/transactionExtractor";
import type { EntityWithAccounts } from "@/types/database";
import {
  buildSuggestedColumnMapping,
  isColumnMappingValid,
  type ColumnMapping,
  type CSVValidationResult,
} from "@/utils/csvValidator";
import { useEffect, useMemo, useState } from "react";
import CreateAccountModal from "./CreateAccountModal";
import CreateEntityModal from "./CreateEntityModal";
import SearchablePopover from "./SearchablePopover";
import ProgressStepper from "./upload-wizard/ProgressStepper";
import Step1FileUpload from "./upload-wizard/Step1FileUpload";
import Step2ColumnMapping from "./upload-wizard/Step2ColumnMapping";
import Step3BankSelection from "./upload-wizard/Step3BankSelection";
import Step4Review from "./upload-wizard/Step4Review";

interface UploadStatementModalWizardProps {
  caseId: string;
  onClose: () => void;
  onUploadComplete: () => void;
}

const STEPS = [
  { id: 1, name: "Account", description: "Choose entity & account" },
  { id: 2, name: "File", description: "Select files" },
  { id: 3, name: "Columns", description: "Map columns" },
  { id: 4, name: "Bank", description: "Choose bank" },
  { id: 5, name: "Review", description: "Review & submit" },
];

export default function UploadStatementModalWizard({
  caseId,
  onClose,
  onUploadComplete,
}: UploadStatementModalWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [entities, setEntities] = useState<EntityWithAccounts[]>([]);
  const [accountEntityId, setAccountEntityId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isCreateEntityModalOpen, setIsCreateEntityModalOpen] = useState(false);
  const [isCreateAccountModalOpen, setIsCreateAccountModalOpen] =
    useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [statementPeriodFrom, setStatementPeriodFrom] = useState("");
  const [statementPeriodTo, setStatementPeriodTo] = useState("");
  const [selectedBank, setSelectedBank] = useState<BankPreset>("generic");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(
    null,
  );
  const [currentFileProgress, setCurrentFileProgress] =
    useState<UploadProgress | null>(null);
  const [currentUploadIndex, setCurrentUploadIndex] = useState<number | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoadingAccount, setIsLoadingAccount] = useState(false);

  const [fileValidations, setFileValidations] = useState<
    (CSVValidationResult | null)[]
  >([]);
  const [fileMappings, setFileMappings] = useState<(ColumnMapping | null)[]>(
    [],
  );
  const [mappingIndex, setMappingIndex] = useState(0);
  const [deletedRows, setDeletedRows] = useState<number[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [isLoadingEntities, setIsLoadingEntities] = useState(true);
  const [refreshEntitiesTrigger, setRefreshEntitiesTrigger] = useState(0);
  const primaryFile = files[0] ?? null;
  const primaryMapping = fileMappings[0] ?? null;

  useEffect(() => {
    let isActive = true;
    const fetchEntities = async () => {
      setIsLoadingEntities(true);
      try {
        const caseEntities = await entitiesService.getByCaseId(caseId);
        if (!isActive) return;
        setEntities(caseEntities);
        setAccountEntityId((prev) => prev || caseEntities[0]?.entity_id || "");
      } catch (error) {
        console.error("Error fetching entities:", error);
      } finally {
        if (isActive) {
          setIsLoadingEntities(false);
        }
      }
    };

    fetchEntities();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!accountEntityId) {
      setAccountId("");
      return;
    }

    const entity = entities.find((item) => item.entity_id === accountEntityId);
    const matchingAccount = entity?.accounts?.find(
      (account) => account.account_id === accountId,
    );
    if (matchingAccount) return;

    const firstAccount = entity?.accounts?.[0];
    const nextAccountId = firstAccount?.account_id || "";

    if (nextAccountId !== accountId) {
      setAccountId(nextAccountId);
    }
  }, []);

  useEffect(() => {
    const fetchAccountAndInferBank = async () => {
      if (!accountId) return;

      setIsLoadingAccount(true);
      try {
        const account = await accountsService.getById(accountId);
        if (account?.bank_name) {
          const inferredBankPreset = inferBankPresetFromBankName(
            account.bank_name,
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
  }, []);

  const CREATE_ENTITY_VALUE = "__create_entity__";
  const CREATE_ACCOUNT_VALUE = "__create_account__";

  const entityOptions = useMemo(
    () =>
      entities.map((entity) => ({
        value: entity.entity_id,
        label: entity.entity_name,
        subLabel: `ID: ${entity.entity_id}`,
        searchValue: `${entity.entity_name} ${entity.entity_id}`,
      })),
    [entities],
  );

  const accountOptions = useMemo(() => {
    const selectedEntity = entities.find(
      (entity) => entity.entity_id === accountEntityId,
    );
    return (
      selectedEntity?.accounts?.map((account) => ({
        value: account.account_id,
        label: `${account.bank_name || "Bank"} (${account.account_number})`,
        subLabel: `ID: ${account.account_id}`,
        searchValue: `${account.bank_name || "Bank"} ${
          account.account_number
        } ${account.account_id}`,
      })) || []
    );
  }, [entities, accountEntityId]);

  const entityCreateOption = {
    value: CREATE_ENTITY_VALUE,
    label: "+ Add New Entity",
    subLabel: "Create a new entity for this case",
  };

  const accountCreateOption = {
    value: CREATE_ACCOUNT_VALUE,
    label: "+ Add New Account",
    subLabel: "Add a bank account for this entity",
  };

  const handleFileSelect = async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setError(null);
    setFileValidations(Array(selectedFiles.length).fill(null));
    setFileMappings(Array(selectedFiles.length).fill(null));
    setMappingIndex(0);
    setIsProcessingFile(false);

    if (!selectedFiles.length) return;

    setIsProcessingFile(true);
    const validations: (CSVValidationResult | null)[] = Array(
      selectedFiles.length,
    ).fill(null);
    const mappings: (ColumnMapping | null)[] = Array(selectedFiles.length).fill(
      null,
    );

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      try {
        let validation: CSVValidationResult | null = null;

        if (file.type === "text/csv") {
          validation = await fileUploadService.validateCSV(file);
        } else if (
          file.type ===
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
          file.type === "application/vnd.ms-excel"
        ) {
          validation = await fileUploadService.validateExcel(file);
        } else if (file.type === "application/pdf") {
          validation =
            await transactionExtractorService.previewPDFColumns(file);
        }

        validations[index] = validation;
        if (validation) {
          mappings[index] = buildSuggestedColumnMapping(validation);
        }
        setFileValidations([...validations]);
        setFileMappings([...mappings]);
      } catch (error) {
        console.error("File validation error:", error);
        setError(
          error instanceof Error ? error.message : "Failed to validate file",
        );
      }
    }
    setIsProcessingFile(false);
  };

  const handleColumnMappingComplete = (
    mapping: ColumnMapping,
    rowsToDelete: number[],
  ) => {
    setFileMappings((prev) => {
      const next = [...prev];
      next[mappingIndex] = mapping;
      return next;
    });
    setDeletedRows(rowsToDelete);

    if (mappingIndex < files.length - 1) {
      setMappingIndex(mappingIndex + 1);
    } else {
      setCurrentStep(4);
    }
  };

  const handleBankChange = (bankPreset: BankPreset) => {
    setSelectedBank(bankPreset);
  };

  const handleSubmit = async () => {
    if (!accountId) {
      setError("Please select an account to upload the statement to");
      return;
    }

    if (!files.length) {
      setError("Please select at least one file to upload");
      return;
    }

    if (!selectedBank) {
      setError("Please select a bank type");
      return;
    }

    if (
      files.some((file, index) => {
        const validation = fileValidations[index];
        const mapping = fileMappings[index];
        if (!validation) return true;
        if (
          (file.type === "text/csv" ||
            file.type === "application/pdf" ||
            file.type ===
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
            file.type === "application/vnd.ms-excel") &&
          !isColumnMappingValid(mapping)
        ) {
          return true;
        }
        return false;
      })
    ) {
      setError("Please map columns for all files before uploading");
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadProgress(null);
    setCurrentFileProgress(null);
    setCurrentUploadIndex(0);

    try {
      for (let i = 0; i < files.length; i += 1) {
        const currentFile = files[i];
        const mapping = fileMappings[i] || undefined;
        setCurrentUploadIndex(i);
        setCurrentFileProgress({
          loaded: 0,
          total: currentFile.size,
          percentage: 0,
        });
        setUploadProgress({
          loaded: 0,
          total: currentFile.size,
          percentage: Math.round((i / files.length) * 100),
        });
        await fileUploadService.uploadStatement({
          accountId,
          file: currentFile,
          statementPeriodFrom: statementPeriodFrom || undefined,
          statementPeriodTo: statementPeriodTo || undefined,
          columnMapping: mapping,
          bankPreset: selectedBank,
          onProgress: (progress) => {
            const baseProgress = i / files.length;
            const currentProgress = progress.percentage / 100 / files.length;
            const percentage = Math.min(
              100,
              Math.round((baseProgress + currentProgress) * 100),
            );
            const filePercentage =
              progress.uploadPercentage ?? progress.percentage;
            setCurrentFileProgress({ ...progress, percentage: filePercentage });
            setUploadProgress({ ...progress, percentage });
          },
        });
      }

      onUploadComplete();
      onClose();
    } catch (error) {
      console.error("Upload failed:", error);
      setError(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
      setCurrentFileProgress(null);
      setCurrentUploadIndex(null);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return !isLoadingEntities && !!accountEntityId && !!accountId;
      case 2:
        return (
          files.length > 0 &&
          !isProcessingFile &&
          fileValidations.length === files.length &&
          fileValidations.every((validation) => validation !== null)
        );
      case 3:
        return fileMappings.every((mapping) => isColumnMappingValid(mapping));
      case 4:
        return !!selectedBank;
      case 5:
        return true;
      default:
        return false;
    }
  };

  const handleNext = async () => {
    if (currentStep < 5) {
      // If we have a PDF file and moving from step 1, process it first
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      if (currentStep === 4) {
        setMappingIndex(0);
      }
      setCurrentStep(currentStep - 1);
    }
  };

  const handleEdit = (step: number) => {
    if (step === 3) {
      setMappingIndex(0);
    }
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
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    Entity
                  </span>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <SearchablePopover
                      value={accountEntityId}
                      items={entityOptions}
                      placeholder={
                        isLoadingEntities
                          ? "Loading entities..."
                          : "Select entity"
                      }
                      searchPlaceholder="Search entities..."
                      emptyText="No entities found."
                      emptyAction={entityCreateOption}
                      footerItems={[entityCreateOption]}
                      disabled={isLoadingEntities}
                      onChange={(value) => {
                        if (value === CREATE_ENTITY_VALUE) {
                          setIsCreateEntityModalOpen(true);
                          return;
                        }
                        setAccountEntityId(value);
                      }}
                      buttonClassName="bg-transparent focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-medium text-gray-500">
                    Account
                  </span>
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                    <SearchablePopover
                      value={accountId}
                      items={accountOptions}
                      placeholder="Select account"
                      searchPlaceholder="Search accounts..."
                      emptyText={
                        accountEntityId
                          ? "No accounts found."
                          : "Select an entity first."
                      }
                      emptyAction={
                        accountEntityId ? accountCreateOption : undefined
                      }
                      footerItems={accountEntityId ? [accountCreateOption] : []}
                      disabled={!accountEntityId}
                      onChange={(value) => {
                        if (value === CREATE_ACCOUNT_VALUE) {
                          setIsCreateAccountModalOpen(true);
                          return;
                        }
                        setAccountId(value);
                      }}
                      buttonClassName="bg-transparent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">
                Select the entity first, then choose the account you want to
                upload statements for.
              </p>
            </div>
          )}

          {currentStep === 2 && (
            <Step1FileUpload
              files={files}
              onFileSelect={handleFileSelect}
              disabled={isUploading}
              isProcessing={isProcessingFile}
            />
          )}

          {currentStep === 3 && (
            <Step2ColumnMapping
              validationResult={fileValidations[mappingIndex] || null}
              columnMapping={fileMappings[mappingIndex] || null}
              onMappingComplete={handleColumnMappingComplete}
              disabled={isUploading}
              fileName={files[mappingIndex]?.name}
              fileIndex={mappingIndex}
              fileCount={files.length}
              ctaLabel={
                mappingIndex < files.length - 1
                  ? "Save & Next File"
                  : "Continue"
              }
            />
          )}

          {currentStep === 4 && (
            <Step3BankSelection
              file={primaryFile}
              columnMapping={primaryMapping}
              selectedBank={selectedBank}
              onBankChange={handleBankChange}
              disabled={isUploading}
            />
          )}

          {currentStep === 5 && (
            <Step4Review
              files={files}
              fileMappings={fileMappings}
              selectedBank={selectedBank}
              statementPeriodFrom={statementPeriodFrom}
              statementPeriodTo={statementPeriodTo}
              onEdit={handleEdit}
            />
          )}
        </div>

        {/* Statement Period (Optional) - Shown on Review Step */}
        {currentStep === 5 && (
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
        {(isUploading || uploadProgress) && (
          <div className="mt-6 space-y-3">
            {currentUploadIndex !== null && files[currentUploadIndex] && (
              <div className="flex flex-col gap-1 text-sm text-gray-700">
                <span className="font-medium">
                  Uploading file {currentUploadIndex + 1} of {files.length}
                </span>
                <span className="text-gray-500">
                  {files[currentUploadIndex].name}
                </span>
              </div>
            )}
            {currentFileProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Current file</span>
                  <span>{currentFileProgress.percentage}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-400 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${currentFileProgress.percentage}%` }}
                  />
                </div>
              </div>
            )}
            {uploadProgress && (
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span>Overall progress</span>
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

            {currentStep < 5 ? (
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

      {isCreateEntityModalOpen && (
        <CreateEntityModal
          caseId={caseId}
          onClose={() => setIsCreateEntityModalOpen(false)}
          onEntityCreated={() => {
            setIsCreateEntityModalOpen(false);
            setRefreshEntitiesTrigger((prev) => prev + 1);
          }}
        />
      )}

      {isCreateAccountModalOpen && accountEntityId && (
        <CreateAccountModal
          entityId={accountEntityId}
          onClose={() => setIsCreateAccountModalOpen(false)}
          onAccountCreated={() => {
            setIsCreateAccountModalOpen(false);
            setRefreshEntitiesTrigger((prev) => prev + 1);
          }}
        />
      )}
    </div>
  );
}
