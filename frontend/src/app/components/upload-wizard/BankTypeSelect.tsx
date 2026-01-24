"use client";

import { getAvailableBankPresets, type BankPreset } from "@/constants/banks";

interface BankTypeSelectProps {
  selectedBank: BankPreset;
  onBankChange: (bank: BankPreset) => void;
  disabled?: boolean;
}

export default function BankTypeSelect({
  selectedBank,
  onBankChange,
  disabled = false,
}: BankTypeSelectProps) {
  const banks = getAvailableBankPresets();

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Bank Type
      </label>
      <select
        value={selectedBank}
        onChange={(e) => onBankChange(e.target.value as BankPreset)}
        disabled={disabled}
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
      >
        {Object.entries(banks).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <p className="text-xs text-gray-500">
        Helps auto-detect columns for your statement format.
      </p>
    </div>
  );
}
