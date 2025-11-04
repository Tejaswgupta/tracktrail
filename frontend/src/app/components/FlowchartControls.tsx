"use client";

import type { Entity } from "@/types/database";

interface FlowchartControlsProps {
  entities: Entity[];
  selectedEntityFilter: string;
  onEntityFilterChange: (value: string) => void;
  selectedEntities: string[];
  onSelectedEntitiesChange: (value: string[]) => void;
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
  selectedEntities,
  onSelectedEntitiesChange,
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
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Filters & Settings
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Entity Filter */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entity Selection
          </label>

          {/* Quick select options */}
          <div className="mb-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onEntityFilterChange("all");
                onSelectedEntitiesChange([]);
              }}
              className={`px-3 py-1 text-xs rounded ${
                selectedEntityFilter === "all"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              All Entities
            </button>
            <button
              type="button"
              onClick={() => {
                onEntityFilterChange("custom");
                onSelectedEntitiesChange(entities.map(e => e.entity_id));
              }}
              className={`px-3 py-1 text-xs rounded ${
                selectedEntityFilter === "custom" && selectedEntities.length === entities.length
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Select All
            </button>
            <button
              type="button"
              onClick={() => {
                onEntityFilterChange("custom");
                onSelectedEntitiesChange([]);
              }}
              className={`px-3 py-1 text-xs rounded ${
                selectedEntityFilter === "custom" && selectedEntities.length === 0
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              Clear All
            </button>
          </div>

          {/* Entity checkboxes */}
          <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-3 bg-gray-50">
            <div className="space-y-2">
              {entities.map((entity) => {
                const isSelected = selectedEntityFilter === "all" ||
                  (selectedEntityFilter === "custom" && selectedEntities.includes(entity.entity_id));

                return (
                  <label key={entity.entity_id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(e) => {
                        if (e.target.checked) {
                          if (selectedEntityFilter === "all") {
                            onEntityFilterChange("custom");
                            onSelectedEntitiesChange([entity.entity_id]);
                          } else {
                            onSelectedEntitiesChange([...selectedEntities, entity.entity_id]);
                          }
                        } else {
                          const newSelected = selectedEntities.filter(id => id !== entity.entity_id);
                          if (newSelected.length === 0) {
                            onEntityFilterChange("all");
                            onSelectedEntitiesChange([]);
                          } else {
                            onSelectedEntitiesChange(newSelected);
                          }
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="ml-2 text-sm text-gray-700 truncate">
                      {entity.entity_name}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Selection summary */}
          <div className="text-xs text-gray-500 mt-1">
            {selectedEntityFilter === "all"
              ? "All entities selected"
              : `${selectedEntities.length} of ${entities.length} entities selected`
            }
          </div>
        </div>

        {/* Minimum Amount Threshold */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Min. Transaction Amount
          </label>
          <input
            type="number"
            min="0"
            step="1000"
            value={minAmountThreshold}
            onChange={(e) => onMinAmountThresholdChange(Number(e.target.value))}
            placeholder="Enter amount"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <div className="text-xs text-gray-500 mt-1">
            Current: {formatCurrency(minAmountThreshold)}
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
              <span className="ml-2 text-sm text-gray-700">
                Inflow (Credits)
              </span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={showOutflow}
                onChange={(e) => onShowOutflowChange(e.target.checked)}
                className="h-4 w-4 text-red-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                Outflow (Debits)
              </span>
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
                onChange={(e) =>
                  onNodeSizingChange(e.target.value as "count" | "volume")
                }
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
                onChange={(e) =>
                  onNodeSizingChange(e.target.value as "count" | "volume")
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">
                Transaction Count
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
