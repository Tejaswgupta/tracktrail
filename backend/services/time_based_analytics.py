"""
Enhanced Time-Based Analytics for Transaction Trend Analysis

This module provides sophisticated time-based analysis capabilities to identify
patterns, trends, and anomalies in debit and credit transactions over time.
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from dataclasses import dataclass
from collections import defaultdict
import warnings

warnings.filterwarnings("ignore")


@dataclass
class TrendAnalysisResult:
    """Results from time-based trend analysis"""

    trend_direction: str
    trend_strength: float
    seasonal_patterns: Dict[str, Any]
    anomalies: List[Dict[str, Any]]
    velocity_metrics: Dict[str, float]
    correlation_analysis: Dict[str, float]


class TimeBasedAnalytics:
    """
    Advanced time-based analytics for transaction data with focus on
    debit/credit trends, velocity analysis, and pattern detection.
    """

    def __init__(self):
        self.analysis_cache = {}

    def analyze_transaction_trends(
        self,
        df: pd.DataFrame,
        date_column: str = "DATE",
        debit_column: str = "DEBIT",
        credit_column: str = "CREDIT",
        time_granularity: str = "daily",
    ) -> Dict[str, Any]:
        """
        Comprehensive time-based trend analysis for debits and credits.

        Args:
            df: DataFrame with transaction data
            date_column: Name of date column
            debit_column: Name of debit amount column
            credit_column: Name of credit amount column
            time_granularity: 'daily', 'weekly', 'monthly', 'hourly'

        Returns:
            Dictionary with comprehensive trend analysis results
        """
        if df.empty:
            return self._empty_analysis_result()

        df_clean = self._prepare_time_series_data(
            df, date_column, debit_column, credit_column
        )

        if df_clean.empty:
            return self._empty_analysis_result()

        time_series = self._aggregate_by_time(df_clean, time_granularity)

        results = {
            "time_granularity": time_granularity,
            "data_summary": self._calculate_data_summary(time_series),
            "trend_analysis": self._analyze_trends(time_series),
            "seasonal_patterns": self._detect_seasonal_patterns(time_series),
            "velocity_analysis": self._analyze_transaction_velocity(time_series),
            "anomaly_detection": self._detect_time_based_anomalies(time_series),
            "correlation_analysis": self._analyze_debit_credit_correlation(time_series),
            "cyclical_patterns": self._detect_cyclical_patterns(time_series),
            "volatility_analysis": self._analyze_volatility(time_series),
            "flow_analysis": self._analyze_cash_flow_patterns(time_series),
            "visualizations": self._create_trend_visualizations(time_series),
        }

        return results

    def _prepare_time_series_data(
        self, df: pd.DataFrame, date_col: str, debit_col: str, credit_col: str
    ) -> pd.DataFrame:
        """Prepare and clean data for time series analysis"""
        df_clean = df.copy()

        df_clean[date_col] = pd.to_datetime(df_clean[date_col], errors="coerce")

        for col in [debit_col, credit_col]:
            if col in df_clean.columns:
                df_clean[col] = pd.to_numeric(
                    df_clean[col].astype(str).str.replace(",", "").str.replace("₹", ""),
                    errors="coerce",
                )
                df_clean[col] = df_clean[col].fillna(0)

        df_clean = df_clean.dropna(subset=[date_col])

        df_clean["net_flow"] = df_clean[credit_col] - df_clean[debit_col]
        df_clean["total_activity"] = df_clean[debit_col] + df_clean[credit_col]
        df_clean["hour"] = df_clean[date_col].dt.hour
        df_clean["day_of_week"] = df_clean[date_col].dt.day_name()
        df_clean["month"] = df_clean[date_col].dt.month
        df_clean["quarter"] = df_clean[date_col].dt.quarter
        df_clean["year"] = df_clean[date_col].dt.year

        return df_clean.sort_values(date_col)

    def _aggregate_by_time(self, df: pd.DataFrame, granularity: str) -> pd.DataFrame:
        """Aggregate transaction data by specified time granularity"""
        date_col = "DATE"

        if granularity == "hourly":
            df["time_key"] = df[date_col].dt.floor("H")
        elif granularity == "daily":
            df["time_key"] = df[date_col].dt.date
        elif granularity == "weekly":
            df["time_key"] = df[date_col].dt.to_period("W").dt.start_time
        elif granularity == "monthly":
            df["time_key"] = df[date_col].dt.to_period("M").dt.start_time
        else:
            df["time_key"] = df[date_col].dt.date

        agg_data = (
            df.groupby("time_key")
            .agg(
                {
                    "DEBIT": ["sum", "count", "mean", "std"],
                    "CREDIT": ["sum", "count", "mean", "std"],
                    "net_flow": ["sum", "mean"],
                    "total_activity": ["sum", "mean"],
                    "hour": lambda x: x.mode().iloc[0] if not x.empty else 12,
                    "day_of_week": lambda x: (
                        x.mode().iloc[0] if not x.empty else "Monday"
                    ),
                }
            )
            .reset_index()
        )

        agg_data.columns = [
            "_".join(col).strip() if col[1] else col[0] for col in agg_data.columns
        ]
        agg_data = agg_data.rename(columns={"time_key_": "time_key"})

        agg_data["debit_credit_ratio"] = agg_data["DEBIT_sum"] / (
            agg_data["CREDIT_sum"] + 1e-10
        )
        agg_data["activity_intensity"] = (
            agg_data["DEBIT_count"] + agg_data["CREDIT_count"]
        )
        agg_data["volatility"] = (
            agg_data["DEBIT_std"].fillna(0) + agg_data["CREDIT_std"].fillna(0)
        ) / 2

        return agg_data.sort_values("time_key")

    def _calculate_data_summary(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Calculate summary statistics for the time series data"""
        return {
            "total_periods": len(time_series),
            "date_range": {
                "start": time_series["time_key"].min(),
                "end": time_series["time_key"].max(),
                "span_days": (
                    time_series["time_key"].max() - time_series["time_key"].min()
                ).days,
            },
            "total_debits": float(time_series["DEBIT_sum"].sum()),
            "total_credits": float(time_series["CREDIT_sum"].sum()),
            "net_flow_total": float(time_series["net_flow_sum"].sum()),
            "average_daily_debits": float(time_series["DEBIT_sum"].mean()),
            "average_daily_credits": float(time_series["CREDIT_sum"].mean()),
            "transaction_count": int(time_series["activity_intensity"].sum()),
            "most_active_period": time_series.loc[
                time_series["activity_intensity"].idxmax(), "time_key"
            ],
            "highest_debit_period": time_series.loc[
                time_series["DEBIT_sum"].idxmax(), "time_key"
            ],
            "highest_credit_period": time_series.loc[
                time_series["CREDIT_sum"].idxmax(), "time_key"
            ],
        }

    def _analyze_trends(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Analyze trends in debit and credit patterns"""
        results = {}

        for metric in ["DEBIT_sum", "CREDIT_sum", "net_flow_sum", "activity_intensity"]:
            if metric in time_series.columns:
                trend_result = self._calculate_linear_trend(
                    time_series["time_key"], time_series[metric]
                )
                results[metric] = trend_result

        window_size = min(7, len(time_series) // 3)
        if window_size >= 2:
            results["moving_averages"] = {
                "debit_ma": time_series["DEBIT_sum"]
                .rolling(window=window_size)
                .mean()
                .tolist(),
                "credit_ma": time_series["CREDIT_sum"]
                .rolling(window=window_size)
                .mean()
                .tolist(),
                "net_flow_ma": time_series["net_flow_sum"]
                .rolling(window=window_size)
                .mean()
                .tolist(),
            }

        debit_trend = results.get("DEBIT_sum", {})
        credit_trend = results.get("CREDIT_sum", {})

        results["overall_assessment"] = {
            "debit_trend_direction": (
                "increasing" if debit_trend.get("slope", 0) > 0 else "decreasing"
            ),
            "credit_trend_direction": (
                "increasing" if credit_trend.get("slope", 0) > 0 else "decreasing"
            ),
            "debit_trend_strength": abs(debit_trend.get("r_squared", 0)),
            "credit_trend_strength": abs(credit_trend.get("r_squared", 0)),
            "trends_aligned": (
                debit_trend.get("slope", 0) * credit_trend.get("slope", 0)
            )
            > 0,
        }

        return results

    def _calculate_linear_trend(
        self, x_values: pd.Series, y_values: pd.Series
    ) -> Dict[str, float]:
        """Calculate linear trend statistics"""
        try:

            if pd.api.types.is_datetime64_any_dtype(x_values):
                x_numeric = (x_values - x_values.min()).dt.days
            else:
                x_numeric = pd.to_numeric(x_values, errors="coerce")

            valid_mask = ~(x_numeric.isna() | y_values.isna())
            x_clean = x_numeric[valid_mask]
            y_clean = y_values[valid_mask]

            if len(x_clean) < 2:
                return {"slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1}

            slope, intercept = np.polyfit(x_clean, y_clean, 1)

            y_pred = slope * x_clean + intercept
            ss_res = np.sum((y_clean - y_pred) ** 2)
            ss_tot = np.sum((y_clean - np.mean(y_clean)) ** 2)
            r_squared = 1 - (ss_res / (ss_tot + 1e-10))

            n = len(x_clean)
            t_stat = (
                slope
                * np.sqrt((n - 2) / (1 - r_squared + 1e-10))
                * np.sqrt(np.sum((x_clean - np.mean(x_clean)) ** 2))
            )
            p_value = 2 * (1 - abs(t_stat) / (abs(t_stat) + n - 2))

            return {
                "slope": float(slope),
                "intercept": float(intercept),
                "r_squared": float(r_squared),
                "p_value": float(p_value),
                "trend_strength": (
                    "strong"
                    if abs(r_squared) > 0.7
                    else "moderate" if abs(r_squared) > 0.3 else "weak"
                ),
            }
        except Exception:
            return {"slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1}

    def _detect_seasonal_patterns(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Detect seasonal and cyclical patterns in transaction data"""
        patterns = {}

        if "day_of_week_<lambda>" in time_series.columns and len(time_series) > 7:
            dow_analysis = self._analyze_day_of_week_patterns(time_series)
            patterns["day_of_week"] = dow_analysis

        if len(time_series) > 30:
            monthly_analysis = self._analyze_monthly_patterns(time_series)
            patterns["monthly"] = monthly_analysis

        cycle_analysis = self._detect_recurring_cycles(time_series)
        patterns["recurring_cycles"] = cycle_analysis

        return patterns

    def _analyze_day_of_week_patterns(
        self, time_series: pd.DataFrame
    ) -> Dict[str, Any]:
        """Analyze patterns by day of week"""

        return {
            "pattern_detected": False,
            "note": "Day-of-week analysis requires individual transaction timestamps",
        }

    def _analyze_monthly_patterns(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Analyze monthly patterns in transaction data"""
        try:

            time_series["month"] = pd.to_datetime(time_series["time_key"]).dt.month

            monthly_stats = (
                time_series.groupby("month")
                .agg(
                    {
                        "DEBIT_sum": ["mean", "std"],
                        "CREDIT_sum": ["mean", "std"],
                        "activity_intensity": "mean",
                    }
                )
                .round(2)
            )

            monthly_stats.columns = ["_".join(col) for col in monthly_stats.columns]

            peak_debit_month = monthly_stats["DEBIT_sum_mean"].idxmax()
            peak_credit_month = monthly_stats["CREDIT_sum_mean"].idxmax()
            peak_activity_month = monthly_stats["activity_intensity_mean"].idxmax()

            return {
                "monthly_statistics": monthly_stats.to_dict(),
                "peak_debit_month": int(peak_debit_month),
                "peak_credit_month": int(peak_credit_month),
                "peak_activity_month": int(peak_activity_month),
                "seasonal_variation": {
                    "debit_cv": float(
                        monthly_stats["DEBIT_sum_std"].mean()
                        / (monthly_stats["DEBIT_sum_mean"].mean() + 1e-10)
                    ),
                    "credit_cv": float(
                        monthly_stats["CREDIT_sum_std"].mean()
                        / (monthly_stats["CREDIT_sum_mean"].mean() + 1e-10)
                    ),
                },
            }
        except Exception:
            return {
                "pattern_detected": False,
                "error": "Insufficient data for monthly analysis",
            }

    def _detect_recurring_cycles(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Detect recurring cycles in transaction patterns"""
        try:

            debit_series = time_series["DEBIT_sum"].values
            credit_series = time_series["CREDIT_sum"].values

            cycles_detected = []

            for cycle_length in [7, 14, 30]:
                if len(debit_series) >= cycle_length * 2:
                    debit_autocorr = self._calculate_autocorrelation(
                        debit_series, cycle_length
                    )
                    credit_autocorr = self._calculate_autocorrelation(
                        credit_series, cycle_length
                    )

                    if debit_autocorr > 0.3 or credit_autocorr > 0.3:
                        cycles_detected.append(
                            {
                                "cycle_length_periods": cycle_length,
                                "debit_correlation": float(debit_autocorr),
                                "credit_correlation": float(credit_autocorr),
                                "strength": (
                                    "strong"
                                    if max(debit_autocorr, credit_autocorr) > 0.6
                                    else "moderate"
                                ),
                            }
                        )

            return {
                "cycles_detected": cycles_detected,
                "has_recurring_patterns": len(cycles_detected) > 0,
            }
        except Exception:
            return {"cycles_detected": [], "has_recurring_patterns": False}

    def _calculate_autocorrelation(self, series: np.ndarray, lag: int) -> float:
        """Calculate autocorrelation at specified lag"""
        try:
            if len(series) <= lag:
                return 0.0

            series_shifted = np.roll(series, lag)
            correlation = np.corrcoef(series[lag:], series_shifted[lag:])[0, 1]
            return correlation if not np.isnan(correlation) else 0.0
        except Exception:
            return 0.0

    def _analyze_transaction_velocity(
        self, time_series: pd.DataFrame
    ) -> Dict[str, Any]:
        """Analyze transaction velocity and frequency patterns"""
        velocity_metrics = {}

        velocity_metrics["average_transactions_per_period"] = float(
            time_series["activity_intensity"].mean()
        )
        velocity_metrics["max_transactions_per_period"] = int(
            time_series["activity_intensity"].max()
        )
        velocity_metrics["velocity_volatility"] = float(
            time_series["activity_intensity"].std()
        )

        velocity_threshold = time_series["activity_intensity"].quantile(0.8)
        high_velocity_periods = time_series[
            time_series["activity_intensity"] > velocity_threshold
        ]

        velocity_metrics["high_velocity_periods"] = {
            "count": len(high_velocity_periods),
            "threshold": float(velocity_threshold),
            "periods": high_velocity_periods["time_key"].tolist(),
        }

        time_series["velocity_change"] = time_series["activity_intensity"].diff()
        velocity_metrics["average_acceleration"] = float(
            time_series["velocity_change"].mean()
        )
        velocity_metrics["max_acceleration"] = float(
            time_series["velocity_change"].max()
        )
        velocity_metrics["max_deceleration"] = float(
            time_series["velocity_change"].min()
        )

        return velocity_metrics

    def _detect_time_based_anomalies(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Detect anomalies in time-based transaction patterns"""
        anomalies = {
            "statistical_anomalies": [],
            "pattern_anomalies": [],
            "velocity_anomalies": [],
        }

        for metric in ["DEBIT_sum", "CREDIT_sum", "activity_intensity"]:
            if metric in time_series.columns:
                q1 = time_series[metric].quantile(0.25)
                q3 = time_series[metric].quantile(0.75)
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr

                anomalous_periods = time_series[
                    (time_series[metric] < lower_bound)
                    | (time_series[metric] > upper_bound)
                ]

                for _, period in anomalous_periods.iterrows():
                    anomalies["statistical_anomalies"].append(
                        {
                            "period": period["time_key"],
                            "metric": metric,
                            "value": float(period[metric]),
                            "expected_range": [float(lower_bound), float(upper_bound)],
                            "severity": (
                                "high"
                                if period[metric] > upper_bound + iqr
                                else "moderate"
                            ),
                        }
                    )

        velocity_mean = time_series["activity_intensity"].mean()
        velocity_std = time_series["activity_intensity"].std()
        velocity_threshold = velocity_mean + 2 * velocity_std

        velocity_anomalies = time_series[
            time_series["activity_intensity"] > velocity_threshold
        ]
        for _, period in velocity_anomalies.iterrows():
            anomalies["velocity_anomalies"].append(
                {
                    "period": period["time_key"],
                    "transaction_count": int(period["activity_intensity"]),
                    "expected_max": float(velocity_threshold),
                    "severity": (
                        "high"
                        if period["activity_intensity"]
                        > velocity_mean + 3 * velocity_std
                        else "moderate"
                    ),
                }
            )

        return anomalies

    def _analyze_debit_credit_correlation(
        self, time_series: pd.DataFrame
    ) -> Dict[str, float]:
        """Analyze correlation between debit and credit patterns"""
        try:
            correlation_matrix = time_series[
                ["DEBIT_sum", "CREDIT_sum", "net_flow_sum", "activity_intensity"]
            ].corr()

            return {
                "debit_credit_correlation": float(
                    correlation_matrix.loc["DEBIT_sum", "CREDIT_sum"]
                ),
                "debit_activity_correlation": float(
                    correlation_matrix.loc["DEBIT_sum", "activity_intensity"]
                ),
                "credit_activity_correlation": float(
                    correlation_matrix.loc["CREDIT_sum", "activity_intensity"]
                ),
                "net_flow_activity_correlation": float(
                    correlation_matrix.loc["net_flow_sum", "activity_intensity"]
                ),
            }
        except Exception:
            return {
                "debit_credit_correlation": 0.0,
                "debit_activity_correlation": 0.0,
                "credit_activity_correlation": 0.0,
                "net_flow_activity_correlation": 0.0,
            }

    def _detect_cyclical_patterns(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Detect cyclical patterns in transaction behavior"""
        cyclical_analysis = {}

        for metric in ["DEBIT_sum", "CREDIT_sum"]:
            if metric in time_series.columns and len(time_series) > 10:
                series_values = time_series[metric].values

                window = min(5, len(series_values) // 3)
                if window >= 2:
                    moving_avg = pd.Series(series_values).rolling(window=window).mean()
                    detrended = series_values - moving_avg.fillna(moving_avg.mean())

                    zero_crossings = np.sum(np.diff(np.sign(detrended)) != 0)
                    cycle_frequency = (
                        zero_crossings / len(series_values)
                        if len(series_values) > 0
                        else 0
                    )

                    cyclical_analysis[metric] = {
                        "cycle_frequency": float(cycle_frequency),
                        "has_cycles": cycle_frequency > 0.1,
                        "cycle_strength": float(
                            np.std(detrended) / (np.mean(np.abs(series_values)) + 1e-10)
                        ),
                    }

        return cyclical_analysis

    def _analyze_volatility(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Analyze volatility in transaction patterns"""
        volatility_analysis = {}

        for metric in ["DEBIT_sum", "CREDIT_sum", "net_flow_sum"]:
            if metric in time_series.columns:
                values = time_series[metric]

                volatility_analysis[metric] = {
                    "standard_deviation": float(values.std()),
                    "coefficient_of_variation": float(
                        values.std() / (values.mean() + 1e-10)
                    ),
                    "range": float(values.max() - values.min()),
                    "interquartile_range": float(
                        values.quantile(0.75) - values.quantile(0.25)
                    ),
                    "volatility_trend": self._calculate_volatility_trend(values),
                }

        return volatility_analysis

    def _calculate_volatility_trend(self, series: pd.Series) -> str:
        """Calculate whether volatility is increasing, decreasing, or stable"""
        try:

            window = min(5, len(series) // 3)
            if window < 2:
                return "insufficient_data"

            rolling_vol = series.rolling(window=window).std()

            vol_trend = self._calculate_linear_trend(
                pd.Series(range(len(rolling_vol))), rolling_vol
            )

            if vol_trend["slope"] > 0 and vol_trend["r_squared"] > 0.3:
                return "increasing"
            elif vol_trend["slope"] < 0 and vol_trend["r_squared"] > 0.3:
                return "decreasing"
            else:
                return "stable"
        except Exception:
            return "unknown"

    def _analyze_cash_flow_patterns(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Analyze cash flow patterns and liquidity trends"""
        flow_analysis = {}

        time_series["cumulative_net_flow"] = time_series["net_flow_sum"].cumsum()
        time_series["cumulative_debits"] = time_series["DEBIT_sum"].cumsum()
        time_series["cumulative_credits"] = time_series["CREDIT_sum"].cumsum()

        flow_analysis["net_flow_trend"] = self._calculate_linear_trend(
            pd.Series(range(len(time_series))), time_series["cumulative_net_flow"]
        )

        positive_flow_periods = len(time_series[time_series["net_flow_sum"] > 0])
        negative_flow_periods = len(time_series[time_series["net_flow_sum"] < 0])

        flow_analysis["flow_balance"] = {
            "positive_periods": positive_flow_periods,
            "negative_periods": negative_flow_periods,
            "neutral_periods": len(time_series)
            - positive_flow_periods
            - negative_flow_periods,
            "net_positive_ratio": (
                positive_flow_periods / len(time_series) if len(time_series) > 0 else 0
            ),
        }

        max_negative_flow = time_series["cumulative_net_flow"].min()
        flow_analysis["liquidity_metrics"] = {
            "max_drawdown": float(max_negative_flow) if max_negative_flow < 0 else 0.0,
            "final_position": float(time_series["cumulative_net_flow"].iloc[-1]),
            "flow_volatility": float(time_series["net_flow_sum"].std()),
        }

        return flow_analysis

    def _create_trend_visualizations(self, time_series: pd.DataFrame) -> Dict[str, Any]:
        """Create visualization data for trend analysis"""
        viz_data = {
            "time_series_data": {
                "dates": time_series["time_key"].tolist(),
                "debits": time_series["DEBIT_sum"].tolist(),
                "credits": time_series["CREDIT_sum"].tolist(),
                "net_flow": time_series["net_flow_sum"].tolist(),
                "activity": time_series["activity_intensity"].tolist(),
            }
        }

        window_size = min(7, len(time_series) // 3)
        if window_size >= 2:
            viz_data["moving_averages"] = {
                "debit_ma": time_series["DEBIT_sum"]
                .rolling(window=window_size)
                .mean()
                .tolist(),
                "credit_ma": time_series["CREDIT_sum"]
                .rolling(window=window_size)
                .mean()
                .tolist(),
            }

        return viz_data

    def _empty_analysis_result(self) -> Dict[str, Any]:
        """Return empty analysis result for invalid data"""
        return {
            "error": "Insufficient or invalid data for analysis",
            "data_summary": {},
            "trend_analysis": {},
            "seasonal_patterns": {},
            "velocity_analysis": {},
            "anomaly_detection": {},
            "correlation_analysis": {},
            "cyclical_patterns": {},
            "volatility_analysis": {},
            "flow_analysis": {},
            "visualizations": {},
        }

    def create_trend_dashboard(self, analysis_results: Dict[str, Any]) -> go.Figure:
        """Create comprehensive trend analysis dashboard"""
        if (
            "visualizations" not in analysis_results
            or not analysis_results["visualizations"]
        ):
            return go.Figure().add_annotation(
                text="No data available for visualization",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
            )

        viz_data = analysis_results["visualizations"]
        time_data = viz_data.get("time_series_data", {})

        if not time_data.get("dates"):
            return go.Figure().add_annotation(
                text="No time series data available",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
            )

        fig = make_subplots(
            rows=3,
            cols=2,
            subplot_titles=(
                "Debit vs Credit Trends",
                "Net Flow Analysis",
                "Transaction Activity",
                "Volatility Analysis",
                "Cumulative Flow",
                "Correlation Heatmap",
            ),
            specs=[
                [{"secondary_y": True}, {"secondary_y": False}],
                [{"secondary_y": False}, {"secondary_y": False}],
                [{"secondary_y": False}, {"secondary_y": False}],
            ],
        )

        dates = time_data["dates"]
        debits = time_data["debits"]
        credits = time_data["credits"]
        net_flow = time_data["net_flow"]
        activity = time_data["activity"]

        fig.add_trace(
            go.Scatter(x=dates, y=debits, name="Debits", line=dict(color="red")),
            row=1,
            col=1,
        )
        fig.add_trace(
            go.Scatter(x=dates, y=credits, name="Credits", line=dict(color="green")),
            row=1,
            col=1,
        )

        if "moving_averages" in viz_data:
            ma_data = viz_data["moving_averages"]
            fig.add_trace(
                go.Scatter(
                    x=dates,
                    y=ma_data["debit_ma"],
                    name="Debit MA",
                    line=dict(color="red", dash="dash"),
                ),
                row=1,
                col=1,
            )
            fig.add_trace(
                go.Scatter(
                    x=dates,
                    y=ma_data["credit_ma"],
                    name="Credit MA",
                    line=dict(color="green", dash="dash"),
                ),
                row=1,
                col=1,
            )

        colors = ["red" if x < 0 else "green" for x in net_flow]
        fig.add_trace(
            go.Bar(x=dates, y=net_flow, name="Net Flow", marker_color=colors),
            row=1,
            col=2,
        )

        fig.add_trace(
            go.Scatter(x=dates, y=activity, name="Activity", line=dict(color="blue")),
            row=2,
            col=1,
        )

        if len(debits) > 5:
            volatility = pd.Series(debits).rolling(window=5).std().fillna(0).tolist()
            fig.add_trace(
                go.Scatter(
                    x=dates,
                    y=volatility,
                    name="Debit Volatility",
                    line=dict(color="orange"),
                ),
                row=2,
                col=2,
            )

        cumulative_net = np.cumsum(net_flow).tolist()
        fig.add_trace(
            go.Scatter(
                x=dates,
                y=cumulative_net,
                name="Cumulative Net Flow",
                line=dict(color="purple"),
            ),
            row=3,
            col=1,
        )

        if "correlation_analysis" in analysis_results:
            corr_data = analysis_results["correlation_analysis"]
            corr_values = list(corr_data.values())
            corr_labels = list(corr_data.keys())

            fig.add_trace(
                go.Bar(x=corr_labels, y=corr_values, name="Correlations"), row=3, col=2
            )

        fig.update_layout(
            title="Transaction Trend Analysis Dashboard", height=900, showlegend=True
        )

        return fig

    def generate_trend_insights(self, analysis_results: Dict[str, Any]) -> List[str]:
        """Generate human-readable insights from trend analysis"""
        insights = []

        if "data_summary" in analysis_results:
            summary = analysis_results["data_summary"]
            insights.append(
                f"📊 Analyzed {summary.get('total_periods', 0)} time periods"
            )
            insights.append(f"💰 Total debits: ₹{summary.get('total_debits', 0):,.2f}")
            insights.append(
                f"💰 Total credits: ₹{summary.get('total_credits', 0):,.2f}"
            )
            insights.append(f"📈 Net flow: ₹{summary.get('net_flow_total', 0):,.2f}")

        if "trend_analysis" in analysis_results:
            trends = analysis_results["trend_analysis"].get("overall_assessment", {})
            if trends:
                insights.append(
                    f"📈 Debit trend: {trends.get('debit_trend_direction', 'unknown')}"
                )
                insights.append(
                    f"📈 Credit trend: {trends.get('credit_trend_direction', 'unknown')}"
                )
                if trends.get("trends_aligned"):
                    insights.append("🔄 Debit and credit trends are aligned")
                else:
                    insights.append("⚠️ Debit and credit trends are diverging")

        if "anomaly_detection" in analysis_results:
            anomalies = analysis_results["anomaly_detection"]
            total_anomalies = len(anomalies.get("statistical_anomalies", [])) + len(
                anomalies.get("velocity_anomalies", [])
            )
            if total_anomalies > 0:
                insights.append(f"🚨 Detected {total_anomalies} anomalous periods")

        if "velocity_analysis" in analysis_results:
            velocity = analysis_results["velocity_analysis"]
            avg_velocity = velocity.get("average_transactions_per_period", 0)
            insights.append(
                f"⚡ Average transaction velocity: {avg_velocity:.1f} transactions per period"
            )

        if "seasonal_patterns" in analysis_results:
            seasonal = analysis_results["seasonal_patterns"]
            if seasonal.get("recurring_cycles", {}).get("has_recurring_patterns"):
                cycles = seasonal["recurring_cycles"]["cycles_detected"]
                insights.append(f"🔄 Detected {len(cycles)} recurring patterns")

        return insights
