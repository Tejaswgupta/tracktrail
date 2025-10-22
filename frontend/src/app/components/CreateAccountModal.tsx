"use client";

import { useAuth } from "@/contexts/AuthContext";
import { accountsService } from "@/services/database";
import { BANK_PRESETS, type BankPreset } from "@/constants/banks";
import { useState, useRef, useEffect } from "react";

interface CreateAccountModalProps {
  entityId: string;
  onClose: () => void;
  onAccountCreated: () => void;
}

export default function CreateAccountModal({
  entityId,
  onClose,
  onAccountCreated,
}: CreateAccountModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    accountNumber: "",
    accountName: "",
    bankName: "generic" as BankPreset,
    accountType: "Current" as
      | "Savings"
      | "Current"
      | "Cash Credit"
      | "Overdraft"
      | "Fixed Deposit"
      | "Recurring Deposit"
      | "NRE"
      | "NRO"
      | "Foreign Currency"
      | "Escrow"
      | "Other",
    ifscCode: "",
    branchName: "",
    openingDate: "",
    status: "Active" as "Active" | "Closed" | "Frozen" | "Dormant",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isBankDropdownOpen, setIsBankDropdownOpen] = useState(false);
  const bankDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        bankDropdownRef.current &&
        !bankDropdownRef.current.contains(event.target as Node)
      ) {
        setIsBankDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleBankSelect = (bankPreset: BankPreset) => {
    setFormData((prev) => ({ ...prev, bankName: bankPreset }));
    setIsBankDropdownOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (!user) {
        alert("You must be logged in to create an account");
        return;
      }

      await accountsService.create({
        entity_id: entityId,
        account_number: formData.accountNumber,
        account_name: formData.accountName || `${BANK_PRESETS[formData.bankName]} Account`,
        account_type: formData.accountType,
        bank_name: BANK_PRESETS[formData.bankName],
        branch_name: formData.branchName,
        ifsc_code: formData.ifscCode,
        opening_date: formData.openingDate || undefined,
        status: formData.status,
        created_by: user.id,
      });

      onAccountCreated();
      onClose();
    } catch (error) {
      console.error("Error creating account:", error);

      if (error instanceof Error) {
        if (error.message.includes("duplicate")) {
          alert("An account with this number already exists for this entity.");
        } else if (
          error.message.includes("permission") ||
          error.message.includes("policy")
        ) {
          alert(
            "You don't have permission to create accounts. Please contact your administrator."
          );
        } else {
          alert(`Failed to create account: ${error.message}`);
        }
      } else {
        alert("An unexpected error occurred while creating the account.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            Add Bank Account
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="accountNumber"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Number *
              </label>
              <input
                type="text"
                id="accountNumber"
                name="accountNumber"
                required
                value={formData.accountNumber}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter account number"
              />
            </div>

            <div>
              <label
                htmlFor="accountName"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Name
              </label>
              <input
                type="text"
                id="accountName"
                name="accountName"
                value={formData.accountName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Account holder name (optional)"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="accountType"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Account Type *
            </label>
            <select
              id="accountType"
              name="accountType"
              required
              value={formData.accountType}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="Savings">Savings</option>
              <option value="Current">Current</option>
              <option value="Cash Credit">Cash Credit</option>
              <option value="Overdraft">Overdraft</option>
              <option value="Fixed Deposit">Fixed Deposit</option>
              <option value="Recurring Deposit">Recurring Deposit</option>
              <option value="NRE">NRE</option>
              <option value="NRO">NRO</option>
              <option value="Foreign Currency">Foreign Currency</option>
              <option value="Escrow">Escrow</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="relative" ref={bankDropdownRef}>
            <label
              htmlFor="bankName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Bank Name *
            </label>
            <button
              type="button"
              onClick={() => setIsBankDropdownOpen(!isBankDropdownOpen)}
              disabled={isSubmitting}
              className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-default focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <div className="flex items-center">
                <span className="block truncate">
                  {formData.bankName ? BANK_PRESETS[formData.bankName] : "Select a bank"}
                </span>
              </div>
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg
                  className={`h-5 w-5 text-gray-400 transition-transform ${
                    isBankDropdownOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </span>
            </button>

            {isBankDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none">
                {Object.entries(BANK_PRESETS).map(([value, label]) => (
                  <div
                    key={value}
                    onClick={() => handleBankSelect(value as BankPreset)}
                    className={`cursor-pointer select-none relative py-3 pl-3 pr-9 hover:bg-blue-50 ${
                      formData.bankName === value
                        ? "text-blue-900 bg-blue-50"
                        : "text-gray-900"
                    }`}
                  >
                    <div className="flex flex-col">
                      <span
                        className={`block truncate ${
                          formData.bankName === value
                            ? "font-semibold"
                            : "font-normal"
                        }`}
                      >
                        {label}
                      </span>
                    </div>
                    {formData.bankName === value && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-blue-600">
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="ifscCode"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                IFSC Code *
              </label>
              <input
                type="text"
                id="ifscCode"
                name="ifscCode"
                required
                value={formData.ifscCode}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., SBIN0001234"
              />
            </div>

            <div>
              <label
                htmlFor="branchName"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Branch Name *
              </label>
              <input
                type="text"
                id="branchName"
                name="branchName"
                required
                value={formData.branchName}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Mumbai Main Branch"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="openingDate"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Opening Date
              </label>
              <input
                type="date"
                id="openingDate"
                name="openingDate"
                value={formData.openingDate}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="status"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Account Status
              </label>
              <select
                id="status"
                name="status"
                value={formData.status}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="Active">Active</option>
                <option value="Closed">Closed</option>
                <option value="Frozen">Frozen</option>
                <option value="Dormant">Dormant</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
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
                  Adding...
                </>
              ) : (
                "Add Account"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
