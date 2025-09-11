"""
Trend Analysis Report Generator

This module creates comprehensive reports combining time-based analytics,
counterparty analysis, and risk assessment for executive summaries.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
import json

@dataclass
class TrendReport:
    """Comprehensive trend analysis report"""
    report_id: str
    generated_at: datetime
    analysis_period: Dict[str, Any]
    executive_summary: Dict[str, Any]
    time_based_insights: Dict[str, Any]
    counterparty_insights: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    recommendations: List[str]
    key_metrics: Dict[str, float]


class TrendReportGenerator:
    """
    Generates comprehensive trend analysis reports combining multiple analysis types.
    """
    
    def __init__(self):
        self.report_cache = {}
    
    def generate_comprehensive_report(self, 
                                    time_analysis_results: Dict[str, Any],
                                    counterparty_results: Dict[str, Any],
                                    df: pd.DataFrame,
                                    entity_name: str = "Unknown Entity",
                                    mule_alerts: List = None) -> TrendReport:
        """
        Generate a comprehensive trend analysis report.
        
        Args:
            time_analysis_results: Results from TimeBasedAnalytics
            counterparty_results: Results from CounterpartyTrendAnalyzer
            df: Original transaction DataFrame
            entity_name: Name of the entity being analyzed
            
        Returns:
            TrendReport object with comprehensive analysis
        """
        
        report_id = f"TREND_REPORT_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Analysis period information
        analysis_period = self._extract_analysis_period(df)
        
        # Executive summary
        executive_summary = self._generate_executive_summary(
            time_analysis_results, counterparty_results, df, entity_name
        )
        
        # Time-based insights
        time_insights = self._extract_time_insights(time_analysis_results)
        
        # Counterparty insights
        cp_insights = self._extract_counterparty_insights(counterparty_results)
        
        # Risk assessment
        risk_assessment = self._generate_risk_assessment(
            time_analysis_results, counterparty_results, df, mule_alerts
        )
        
        # Recommendations
        recommendations = self._generate_recommendations(
            time_analysis_results, counterparty_results, risk_assessment, mule_alerts
        )
        
        # Key metrics
        key_metrics = self._calculate_key_metrics(
            time_analysis_results, counterparty_results, df
        )
        
        return TrendReport(
            report_id=report_id,
            generated_at=datetime.now(),
            analysis_period=analysis_period,
            executive_summary=executive_summary,
            time_based_insights=time_insights,
            counterparty_insights=cp_insights,
            risk_assessment=risk_assessment,
            recommendations=recommendations,
            key_metrics=key_metrics
        )
    
    def _extract_analysis_period(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Extract analysis period information"""
        if df.empty or 'DATE' not in df.columns:
            return {}
        
        dates = pd.to_datetime(df['DATE'], errors='coerce').dropna()
        if dates.empty:
            return {}
        
        return {
            'start_date': dates.min().strftime('%Y-%m-%d'),
            'end_date': dates.max().strftime('%Y-%m-%d'),
            'total_days': (dates.max() - dates.min()).days,
            'total_transactions': len(df),
            'active_days': dates.dt.date.nunique()
        }
    
    def _generate_executive_summary(self, time_results: Dict[str, Any], 
                                  cp_results: Dict[str, Any], 
                                  df: pd.DataFrame, 
                                  entity_name: str) -> Dict[str, Any]:
        """Generate executive summary"""
        summary = {
            'entity_name': entity_name,
            'analysis_scope': 'comprehensive_trend_analysis',
            'overall_health_score': 0.0,
            'primary_concerns': [],
            'positive_indicators': [],
            'transaction_overview': {}
        }
        
        # Transaction overview
        if not df.empty:
            total_debits = df['DEBIT'].fillna(0).sum()
            total_credits = df['CREDIT'].fillna(0).sum()
            net_flow = total_credits - total_debits
            
            summary['transaction_overview'] = {
                'total_debits': float(total_debits),
                'total_credits': float(total_credits),
                'net_flow': float(net_flow),
                'transaction_count': len(df),
                'average_transaction_size': float((total_debits + total_credits) / len(df)) if len(df) > 0 else 0
            }
        
        # Health score calculation (0-100)
        health_score = 70  # Base score
        
        # Adjust based on anomalies
        if 'anomaly_detection' in time_results:
            anomalies = time_results['anomaly_detection']
            total_anomalies = (len(anomalies.get('statistical_anomalies', [])) + 
                             len(anomalies.get('velocity_anomalies', [])))
            health_score -= min(30, total_anomalies * 5)  # Reduce up to 30 points
            
            if total_anomalies > 0:
                summary['primary_concerns'].append(f"{total_anomalies} anomalous periods detected")
        
        # Adjust based on high-risk counterparties
        if cp_results:
            high_risk_count = sum(1 for r in cp_results.values() if r.risk_score > 0.6)
            health_score -= min(20, high_risk_count * 10)  # Reduce up to 20 points
            
            if high_risk_count > 0:
                summary['primary_concerns'].append(f"{high_risk_count} high-risk counterparties identified")
        
        # Positive indicators
        if 'trend_analysis' in time_results:
            trends = time_results['trend_analysis'].get('overall_assessment', {})
            if trends.get('trends_aligned'):
                summary['positive_indicators'].append("Debit and credit trends are well-aligned")
                health_score += 5
        
        if cp_results:
            stable_counterparties = sum(1 for r in cp_results.values() if r.risk_score < 0.3)
            if stable_counterparties > 0:
                summary['positive_indicators'].append(f"{stable_counterparties} low-risk counterparties")
                health_score += min(10, stable_counterparties * 2)
        
        summary['overall_health_score'] = max(0, min(100, health_score))
        
        return summary
    
    def _extract_time_insights(self, time_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract key insights from time-based analysis"""
        insights = {
            'trend_summary': {},
            'seasonal_findings': {},
            'velocity_analysis': {},
            'volatility_assessment': {}
        }
        
        # Trend summary
        if 'trend_analysis' in time_results:
            trends = time_results['trend_analysis']
            if 'overall_assessment' in trends:
                assessment = trends['overall_assessment']
                insights['trend_summary'] = {
                    'debit_trend': assessment.get('debit_trend_direction', 'unknown'),
                    'credit_trend': assessment.get('credit_trend_direction', 'unknown'),
                    'debit_strength': assessment.get('debit_trend_strength', 0),
                    'credit_strength': assessment.get('credit_trend_strength', 0),
                    'trends_aligned': assessment.get('trends_aligned', False)
                }
        
        # Seasonal findings
        if 'seasonal_patterns' in time_results:
            seasonal = time_results['seasonal_patterns']
            insights['seasonal_findings'] = {
                'has_recurring_patterns': seasonal.get('recurring_cycles', {}).get('has_recurring_patterns', False),
                'cycle_count': len(seasonal.get('recurring_cycles', {}).get('cycles_detected', [])),
                'monthly_patterns': 'monthly' in seasonal and seasonal['monthly'].get('pattern_detected', False)
            }
        
        # Velocity analysis
        if 'velocity_analysis' in time_results:
            velocity = time_results['velocity_analysis']
            insights['velocity_analysis'] = {
                'average_velocity': velocity.get('average_transactions_per_period', 0),
                'max_velocity': velocity.get('max_transactions_per_period', 0),
                'velocity_volatility': velocity.get('velocity_volatility', 0),
                'high_velocity_periods': len(velocity.get('high_velocity_periods', {}).get('periods', []))
            }
        
        # Volatility assessment
        if 'volatility_analysis' in time_results:
            volatility = time_results['volatility_analysis']
            insights['volatility_assessment'] = {}
            for metric, vol_data in volatility.items():
                insights['volatility_assessment'][metric] = {
                    'coefficient_of_variation': vol_data.get('coefficient_of_variation', 0),
                    'volatility_trend': vol_data.get('volatility_trend', 'unknown')
                }
        
        return insights
    
    def _extract_counterparty_insights(self, cp_results: Dict[str, Any]) -> Dict[str, Any]:
        """Extract key insights from counterparty analysis"""
        if not cp_results:
            return {'total_counterparties': 0}
        
        insights = {
            'total_counterparties': len(cp_results),
            'risk_distribution': {},
            'behavioral_changes': {},
            'top_counterparties': {},
            'trend_distribution': {}
        }
        
        # Risk distribution
        risk_scores = [r.risk_score for r in cp_results.values()]
        insights['risk_distribution'] = {
            'low_risk': sum(1 for r in risk_scores if r < 0.3),
            'medium_risk': sum(1 for r in risk_scores if 0.3 <= r < 0.6),
            'high_risk': sum(1 for r in risk_scores if r >= 0.6),
            'average_risk_score': np.mean(risk_scores) if risk_scores else 0
        }
        
        # Behavioral changes
        counterparties_with_changes = [r for r in cp_results.values() if r.behavioral_changes]
        insights['behavioral_changes'] = {
            'counterparties_with_changes': len(counterparties_with_changes),
            'total_changes_detected': sum(len(r.behavioral_changes) for r in counterparties_with_changes)
        }
        
        # Top counterparties by volume
        sorted_by_volume = sorted(cp_results.values(), key=lambda x: x.total_volume, reverse=True)
        insights['top_counterparties'] = {
            'by_volume': [
                {'name': r.counterparty_name, 'volume': r.total_volume, 'risk_score': r.risk_score}
                for r in sorted_by_volume[:5]
            ],
            'by_risk': [
                {'name': r.counterparty_name, 'volume': r.total_volume, 'risk_score': r.risk_score}
                for r in sorted(cp_results.values(), key=lambda x: x.risk_score, reverse=True)[:5]
            ]
        }
        
        # Trend distribution
        trend_counts = {}
        for result in cp_results.values():
            trend = result.trend_direction
            trend_counts[trend] = trend_counts.get(trend, 0) + 1
        insights['trend_distribution'] = trend_counts
        
        return insights
    
    def _generate_risk_assessment(self, time_results: Dict[str, Any], 
                                cp_results: Dict[str, Any], 
                                df: pd.DataFrame,
                                mule_alerts: List = None) -> Dict[str, Any]:
        """Generate comprehensive risk assessment"""
        risk_assessment = {
            'overall_risk_level': 'low',
            'risk_factors': [],
            'risk_score': 0.0,
            'specific_risks': {
                'temporal_risks': [],
                'counterparty_risks': [],
                'volume_risks': [],
                'pattern_risks': []
            }
        }
        
        risk_score = 0.0
        
        # Temporal risks
        if 'anomaly_detection' in time_results:
            anomalies = time_results['anomaly_detection']
            high_severity_anomalies = [
                a for a in anomalies.get('statistical_anomalies', []) + anomalies.get('velocity_anomalies', [])
                if a.get('severity') == 'high'
            ]
            
            if high_severity_anomalies:
                risk_score += len(high_severity_anomalies) * 0.1
                risk_assessment['specific_risks']['temporal_risks'].append(
                    f"{len(high_severity_anomalies)} high-severity temporal anomalies detected"
                )
        
        # Counterparty risks
        if cp_results:
            high_risk_counterparties = [r for r in cp_results.values() if r.risk_score > 0.6]
            if high_risk_counterparties:
                risk_score += len(high_risk_counterparties) * 0.15
                risk_assessment['specific_risks']['counterparty_risks'].append(
                    f"{len(high_risk_counterparties)} high-risk counterparties identified"
                )
            
            # Behavioral changes
            behavioral_changes = sum(len(r.behavioral_changes) for r in cp_results.values())
            if behavioral_changes > 0:
                risk_score += behavioral_changes * 0.05
                risk_assessment['specific_risks']['pattern_risks'].append(
                    f"{behavioral_changes} behavioral changes detected across counterparties"
                )
        
        # Volume risks
        if not df.empty:
            total_volume = df['DEBIT'].fillna(0).sum() + df['CREDIT'].fillna(0).sum()
            if total_volume > 10000000:  # 10M threshold
                risk_score += 0.1
                risk_assessment['specific_risks']['volume_risks'].append(
                    f"High transaction volume: ₹{total_volume:,.2f}"
                )
        
        # Mule account risks (CRITICAL)
        if mule_alerts:
            high_confidence_mule_alerts = [alert for alert in mule_alerts if alert.confidence_score > 0.7]
            if high_confidence_mule_alerts:
                risk_score += 0.5  # Major risk increase for mule patterns
                risk_assessment['specific_risks']['pattern_risks'].append(
                    f"🚨 CRITICAL: {len(high_confidence_mule_alerts)} high-confidence mule account patterns detected"
                )
            
            # Add all mule alerts to pattern risks
            for alert in mule_alerts:
                risk_assessment['specific_risks']['pattern_risks'].append(
                    f"Mule pattern detected: {alert.pattern_type} (confidence: {alert.confidence_score:.2f})"
                )
        
        # Determine overall risk level
        risk_assessment['risk_score'] = min(1.0, risk_score)
        
        if risk_score < 0.3:
            risk_assessment['overall_risk_level'] = 'low'
        elif risk_score < 0.6:
            risk_assessment['overall_risk_level'] = 'medium'
        else:
            risk_assessment['overall_risk_level'] = 'high'
        
        # Compile risk factors
        for category, risks in risk_assessment['specific_risks'].items():
            risk_assessment['risk_factors'].extend(risks)
        
        return risk_assessment
    
    def _generate_recommendations(self, time_results: Dict[str, Any], 
                                cp_results: Dict[str, Any], 
                                risk_assessment: Dict[str, Any],
                                mule_alerts: List = None) -> List[str]:
        """Generate actionable recommendations"""
        recommendations = []
        
        # CRITICAL: Mule account recommendations (highest priority)
        if mule_alerts:
            high_confidence_alerts = [alert for alert in mule_alerts if alert.confidence_score > 0.7]
            if high_confidence_alerts:
                recommendations.append("🚨 CRITICAL: MULE ACCOUNT PATTERNS DETECTED - IMMEDIATE ACTION REQUIRED")
                recommendations.append("🔒 Consider immediate account restrictions/freezing")
                recommendations.append("📋 File Suspicious Activity Report (SAR) immediately")
                recommendations.append("👮 Consider law enforcement notification")
                recommendations.append("🔍 Investigate all related accounts and counterparties")
            else:
                recommendations.append("⚠️ Potential mule account activity - enhanced monitoring required")
                recommendations.append("📊 Conduct detailed transaction pattern analysis")
        
        # Risk-based recommendations
        if risk_assessment['overall_risk_level'] == 'high':
            recommendations.append("🚨 Immediate review recommended due to high risk score")
            recommendations.append("🔍 Conduct detailed investigation of flagged counterparties")
        elif risk_assessment['overall_risk_level'] == 'medium':
            recommendations.append("⚠️ Enhanced monitoring recommended")
        
        # Anomaly-based recommendations
        if 'anomaly_detection' in time_results:
            anomalies = time_results['anomaly_detection']
            if anomalies.get('statistical_anomalies') or anomalies.get('velocity_anomalies'):
                recommendations.append("📊 Review periods with anomalous transaction patterns")
        
        # Counterparty-based recommendations
        if cp_results:
            high_risk_count = sum(1 for r in cp_results.values() if r.risk_score > 0.6)
            if high_risk_count > 0:
                recommendations.append(f"👥 Investigate {high_risk_count} high-risk counterparties")
            
            behavioral_changes = sum(1 for r in cp_results.values() if r.behavioral_changes)
            if behavioral_changes > 0:
                recommendations.append(f"📈 Review {behavioral_changes} counterparties with behavioral changes")
        
        # Trend-based recommendations
        if 'trend_analysis' in time_results:
            trends = time_results['trend_analysis'].get('overall_assessment', {})
            if not trends.get('trends_aligned'):
                recommendations.append("📈 Investigate diverging debit and credit trends")
        
        # General recommendations
        recommendations.append("📋 Maintain regular monitoring of transaction patterns")
        recommendations.append("🔄 Update risk assessment quarterly")
        
        return recommendations
    
    def _calculate_key_metrics(self, time_results: Dict[str, Any], 
                             cp_results: Dict[str, Any], 
                             df: pd.DataFrame) -> Dict[str, float]:
        """Calculate key performance metrics"""
        metrics = {}
        
        if not df.empty:
            # Basic transaction metrics
            metrics['total_transaction_count'] = float(len(df))
            metrics['total_debit_amount'] = float(df['DEBIT'].fillna(0).sum())
            metrics['total_credit_amount'] = float(df['CREDIT'].fillna(0).sum())
            metrics['net_flow'] = metrics['total_credit_amount'] - metrics['total_debit_amount']
            metrics['average_transaction_size'] = float(
                (metrics['total_debit_amount'] + metrics['total_credit_amount']) / len(df)
            )
        
        # Time-based metrics
        if 'velocity_analysis' in time_results:
            velocity = time_results['velocity_analysis']
            metrics['average_daily_transactions'] = float(velocity.get('average_transactions_per_period', 0))
            metrics['max_daily_transactions'] = float(velocity.get('max_transactions_per_period', 0))
        
        # Counterparty metrics
        if cp_results:
            metrics['total_counterparties'] = float(len(cp_results))
            metrics['average_counterparty_risk_score'] = float(
                sum(r.risk_score for r in cp_results.values()) / len(cp_results)
            )
            metrics['high_risk_counterparty_count'] = float(
                sum(1 for r in cp_results.values() if r.risk_score > 0.6)
            )
        
        # Risk metrics
        if 'anomaly_detection' in time_results:
            anomalies = time_results['anomaly_detection']
            metrics['total_anomalies_detected'] = float(
                len(anomalies.get('statistical_anomalies', [])) + 
                len(anomalies.get('velocity_anomalies', []))
            )
        
        return metrics
    
    def export_report_to_dict(self, report: TrendReport) -> Dict[str, Any]:
        """Export report to dictionary for JSON serialization"""
        return {
            'report_id': report.report_id,
            'generated_at': report.generated_at.isoformat(),
            'analysis_period': report.analysis_period,
            'executive_summary': report.executive_summary,
            'time_based_insights': report.time_based_insights,
            'counterparty_insights': report.counterparty_insights,
            'risk_assessment': report.risk_assessment,
            'recommendations': report.recommendations,
            'key_metrics': report.key_metrics
        }
    
    def export_report_to_json(self, report: TrendReport, filepath: str) -> bool:
        """Export report to JSON file"""
        try:
            report_dict = self.export_report_to_dict(report)
            with open(filepath, 'w') as f:
                json.dump(report_dict, f, indent=2, default=str)
            return True
        except Exception as e:
            print(f"Error exporting report: {str(e)}")
            return False
    
    def create_executive_summary_text(self, report: TrendReport) -> str:
        """Create a formatted executive summary text"""
        summary = report.executive_summary
        
        text = f"""
EXECUTIVE SUMMARY - TRANSACTION TREND ANALYSIS
{'=' * 50}

Entity: {summary.get('entity_name', 'Unknown')}
Report ID: {report.report_id}
Generated: {report.generated_at.strftime('%Y-%m-%d %H:%M:%S')}
Analysis Period: {report.analysis_period.get('start_date', 'Unknown')} to {report.analysis_period.get('end_date', 'Unknown')}

OVERALL HEALTH SCORE: {summary.get('overall_health_score', 0):.1f}/100

TRANSACTION OVERVIEW:
- Total Transactions: {summary.get('transaction_overview', {}).get('transaction_count', 0):,}
- Total Debits: ₹{summary.get('transaction_overview', {}).get('total_debits', 0):,.2f}
- Total Credits: ₹{summary.get('transaction_overview', {}).get('total_credits', 0):,.2f}
- Net Flow: ₹{summary.get('transaction_overview', {}).get('net_flow', 0):,.2f}

PRIMARY CONCERNS:
"""
        
        for concern in summary.get('primary_concerns', []):
            text += f"• {concern}\n"
        
        if not summary.get('primary_concerns'):
            text += "• No major concerns identified\n"
        
        text += "\nPOSITIVE INDICATORS:\n"
        for indicator in summary.get('positive_indicators', []):
            text += f"• {indicator}\n"
        
        if not summary.get('positive_indicators'):
            text += "• No specific positive indicators noted\n"
        
        text += f"\nRECOMMENDATIONS:\n"
        for rec in report.recommendations:
            text += f"• {rec}\n"
        
        return text