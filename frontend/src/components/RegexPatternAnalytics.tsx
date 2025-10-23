"use client";

import { useState, useEffect } from "react";
import { regexPatternsService, type BankRegexPattern } from "@/services/database";
import { getAvailableBankPresets } from "@/constants/banks";

interface PatternAnalyticsProps {
  bankPreset?: string;
}

export default function RegexPatternAnalytics({ bankPreset }: PatternAnalyticsProps) {
  const [patterns, setPatterns] = useState<BankRegexPattern[]>([]);
  const [analytics, setAnalytics] = useState<{
    totalPatterns: number;
    activePatterns: number;
    aiGeneratedPatterns: number;
    avgSuccessRate: number;
    topPerformingPatterns: BankRegexPattern[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedBank, setSelectedBank] = useState<string>(bankPreset || "generic");

  const bankPresets = getAvailableBankPresets();

  useEffect(() => {
    loadPatternData();
  }, [selectedBank]);

  const loadPatternData = async () => {
    setLoading(true);
    try {
      const [patternsData, analyticsData] = await Promise.all([
        regexPatternsService.getPatternsWithStats(selectedBank),
        regexPatternsService.getPatternAnalytics(selectedBank),
      ]);

      setPatterns(patternsData);
      setAnalytics(analyticsData);
    } catch (error) {
      console.error("Error loading pattern analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-600">Failed to load pattern analytics</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">
            Pattern Analytics
          </h2>
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
        </div>
      </div>

      {/* Summary Cards */}
      <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-blue-50 p-3 rounded">
          <div className="text-2xl font-bold text-blue-600">
            {analytics.totalPatterns}
          </div>
          <div className="text-sm text-blue-600">Total Patterns</div>
        </div>
        <div className="bg-green-50 p-3 rounded">
          <div className="text-2xl font-bold text-green-600">
            {analytics.activePatterns}
          </div>
          <div className="text-sm text-green-600">Active Patterns</div>
        </div>
        <div className="bg-purple-50 p-3 rounded">
          <div className="text-2xl font-bold text-purple-600">
            {analytics.aiGeneratedPatterns}
          </div>
          <div className="text-sm text-purple-600">AI Generated</div>
        </div>
        <div className="bg-orange-50 p-3 rounded">
          <div className="text-2xl font-bold text-orange-600">
            {analytics.avgSuccessRate}%
          </div>
          <div className="text-sm text-orange-600">Avg Success Rate</div>
        </div>
      </div>

      {/* Top Performing Patterns */}
      <div className="p-4 border-t border-gray-200">
        <h3 className="text-md font-medium text-gray-900 mb-3">
          Top Performing Patterns
        </h3>
        {analytics.topPerformingPatterns.length === 0 ? (
          <p className="text-sm text-gray-600">No patterns with usage data available</p>
        ) : (
          <div className="space-y-2">
            {analytics.topPerformingPatterns.map((pattern, index) => (
              <div key={pattern.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center space-x-3 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-medium text-gray-500">#{index + 1}</span>
                    {pattern.is_ai_generated && (
                      <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                        AI
                      </span>
                    )}
                  </div>
                  <code className="text-xs font-mono text-gray-700 bg-white px-2 py-1 rounded border border-gray-200 flex-1">
                    {pattern.pattern}
                  </code>
                </div>
                <div className="flex items-center space-x-4 text-xs text-gray-600">
                  <span>{pattern.usage_count} uses</span>
                  <span className="font-medium text-green-600">
                    {pattern.success_rate}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Patterns Table */}
      <div className="p-4 border-t border-gray-200">
        <h3 className="text-md font-medium text-gray-900 mb-3">
          All Patterns ({patterns.length})
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Pattern
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Priority
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Success Rate
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usage
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {patterns.map((pattern) => (
                <tr key={pattern.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs">
                    <div className="flex items-center space-x-2">
                      {pattern.is_ai_generated && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
                          AI
                        </span>
                      )}
                      <code className="text-xs font-mono text-gray-700 bg-gray-100 px-2 py-1 rounded">
                        {pattern.pattern.length > 60
                          ? pattern.pattern.substring(0, 60) + "..."
                          : pattern.pattern}
                      </code>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {pattern.priority}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`font-medium ${
                      pattern.success_rate >= 80 ? 'text-green-600' :
                      pattern.success_rate >= 60 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {pattern.success_rate}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {pattern.usage_count}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded text-xs ${
                      pattern.is_active
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {pattern.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}