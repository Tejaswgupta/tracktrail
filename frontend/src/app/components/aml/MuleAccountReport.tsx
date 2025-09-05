"use client";

import React from 'react';
import type { MuleAlert } from '@/types/mule';

interface MuleAccountReportProps {
  alerts: MuleAlert[];
  summary: {
    total_alerts: number;
    high_confidence_alerts: number;
    entities_analyzed: number;
    alerts_generated: number;
  };
  selectedAlert: string | null;
  onAlertSelect: (alertId: string) => void;
}

export function MuleAccountReport({
  alerts,
  summary,
  selectedAlert,
  onAlertSelect,
}: MuleAccountReportProps) {
  const selectedAlertData = alerts.find(alert => alert.account_id === selectedAlert);

  const formatCurrency = (amount: number) => {
    return `₹${amount.toLocaleString('en-IN')}`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN');
  };

  const getRiskLevel = (confidence: number) => {
    if (confidence >= 0.7) return 'HIGH RISK';
    if (confidence >= 0.4) return 'MEDIUM RISK';
    return 'LOW RISK';
  };

  const getRiskColor = (confidence: number) => {
    if (confidence >= 0.7) return 'text-red-700 bg-red-100 border-red-300';
    if (confidence >= 0.4) return 'text-yellow-700 bg-yellow-100 border-yellow-300';
    return 'text-green-700 bg-green-100 border-green-300';
  };

  if (!selectedAlertData) {
    return (
      <div className="space-y-6">
        <h4 className="text-lg font-semibold text-gray-900">Detected Mule Account Patterns</h4>
        
        <div className="grid gap-4">
          {alerts.map((alert) => (
            <div
              key={alert.account_id}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => onAlertSelect(alert.account_id)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h5 className="font-medium text-gray-900 mb-1">{alert.account_id}</h5>
                  <p className="text-sm text-gray-600">
                    Pattern: {alert.pattern_type.replace('_', ' ').toUpperCase()}
                  </p>
                  <p className="text-xs text-gray-500 mt-2">
                    Period: {formatDate(alert.detection_period.start_date)} - {formatDate(alert.detection_period.end_date)}
                  </p>
                </div>
                <div className={`px-3 py-1 text-sm font-medium border rounded ${getRiskColor(alert.confidence_score)}`}>
                  {getRiskLevel(alert.confidence_score)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xl font-semibold text-gray-900">Alert: {selectedAlertData.account_id}</h4>
          <div className={`inline-block px-3 py-1 text-sm font-medium border rounded mt-2 ${getRiskColor(selectedAlertData.confidence_score)}`}>
            {getRiskLevel(selectedAlertData.confidence_score)} - Confidence: {(selectedAlertData.confidence_score * 100).toFixed(0)}%
          </div>
        </div>
        <button
          onClick={() => onAlertSelect('')}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Back to List
        </button>
      </div>

      <div className="bg-gray-50 rounded-lg p-4">
        <h5 className="font-semibold text-gray-900 mb-3">Detection Period</h5>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-600">Start Date</div>
            <div className="font-medium">{formatDate(selectedAlertData.detection_period.start_date)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">End Date</div>
            <div className="font-medium">{formatDate(selectedAlertData.detection_period.end_date)}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Duration</div>
            <div className="font-medium">{selectedAlertData.detection_period.total_days} days</div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h5 className="font-semibold text-gray-900 mb-4">Pass-Through Analysis</h5>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="text-sm text-gray-600 mb-1">Total Inflow</div>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(selectedAlertData.disbursement_phase.total_credits)}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm text-gray-600 mb-1">Total Outflow</div>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(selectedAlertData.disbursement_phase.total_debits)}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm text-gray-600 mb-1">Net Flow</div>
            <div className={`text-2xl font-bold ${selectedAlertData.disbursement_phase.net_flow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(selectedAlertData.disbursement_phase.net_flow)}
            </div>
          </div>
          
          <div className="text-center">
            <div className="text-sm text-gray-600 mb-1">Flow Balance</div>
            <div className="text-2xl font-bold text-blue-600">
              {(selectedAlertData.disbursement_phase.flow_balance_score * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      <div className={`border-2 rounded-lg p-6 ${selectedAlertData.confidence_score >= 0.7 ? 'border-red-300 bg-red-50' : selectedAlertData.confidence_score >= 0.4 ? 'border-yellow-300 bg-yellow-50' : 'border-green-300 bg-green-50'}`}>
        <h5 className="font-semibold text-gray-900 mb-3">Risk Assessment</h5>
        <div className={`inline-block px-3 py-1 text-sm font-medium border rounded mb-4 ${getRiskColor(selectedAlertData.confidence_score)}`}>
          {getRiskLevel(selectedAlertData.confidence_score)} - Immediate action required
        </div>
        
        <div className="space-y-2">
          {selectedAlertData.risk_indicators && selectedAlertData.risk_indicators.map((indicator, index) => (
            <div key={index} className="flex items-start">
              <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-3"></div>
              <span className="text-sm text-gray-700">{indicator}</span>
            </div>
          ))}
        </div>

        {selectedAlertData.recommended_actions && selectedAlertData.recommended_actions.length > 0 && (
          <div className="mt-4">
            <h6 className="font-medium text-gray-700 mb-2">Recommended Actions:</h6>
            <div className="space-y-1">
              {selectedAlertData.recommended_actions.map((action, index) => (
                <div key={index} className="flex items-start">
                  <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-3"></div>
                  <span className="text-sm text-gray-700">{action}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default MuleAccountReport;
