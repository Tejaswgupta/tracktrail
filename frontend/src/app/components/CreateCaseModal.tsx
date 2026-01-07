"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

interface CreateCaseModalProps {
  onClose: () => void;
  onCaseCreated: () => void;
}

export default function CreateCaseModal({
  onClose,
  onCaseCreated,
}: CreateCaseModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    investigator: "",
    priority: "medium" as "low" | "medium" | "high",
    category: "gst_evasion" as
      | "gst_evasion"
      | "money_laundering"
      | "tax_fraud"
      | "other",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { casesService } = await import("@/services/database");

      // Allow both authenticated and anonymous users
      if (!user) {
        // Try to sign in anonymously as fallback
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();
        const { data: anonData, error: anonError } =
          await supabase.auth.signInAnonymously();

        if (anonError || !anonData.user) {
          alert(
            "Unable to create case. Please try signing in or refreshing the page."
          );
          return;
        }
      }

      // Generate case number (in production, this should be handled by the backend)
      const caseNumber = `DGGI/${new Date().getFullYear()}/${Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase()}`;

      await casesService.create({
        case_number: caseNumber,
        case_name: formData.name,
        case_type:
          formData.category === "gst_evasion"
            ? "Tax Evasion"
            : formData.category === "money_laundering"
            ? "Money Laundering"
            : "Other",
        status: "Active",
        priority: (formData.priority.charAt(0).toUpperCase() +
          formData.priority.slice(1)) as any,
        description: formData.description,
        investigating_agency: user?.user_metadata?.agency || "DGGI",
        lead_investigator: formData.investigator,
        created_by: user!.id,
        opened_date: new Date().toISOString().split("T")[0], // Current date in YYYY-MM-DD format
      });

      onCaseCreated();
    } catch (error) {
      console.error("Error creating case:", error);

      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes("row-level security")) {
          alert(
            "Authentication required. Please contact your administrator to set up proper access permissions."
          );
        } else if (error.message.includes("violates")) {
          alert("Permission denied. You don't have access to create cases.");
        } else {
          alert(`Failed to create case: ${error.message}`);
        }
      } else {
        alert("An unexpected error occurred while creating the case.");
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
          <h3 className="text-lg font-medium text-gray-900">Create New Case</h3>
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

        {user?.is_anonymous && (
          <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-md">
            <div className="flex">
              <svg
                className="w-5 h-5 text-orange-400 mr-2 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
              <div>
                <h4 className="text-sm font-medium text-orange-800">
                  Guest Mode
                </h4>
                <p className="text-sm text-orange-700 mt-1">
                  You're using guest access. Cases created may not persist after
                  your session ends. Consider{" "}
                  <a href="/auth/signup" className="underline">
                    creating an account
                  </a>{" "}
                  for permanent access.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="name"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Case Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              value={formData.name}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter case name"
            />
          </div>

          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              value={formData.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter case description"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* <div>
              <label
                htmlFor="investigator"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Lead Investigator *
              </label>
              <input
                type="text"
                id="investigator"
                name="investigator"
                required
                value={formData.investigator}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter investigator name"
              />
            </div> */}
            {/* 
            <div>
              <label
                htmlFor="priority"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div> */}
          </div>

          <div>
            <label
              htmlFor="category"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Case Category
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="gst_evasion">GST Evasion</option>
              <option value="money_laundering">Money Laundering</option>
              <option value="tax_fraud">Tax Fraud</option>
              <option value="other">Other</option>
            </select>
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
                  Creating...
                </>
              ) : (
                "Create Case"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
