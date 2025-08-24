import type { AMLAnalysisResult } from "./amlDetection";
import { supabase } from "./database";

export interface AMLAlertRecord {
  alert_id: string;
  case_id: string;
  alert_type: string;
  severity: string;
  title: string;
  description: string;
  score: number;
  entities: string[];
  transaction_ids: string[];
  metadata: Record<string, any>;
  status: "open" | "investigating" | "closed" | "false_positive";
  assigned_to?: string;
  resolution_notes?: string;
  created_at: string;
  created_by: string;
  updated_at?: string;
  updated_by?: string;
  resolved_at?: string;
}

export interface AMLAnalysisSession {
  session_id: string;
  case_id: string;
  analysis_type: string;
  transaction_count: number;
  alerts_generated: number;
  overall_risk_score: number;
  analysis_parameters: Record<string, any>;
  execution_time_ms: number;
  started_at: string;
  completed_at?: string;
  status: "running" | "completed" | "failed" | "cancelled";
  error_message?: string;
  created_by: string;
}

export interface EntityRiskScore {
  risk_score_id: string;
  entity_id: string;
  case_id?: string;
  risk_score: number;
  risk_factors: string[];
  recommendations: string[];
  transaction_count: number;
  total_amount: number;
  analysis_date: string;
  created_at: string;
  created_by: string;
}

export interface AMLReport {
  report_id: string;
  case_id: string;
  report_type: string;
  report_title: string;
  report_sections: string[];
  file_name?: string;
  file_size?: number;
  file_path?: string;
  generation_parameters: Record<string, any>;
  generated_at: string;
  generated_by: string;
  downloaded_count: number;
  last_downloaded_at?: string;
}

class AMLDatabaseService {
  /**
   * Save AML analysis results to database
   */
  async saveAnalysisResults(
    caseId: string,
    results: AMLAnalysisResult,
    analysisParameters: Record<string, any> = {},
    executionTimeMs: number = 0,
    createdBy: string = "system"
  ): Promise<{ sessionId: string; alertIds: string[] }> {
    try {
      // Start a transaction-like operation
      const sessionId = crypto.randomUUID();
      const alertIds: string[] = [];

      // 1. Create analysis session
      const { error: sessionError } = await supabase
        .from("aml_analysis_sessions")
        .insert({
          session_id: sessionId,
          case_id: caseId,
          analysis_type: "full_analysis",
          transaction_count: analysisParameters.transactionCount || 0,
          alerts_generated: results.alerts.length,
          overall_risk_score: results.summary.riskScore,
          analysis_parameters: analysisParameters,
          execution_time_ms: executionTimeMs,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString(),
          status: "completed",
          created_by: createdBy,
        });

      if (sessionError) {
        console.error("Error creating analysis session:", sessionError);
        throw sessionError;
      }

      // 2. Save alerts
      if (results.alerts.length > 0) {
        const alertRecords = results.alerts.map((alert) => ({
          alert_id: crypto.randomUUID(),
          case_id: caseId,
          alert_type: alert.type,
          severity: alert.severity,
          title: alert.title,
          description: alert.description,
          score: alert.score,
          entities: alert.entities,
          transaction_ids: alert.transactions.map(
            (t) => t.transaction_id || ""
          ),
          metadata: alert.metadata,
          status: "open" as const,
          created_at: new Date().toISOString(),
          created_by: createdBy,
        }));

        const { data: insertedAlerts, error: alertsError } = await supabase
          .from("aml_alerts")
          .insert(alertRecords)
          .select("alert_id");

        if (alertsError) {
          console.error("Error saving alerts:", alertsError);
          throw alertsError;
        }

        alertIds.push(...(insertedAlerts?.map((a) => a.alert_id) || []));
      }

      return { sessionId, alertIds };
    } catch (error) {
      console.error("Error saving AML analysis results:", error);
      throw error;
    }
  }

  /**
   * Get AML alerts for a case
   */
  async getAMLAlerts(
    caseId: string,
    filters?: {
      severity?: string;
      alertType?: string;
      status?: string;
    }
  ): Promise<AMLAlertRecord[]> {
    try {
      let query = supabase
        .from("aml_alerts")
        .select("*")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });

