"use client";

import {
  buildSuggestedColumnMapping,
  isColumnMappingValid,
  type ColumnMapping,
  type CSVValidationResult,
} from "@/utils/csvValidator";
import { useEffect, useState } from "react";

interface CSVColumnMapperProps {
  validationResult: CSVValidationResult;
  onMappingComplete: (mapping: ColumnMapping) => void;
  onCancel: () => void;
  initialMapping?: ColumnMapping;
  fileName?: string;
  fileIndex?: number;
  fileCount?: number;
  ctaLabel?: string;
}

export default function CSVColumnMapper({
  validationResult,
  onMappingComplete,
  onCancel,
  initialMapping,
  fileName,
  fileIndex,
  fileCount,
  ctaLabel,
}: CSVColumnMapperProps) {
  const getInitialMapping = () => {
    if (initialMapping) {
      return {
        DATE: initialMapping.DATE || "",
        DESCRIPTION: initialMapping.DESCRIPTION || "",
        DEBIT: initialMapping.DEBIT || "",
        CREDIT: initialMapping.CREDIT || "",
        AMOUNT: initialMapping.AMOUNT || "",
        DIRECTION: initialMapping.DIRECTION || "",
      };
    }

    const init = buildSuggestedColumnMapping(validationResult);
    if (!init.AMOUNT && !init.DEBIT && !init.CREDIT) {
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

  useEffect(() => {
    setMapping(getInitialMapping());
  }, [validationResult, initialMapping]);

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
    if (!isColumnMappingValid(mapping)) {
      alert(
        "Please map all required columns: DATE, DESCRIPTION, and either (DEBIT + CREDIT) or AMOUNT"
      );
      return;
    }

    onMappingComplete(mapping);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Map Columns
        </h3>
        <p className="text-sm text-gray-600">
          Review or map columns for this file. You can choose between a single Amount column or separate Debit/Credit columns.
        </p>
        {fileName && fileIndex !== undefined && fileCount !== undefined && (
          <p className="text-xs text-gray-500 mt-2">
            File {fileIndex + 1} of {fileCount}: {fileName}
          </p>
        )}
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
          <div />
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
          <div />
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
                      DIRECTION: "", // not applicable in separate debit/credit mode
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
                    <div />
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
                    <div />
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
                    <div />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Note: Positive values will be treated as credits, negative
                    as debits
                  </p>

                  {/* Optional Direction column when using unified Amount */}
                  <div className="grid grid-cols-3 gap-4 items-center mt-3">
                    <div className="text-sm text-gray-600">DIRECTION (optional)</div>
                    <div>
                      <select
                        value={mapping.DIRECTION || ""}
                        onChange={(e) =>
                          handleMappingChange("DIRECTION", e.target.value)
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
                    <div />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    If provided, DIRECTION should contain values like DR/CR, Debit/Credit, etc.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
          {ctaLabel || "Continue with Mapping"}
        </button>
      </div>
    </div>
  );
}
