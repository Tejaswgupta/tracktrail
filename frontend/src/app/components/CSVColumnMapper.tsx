"use client";

import type { ColumnMapping, CSVValidationResult } from "@/utils/csvValidator";
import { useState } from "react";

interface CSVColumnMapperProps {
  validationResult: CSVValidationResult;
  onMappingComplete: (mapping: ColumnMapping) => void;
  onCancel: () => void;
}

export default function CSVColumnMapper({
  validationResult,
  onMappingComplete,
  onCancel,
}: CSVColumnMapperProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    // Initialize with suggested mapping if available
    const suggested = validationResult.suggestedMapping;
    const initial: ColumnMapping = {
      DATE: suggested?.DATE || "",
      DESCRIPTION: suggested?.DESCRIPTION || "",
      DEBIT: "",
      CREDIT: "",
      AMOUNT: "",
    };

    // Prefer single amount column if available, otherwise use debit/credit
    if (suggested?.AMOUNT) {
      initial.AMOUNT = suggested.AMOUNT;
    } else if (suggested?.DEBIT || suggested?.CREDIT) {
      initial.DEBIT = suggested?.DEBIT || "";
      initial.CREDIT = suggested?.CREDIT || "";
    } else {
      // Default to debit/credit format if no suggestions
      initial.DEBIT =
        validationResult.headers.find(
          (h) =>
            h.toLowerCase().includes("debit") || h.toLowerCase().includes("dr")
        ) || "";
      initial.CREDIT =
        validationResult.headers.find(
          (h) =>
            h.toLowerCase().includes("credit") || h.toLowerCase().includes("cr")
        ) || "";
    }

    return initial;
  });

  const handleMappingChange = (
    requiredColumn: keyof ColumnMapping,
    csvColumn: string
  ) => {
    setMapping((prev) => ({
      ...prev,
      [requiredColumn]: csvColumn,
    }));
  };

  const handleSubmit = () => {
    // Validate that we have minimum required mappings
    const hasDate = !!mapping.DATE;
    const hasDescription = !!mapping.DESCRIPTION;
    const hasDebitCredit =
      !!mapping.DEBIT && !!mapping.CREDIT && !mapping.AMOUNT;
    const hasAmount = !!mapping.AMOUNT && !mapping.DEBIT && !mapping.CREDIT;

    if (!hasDate || !hasDescription || (!hasDebitCredit && !hasAmount)) {
      alert(
        "Please map all required columns: DATE, DESCRIPTION, and either (DEBIT + CREDIT) or AMOUNT"
      );
      return;
    }

    onMappingComplete(mapping);
  };

  const getPreviewValue = (csvColumn: string): string => {
    if (!csvColumn || !validationResult.previewData?.[0]) return "";
    return validationResult.previewData[0][csvColumn] || "";
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Map CSV Columns
        </h3>
        <p className="text-sm text-gray-600">
          Your CSV file doesn't match the expected format. Please map your
          columns to the required fields.
        </p>
      </div>

      {/* Column Mapping Form */}
      <div className="space-y-4">
        {/* DATE Column */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-sm font-medium text-gray-700">
            DATE <span className="text-red-500">*</span>
          </div>
          <div>
            <select
              value={mapping.DATE}
              onChange={(e) => handleMappingChange("DATE", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select column...</option>
              {validationResult.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500">
            {mapping.DATE && (
              <span>Preview: {getPreviewValue(mapping.DATE)}</span>
            )}
          </div>
        </div>

        {/* DESCRIPTION Column */}
        <div className="grid grid-cols-3 gap-4 items-center">
          <div className="text-sm font-medium text-gray-700">
            DESCRIPTION <span className="text-red-500">*</span>
          </div>
          <div>
            <select
              value={mapping.DESCRIPTION}
              onChange={(e) =>
                handleMappingChange("DESCRIPTION", e.target.value)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select column...</option>
              {validationResult.headers.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-gray-500">
            {mapping.DESCRIPTION && (
              <span>Preview: {getPreviewValue(mapping.DESCRIPTION)}</span>
            )}
          </div>
        </div>

        {/* Amount Format Selection */}
        <div className="border-t pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Amount Format <span className="text-red-500">*</span>
          </p>
          <div className="space-y-3">
            {/* Option 1: Separate Debit/Credit columns */}
            <div className="border rounded-lg p-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="amountFormat"
                  checked={
                    (!!mapping.DEBIT || !!mapping.CREDIT) && !mapping.AMOUNT
                  }
                  onChange={() => {
                    setMapping((prev) => ({
                      ...prev,
                      AMOUNT: "",
                      DEBIT: prev.DEBIT || validationResult.headers[0] || "",
                      CREDIT: prev.CREDIT || validationResult.headers[1] || "",
                    }));
                  }}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium">
                  Separate Debit/Credit Columns
                </span>
              </label>

              {(!!mapping.DEBIT || !!mapping.CREDIT) && !mapping.AMOUNT && (
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <div className="text-sm text-gray-600">DEBIT/DR</div>
                    <div>
                      <select
                        value={mapping.DEBIT}
                        onChange={(e) =>
                          handleMappingChange("DEBIT", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select column...</option>
                        {validationResult.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-xs text-gray-500">
                      {mapping.DEBIT && (
                        <span>Preview: {getPreviewValue(mapping.DEBIT)}</span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 items-center">
                    <div className="text-sm text-gray-600">CREDIT/CR</div>
                    <div>
                      <select
                        value={mapping.CREDIT}
                        onChange={(e) =>
                          handleMappingChange("CREDIT", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select column...</option>
                        {validationResult.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-xs text-gray-500">
                      {mapping.CREDIT && (
                        <span>Preview: {getPreviewValue(mapping.CREDIT)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Option 2: Single Amount column */}
            <div className="border rounded-lg p-3">
              <label className="flex items-center space-x-2">
                <input
                  type="radio"
                  name="amountFormat"
                  checked={
                    !!mapping.AMOUNT && !mapping.DEBIT && !mapping.CREDIT
                  }
                  onChange={() => {
                    setMapping((prev) => ({
                      ...prev,
                      DEBIT: "",
                      CREDIT: "",
                      AMOUNT: prev.AMOUNT || validationResult.headers[0] || "",
                    }));
                  }}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium">
                  Single Amount Column
                </span>
              </label>

              {!!mapping.AMOUNT && !mapping.DEBIT && !mapping.CREDIT && (
                <div className="mt-3">
                  <div className="grid grid-cols-3 gap-4 items-center">
                    <div className="text-sm text-gray-600">AMOUNT</div>
                    <div>
                      <select
                        value={mapping.AMOUNT}
                        onChange={(e) =>
                          handleMappingChange("AMOUNT", e.target.value)
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Select column...</option>
                        {validationResult.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="text-xs text-gray-500">
                      {mapping.AMOUNT && (
                        <span>Preview: {getPreviewValue(mapping.AMOUNT)}</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Note: Positive values will be treated as credits, negative
                    as debits
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Preview Table */}
      {validationResult.previewData &&
        validationResult.previewData.length > 0 && (
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">
              Preview Data
            </h4>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {validationResult.headers.map((header) => (
                      <th
                        key={header}
                        className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {validationResult.previewData
                    .slice(0, 3)
                    .map((row, index) => (
                      <tr key={index}>
                        {validationResult.headers.map((header) => (
                          <td
                            key={header}
                            className="px-3 py-2 whitespace-nowrap text-xs text-gray-900"
                          >
                            {row[header] || ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Continue with Mapping
        </button>
      </div>
    </div>
  );
}
