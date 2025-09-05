"use client";

import React from 'react';

interface MuleAccountControlsProps {
  parameters: {
    minCollectionTransactions: number;
    minDisbursementAmountRatio: number;
    maxCollectionPeriodDays: number;
    velocityThreshold: number;
    periodicityTolerance: number;
    sensitivityMultiplier: number;
    patternSensitivity: 'low' | 'medium' | 'high';
  };
  onParametersChange: (parameters: any) => void;
  onAnalyze: () => void;
  loading: boolean;
  selectedEntityCount: number;
}

export function MuleAccountControls({
  parameters,
  onParametersChange,
  onAnalyze,
  loading,
  selectedEntityCount,
}: MuleAccountControlsProps) {
  const handleParameterChange = (key: string, value: any) => {
    onParametersChange({
      ...parameters,
      [key]: value,
    });
  };

  const resetToDefaults = () => {
    onParametersChange({
      minCollectionTransactions: 5,
      minDisbursementAmountRatio: 3.0,
      maxCollectionPeriodDays: 30,
      velocityThreshold: 0.5,
      periodicityTolerance: 2,
      sensitivityMultiplier: 1.0,
      patternSensitivity: 'medium' as const,
    });
  };

  const getSensitivityColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-700 border-green-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-300';
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-semibold text-gray-900">Analysis Parameters</h4>
        <div className="flex items-center space-x-2">
          <button
            onClick={resetToDefaults}
            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-gray-100"
          >
            Reset Defaults
          </button>
          <button
            onClick={onAnalyze}
            disabled={loading || selectedEntityCount === 0}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Analyzing...
              </>
            ) : (
              'Analyze Mule Accounts'
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Pattern Sensitivity */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">
            Pattern Sensitivity
            <div className="text-xs text-gray-500 mt-1">Detection sensitivity level</div>
          </label>
          <div className="flex space-x-1">
            {(['low', 'medium', 'high'] as const).map((level) => (
              <button
                key={level}
                onClick={() => handleParameterChange('patternSensitivity', level)}
                className={`px-3 py-2 text-xs border rounded-md flex-1 transition-colors ${
                  parameters.patternSensitivity === level
                    ? getSensitivityColor(level)
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                aria-label={`Set pattern sensitivity to ${level}`}
              >
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Min Collection Transactions */}
        <div className="space-y-2">
          <label htmlFor="minCollectionTransactions" className="text-sm font-medium text-gray-700">
            Min Collection Transactions
            <div className="text-xs text-gray-500 mt-1">Minimum credit transactions to consider</div>
          </label>
          <input
            id="minCollectionTransactions"
            type="number"
            min="3"
            max="20"
            step="1"
            value={parameters.minCollectionTransactions}
            onChange={(e) => handleParameterChange('minCollectionTransactions', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="minCollectionTransactions-help"
          />
        </div>

        {/* Disbursement Amount Ratio */}
        <div className="space-y-2">
          <label htmlFor="minDisbursementAmountRatio" className="text-sm font-medium text-gray-700">
            Disbursement Ratio
            <div className="text-xs text-gray-500 mt-1">Large debit vs average credit multiplier</div>
          </label>
          <input
            id="minDisbursementAmountRatio"
            type="number"
            min="1.5"
            max="10"
            step="0.5"
            value={parameters.minDisbursementAmountRatio}
            onChange={(e) => handleParameterChange('minDisbursementAmountRatio', parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="minDisbursementAmountRatio-help"
          />
        </div>

        {/* Collection Period */}
        <div className="space-y-2">
          <label htmlFor="maxCollectionPeriodDays" className="text-sm font-medium text-gray-700">
            Max Collection Period
            <div className="text-xs text-gray-500 mt-1">Maximum days for collection phase</div>
          </label>
          <input
            id="maxCollectionPeriodDays"
            type="number"
            min="7"
            max="90"
            step="1"
            value={parameters.maxCollectionPeriodDays}
            onChange={(e) => handleParameterChange('maxCollectionPeriodDays', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="maxCollectionPeriodDays-help"
          />
        </div>

        {/* Velocity Threshold */}
        <div className="space-y-2">
          <label htmlFor="velocityThreshold" className="text-sm font-medium text-gray-700">
            Velocity Threshold
            <div className="text-xs text-gray-500 mt-1">Transactions per day threshold</div>
          </label>
          <input
            id="velocityThreshold"
            type="number"
            min="0.1"
            max="5"
            step="0.1"
            value={parameters.velocityThreshold}
            onChange={(e) => handleParameterChange('velocityThreshold', parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="velocityThreshold-help"
          />
        </div>

        {/* Sensitivity Multiplier */}
        <div className="space-y-2">
          <label htmlFor="sensitivityMultiplier" className="text-sm font-medium text-gray-700">
            Sensitivity Multiplier
            <div className="text-xs text-gray-500 mt-1">Adjust overall detection sensitivity</div>
          </label>
          <input
            id="sensitivityMultiplier"
            type="number"
            min="0.5"
            max="2.0"
            step="0.1"
            value={parameters.sensitivityMultiplier}
            onChange={(e) => handleParameterChange('sensitivityMultiplier', parseFloat(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-describedby="sensitivityMultiplier-help"
          />
        </div>
      </div>

      {/* Advanced Settings */}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
          Advanced Settings
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4 pl-4 border-l-2 border-gray-200">
          <div className="space-y-2">
            <label htmlFor="periodicityTolerance" className="text-sm font-medium text-gray-700">
              Periodicity Tolerance
              <div className="text-xs text-gray-500 mt-1">Days tolerance for periodic patterns</div>
            </label>
            <input
              id="periodicityTolerance"
              type="number"
              min="1"
              max="7"
              step="1"
              value={parameters.periodicityTolerance}
              onChange={(e) => handleParameterChange('periodicityTolerance', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-describedby="periodicityTolerance-help"
            />
          </div>
        </div>
      </details>

      {/* Configuration Summary */}
      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <div className="text-xs text-blue-700">
          <div className="flex justify-between items-center mb-2">
            <span className="font-medium">Current Configuration:</span>
            <span className={`px-2 py-1 rounded text-xs font-medium ${getSensitivityColor(parameters.patternSensitivity)}`}>
              {parameters.patternSensitivity.toUpperCase()} SENSITIVITY
            </span>
          </div>
          <div className="space-y-1">
            <div>Will detect accounts with ≥{parameters.minCollectionTransactions} credits followed by large debits</div>
            <div>Large debits must be ≥{parameters.minDisbursementAmountRatio}x average credit amount</div>
            <div>Collection period limited to {parameters.maxCollectionPeriodDays} days</div>
            {parameters.sensitivityMultiplier !== 1.0 && (
              <div>Sensitivity adjusted by {parameters.sensitivityMultiplier}x multiplier</div>
            )}
          </div>
        </div>
      </div>

      {selectedEntityCount === 0 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
          <div className="text-sm text-amber-700">
            Please select entities from the Entity Mapping tab to analyze
          </div>
        </div>
      )}
    </div>
  );
}