      if (filters?.severity) {
        query = query.eq("severity", filters.severity);
      }
      if (filters?.alertType) {
        query = query.eq("alert_type", filters.alertType);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching AML alerts:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error getting AML alerts:", error);
      throw error;
    }
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(
    alertId: string,
    status: "open" | "investigating" | "closed" | "false_positive",
    assignedTo?: string,
    resolutionNotes?: string,
    updatedBy: string = "system"
  ): Promise<void> {
    try {
      const updateData: any = {
        status,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      };

      if (assignedTo) updateData.assigned_to = assignedTo;
      if (resolutionNotes) updateData.resolution_notes = resolutionNotes;
      if (status === "closed")
        updateData.resolved_at = new Date().toISOString();

      const { error } = await supabase
        .from("aml_alerts")
        .update(updateData)
        .eq("alert_id", alertId);

      if (error) {
        console.error("Error updating alert status:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error updating alert status:", error);
      throw error;
    }
  }

  /**
   * Save entity risk scores
   */
  async saveEntityRiskScores(
    riskScores: Array<{
      entityId: string;
      caseId?: string;
      riskScore: number;
      riskFactors: string[];
      recommendations: string[];
      transactionCount: number;
      totalAmount: number;
    }>,
    createdBy: string = "system"
  ): Promise<string[]> {
    try {
      const records = riskScores.map((score) => ({
        risk_score_id: crypto.randomUUID(),
        entity_id: score.entityId,
        case_id: score.caseId,
        risk_score: score.riskScore,
        risk_factors: score.riskFactors,
        recommendations: score.recommendations,
        transaction_count: score.transactionCount,
        total_amount: score.totalAmount,
        analysis_date: new Date().toISOString().split("T")[0],
        created_at: new Date().toISOString(),
        created_by: createdBy,
      }));

      const { data, error } = await supabase
        .from("entity_risk_scores")
        .upsert(records, {
          onConflict: "entity_id,case_id,analysis_date",
          ignoreDuplicates: false,
        })
        .select("risk_score_id");

      if (error) {
        console.error("Error saving entity risk scores:", error);
        throw error;
      }

      return data?.map((d) => d.risk_score_id) || [];
    } catch (error) {
      console.error("Error saving entity risk scores:", error);
      throw error;
    }
  }

  /**
   * Get entity risk scores
   */
  async getEntityRiskScores(filters?: {
    entityId?: string;
    caseId?: string;
    minRiskScore?: number;
  }): Promise<EntityRiskScore[]> {
    try {
      let query = supabase
        .from("entity_risk_scores")
        .select("*")
        .order("risk_score", { ascending: false });

      if (filters?.entityId) {
        query = query.eq("entity_id", filters.entityId);
      }
      if (filters?.caseId) {
        query = query.eq("case_id", filters.caseId);
      }
      if (filters?.minRiskScore) {
        query = query.gte("risk_score", filters.minRiskScore);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching entity risk scores:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error getting entity risk scores:", error);
      throw error;
    }
  }

  /**
   * Save AML report metadata
   */
  async saveAMLReport(
    caseId: string,
    reportTitle: string,
    reportSections: string[],
    generationParameters: Record<string, any>,
    fileName?: string,
    fileSize?: number,
    filePath?: string,
    generatedBy: string = "system"
  ): Promise<string> {
    try {
      const reportId = crypto.randomUUID();

      const { error } = await supabase.from("aml_reports").insert({
        report_id: reportId,
        case_id: caseId,
        report_type: "comprehensive",
        report_title: reportTitle,
        report_sections: reportSections,
        file_name: fileName,
        file_size: fileSize,
        file_path: filePath,
        generation_parameters: generationParameters,
        generated_at: new Date().toISOString(),
        generated_by: generatedBy,
        downloaded_count: 0,
      });

      if (error) {
        console.error("Error saving AML report:", error);
        throw error;
      }

      return reportId;
    } catch (error) {
      console.error("Error saving AML report:", error);
      throw error;
    }
  }

  /**
   * Get AML reports for a case
   */
  async getAMLReports(caseId: string): Promise<AMLReport[]> {
    try {
      const { data, error } = await supabase
        .from("aml_reports")
        .select("*")
        .eq("case_id", caseId)
        .order("generated_at", { ascending: false });

      if (error) {
        console.error("Error fetching AML reports:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error getting AML reports:", error);
      throw error;
    }
  }

  /**
   * Increment report download count
   */
  async incrementReportDownload(reportId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc("increment_report_download", {
        report_id: reportId,
      });

      if (error) {
        console.error("Error incrementing report download:", error);
        // Don't throw - this is not critical
      }
    } catch (error) {
      console.error("Error incrementing report download:", error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Get analysis sessions for a case
   */
  async getAnalysisSessions(caseId: string): Promise<AMLAnalysisSession[]> {
    try {
      const { data, error } = await supabase
        .from("aml_analysis_sessions")
        .select("*")
        .eq("case_id", caseId)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching analysis sessions:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error getting analysis sessions:", error);
      throw error;
    }
  }

  /**
   * Get regulatory thresholds
   */
  async getRegulatoryThresholds(): Promise<
    Array<{
      threshold_id: string;
      threshold_name: string;
      threshold_amount: number;
      currency: string;
      threshold_type: string;
      description: string;
      regulatory_authority: string;
      effective_date: string;
      expiry_date?: string;
      is_active: boolean;
    }>
  > {
    try {
      const { data, error } = await supabase
        .from("regulatory_thresholds")
        .select("*")
        .eq("is_active", true)
        .order("threshold_amount", { ascending: false });

      if (error) {
        console.error("Error fetching regulatory thresholds:", error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error("Error getting regulatory thresholds:", error);
      throw error;
    }
  }

  /**
   * Get AML dashboard statistics
   */
  async getAMLDashboardStats(caseId?: string): Promise<{
    totalAlerts: number;
    criticalAlerts: number;
    openAlerts: number;
    avgRiskScore: number;
    recentSessions: number;
    topRiskEntities: Array<{ entity_id: string; risk_score: number }>;
  }> {
    try {
      // Get alert statistics
      let alertQuery = supabase.from("aml_alerts").select("severity, status");

      if (caseId) {
        alertQuery = alertQuery.eq("case_id", caseId);
      }

      const { data: alerts, error: alertError } = await alertQuery;

      if (alertError) throw alertError;

      // Get risk score statistics
      let riskQuery = supabase
        .from("entity_risk_scores")
        .select("entity_id, risk_score");

      if (caseId) {
        riskQuery = riskQuery.eq("case_id", caseId);
      }

      const { data: riskScores, error: riskError } = await riskQuery;

      if (riskError) throw riskError;

      // Get recent sessions
      let sessionQuery = supabase
        .from("aml_analysis_sessions")
        .select("session_id")
        .gte(
          "started_at",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ); // Last 7 days

      if (caseId) {
        sessionQuery = sessionQuery.eq("case_id", caseId);
      }

      const { data: sessions, error: sessionError } = await sessionQuery;

      if (sessionError) throw sessionError;

      // Calculate statistics
      const totalAlerts = alerts?.length || 0;
      const criticalAlerts =
        alerts?.filter((a) => a.severity === "critical").length || 0;
      const openAlerts = alerts?.filter((a) => a.status === "open").length || 0;
      const avgRiskScore = riskScores?.length
        ? riskScores.reduce((sum, r) => sum + r.risk_score, 0) /
          riskScores.length
        : 0;
      const recentSessions = sessions?.length || 0;
      const topRiskEntities = (riskScores || [])
        .sort((a, b) => b.risk_score - a.risk_score)
        .slice(0, 5);

      return {
        totalAlerts,
        criticalAlerts,
        openAlerts,
        avgRiskScore,
        recentSessions,
        topRiskEntities,
      };
    } catch (error) {
      console.error("Error getting AML dashboard stats:", error);
      throw error;
    }
  }
}

export const amlDatabaseService = new AMLDatabaseService();
