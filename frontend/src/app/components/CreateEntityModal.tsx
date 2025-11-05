"use client";

import { useAuth } from "@/contexts/AuthContext";
import { EntityType } from "@/types/database";
import { useState } from "react";

interface CreateEntityModalProps {
  caseId: string;
  onClose: () => void;
  onEntityCreated: () => void;
}

export default function CreateEntityModal({
  caseId,
  onClose,
  onEntityCreated,
}: CreateEntityModalProps) {
  const { user } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    type: EntityType.Company,
    identifier: "",
    description: "",
    address: "",
    contactInfo: "",
    role: "Suspect" as
      | "Primary Suspect"
      | "Suspect"
      | "Person of Interest"
      | "Witness"
      | "Victim"
      | "Related Party",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const { entitiesService } = await import("@/services/database");

      // Allow both authenticated and anonymous users
      if (!user) {
        // Try to sign in anonymously as fallback
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();
        const { data: anonData, error: anonError } =
          await supabase.auth.signInAnonymously();

        if (anonError || !anonData.user) {
          alert(
            "Unable to create entity. Please try signing in or refreshing the page."
          );
          return;
        }
      }

      // Create the entity first
      const entity = await entitiesService.create({
        entity_name: formData.name,
        entity_type: formData.type,
        pan:
          formData.type === EntityType.Individual
            ? formData.identifier
            : undefined,
        cin:
          formData.type === EntityType.Company
            ? formData.identifier
            : undefined,
        // For trusts and partnerships, store identifier in metadata since there's no specific field
        metadata: [EntityType.Trust, EntityType.Partnership].includes(
          formData.type
        )
          ? {
              registration_number: formData.identifier,
              description: formData.description,
            }
          : formData.description
          ? { description: formData.description }
          : undefined,
        registered_address: formData.address || undefined,
        primary_phone: formData.contactInfo || undefined,
        is_verified: false, // New entities start as unverified
        created_by: user?.id || "anonymous",
      });

      // Link the entity to the case
      await entitiesService.addToCase(
        caseId,
        entity.entity_id,
        formData.role,
        user?.id || "anonymous"
      );

      onEntityCreated();
    } catch (error) {
      console.error("Error creating entity:", error);

      // Show user-friendly error message
      if (error instanceof Error) {
        if (error.message.includes("row-level security")) {
          alert(
            "Authentication required. Please contact your administrator to set up proper access permissions."
          );
        } else if (error.message.includes("violates")) {
          alert("Permission denied. You don't have access to create entities.");
        } else if (error.message.includes("duplicate")) {
          alert("An entity with this identifier already exists.");
        } else {
          alert(`Failed to create entity: ${error.message}`);
        }
      } else {
        console.error("Unknown error type:", error);
        alert(`An unexpected error occurred while creating the entity. Please try again or contact support if the issue persists. Error details: ${JSON.stringify(error)}`);
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

  const getIdentifierLabel = () => {
    switch (formData.type) {
      case EntityType.Company:
        return "CIN / Registration Number";
      case EntityType.Individual:
        return "PAN Number";
      case EntityType.Trust:
        return "Trust Registration Number";
      case EntityType.Partnership:
        return "Partnership Registration Number";
      default:
        return "Identifier";
    }
  };

  const getIdentifierPlaceholder = () => {
    switch (formData.type) {
      case EntityType.Company:
        return "e.g., L12345MH2020PLC123456";
      case EntityType.Individual:
        return "e.g., ABCDE1234F";
      case EntityType.Trust:
        return "e.g., TR/2020/123456";
      case EntityType.Partnership:
        return "e.g., FP/2020/123456";
      default:
        return "Enter identifier";
    }
  };
  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-medium text-gray-900">Add New Entity</h3>
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
                  You're using guest access. Entities created may not persist
                  after your session ends. Consider{" "}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Entity Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter entity name"
              />
            </div>

            <div>
              <label
                htmlFor="type"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Entity Type *
              </label>
              <select
                id="type"
                name="type"
                required
                value={formData.type}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="company">Company</option>
                <option value="individual">Individual</option>
                <option value="trust">Trust</option>
                <option value="partnership">Partnership</option>
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="identifier"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              {getIdentifierLabel()} *
            </label>
            <input
              type="text"
              id="identifier"
              name="identifier"
              required
              value={formData.identifier}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder={getIdentifierPlaceholder()}
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
              rows={3}
              value={formData.description}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter entity description or role in the case"
            />
          </div>

          <div>
            <label
              htmlFor="address"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Address
            </label>
            <textarea
              id="address"
              name="address"
              rows={2}
              value={formData.address}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter registered address"
            />
          </div>

          <div>
            <label
              htmlFor="contactInfo"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Contact Information
            </label>
            <input
              type="text"
              id="contactInfo"
              name="contactInfo"
              value={formData.contactInfo}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              placeholder="Phone, email, or other contact details"
            />
          </div>

          <div>
            <label
              htmlFor="role"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Role in Case *
            </label>
            <select
              id="role"
              name="role"
              required
              value={formData.role}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="Primary Suspect">Primary Suspect</option>
              <option value="Suspect">Suspect</option>
              <option value="Person of Interest">Person of Interest</option>
              <option value="Witness">Witness</option>
              <option value="Victim">Victim</option>
              <option value="Related Party">Related Party</option>
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
                  Adding...
                </>
              ) : (
                "Add Entity"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
