"""
Counterparty-Specific Trend Analysis

This module provides specialized analysis for individual counterparty transaction patterns,
helping identify suspicious behavior, relationship changes, and entity-specific trends.
"""

import polars as pl
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from dataclasses import dataclass
from collections import defaultdict
import warnings
warnings.filterwarnings('ignore')

@dataclass
class CounterpartyTrendResult:
    """Results from counterparty-specific trend analysis"""
    counterparty_name: str
    transaction_count: int
    total_volume: float
    net_flow: float
    trend_direction: str
    risk_score: float
    behavioral_changes: List[Dict[str, Any]]
    seasonal_patterns: Dict[str, Any]
    velocity_metrics: Dict[str, float]


class CounterpartyTrendAnalyzer:
    """
    Specialized analyzer for counterparty-specific transaction trends and patterns.
    Focuses on identifying suspicious behavior and relationship changes over time.
    """

    def __init__(self):
        self.analysis_cache = {}

    def analyze_counterparty_trends(self, df: pl.DataFrame,
                                  counterparty_column: str = 'counterparty',
                                  min_transactions: int = 3) -> Dict[str, CounterpartyTrendResult]:
        """
        Analyze trends for each counterparty individually.

        Args:
            df: DataFrame with transaction data
            counterparty_column: Name of counterparty column
            min_transactions: Minimum transactions required for analysis

        Returns:
            Dictionary mapping counterparty names to trend results
        """
        if df.is_empty() or counterparty_column not in df.columns:
            return {}

        df_clean = self._prepare_counterparty_data(df, counterparty_column)

        counterparty_results = {}

        for counterparty, cp_data in df_clean.group_by(counterparty_column, maintain_order=True):
            if len(cp_data) < min_transactions:
                continue

            result = self._analyze_single_counterparty(counterparty, cp_data)
            if result:
                counterparty_results[counterparty] = result

        return counterparty_results

    def _prepare_counterparty_data(self, df: pl.DataFrame, counterparty_col: str) -> pl.DataFrame:
        """Prepare and clean counterparty data for analysis"""
        df_clean = df.clone()

        if 'DATE' in df_clean.columns:
            df_clean = df_clean.with_columns(
                pl.col('DATE').cast(pl.Datetime, strict=False).alias('DATE')
            )

        for col in ['DEBIT', 'CREDIT']:
            if col in df_clean.columns:
                df_clean = df_clean.with_columns(
                    pl.col(col)
                    .cast(pl.Utf8)
                    .str.replace_all(',', '')
                    .str.replace_all('₹', '')
                    .cast(pl.Float64, strict=False)
                    .fill_null(0)
                    .alias(col)
                )

        df_clean = df_clean.filter(pl.col('DATE').is_not_null())
        df_clean = df_clean.filter(pl.col(counterparty_col).is_not_null())
        df_clean = df_clean.filter(pl.col(counterparty_col).str.strip_chars() != '')

        df_clean = df_clean.with_columns([
            (pl.col('CREDIT') - pl.col('DEBIT')).alias('net_flow'),
            (pl.col('DEBIT') + pl.col('CREDIT')).alias('total_activity'),
        ])

        min_date = df_clean.get_column('DATE').min()
        df_clean = df_clean.with_columns(
            (pl.col('DATE') - min_date).dt.days().alias('days_since_start')
        )

        return df_clean.sort(['DATE'])

    def _analyze_single_counterparty(self, counterparty: str,
                                   cp_data: pl.DataFrame) -> Optional[CounterpartyTrendResult]:
        """Analyze trends for a single counterparty"""
        try:
            transaction_count = len(cp_data)
            total_volume = float(cp_data.get_column('total_activity').sum())
            net_flow = float(cp_data.get_column('net_flow').sum())

            trend_direction = self._calculate_counterparty_trend(cp_data)

            risk_score = self._calculate_counterparty_risk_score(cp_data)

            behavioral_changes = self._detect_behavioral_changes(cp_data)

            seasonal_patterns = self._analyze_counterparty_seasonality(cp_data)

            velocity_metrics = self._calculate_counterparty_velocity(cp_data)

            return CounterpartyTrendResult(
                counterparty_name=counterparty,
                transaction_count=transaction_count,
                total_volume=float(total_volume),
                net_flow=float(net_flow),
                trend_direction=trend_direction,
                risk_score=risk_score,
                behavioral_changes=behavioral_changes,
                seasonal_patterns=seasonal_patterns,
                velocity_metrics=velocity_metrics
            )

        except Exception as e:
            print(f"Error analyzing counterparty {counterparty}: {str(e)}")
            return None

    def _calculate_counterparty_trend(self, cp_data: pl.DataFrame) -> str:
        """Calculate overall trend direction for counterparty"""
        try:
            x_values = cp_data.get_column('days_since_start').to_numpy()
            y_values = cp_data.get_column('total_activity').to_numpy()

            if len(x_values) < 2:
                return 'insufficient_data'

            slope = np.polyfit(x_values, y_values, 1)[0]
            correlation = np.corrcoef(x_values, y_values)[0, 1]

            if abs(correlation) < 0.3:
                return 'stable'
            elif slope > 0:
                return 'increasing'
            else:
                return 'decreasing'

        except Exception:
            return 'unknown'

    def _calculate_counterparty_risk_score(self, cp_data: pl.DataFrame) -> float:
        """Calculate risk score for counterparty based on various factors"""
        risk_score = 0.0

        try:
            date_span = (cp_data.get_column('DATE').max() - cp_data.get_column('DATE').min()).days
            if date_span > 0:
                velocity = len(cp_data) / date_span
                if velocity > 1.0:
                    risk_score += 0.2
                elif velocity > 0.5:
                    risk_score += 0.1

            if len(cp_data) > 1:
                amount_cv = cp_data.get_column('total_activity').std() / (cp_data.get_column('total_activity').mean() + 1e-10)
                if amount_cv > 2.0:
                    risk_score += 0.25
                elif amount_cv > 1.0:
                    risk_score += 0.15

            round_amounts = 0
            for x in cp_data.get_column('total_activity').to_list():
                if x % 1000 == 0 or x % 500 == 0:
                    round_amounts += 1
            round_ratio = round_amounts / len(cp_data) if len(cp_data) else 0
            if round_ratio > 0.7:
                risk_score += 0.15
            elif round_ratio > 0.5:
                risk_score += 0.08

            total_debits = cp_data.get_column('DEBIT').sum()
            total_credits = cp_data.get_column('CREDIT').sum()
            total_volume = total_debits + total_credits

            if total_volume > 0:
                imbalance_ratio = abs(total_credits - total_debits) / total_volume
                if imbalance_ratio > 0.9:
                    risk_score += 0.2
                elif imbalance_ratio > 0.7:
                    risk_score += 0.1

            if len(cp_data) > 3:
                dow_counts = (
                    cp_data.with_columns(
                        pl.col('DATE').dt.strftime('%A').alias('day_name')
                    )
                    .group_by('day_name')
                    .len()
                )
                max_dow_ratio = dow_counts.get_column('len').max() / len(cp_data)
                if max_dow_ratio > 0.8:
                    risk_score += 0.2
                elif max_dow_ratio > 0.6:
                    risk_score += 0.1

            return min(1.0, risk_score)

        except Exception:
            return 0.0

    def _detect_behavioral_changes(self, cp_data: pl.DataFrame) -> List[Dict[str, Any]]:
        """Detect significant changes in counterparty behavior over time"""
        changes = []

        try:
            if len(cp_data) < 6:
                return changes

            mid_point = len(cp_data) // 2
            early_period = cp_data.slice(0, mid_point)
            late_period = cp_data.slice(mid_point)

            early_avg = float(early_period.get_column('total_activity').mean())
            late_avg = float(late_period.get_column('total_activity').mean())

            if early_avg > 0:
                amount_change = (late_avg - early_avg) / early_avg
                if abs(amount_change) > 0.5:
                    changes.append({
                        'type': 'amount_change',
                        'description': f"Average transaction amount {'increased' if amount_change > 0 else 'decreased'} by {abs(amount_change)*100:.1f}%",
                        'severity': 'high' if abs(amount_change) > 1.0 else 'moderate',
                        'change_ratio': amount_change
                    })

            early_days = (early_period.get_column('DATE').max() - early_period.get_column('DATE').min()).days
            late_days = (late_period.get_column('DATE').max() - late_period.get_column('DATE').min()).days

            if early_days > 0 and late_days > 0:
                early_freq = len(early_period) / early_days
                late_freq = len(late_period) / late_days

                if early_freq > 0:
                    freq_change = (late_freq - early_freq) / early_freq
                    if abs(freq_change) > 0.5:
                        changes.append({
                            'type': 'frequency_change',
                            'description': f"Transaction frequency {'increased' if freq_change > 0 else 'decreased'} by {abs(freq_change)*100:.1f}%",
                            'severity': 'high' if abs(freq_change) > 1.0 else 'moderate',
                            'change_ratio': freq_change
                        })

            early_net_flow = float(early_period.get_column('net_flow').sum())
            late_net_flow = float(late_period.get_column('net_flow').sum())

            if (early_net_flow > 0 and late_net_flow < 0) or (early_net_flow < 0 and late_net_flow > 0):
                changes.append({
                    'type': 'flow_direction_change',
                    'description': f"Net flow direction changed from {'positive' if early_net_flow > 0 else 'negative'} to {'positive' if late_net_flow > 0 else 'negative'}",
                    'severity': 'high',
                    'early_flow': float(early_net_flow),
                    'late_flow': float(late_net_flow)
                })

        except Exception as e:
            print(f"Error detecting behavioral changes: {str(e)}")

        return changes

    def _analyze_counterparty_seasonality(self, cp_data: pl.DataFrame) -> Dict[str, Any]:
        """Analyze seasonal patterns for counterparty"""
        patterns = {}

        try:
            if len(cp_data) > 7:
                dow_counts = (
                    cp_data.with_columns(
                        pl.col('DATE').dt.strftime('%A').alias('day_name')
                    )
                    .group_by('day_name')
                    .len()
                    .sort('len', descending=True)
                )
                most_active_day = (
                    dow_counts.get_column('day_name')[0]
                    if len(dow_counts) else None
                )

                patterns['day_of_week'] = {
                    'most_active_day': most_active_day,
                    'activity_distribution': {
                        row['day_name']: int(row['len'])
                        for row in dow_counts.iter_rows(named=True)
                    },
                    'has_pattern': (
                        dow_counts.get_column('len').max() / len(cp_data) > 0.4
                        if len(dow_counts) else False
                    )
                }

            date_span_months = (cp_data.get_column('DATE').max() - cp_data.get_column('DATE').min()).days / 30
            if date_span_months > 1:
                monthly_stats = (
                    cp_data.with_columns(pl.col('DATE').dt.month().alias('month'))
                    .group_by('month')
                    .agg([
                        pl.col('total_activity').count().alias('count'),
                        pl.col('total_activity').mean().alias('mean'),
                        pl.col('total_activity').sum().alias('sum'),
                    ])
                )

                patterns['monthly'] = {
                    'statistics': monthly_stats.to_dicts(),
                    'span_months': date_span_months
                }

        except Exception as e:
            print(f"Error analyzing seasonality: {str(e)}")

        return patterns

    def _calculate_counterparty_velocity(self, cp_data: pl.DataFrame) -> Dict[str, float]:
        """Calculate velocity metrics for counterparty"""
        metrics = {}

        try:
            date_span = (cp_data.get_column('DATE').max() - cp_data.get_column('DATE').min()).days
            if date_span > 0:
                metrics['transactions_per_day'] = len(cp_data) / date_span
                metrics['volume_per_day'] = cp_data.get_column('total_activity').sum() / date_span
            else:
                metrics['transactions_per_day'] = len(cp_data)
                metrics['volume_per_day'] = cp_data.get_column('total_activity').sum()

            if len(cp_data) > 1:
                dates = cp_data.get_column('DATE').to_list()
                time_diffs = [(dates[i] - dates[i - 1]).days for i in range(1, len(dates))]
                if time_diffs:
                    metrics['avg_days_between_transactions'] = float(np.mean(time_diffs))
                    metrics['min_days_between_transactions'] = float(np.min(time_diffs))
                    metrics['max_days_between_transactions'] = float(np.max(time_diffs))

            same_day_counts = (
                cp_data.with_columns(pl.col('DATE').dt.date().alias('date_only'))
                .group_by('date_only')
                .len()
            )
            metrics['max_transactions_per_day'] = int(same_day_counts.get_column('len').max())
            metrics['days_with_multiple_transactions'] = int(
                same_day_counts.filter(pl.col('len') > 1).height
            )

        except Exception as e:
            print(f"Error calculating velocity: {str(e)}")

        return metrics

    def create_counterparty_dashboard(self, counterparty_results: Dict[str, CounterpartyTrendResult],
                                    top_n: int = 10) -> go.Figure:
        """Create dashboard showing top counterparties by various metrics"""

        if not counterparty_results:
            return go.Figure().add_annotation(
                text="No counterparty data available",
                xref="paper", yref="paper", x=0.5, y=0.5
            )

        sorted_counterparties = sorted(
            counterparty_results.items(),
            key=lambda x: x[1].total_volume,
            reverse=True
        )[:top_n]

        fig = make_subplots(
            rows=2, cols=2,
            subplot_titles=(
                'Top Counterparties by Volume',
                'Risk Score Distribution',
                'Transaction Count vs Volume',
                'Net Flow Analysis'
            ),
            specs=[[{"type": "bar"}, {"type": "histogram"}],
                   [{"type": "scatter"}, {"type": "bar"}]]
        )

        names = [item[0] for item in sorted_counterparties]
        results = [item[1] for item in sorted_counterparties]

        volumes = [r.total_volume for r in results]
        risk_scores = [r.risk_score for r in results]
        transaction_counts = [r.transaction_count for r in results]
        net_flows = [r.net_flow for r in results]

        fig.add_trace(
            go.Bar(x=names, y=volumes, name='Volume', marker_color='blue'),
            row=1, col=1
        )

        all_risk_scores = [r.risk_score for r in counterparty_results.values()]
        fig.add_trace(
            go.Histogram(x=all_risk_scores, name='Risk Scores', marker_color='red'),
            row=1, col=2
        )

        fig.add_trace(
            go.Scatter(
                x=transaction_counts,
                y=volumes,
                mode='markers+text',
                text=names,
                textposition='top center',
                name='Counterparties',
                marker=dict(size=10, color=risk_scores, colorscale='Reds', showscale=True)
            ),
            row=2, col=1
        )

        colors = ['red' if x < 0 else 'green' for x in net_flows]
        fig.add_trace(
            go.Bar(x=names, y=net_flows, name='Net Flow', marker_color=colors),
            row=2, col=2
        )

        fig.update_layout(
            title="Counterparty Analysis Dashboard",
            height=800,
            showlegend=False
        )

        fig.update_xaxes(tickangle=45)

        return fig

    def generate_counterparty_insights(self, counterparty_results: Dict[str, CounterpartyTrendResult]) -> List[str]:
        """Generate insights from counterparty analysis"""
        insights = []

        if not counterparty_results:
            return ["No counterparty data available for analysis"]

        total_counterparties = len(counterparty_results)
        total_volume = sum(r.total_volume for r in counterparty_results.values())
        avg_risk_score = sum(r.risk_score for r in counterparty_results.values()) / total_counterparties

        insights.append(f"📊 Analyzed {total_counterparties} counterparties with total volume ₹{total_volume:,.2f}")
        insights.append(f"⚠️ Average risk score: {avg_risk_score:.2f}/1.0")

        high_risk = [r for r in counterparty_results.values() if r.risk_score > 0.6]
        if high_risk:
            insights.append(f"🚨 {len(high_risk)} counterparties flagged as high-risk")
            top_risk = sorted(high_risk, key=lambda x: x.risk_score, reverse=True)[0]
            insights.append(f"🔴 Highest risk: {top_risk.counterparty_name} (score: {top_risk.risk_score:.2f})")

        top_volume = sorted(counterparty_results.values(), key=lambda x: x.total_volume, reverse=True)
        if top_volume:
            insights.append(f"💰 Largest counterparty: {top_volume[0].counterparty_name} (₹{top_volume[0].total_volume:,.2f})")

        counterparties_with_changes = [r for r in counterparty_results.values() if r.behavioral_changes]
        if counterparties_with_changes:
            insights.append(f"📈 {len(counterparties_with_changes)} counterparties show behavioral changes")

        increasing_trends = [r for r in counterparty_results.values() if r.trend_direction == 'increasing']
        decreasing_trends = [r for r in counterparty_results.values() if r.trend_direction == 'decreasing']

        if increasing_trends:
            insights.append(f"📈 {len(increasing_trends)} counterparties show increasing activity")
        if decreasing_trends:
            insights.append(f"📉 {len(decreasing_trends)} counterparties show decreasing activity")

        return insights

    def get_high_risk_counterparties(self, counterparty_results: Dict[str, CounterpartyTrendResult],
                                   risk_threshold: float = 0.6) -> List[CounterpartyTrendResult]:
        """Get counterparties above risk threshold, sorted by risk score"""
        high_risk = [r for r in counterparty_results.values() if r.risk_score >= risk_threshold]
        return sorted(high_risk, key=lambda x: x.risk_score, reverse=True)

    def export_counterparty_analysis(self, counterparty_results: Dict[str, CounterpartyTrendResult]) -> pl.DataFrame:
        """Export counterparty analysis results to DataFrame"""
        data = []

        for result in counterparty_results.values():
            row = {
                'counterparty': result.counterparty_name,
                'transaction_count': result.transaction_count,
                'total_volume': result.total_volume,
                'net_flow': result.net_flow,
                'trend_direction': result.trend_direction,
                'risk_score': result.risk_score,
                'behavioral_changes_count': len(result.behavioral_changes),
                'has_seasonal_patterns': bool(result.seasonal_patterns),
                'avg_transactions_per_day': result.velocity_metrics.get('transactions_per_day', 0),
                'avg_volume_per_day': result.velocity_metrics.get('volume_per_day', 0)
            }
            data.append(row)

        return pl.DataFrame(data).sort('risk_score', descending=True)
