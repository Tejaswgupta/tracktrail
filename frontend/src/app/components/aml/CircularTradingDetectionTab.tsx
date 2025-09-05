"use client";

import React, { useState } from 'react';
import { useCircularTradingAnalysis } from '@/hooks/useCircularTradingAnalysis';
import { CircularTradingGraph } from './CircularTradingGraph';
import { CircularTradingControls } from './CircularTradingControls';

interface CircularTradingDetectionTabProps {
  caseId: string;
  amlMetadata: any;
  selectedEntityIds: string[];
}

export default function CircularTradingDetectionTab({
  caseId,
  amlMetadata,
  selectedEntityIds,
}: CircularTradingDetectionTabProps) {
  const [analysisParameters, setAnalysisParameters] = useState({
    minLength: 2,
    maxLength: 10,
    minAmount: 1000,
    maxDurationDays: 365,
    netFlowThreshold: 0.1,
  });

  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);
  const [highlightedEntities, setHighlightedEntities] = useState<string[]>([]);

  const {
    loading,
    error,
    result,
    analyzeCircularTrading,
    clearResult,
    clearError,
  } = useCircularTradingAnalysis();

  const handleAnalyze = async () => {
    if (selectedEntityIds.length === 0) {
      return;
    }
    await analyzeCircularTrading(selectedEntityIds, analysisParameters);
  };

  const handleCycleSelect = (cycleId: string) => {
    setSelectedCycle(cycleId);
    const cycle = result?.cycles.find(c => c.cycleId === cycleId);
    if (cycle) {
      setHighlightedEntities([...cycle.path]);
    }
  };

  const handleNodeSelect = (nodeId: string) => {
    const relatedCycles = result?.cycles.filter(c => c.path.includes(nodeId)) || [];
    if (relatedCycles.length > 0) {
      handleCycleSelect(relatedCycles[0].cycleId);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Circular Trading Detection
            </h3>
            <p className="text-sm text-gray-600">
              Analyze {selectedEntityIds.length} entities for circular trading patterns using network graph analysis
            </p>
          </div>
          {result && (
            <button
              onClick={clearResult}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear Results
            </button>
          )}
        </div>

        <CircularTradingControls
          parameters={analysisParameters}
          onParametersChange={setAnalysisParameters}
          onAnalyze={handleAnalyze}
          loading={loading}
          selectedEntityCount={selectedEntityIds.length}
        />

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Analysis Error</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
                <button
                  onClick={clearError}
                  className="mt-2 text-sm text-red-600 hover:text-red-500 underline"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Analyzing circular trading patterns...</span>
          </div>
        ) : result ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
              <div className="xl:col-span-3">
                <CircularTradingGraph
                  nodes={result.nodes}
                  edges={result.edges}
                  cycles={result.cycles}
                  selectedCycle={selectedCycle}
                  highlightedEntities={highlightedEntities}
                  onNodeSelect={handleNodeSelect}
                  onCycleHighlight={handleCycleSelect}
                />
              </div>
              
              <div className="xl:col-span-1">
                <div className="bg-gray-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-4">Detected Cycles</h4>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {result.cycles.length === 0 ? (
                      <div className="text-center py-8 text-gray-500">
                        <svg className="w-12 h-12 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p className="text-sm">No circular trading patterns detected</p>
                        <p className="text-xs text-gray-400 mt-1">Try adjusting the analysis parameters</p>
                      </div>
                    ) : (
                      result.cycles.map((cycle) => (
                        <div
                          key={cycle.cycleId}
                          className={`p-3 border rounded cursor-pointer transition-colors ${
                            selectedCycle === cycle.cycleId 
                              ? 'border-blue-500 bg-blue-50' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => handleCycleSelect(cycle.cycleId)}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="text-sm font-medium text-gray-900">
                              {cycle.cycleType === 'simple' ? '🔄' : cycle.cycleType === 'complex' ? '🌀' : '🎯'} 
                              {cycle.cycleLength}-Entity Cycle
                            </div>
                            <div className={`text-xs px-2 py-1 rounded ${
                              cycle.confidenceScore > 0.7 ? 'bg-red-100 text-red-700' :
                              cycle.confidenceScore > 0.4 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-100 text-green-700'
                            }`}>
                              {(cycle.confidenceScore * 100).toFixed(0)}%
                            </div>
                          </div>
                          
                          <div className="text-xs text-gray-600 space-y-1">
                            <div>Amount: ₹{cycle.totalAmount.toLocaleString()}</div>
                            <div>Duration: {cycle.durationDays} days</div>
                            <div>Net Flow: ₹{Math.abs(cycle.netFlow).toLocaleString()}</div>
                          </div>
                          
                          <div className="mt-2 text-xs text-gray-500 truncate">
                            Path: {cycle.path.join(' → ')}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Ready for Circular Trading Analysis
            </h3>
            <p className="text-gray-500 mb-4">
              Click "Analyze Circular Trading" to detect round trip patterns in your selected entities
            </p>
            <button
              onClick={handleAnalyze}
              disabled={selectedEntityIds.length === 0}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Analyze Circular Trading
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
