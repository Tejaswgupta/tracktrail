"use client";

import type { AMLAnalysisResult } from "@/services/amlDetection";
import type { Transaction } from "@/types/database";
import { AMLUtils } from "@/utils/amlUtils";
import { useState } from "react";

interface AMLReportGeneratorProps {
  transactions: Transaction[];
  amlResults: AMLAnalysisResult;
  caseId: string;
}

interface ReportSection {
  id: string;
  title: string;
  enabled: boolean;
  description: string;
}

export default function AMLReportGenerator({
  transactions,
  amlResults,
  caseId,
}: AMLReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportSections, setReportSections] = useState<ReportSection[]>([
    {
      id: "executive_summary",
      title: "Executive Summary",
      enabled: true,
      description: "High-level overview of findings and risk assessment",
    },
    {
      id: "transaction_analysis",
      title: "Transaction Analysis",
      enabled: true,
      description: "Detailed breakdown of transaction patterns and volumes",
    },
    {
      id: "aml_alerts",
      title: "AML Alerts",
      enabled: true,
      description: "All suspicious activity alerts with details",
    },
    {
      id: "entity_risk_profiles",
      title: "Entity Risk Profiles",
      enabled: true,
      description: "Risk assessment for each counterparty",
    },
    {
      id: "statistical_analysis",
      title: "Statistical Analysis",
      enabled: false,
      description: "Benford's Law analysis and anomaly detection",
    },
    {
      id: "network_analysis",
      title: "Network Analysis",
      enabled: false,
      description: "Entity relationship mapping and flow analysis",
    },
    {
      id: "compliance_summary",
      title: "Compliance Summary",
      enabled: true,
      description: "Regulatory compliance status and recommendations",
    },
  ]);

  const toggleSection = (sectionId: string) => {
    setReportSections((prev) =>
      prev.map((section) =>
        section.id === sectionId
          ? { ...section, enabled: !section.enabled }
          : section
      )
    );
  };

  const generateReport = async () => {
    setIsGenerating(true);

    try {
      const enabledSections = reportSections.filter((s) => s.enabled);
      const reportData = await buildReportData(enabledSections);

      // Generate and download the report
      const reportContent = generateReportHTML(reportData);
      downloadReport(
        reportContent,
        `AML_Report_${caseId}_${new Date().toISOString().split("T")[0]}.html`
      );
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const buildReportData = async (enabledSections: ReportSection[]) => {
    const reportData: any = {
      metadata: {
        caseId,
        generatedAt: new Date().toISOString(),
        totalTransactions: transactions.length,
        analysisDate: new Date().toLocaleDateString(),
        reportSections: enabledSections.map((s) => s.title),
      },
    };

    for (const section of enabledSections) {
      switch (section.id) {
        case "executive_summary":
          reportData.executiveSummary = generateExecutiveSummary();
          break;

        case "transaction_analysis":
          reportData.transactionAnalysis = generateTransactionAnalysis();
          break;

        case "aml_alerts":
          reportData.amlAlerts = amlResults.alerts;
          break;

        case "entity_risk_profiles":
          reportData.entityRiskProfiles = generateEntityRiskProfiles();
          break;

        case "statistical_analysis":
          reportData.statisticalAnalysis = generateStatisticalAnalysis();
          break;

        case "network_analysis":
          reportData.networkAnalysis = generateNetworkAnalysis();
          break;

        case "compliance_summary":
          reportData.complianceSummary = generateComplianceSummary();
          break;
      }
    }

    return reportData;
  };

  const generateExecutiveSummary = () => {
    const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
    const dateRange = {
      from: transactions.reduce(
        (min, t) => (t.tx_date < min ? t.tx_date : min),
        transactions[0]?.tx_date || ""
      ),
      to: transactions.reduce(
        (max, t) => (t.tx_date > max ? t.tx_date : max),
        transactions[0]?.tx_date || ""
      ),
    };

    const criticalAlerts = amlResults.alerts.filter(
      (a) => a.severity === "critical"
    ).length;
    const highAlerts = amlResults.alerts.filter(
      (a) => a.severity === "high"
    ).length;

    return {
      totalTransactions: transactions.length,
      totalAmount,
      dateRange,
      riskScore: amlResults.summary.riskScore,
      criticalAlerts,
      highAlerts,
      keyFindings: [
        `${amlResults.summary.totalAlerts} suspicious activity alerts identified`,
        `${amlResults.summary.highRiskEntities.length} high-risk entities detected`,
        `Overall risk score: ${amlResults.summary.riskScore.toFixed(0)}%`,
        criticalAlerts > 0
          ? `${criticalAlerts} critical alerts require immediate attention`
          : "No critical alerts identified",
      ].filter(Boolean),
      recommendations: generateRecommendations(),
    };
  };

  const generateTransactionAnalysis = () => {
    const byDirection = transactions.reduce((acc, t) => {
      acc[t.direction] = (acc[t.direction] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);

    const byMonth = transactions.reduce((acc, t) => {
      const month = t.tx_date.substring(0, 7); // YYYY-MM
      if (!acc[month]) acc[month] = { count: 0, amount: 0 };
      acc[month].count++;
      acc[month].amount += t.amount;
      return acc;
    }, {} as Record<string, { count: number; amount: number }>);

    const amounts = transactions.map((t) => t.amount);
    const avgAmount =
      amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const maxAmount = Math.max(...amounts);
    const minAmount = Math.min(...amounts);

    return {
      summary: {
        totalCredits: byDirection.CR || 0,
        totalDebits: byDirection.DR || 0,
        netFlow: (byDirection.CR || 0) - (byDirection.DR || 0),
        averageAmount: avgAmount,
        maxAmount,
        minAmount,
      },
      monthlyBreakdown: byMonth,
      largeTransactions: transactions
        .filter((t) => t.amount >= AMLUtils.THRESHOLDS.HIGH_VALUE_TRANSACTION)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    };
  };

  const generateEntityRiskProfiles = () => {
    const entityGroups = new Map<string, Transaction[]>();

    for (const transaction of transactions) {
      const entity = transaction.counterparty_merged || "Unknown";
      if (!entityGroups.has(entity)) entityGroups.set(entity, []);
      entityGroups.get(entity)!.push(transaction);
    }

    const riskProfiles = [];
    for (const [entity, entityTransactions] of entityGroups) {
      if (entity === "Unknown" || entityTransactions.length < 2) continue;

      const riskProfile = AMLUtils.calculateEntityRiskScore(
        entity,
        entityTransactions
      );
      riskProfiles.push(riskProfile);
    }

    return riskProfiles.sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);
  };

  const generateStatisticalAnalysis = () => {
    const benfordsLaw = AMLUtils.calculateBenfordsLaw(transactions);
    const anomalousTransactions =
      AMLUtils.findAnomalousTransactions(transactions);
    const timeSeries = AMLUtils.generateTimeSeries(transactions, "day");

    return {
      benfordsLaw,
      anomalousTransactions: anomalousTransactions.slice(0, 10), // Top 10 anomalies
      timeSeries: timeSeries.slice(-30), // Last 30 days
      statisticalSummary: {
        totalAnomalies: anomalousTransactions.length,
        anomalyPercentage:
          (anomalousTransactions.length / transactions.length) * 100,
        benfordsCompliance:
          benfordsLaw.reduce((sum, b) => sum + b.deviation, 0) /
          benfordsLaw.length,
      },
    };
  };

  const generateNetworkAnalysis = () => {
    const network = AMLUtils.buildEntityNetwork(transactions);

    return {
      networkSize: network.entities.size,
      totalConnections: Array.from(network.connections.values()).reduce(
        (sum, connections) => sum + connections.size,
        0
      ),
      totalFlows: network.flows.length,
      totalAmount: network.totalAmount,
      topEntitiesByConnections: Array.from(network.connections.entries())
        .map(([entity, connections]) => ({
          entity,
          connectionCount: connections.size,
        }))
        .sort((a, b) => b.connectionCount - a.connectionCount)
        .slice(0, 10),
    };
  };

  const generateComplianceSummary = () => {
    const highValueTransactions = transactions.filter(
      (t) => t.amount >= AMLUtils.THRESHOLDS.HIGH_VALUE_TRANSACTION
    );
    const cashTransactions = transactions.filter(
      (t) =>
        t.description?.toUpperCase().includes("CASH") ||
        t.description?.toUpperCase().includes("ATM")
    );

    const complianceIssues = [];
    const recommendations = [];

    if (highValueTransactions.length > 0) {
      complianceIssues.push(
        `${highValueTransactions.length} high-value transactions (>₹20L) identified`
      );
      recommendations.push(
        "Ensure proper documentation for high-value transactions"
      );
    }

    if (amlResults.summary.criticalAlerts > 0) {
      complianceIssues.push(
        `${amlResults.summary.criticalAlerts} critical AML alerts require STR filing consideration`
      );
      recommendations.push(
        "Review critical alerts for STR filing requirements"
      );
    }

    const cashRatio = cashTransactions.length / transactions.length;
    if (cashRatio > 0.3) {
      complianceIssues.push(
        `High cash transaction ratio: ${(cashRatio * 100).toFixed(1)}%`
      );
      recommendations.push("Enhanced monitoring of cash transactions required");
    }

    return {
      complianceStatus:
        complianceIssues.length === 0 ? "Compliant" : "Issues Identified",
      complianceIssues,
      recommendations,
      regulatoryThresholds: {
        highValueTransactions: highValueTransactions.length,
        cashTransactionReports: cashTransactions.filter(
          (t) => t.amount >= AMLUtils.THRESHOLDS.CASH_TRANSACTION_REPORT
        ).length,
        suspiciousTransactionReports: amlResults.alerts.filter(
          (a) => a.severity === "critical" || a.severity === "high"
        ).length,
      },
    };
  };

  const generateRecommendations = () => {
    const recommendations = [];

    if (amlResults.summary.criticalAlerts > 0) {
      recommendations.push("Immediate review of critical alerts required");
      recommendations.push(
        "Consider filing Suspicious Transaction Reports (STR)"
      );
    }

    if (amlResults.summary.riskScore > 70) {
      recommendations.push("Enhanced due diligence recommended");
      recommendations.push("Increase transaction monitoring frequency");
    }

    if (amlResults.summary.highRiskEntities.length > 5) {
      recommendations.push(
        "Conduct detailed background checks on high-risk entities"
      );
    }

    return recommendations;
  };

  const generateReportHTML = (reportData: any) => {
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    };

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AML Analysis Report - Case ${reportData.metadata.caseId}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; color: #333; }
        .header { border-bottom: 3px solid #2563eb; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { color: #2563eb; margin: 0; }
        .header .meta { color: #666; margin-top: 10px; }
        .section { margin-bottom: 40px; page-break-inside: avoid; }
        .section h2 { color: #1f2937; border-bottom: 2px solid #e5e7eb; padding-bottom: 10px; }
        .section h3 { color: #374151; margin-top: 25px; }
        .alert-critical { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 10px 0; }
        .alert-high { background: #fff7ed; border-left: 4px solid #ea580c; padding: 15px; margin: 10px 0; }
        .alert-medium { background: #fefce8; border-left: 4px solid #ca8a04; padding: 15px; margin: 10px 0; }
        .alert-low { background: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 10px 0; }
        .risk-score { font-size: 2em; font-weight: bold; text-align: center; padding: 20px; border-radius: 8px; }
        .risk-critical { background: #fef2f2; color: #dc2626; }
        .risk-high { background: #fff7ed; color: #ea580c; }
        .risk-medium { background: #fefce8; color: #ca8a04; }
        .risk-low { background: #f0fdf4; color: #16a34a; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #d1d5db; padding: 12px; text-align: left; }
        th { background: #f9fafb; font-weight: 600; }
        .recommendations { background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; }
        .recommendations ul { margin: 0; padding-left: 20px; }
        .footer { margin-top: 50px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 0.9em; }
        @media print { body { margin: 20px; } .section { page-break-inside: avoid; } }
    </style>
</head>
<body>
    <div class="header">
        <h1>Anti-Money Laundering Analysis Report</h1>
        <div class="meta">
            <strong>Case ID:</strong> ${reportData.metadata.caseId}<br>
            <strong>Generated:</strong> ${formatDate(
              reportData.metadata.generatedAt
            )}<br>
            <strong>Analysis Period:</strong> ${
              reportData.executiveSummary
                ? `${formatDate(
                    reportData.executiveSummary.dateRange.from
                  )} to ${formatDate(reportData.executiveSummary.dateRange.to)}`
                : "N/A"
            }<br>
            <strong>Total Transactions:</strong> ${reportData.metadata.totalTransactions.toLocaleString()}
        </div>
    </div>

    ${
      reportData.executiveSummary
        ? `
    <div class="section">
        <h2>Executive Summary</h2>
        <div class="risk-score ${
          reportData.executiveSummary.riskScore >= 70
            ? "risk-critical"
            : reportData.executiveSummary.riskScore >= 40
            ? "risk-high"
            : reportData.executiveSummary.riskScore >= 20
            ? "risk-medium"
            : "risk-low"
        }">
            Overall Risk Score: ${reportData.executiveSummary.riskScore.toFixed(
              0
            )}%
        </div>
        
        <h3>Key Findings</h3>
        <ul>
            ${reportData.executiveSummary.keyFindings
              .map((finding: string) => `<li>${finding}</li>`)
              .join("")}
        </ul>

        <h3>Transaction Overview</h3>
        <table>
            <tr><th>Metric</th><th>Value</th></tr>
            <tr><td>Total Transactions</td><td>${reportData.executiveSummary.totalTransactions.toLocaleString()}</td></tr>
            <tr><td>Total Amount</td><td>${formatCurrency(
              reportData.executiveSummary.totalAmount
            )}</td></tr>
            <tr><td>Critical Alerts</td><td>${
              reportData.executiveSummary.criticalAlerts
            }</td></tr>
            <tr><td>High Priority Alerts</td><td>${
              reportData.executiveSummary.highAlerts
            }</td></tr>
        </table>

        <div class="recommendations">
            <h3>Recommendations</h3>
            <ul>
                ${reportData.executiveSummary.recommendations
                  .map((rec: string) => `<li>${rec}</li>`)
                  .join("")}
            </ul>
        </div>
    </div>
    `
        : ""
    }

    ${
      reportData.amlAlerts
        ? `
    <div class="section">
        <h2>AML Alerts (${reportData.amlAlerts.length})</h2>
        ${reportData.amlAlerts
          .map(
            (alert: any) => `
            <div class="alert-${alert.severity}">
                <h3>${alert.title}</h3>
                <p><strong>Severity:</strong> ${alert.severity.toUpperCase()} | <strong>Score:</strong> ${(
              alert.score * 100
            ).toFixed(0)}%</p>
                <p>${alert.description}</p>
                <p><strong>Entities:</strong> ${alert.entities.join(", ")}</p>
                <p><strong>Transactions:</strong> ${
                  alert.transactions.length
                } | <strong>Detected:</strong> ${formatDate(
              alert.detectedAt
            )}</p>
            </div>
        `
          )
          .join("")}
    </div>
    `
        : ""
    }

    ${
      reportData.entityRiskProfiles
        ? `
    <div class="section">
        <h2>Entity Risk Profiles</h2>
        <table>
            <thead>
                <tr>
                    <th>Entity</th>
                    <th>Risk Score</th>
                    <th>Risk Factors</th>
                    <th>Recommendations</th>
                </tr>
            </thead>
            <tbody>
                ${reportData.entityRiskProfiles
                  .map(
                    (profile: any) => `
                    <tr>
                        <td>${profile.entity}</td>
                        <td>${profile.riskScore}%</td>
                        <td>${profile.riskFactors.join("; ")}</td>
                        <td>${profile.recommendations.join("; ")}</td>
                    </tr>
                `
                  )
                  .join("")}
            </tbody>
        </table>
    </div>
    `
        : ""
    }

    ${
      reportData.complianceSummary
        ? `
    <div class="section">
        <h2>Compliance Summary</h2>
        <p><strong>Status:</strong> ${
          reportData.complianceSummary.complianceStatus
        }</p>
        
        ${
          reportData.complianceSummary.complianceIssues.length > 0
            ? `
            <h3>Compliance Issues</h3>
            <ul>
                ${reportData.complianceSummary.complianceIssues
                  .map((issue: string) => `<li>${issue}</li>`)
                  .join("")}
            </ul>
        `
            : ""
        }

        <h3>Regulatory Thresholds</h3>
        <table>
            <tr><th>Threshold Type</th><th>Count</th></tr>
            <tr><td>High Value Transactions (>₹20L)</td><td>${
              reportData.complianceSummary.regulatoryThresholds
                .highValueTransactions
            }</td></tr>
            <tr><td>Cash Transaction Reports (>₹10L)</td><td>${
              reportData.complianceSummary.regulatoryThresholds
                .cashTransactionReports
            }</td></tr>
            <tr><td>Potential STRs</td><td>${
              reportData.complianceSummary.regulatoryThresholds
                .suspiciousTransactionReports
            }</td></tr>
        </table>

        <div class="recommendations">
            <h3>Compliance Recommendations</h3>
            <ul>
                ${reportData.complianceSummary.recommendations
                  .map((rec: string) => `<li>${rec}</li>`)
                  .join("")}
            </ul>
        </div>
    </div>
    `
        : ""
    }

    <div class="footer">
        <p><strong>Disclaimer:</strong> This report is generated by automated analysis and should be reviewed by qualified compliance professionals. All findings should be verified independently before taking regulatory action.</p>
        <p><strong>Generated by:</strong> Bank Statement Analyzer AML Module | <strong>Version:</strong> 1.0 | <strong>Date:</strong> ${formatDate(
          reportData.metadata.generatedAt
        )}</p>
    </div>
</body>
</html>
    `;
  };

  const downloadReport = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-lg font-medium text-gray-900">
            Generate AML Report
          </h3>
          <p className="text-sm text-gray-600">
            Create a comprehensive AML analysis report
          </p>
        </div>
        <button
          onClick={generateReport}
          disabled={
            isGenerating || reportSections.filter((s) => s.enabled).length === 0
          }
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Generating...
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              Generate Report
            </>
          )}
        </button>
      </div>

      <div className="space-y-4">
        <h4 className="text-sm font-medium text-gray-900">Report Sections</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportSections.map((section) => (
            <div key={section.id} className="flex items-start space-x-3">
              <input
                type="checkbox"
                id={section.id}
                checked={section.enabled}
                onChange={() => toggleSection(section.id)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <div className="flex-1">
                <label
                  htmlFor={section.id}
                  className="text-sm font-medium text-gray-900 cursor-pointer"
                >
                  {section.title}
                </label>
                <p className="text-xs text-gray-500">{section.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 p-4 bg-blue-50 rounded-md">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              Report Information
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <p>
                The generated report will include detailed analysis based on{" "}
                {transactions.length.toLocaleString()} transactions and{" "}
                {amlResults.alerts.length} AML alerts.
              </p>
              <p className="mt-1">
                Report will be downloaded as an HTML file that can be viewed in
                any browser or converted to PDF.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
