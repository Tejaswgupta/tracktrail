"use client";
import React, { useState, useEffect } from 'react';
import { useMuleAccountAnalysis } from '@/hooks/useMuleAccountAnalysis';
import { MuleAccountReport } from './MuleAccountReport';
import { MuleAccountControls } from './MuleAccountControls';
import type { MuleAlert } from '@/types/mule';

interface MuleAccountDetectionTabProps {
  caseId: string;
  amlMetadata: any;
  selectedEntityIds: string[];
}

export default function MuleAccountDetectionTab({
  caseId,
  amlMetadata,
  selectedEntityIds,
}: MuleAccountDetectionTabProps) {
  const [analysisParameters, setAnalysisParameters] = useState({
    minCollectionTransactions: 5,
    minDisbursementAmountRatio: 3.0,
    maxCollectionPeriodDays: 30,
    velocityThreshold: 0.5,
    periodicityTolerance: 2,
    sensitivityMultiplier: 1.0,
    patternSensitivity: 'medium' as 'low' | 'medium' | 'high',
  });

  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');

  const {
    loading,
    error,
    result,
    analyzeMuleAccounts,
    clearResult,
    clearError,
  } = useMuleAccountAnalysis();

  useEffect(() => {
    console.log('MuleTab received selectedEntityIds:', selectedEntityIds);
  }, [selectedEntityIds]);

  const handleAnalyze = async () => {
    console.log('Analyzing with entities:', selectedEntityIds);
    if (selectedEntityIds.length === 0) {
      alert('Please select entities first from the Entity Selection section above.');
      return;
    }
    await analyzeMuleAccounts(selectedEntityIds, analysisParameters);
  };

  const handleAlertSelect = (alertId: string) => {
    setSelectedAlert(alertId);
    setViewMode('detailed');
  };

  const getAlertsByRiskLevel = (): { high: MuleAlert[]; medium: MuleAlert[]; low: MuleAlert[] } => {
    if (!result?.alerts || !Array.isArray(result.alerts)) {
      return { high: [], medium: [], low: [] };
    }
    
    return result.alerts.reduce(
      (acc, alert) => {
        if (alert.confidence_score >= 0.7) {
          acc.high.push(alert);
        } else if (alert.confidence_score >= 0.4) {
          acc.medium.push(alert);
        } else {
          acc.low.push(alert);
        }
        return acc;
      },
      { high: [], medium: [], low: [] } as { high: MuleAlert[]; medium: MuleAlert[]; low: MuleAlert[] }
    );
  };

  const alertsByRisk = getAlertsByRiskLevel();

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Analyzing mule account patterns...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
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
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Mule Account Detection
            </h3>
            <p className="text-sm text-gray-600">
              Analyze {selectedEntityIds.length} entities for pass-through money laundering patterns
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {result && (
              <>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setViewMode('summary')}
                    className={`px-3 py-1 text-sm rounded-md ${
                      viewMode === 'summary' 
                        ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                        : 'text-gray-600 hover:text-gray-800 border border-gray-300'
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setViewMode('detailed')}
                    className={`px-3 py-1 text-sm rounded-md ${
                      viewMode === 'detailed' 
                        ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                        : 'text-gray-600 hover:text-gray-800 border border-gray-300'
                    }`}
                  >
                    Detailed
                  </button>
                </div>
                <button
                  onClick={clearResult}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Clear Results
                </button>
              </>
            )}
          </div>
        </div>
        <MuleAccountControls
          parameters={analysisParameters}
          onParametersChange={setAnalysisParameters}
          onAnalyze={handleAnalyze}
          loading={loading}
          selectedEntityCount={selectedEntityIds.length}
        />
      </div>
      <div className="p-6">
        {result ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-600">{alertsByRisk.high.length}</div>
                <div className="text-sm text-red-700">High Risk Alerts</div>
                <div className="text-xs text-red-600 mt-1">≥70% confidence</div>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-600">{alertsByRisk.medium.length}</div>
                <div className="text-sm text-yellow-700">Medium Risk Alerts</div>
                <div className="text-xs text-yellow-600 mt-1">40-69% confidence</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-600">{result?.summary?.total_alerts ?? 0}</div>
                <div className="text-sm text-blue-700">Total Alerts</div>
                <div className="text-xs text-blue-600 mt-1">All patterns detected</div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-600">{selectedEntityIds.length}</div>
                <div className="text-sm text-gray-700">Entities Analyzed</div>
                <div className="text-xs text-gray-600 mt-1">Transaction accounts</div>
              </div>
            </div>
            {viewMode === 'summary' ? (
              <div className="space-y-6">
                {alertsByRisk.high.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold text-red-700 mb-4 flex items-center">
                      <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Critical Risk Alerts ({alertsByRisk.high.length})
                    </h4>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {alertsByRisk.high.map((alert, index) => (
                        <div
                          key={`high-alert-${alert.account_id || 'unknown'}-${index}`}
                          className="border-2 border-red-300 rounded-lg p-4 bg-red-50 cursor-pointer hover:bg-red-100 transition-colors"
                          onClick={() => handleAlertSelect(alert.account_id || `alert-${index}`)}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="font-medium text-red-900">{alert.account_id || `Account ${index + 1}`}</div>
                            <div className="px-2 py-1 bg-red-600 text-white text-xs rounded font-medium">
                              {(alert.confidence_score * 100).toFixed(0)}% RISK
                            </div>
                          </div>
                          <div className="text-sm text-red-800 mb-2">
                            Pattern: <span className="font-medium">{alert.pattern_type?.replace('_', ' ').toUpperCase() || 'UNKNOWN'}</span>
                          </div>
                          <div className="text-xs text-red-700">
                            {alert.risk_indicators?.slice(0, 2).join('. ') || 'Suspicious activity detected'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(result?.summary?.total_alerts ?? 0) === 0 && (
                  <div className="text-center py-12">
                    <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
                      <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Mule Account Patterns Detected</h3>
                    <p className="text-gray-500">
                      The analyzed entities show no signs of pass-through money laundering activity
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <MuleAccountReport
                alerts={result.alerts}
                summary={result.summary}
                selectedAlert={selectedAlert}
                onAlertSelect={handleAlertSelect}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Ready for Mule Account Analysis
            </h3>
            <p className="text-gray-500 mb-4">
              Select entities above, then click "Analyze Mule Accounts" to detect pass-through money laundering patterns
            </p>
            <button
              onClick={handleAnalyze}
              disabled={selectedEntityIds.length === 0}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Analyze Mule Accounts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
