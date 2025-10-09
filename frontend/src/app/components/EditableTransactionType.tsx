import { useState, useEffect, useRef } from 'react';

interface EditableTransactionTypeProps {
  type: string;
  description?: string;
  onSave: (newType: string) => void;
  disabled?: boolean;
  predefinedTypes?: string[];
}

export default function EditableTransactionType({
  type,
  description,
  onSave,
  disabled = false,
  predefinedTypes = []
}: EditableTransactionTypeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editValue, setEditValue] = useState(type);
  const [isCustomType, setIsCustomType] = useState(!predefinedTypes.includes(type));
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset edit value when type prop changes
  useEffect(() => {
    setEditValue(type);
    setIsCustomType(!predefinedTypes.includes(type));
  }, [type, predefinedTypes]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // Select all text for easy editing
    }
  }, [isEditing]);

  const handleTypeChange = (newType: string) => {
    setEditValue(newType);
    setIsCustomType(newType === "CUSTOM" || !predefinedTypes.includes(newType));
    if (newType === "CUSTOM" && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleEdit = () => {
    if (!disabled && !isSaving) {
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    let finalValue = editValue.trim();

    // If it's a custom type and not empty, save it
    // If it's a predefined type, save it
    if (finalValue && finalValue !== type && finalValue !== "CUSTOM") {
      setIsSaving(true);
      try {
        await onSave(finalValue);
        setIsEditing(false);
      } catch (error) {
        console.error("Error saving transaction type:", error);
      } finally {
        setIsSaving(false);
      }
    } else {
      // If no change or empty, just cancel
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setEditValue(type); // Reset to original type
    setIsCustomType(!predefinedTypes.includes(type));
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="flex flex-col">
      {isEditing || isSaving ? (
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-2">
            {predefinedTypes.length > 0 ? (
              <select
                value={isCustomType ? "CUSTOM" : editValue}
                onChange={(e) => handleTypeChange(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
              >
                <option value="">Select Type</option>
                {predefinedTypes.map((predefinedType) => (
                  <option key={predefinedType} value={predefinedType}>
                    {predefinedType}
                  </option>
                ))}
                <option value="CUSTOM">+ Add Custom Type</option>
              </select>
            ) : (
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
                autoFocus
                placeholder="Enter transaction type"
              />
            )}
            {isCustomType && (
              <input
                ref={inputRef}
                type="text"
                value={editValue === "CUSTOM" ? "" : editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                disabled={isSaving}
                autoFocus
                placeholder="Enter custom type"
              />
            )}
          </div>
          <div className="flex space-x-1">
            <button
              onClick={handleSave}
              disabled={isSaving || (isCustomType && !editValue.trim())}
              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-1 h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </span>
              ) : "Save"}
            </button>
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="text-xs bg-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col">
          <div
            className={`font-medium text-gray-900 cursor-pointer hover:bg-gray-100 rounded px-1 ${!disabled ? 'underline decoration-dotted' : ''}`}
            onClick={handleEdit}
            title={disabled ? "Editing disabled" : "Click to edit transaction type"}
          >
            {type}
          </div>
          {description && !isEditing && !isSaving && (
            <div className="text-xs text-gray-500 font-normal truncate" title={description}>
              {description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}