"use client";

import { useState, useEffect } from "react";
import { regexPatternsService, type BankRegexPattern } from "@/services/database";
import { getAvailableBankPresets } from "@/constants/banks";

interface PatternManagerProps {
  bankPreset?: string;
}

export default function RegexPatternManager({ bankPreset }: PatternManagerProps) {
  const [patterns, setPatterns] = useState<BankRegexPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState<string>(bankPreset || "generic");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPattern, setNewPattern] = useState("");
  const [editingPattern, setEditingPattern] = useState<string | null>(null);

  const bankPresets = getAvailableBankPresets();

  useEffect(() => {
    loadPatterns();
  }, [selectedBank]);

  const loadPatterns = async () => {
    setLoading(true);
    try {
      const patternsData = await regexPatternsService.getPatternsWithStats(selectedBank);
      setPatterns(patternsData);
    } catch (error) {
      console.error("Error loading patterns:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPattern = async () => {
    if (!newPattern.trim()) return;

    try {
      const result = await regexPatternsService.addPattern(selectedBank, newPattern.trim(), {
        isAiGenerated: false,
        createdBy: "Manual-Entry",
        notes: "Manually added pattern",
        priority: 100,
      });

      if (result) {
        setNewPattern("");
        setShowAddForm(false);
        await loadPatterns();
      }
    } catch (error) {
      console.error("Error adding pattern:", error);
    }
  };

  const handleToggleActive = async (patternId: string, isActive: boolean) => {
    try {
      if (isActive) {
        await regexPatternsService.deactivatePattern(patternId);
      } else {
        // Reactivate - you'd need to add this method to the service
        await regexPatternsService.updatePatternPriority(patternId, 100);
      }
      await loadPatterns();
    } catch (error) {
      console.error("Error toggling pattern:", error);
    }
  };

  const handleUpdatePriority = async (patternId: string, priority: number) => {
    try {
      await regexPatternsService.updatePatternPriority(patternId, priority);
      await loadPatterns();
    } catch (error) {
      console.error("Error updating priority:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">
            Pattern Manager
          </h2>
          <div className="flex items-center space-x-3">
            <select
              value={selectedBank}
              onChange={(e) => setSelectedBank(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(bankPresets).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowAddForm(true)}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add Pattern
            </button>
          </div>
        </div>
      </div>

      {/* Add Pattern Form */}
      {showAddForm && (
        <div className="p-4 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-medium text-gray-900 mb-3">Add New Pattern</h3>
          <div className="flex space-x-3">
            <input
              type="text"
              value={newPattern}
              onChange={(e) => setNewPattern(e.target.value)}
              placeholder="Enter regex pattern (use capture group 1 for counterparty)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              onClick={handleAddPattern}
              disabled={!newPattern.trim()}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewPattern("");
              }}
              className="px-3 py-2 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Patterns List */}
      <div className="p-4">
        <div className="space-y-2">
          {patterns.length === 0 ? (
            <p className="text-sm text-gray-600">No patterns found for this bank</p>
          ) : (
            patterns.map((pattern) => (
              <div key={pattern.id} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="flex items-center space-x-2">
                    {pattern.is_ai_generated && (
                      <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                        AI
                      </span>
                    )}
                    <span className={`px-1.5 py-0.5 text-xs rounded ${
                      pattern.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {pattern.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <code className="text-sm font-mono text-gray-700 bg-white px-3 py-2 rounded border border-gray-200 flex-1">
                    {pattern.pattern}
                  </code>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-xs text-gray-600">
                    <div>Priority: {pattern.priority}</div>
                    <div>Success: {pattern.success_rate}%</div>
                    <div>Usage: {pattern.usage_count}</div>
                  </div>
                  <div className="flex flex-col space-y-1">
                    <button
                      onClick={() => handleToggleActive(pattern.id, pattern.is_active)}
                      className={`px-2 py-1 text-xs rounded ${
                        pattern.is_active
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {pattern.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <div className="flex items-center space-x-1">
                      <button
                        onClick={() => handleUpdatePriority(pattern.id, Math.max(1, pattern.priority - 10))}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleUpdatePriority(pattern.id, pattern.priority + 10)}
                        className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}