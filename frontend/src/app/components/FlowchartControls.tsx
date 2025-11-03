"use client";

import type { Entity } from "@/types/database";

interface FlowchartControlsProps {
  entities: Entity[];
  selectedEntityFilter: string;
  onEntityFilterChange: (value: string) => void;
  minAmountThreshold: number;
  onMinAmountThresholdChange: (value: number) => void;
  showInflow: boolean;
  onShowInflowChange: (value: boolean) => void;
  showOutflow: boolean;
  onShowOutflowChange: (value: boolean) => void;
  nodeSizing: "count" | "volume";
  onNodeSizingChange: (value: "count" | "volume") => void;
}

export default function FlowchartControls({
  entities,
  selectedEntityFilter,
  onEntityFilterChange,
  minAmountThreshold,
  onMinAmountThresholdChange,
  showInflow,
  onShowInflowChange,
  showOutflow,
  onShowOutflowChange,
  nodeSizing,
  onNodeSizingChange,
}: FlowchartControlsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Filters & Settings</h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Entity Filter */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entity Filter
          </label>
          <select
            value={selectedEntityFilter}
            onChange={(e) => onEntityFilterChange(e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Entities</option>
            {entities.map((entity) => (
              <option key={entity.entity_id} value={entity.entity_id}>
                {entity.entity_name}
              </option>
            ))}
          </select>
        </div>

        {/* Minimum Amount Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min. Transaction Amount
          </label>
          <input
            type="range"
            min="0"
            max="1000000"
            step="10000"
            value={minAmountThreshold}
            onChange={(e) => onMinAmountThresholdChange(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>₹0</span>
            <span className="font-medium text-gray-700">
              {formatCurrency(minAmountThreshold)}
            </span>
            <span>₹10L+</span>
          </div>
        </div>

        {/* Flow Direction */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Flow Direction
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showInflow}
                onChange={(e) => onShowInflowChange(e.target.checked)}
                className="h-4 w-4 text-green-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Inflow (Credits)</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showOutflow}
                onChange={(e) => onShowOutflowChange(e.target.checked)}
                className="h-4 w-4 text-red-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">Outflow (Debits)</span>
            </label>
          </div>
        </div>

        {/* Node Sizing */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Node Size Based On
          </label>
          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="radio"
                name="nodeSizing"
                value="volume"
                checked={nodeSizing === "volume"}
                onChange={(e) => onNodeSizingChange(e.target.value as "count" | "volume")}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Total Volume</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="nodeSizing"
                value="count"
                checked={nodeSizing === "count"}
                onChange={(e) => onNodeSizingChange(e.target.value as "count" | "volume")}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">Transaction Count</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
