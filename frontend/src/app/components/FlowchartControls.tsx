"use client";

import type { Entity } from "@/types/database";
import { TIMELINE_EVENT_LIMIT_OPTIONS } from "./FlowchartConstants";

export interface FlowDateRange {
  from: string | null;
  to: string | null;
}

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
  timelineEventLimit: number;
  onTimelineEventLimitChange: (value: number) => void;
  dateRange: FlowDateRange;
  availableDateRange?: FlowDateRange;
  onDateRangeChange: (value: Partial<FlowDateRange>) => void;
  onResetDateRange: () => void;
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
  timelineEventLimit,
  onTimelineEventLimitChange,
  dateRange,
  availableDateRange,
  onDateRangeChange,
  onResetDateRange,
}: FlowchartControlsProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDateLabel = (value: string | null) => {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(value));
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">
        Filters &amp; Settings
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
        {/* Entity Filter */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Entity Selection
          </label>

          {/* Quick select options */}
          <div className="mb-3 flex flex-wrap gap-2">
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
                onSelectedEntitiesChange(
                  entities.map((entity) => entity.entity_id)
                );
              }}
              className={`px-3 py-1 text-xs rounded ${
                selectedEntityFilter === "custom" &&
                selectedEntities.length === entities.length &&
                entities.length > 0
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
                selectedEntityFilter === "custom" &&
                selectedEntities.length === 0
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
                const isSelected =
                  selectedEntityFilter === "all" ||
                  (selectedEntityFilter === "custom" &&
                    selectedEntities.includes(entity.entity_id));

                return (
                  <label key={entity.entity_id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          if (selectedEntityFilter === "all") {
                            onEntityFilterChange("custom");
                            onSelectedEntitiesChange([entity.entity_id]);
                          } else if (
                            !selectedEntities.includes(entity.entity_id)
                          ) {
                            onSelectedEntitiesChange([
                              ...selectedEntities,
                              entity.entity_id,
                            ]);
                          }
                        } else {
                          if (selectedEntityFilter === "all") {
                            onEntityFilterChange("custom");
                            onSelectedEntitiesChange(
                              entities
                                .map((item) => item.entity_id)
                                .filter((id) => id !== entity.entity_id)
                            );
                          } else {
                            const updated = selectedEntities.filter(
                              (id) => id !== entity.entity_id
                            );
                            if (updated.length === 0) {
                              onEntityFilterChange("all");
                              onSelectedEntitiesChange([]);
                            } else {
                              onSelectedEntitiesChange(updated);
                            }
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
              : `${selectedEntities.length} of ${entities.length} entities selected`}
          </div>
        </div>

        {/* Time Window */}
        <div className="lg:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Time Window
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.from ?? ""}
                onChange={(event) =>
                  onDateRangeChange({ from: event.target.value || null })
                }
                min={availableDateRange?.from ?? undefined}
                max={dateRange.to ?? availableDateRange?.to ?? undefined}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!availableDateRange?.from}
              />
              <span className="text-sm text-gray-500">to</span>
              <input
                type="date"
                value={dateRange.to ?? ""}
                onChange={(event) =>
                  onDateRangeChange({ to: event.target.value || null })
                }
                min={dateRange.from ?? availableDateRange?.from ?? undefined}
                max={availableDateRange?.to ?? undefined}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!availableDateRange?.to}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>
                {availableDateRange?.from && availableDateRange?.to
                  ? `Full range: ${formatDateLabel(
                      availableDateRange.from
                    )} – ${formatDateLabel(availableDateRange.to)}`
                  : "No transactions available"}
              </span>
              <button
                type="button"
                onClick={onResetDateRange}
                className="text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
                disabled={!availableDateRange?.from || !availableDateRange?.to}
              >
                Reset
              </button>
            </div>
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
            onChange={(event) =>
              onMinAmountThresholdChange(Number(event.target.value))
            }
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
                onChange={(event) => onShowInflowChange(event.target.checked)}
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
                onChange={(event) => onShowOutflowChange(event.target.checked)}
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
                onChange={(event) =>
                  onNodeSizingChange(event.target.value as "count" | "volume")
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
                onChange={(event) =>
                  onNodeSizingChange(event.target.value as "count" | "volume")
                }
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              <span className="ml-2 text-sm text-gray-700">
                Transaction Count
              </span>
            </label>
          </div>
        </div>

        {/* Timeline Event Limit */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Timeline Event Limit
          </label>
          <select
            value={timelineEventLimit}
            onChange={(event) => {
              const nextValue = Number(event.target.value);
              if (Number.isFinite(nextValue)) {
                onTimelineEventLimitChange(nextValue);
              }
            }}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            {!TIMELINE_EVENT_LIMIT_OPTIONS.includes(timelineEventLimit) ? (
              <option value={timelineEventLimit}>
                {timelineEventLimit.toLocaleString()} events
              </option>
            ) : null}
            {TIMELINE_EVENT_LIMIT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option.toLocaleString()} events
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1">
            Larger limits may impact chronological view performance.
          </div>
        </div>
      </div>
    </div>
  );
}
