"use client";

import { BANK_PRESETS, type BankPreset } from "@/constants/banks";
import { isColumnMappingValid, type ColumnMapping } from "@/utils/csvValidator";

interface Step4ReviewProps {
  files: File[];
  fileMappings: (ColumnMapping | null)[];
  selectedBank: BankPreset;
  statementPeriodFrom?: string;
  statementPeriodTo?: string;
  onEdit?: (step: number) => void;
}

export default function Step4Review({
  files,
  fileMappings,
  selectedBank,
  statementPeriodFrom,
  statementPeriodTo,
  onEdit,
}: Step4ReviewProps) {
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileType = (fileName: string) => {
    const extension = fileName.split(".").pop()?.toLowerCase();
    switch (extension) {
      case "pdf":
        return "PDF Document";
      case "csv":
        return "CSV File";
      case "xlsx":
      case "xls":
        return "Excel Spreadsheet";
      default:
        return "Document";
    }
  };
  const fileTypes = Array.from(
    new Set(files.map((file) => getFileType(file.name)))
  );
  const fileTypeLabel = fileTypes.length > 1 ? "Mixed Types" : fileTypes[0];
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const mappedCount = fileMappings.filter((mapping) =>
    isColumnMappingValid(mapping)
  ).length;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Review & Submit
        </h3>
        <p className="text-sm text-gray-600">
          Review your selections before uploading
        </p>
      </div>

      <div className="space-y-4">
        {/* File Information */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">File Details</h4>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(1)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>
          {files.length ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Files:</span>
                <span className="font-medium text-gray-900">
                  {files.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Type:</span>
                <span className="font-medium text-gray-900">
                  {fileTypeLabel}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Size:</span>
                <span className="font-medium text-gray-900">
                  {formatFileSize(totalSize)}
                </span>
              </div>
              <div className="pt-2 space-y-1">
                {files.map((fileItem) => (
                  <div
                    key={`${fileItem.name}-${fileItem.size}`}
                    className="flex justify-between text-xs text-gray-600"
                  >
                    <span className="truncate pr-2">{fileItem.name}</span>
                    <span className="whitespace-nowrap">
                      {formatFileSize(fileItem.size)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No file selected</p>
          )}
        </div>

        {/* Column Mapping */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Column Mapping</h4>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(2)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>
          {fileMappings.length ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Mapped:</span>
                <span className="font-medium text-gray-900">
                  {mappedCount} of {files.length}
                </span>
              </div>
              <div className="pt-2 space-y-1">
                {files.map((fileItem, index) => (
                  <div
                    key={`${fileItem.name}-${fileItem.size}`}
                    className="flex justify-between text-xs text-gray-600"
                  >
                    <span className="truncate pr-2">{fileItem.name}</span>
                    <span>
                      {isColumnMappingValid(fileMappings[index])
                        ? "Mapped"
                        : "Needs mapping"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No column mapping configured</p>
          )}
        </div>

        {/* Bank Selection */}
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-medium text-gray-700">Bank Type</h4>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(3)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Edit
              </button>
            )}
          </div>
          <p className="text-sm font-medium text-gray-900">
            {BANK_PRESETS[selectedBank] || selectedBank}
          </p>
        </div>

        {/* Statement Period */}
        {(statementPeriodFrom || statementPeriodTo) && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Statement Period
            </h4>
            <div className="space-y-2">
              {statementPeriodFrom && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">From:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(statementPeriodFrom).toLocaleDateString()}
                  </span>
                </div>
              )}
              {statementPeriodTo && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">To:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(statementPeriodTo).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Ready to Upload Message */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
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
              Ready to upload! Click "Upload Statement" to begin processing.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
