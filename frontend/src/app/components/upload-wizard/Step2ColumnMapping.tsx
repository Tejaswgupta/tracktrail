"use client";

import {
  buildSuggestedColumnMapping,
  isColumnMappingValid,
  type ColumnMapping,
  type CSVValidationResult,
} from "@/utils/csvValidator";
import { useEffect, useState } from "react";

interface Step2ColumnMappingProps {
  validationResult: CSVValidationResult | null;
  columnMapping: ColumnMapping | null;
  onMappingComplete: (mapping: ColumnMapping, deletedRows: number[]) => void;
  disabled?: boolean;
  fileName?: string;
  fileIndex?: number;
  fileCount?: number;
  ctaLabel?: string;
}

export default function Step2ColumnMapping({
  validationResult,
  columnMapping,
  onMappingComplete,
  disabled = false,
  fileName,
  fileIndex,
  fileCount,
  ctaLabel,
}: Step2ColumnMappingProps) {
  const getInitialMapping = () => {
    if (columnMapping) {
      return { ...columnMapping };
    }
    const init = buildSuggestedColumnMapping(validationResult);
    if (!init.AMOUNT && !init.DEBIT && !init.CREDIT && validationResult) {
      init.DEBIT =
        validationResult.headers.find(
          (h) =>
            h.toLowerCase().includes("debit") || h.toLowerCase().includes("dr")
        ) || "";
      init.CREDIT =
        validationResult.headers.find(
          (h) =>
            h.toLowerCase().includes("credit") || h.toLowerCase().includes("cr")
        ) || "";
    }
    return init;
  };

  const [mapping, setMapping] = useState<ColumnMapping>(getInitialMapping);

  const [deletedRows, setDeletedRows] = useState<number[]>([]);

  useEffect(() => {
    setMapping(getInitialMapping());
    setDeletedRows([]);
  }, [validationResult, columnMapping]);

  const handleMappingChange = (
    requiredColumn: keyof ColumnMapping,
    csvColumn: string
  ) => {
    setMapping((prev) => ({
      ...prev,
      [requiredColumn]: csvColumn,
    }));
  };

  const handleRowDelete = (rowIndex: number) => {
    setDeletedRows((prev) => [...prev, rowIndex]);
  };

  const handleRowRestore = (rowIndex: number) => {
    setDeletedRows((prev) => prev.filter((i) => i !== rowIndex));
  };

  const handleSubmit = () => {
    if (!isColumnMappingValid(mapping)) {
      alert(
        "Please map all required columns: DATE, DESCRIPTION, and either (DEBIT + CREDIT) or AMOUNT"
      );
      return;
    }

    onMappingComplete(mapping, deletedRows);
  };

  const getPreviewValue = (csvColumn: string, rowIndex: number): string => {
    if (!csvColumn || !validationResult?.previewData?.[rowIndex]) return "";
    return validationResult.previewData[rowIndex][csvColumn] || "";
  };

  if (!validationResult) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-gray-500">Processing file for mapping...</p>
      </div>
    );
  }

  const previewRows = validationResult.previewData?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Map Columns & Clean Data
        </h3>
        <p className="text-sm text-gray-600">
          Map columns for this file to required fields and remove unwanted rows
        </p>
        {fileName && fileIndex !== undefined && fileCount !== undefined && (
          <p className="text-xs text-gray-500 mt-2">
            File {fileIndex + 1} of {fileCount}: {fileName}
          </p>
        )}
      </div>

      {/* Column Mapping Form */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Column Mapping</h4>

        {/* DATE Column */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-sm font-medium text-gray-700">
            DATE <span className="text-red-500">*</span>
          </div>
          <select
            value={mapping.DATE}
            onChange={(e) => handleMappingChange("DATE", e.target.value)}
            disabled={disabled}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select column...</option>
            {validationResult.headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 truncate">
            {mapping.DATE && `Preview: ${getPreviewValue(mapping.DATE, 0)}`}
          </div>
        </div>

        {/* DESCRIPTION Column */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-sm font-medium text-gray-700">
            DESCRIPTION <span className="text-red-500">*</span>
          </div>
          <select
            value={mapping.DESCRIPTION}
            onChange={(e) =>
              handleMappingChange("DESCRIPTION", e.target.value)
            }
            disabled={disabled}
            className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select column...</option>
            {validationResult.headers.map((header) => (
              <option key={header} value={header}>
                {header}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 truncate">
            {mapping.DESCRIPTION &&
              `Preview: ${getPreviewValue(mapping.DESCRIPTION, 0)}`}
          </div>
        </div>

        {/* Amount Format Toggle */}
        <div className="pt-3 border-t">
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="amountFormat"
                checked={
                  (!!mapping.DEBIT || !!mapping.CREDIT) && !mapping.AMOUNT
                }
                onChange={() =>
                  setMapping((prev) => ({
                    ...prev,
                    AMOUNT: "",
                    DEBIT: prev.DEBIT || validationResult.headers[0] || "",
                    CREDIT: prev.CREDIT || validationResult.headers[1] || "",
                    DIRECTION: "",
                  }))
                }
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm">Debit/Credit</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="amountFormat"
                checked={!!mapping.AMOUNT && !mapping.DEBIT && !mapping.CREDIT}
                onChange={() =>
                  setMapping((prev) => ({
                    ...prev,
                    DEBIT: "",
                    CREDIT: "",
                    AMOUNT: prev.AMOUNT || validationResult.headers[0] || "",
                  }))
                }
                disabled={disabled}
                className="mr-2"
              />
              <span className="text-sm">Single Amount</span>
            </label>
          </div>
        </div>

        {/* Conditional Fields */}
        {(!!mapping.DEBIT || !!mapping.CREDIT) && !mapping.AMOUNT ? (
          <>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-sm text-gray-700">DEBIT</div>
              <select
                value={mapping.DEBIT}
                onChange={(e) => handleMappingChange("DEBIT", e.target.value)}
                disabled={disabled}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select column...</option>
                {validationResult.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 truncate">
                {mapping.DEBIT && `Preview: ${getPreviewValue(mapping.DEBIT, 0)}`}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-sm text-gray-700">CREDIT</div>
              <select
                value={mapping.CREDIT}
                onChange={(e) => handleMappingChange("CREDIT", e.target.value)}
                disabled={disabled}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select column...</option>
                {validationResult.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 truncate">
                {mapping.CREDIT &&
                  `Preview: ${getPreviewValue(mapping.CREDIT, 0)}`}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-sm text-gray-700">AMOUNT</div>
              <select
                value={mapping.AMOUNT}
                onChange={(e) => handleMappingChange("AMOUNT", e.target.value)}
                disabled={disabled}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select column...</option>
                {validationResult.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 truncate">
                {mapping.AMOUNT &&
                  `Preview: ${getPreviewValue(mapping.AMOUNT, 0)}`}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              <div className="text-sm text-gray-700">DIRECTION (optional)</div>
              <select
                value={mapping.DIRECTION || ""}
                onChange={(e) =>
                  handleMappingChange("DIRECTION", e.target.value)
                }
                disabled={disabled}
                className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select column...</option>
                {validationResult.headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <div className="text-xs text-gray-500 truncate">
                {mapping.DIRECTION &&
                  `Preview: ${getPreviewValue(mapping.DIRECTION, 0)}`}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Preview Table with Row Deletion */}
      {previewRows.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-700">
              Preview Data (First 5 Rows)
            </h4>
            {deletedRows.length > 0 && (
              <span className="text-xs text-gray-500">
                {deletedRows.length} row(s) marked for deletion
              </span>
            )}
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                  {validationResult.headers.map((header) => (
                    <th
                      key={header}
                      className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {previewRows.map((row, index) => {
                  const isDeleted = deletedRows.includes(index);
                  return (
                    <tr
                      key={index}
                      className={isDeleted ? "bg-red-50 opacity-50" : ""}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        {isDeleted ? (
                          <button
                            type="button"
                            onClick={() => handleRowRestore(index)}
                            disabled={disabled}
                            className="text-xs text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            Restore
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRowDelete(index)}
                            disabled={disabled}
                            className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                      {validationResult.headers.map((header) => (
                        <td
                          key={header}
                          className="px-3 py-2 whitespace-nowrap text-xs text-gray-900"
                        >
                          {row[header] || "-"}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
        >
          {ctaLabel || "Continue"}
        </button>
      </div>
    </div>
  );
}
