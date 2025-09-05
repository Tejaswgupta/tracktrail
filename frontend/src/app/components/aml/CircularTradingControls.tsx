import React from 'react';

interface CircularTradingControlsProps {
  parameters: {
    minLength: number;
    maxLength: number;
    minAmount: number;
    maxDurationDays: number;
    netFlowThreshold: number;
  };
  onParametersChange: (parameters: any) => void;
  onAnalyze: () => void;
  loading: boolean;
  selectedEntityCount: number;
}

export function CircularTradingControls({
  parameters,
  onParametersChange,
  onAnalyze,
  loading,
  selectedEntityCount,
}: CircularTradingControlsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
      <div>
        <label 
          htmlFor="minLength" 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Min Cycle Length
        </label>
        <input
          id="minLength"
          type="number"
          min="2"
          max="10"
          value={parameters.minLength}
          onChange={(e) => onParametersChange({
            ...parameters,
            minLength: parseInt(e.target.value) || 2
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="2"
          title="Minimum number of entities in a cycle (2-10)"
        />
      </div>

      <div>
        <label 
          htmlFor="maxLength" 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Max Cycle Length
        </label>
        <input
          id="maxLength"
          type="number"
          min="2"
          max="20"
          value={parameters.maxLength}
          onChange={(e) => onParametersChange({
            ...parameters,
            maxLength: parseInt(e.target.value) || 10
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="10"
          title="Maximum number of entities in a cycle (2-20)"
        />
      </div>

      <div>
        <label 
          htmlFor="minAmount" 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Min Amount (₹)
        </label>
        <input
          id="minAmount"
          type="number"
          min="0"
          step="1000"
          value={parameters.minAmount}
          onChange={(e) => onParametersChange({
            ...parameters,
            minAmount: parseInt(e.target.value) || 0
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="1000"
          title="Minimum transaction amount to include in analysis"
        />
      </div>

      <div>
        <label 
          htmlFor="maxDuration" 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Max Duration (days)
        </label>
        <input
          id="maxDuration"
          type="number"
          min="1"
          max="365"
          value={parameters.maxDurationDays}
          onChange={(e) => onParametersChange({
            ...parameters,
            maxDurationDays: parseInt(e.target.value) || 365
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="365"
          title="Maximum time span for cycle completion (1-365 days)"
        />
      </div>

      <div>
        <label 
          htmlFor="netFlowThreshold" 
          className="block text-sm font-medium text-gray-700 mb-1"
        >
          Net Flow Threshold
        </label>
        <input
          id="netFlowThreshold"
          type="number"
          min="0"
          max="1"
          step="0.01"
          value={parameters.netFlowThreshold}
          onChange={(e) => onParametersChange({
            ...parameters,
            netFlowThreshold: parseFloat(e.target.value) || 0.1
          })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="0.1"
          title="Maximum allowed net flow ratio for round trip detection (0.0-1.0)"
        />
      </div>

      <div>
        <button
          onClick={onAnalyze}
          disabled={loading || selectedEntityCount === 0}
          className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          title={selectedEntityCount === 0 ? "Select entities to analyze" : "Start circular trading analysis"}
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Analyzing...
            </>
          ) : (
            'Analyze Circular Trading'
          )}
        </button>
      </div>
    </div>
  );
}
