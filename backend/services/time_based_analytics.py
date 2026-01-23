"""
Enhanced Time-Based Analytics for Transaction Trend Analysis

This module provides sophisticated time-based analysis capabilities to identify
patterns, trends, and anomalies in debit and credit transactions over time.
"""

import numpy as np
import polars as pl
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
        df: pl.DataFrame,
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
        if df.is_empty():
            return self._empty_analysis_result()

        df_clean = self._prepare_time_series_data(
            df, date_column, debit_column, credit_column
        )

        if df_clean.is_empty():
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
        self, df: pl.DataFrame, date_col: str, debit_col: str, credit_col: str
    ) -> pl.DataFrame:
        """Prepare and clean data for time series analysis"""
        df_clean = df.clone()

        if date_col in df_clean.columns:
            df_clean = df_clean.with_columns(
                pl.col(date_col).cast(pl.Datetime, strict=False).alias(date_col)
            )

        for col in [debit_col, credit_col]:
            if col in df_clean.columns:
                df_clean = df_clean.with_columns(
                    pl.col(col)
                    .cast(pl.Utf8)
                    .str.replace_all(",", "")
                    .str.replace_all("₹", "")
                    .cast(pl.Float64, strict=False)
                    .fill_null(0)
                    .alias(col)
                )

        df_clean = df_clean.filter(pl.col(date_col).is_not_null())

        df_clean = df_clean.with_columns(
            [
                (pl.col(credit_col) - pl.col(debit_col)).alias("net_flow"),
                (pl.col(debit_col) + pl.col(credit_col)).alias("total_activity"),
                pl.col(date_col).dt.hour().alias("hour"),
                pl.col(date_col).dt.strftime("%A").alias("day_of_week"),
                pl.col(date_col).dt.month().alias("month"),
                pl.col(date_col).dt.quarter().alias("quarter"),
                pl.col(date_col).dt.year().alias("year"),
            ]
        )

        return df_clean.sort(date_col)

    def _aggregate_by_time(self, df: pl.DataFrame, granularity: str) -> pl.DataFrame:
        """Aggregate transaction data by specified time granularity"""
        date_col = "DATE"

        if granularity == "hourly":
            df = df.with_columns(pl.col(date_col).dt.truncate("1h").alias("time_key"))
        elif granularity == "daily":
            df = df.with_columns(pl.col(date_col).dt.date().alias("time_key"))
        elif granularity == "weekly":
            df = df.with_columns(pl.col(date_col).dt.truncate("1w").alias("time_key"))
        elif granularity == "monthly":
            df = df.with_columns(pl.col(date_col).dt.truncate("1mo").alias("time_key"))
        else:
            df = df.with_columns(pl.col(date_col).dt.date().alias("time_key"))

        agg_data = (
            df.group_by("time_key")
            .agg(
                [
                    pl.col("DEBIT").sum().alias("DEBIT_sum"),
                    pl.col("DEBIT").count().alias("DEBIT_count"),
                    pl.col("DEBIT").mean().alias("DEBIT_mean"),
                    pl.col("DEBIT").std().alias("DEBIT_std"),
                    pl.col("CREDIT").sum().alias("CREDIT_sum"),
                    pl.col("CREDIT").count().alias("CREDIT_count"),
                    pl.col("CREDIT").mean().alias("CREDIT_mean"),
                    pl.col("CREDIT").std().alias("CREDIT_std"),
                    pl.col("net_flow").sum().alias("net_flow_sum"),
                    pl.col("net_flow").mean().alias("net_flow_mean"),
                    pl.col("total_activity").sum().alias("total_activity_sum"),
                    pl.col("total_activity").mean().alias("total_activity_mean"),
                    pl.col("hour").mode().first().alias("hour_mode"),
                    pl.col("day_of_week").mode().first().alias("day_of_week_mode"),
                ]
            )
        )

        agg_data = agg_data.with_columns(
            [
                (pl.col("DEBIT_sum") / (pl.col("CREDIT_sum") + 1e-10)).alias(
                    "debit_credit_ratio"
                ),
                (pl.col("DEBIT_count") + pl.col("CREDIT_count")).alias(
                    "activity_intensity"
                ),
                (
                    (pl.col("DEBIT_std").fill_null(0)
                    + pl.col("CREDIT_std").fill_null(0))
                    / 2
                ).alias("volatility"),
            ]
        )

        return agg_data.sort("time_key")

    def _calculate_data_summary(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Calculate summary statistics for the time series data"""
        start = time_series.get_column("time_key").min() if len(time_series) else None
        end = time_series.get_column("time_key").max() if len(time_series) else None
        span_days = 0
        if start is not None and end is not None:
            try:
                span_days = (end - start).days
            except Exception:
                span_days = 0

        def _idxmax(col: str) -> Optional[Any]:
            if len(time_series) == 0 or col not in time_series.columns:
                return None
            sorted_df = time_series.sort(col, descending=True)
            return sorted_df.get_column("time_key")[0] if len(sorted_df) else None

        return {
            "total_periods": len(time_series),
            "date_range": {
                "start": start,
                "end": end,
                "span_days": span_days,
            },
            "total_debits": float(time_series.get_column("DEBIT_sum").sum()),
            "total_credits": float(time_series.get_column("CREDIT_sum").sum()),
            "net_flow_total": float(time_series.get_column("net_flow_sum").sum()),
            "average_daily_debits": float(time_series.get_column("DEBIT_sum").mean()),
            "average_daily_credits": float(time_series.get_column("CREDIT_sum").mean()),
            "transaction_count": int(time_series.get_column("activity_intensity").sum()),
            "most_active_period": _idxmax("activity_intensity"),
            "highest_debit_period": _idxmax("DEBIT_sum"),
            "highest_credit_period": _idxmax("CREDIT_sum"),
        }

    def _analyze_trends(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Analyze trends in debit and credit patterns"""
        results = {}

        for metric in ["DEBIT_sum", "CREDIT_sum", "net_flow_sum", "activity_intensity"]:
            if metric in time_series.columns:
                trend_result = self._calculate_linear_trend(
                    time_series.get_column("time_key"), time_series.get_column(metric)
                )
                results[metric] = trend_result

        window_size = min(7, len(time_series) // 3)
        if window_size >= 2:
            debit_vals = time_series.get_column("DEBIT_sum").to_numpy()
            credit_vals = time_series.get_column("CREDIT_sum").to_numpy()
            results["moving_averages"] = {
                "debit_ma": self._rolling_mean(debit_vals, window_size).tolist(),
                "credit_ma": self._rolling_mean(credit_vals, window_size).tolist(),
                "net_flow_ma": self._rolling_mean(
                    time_series.get_column("net_flow_sum").to_numpy(), window_size
                ).tolist(),
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
        self, x_values: pl.Series, y_values: pl.Series
    ) -> Dict[str, float]:
        """Calculate linear trend statistics"""
        try:
            valid_mask = x_values.is_not_null() & y_values.is_not_null()
            x_clean = x_values.filter(valid_mask).to_numpy()
            y_clean = y_values.filter(valid_mask).to_numpy()

            if len(x_clean) < 2:
                return {"slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1}

            if np.issubdtype(x_clean.dtype, np.datetime64):
                x_numeric = (x_clean - x_clean.min()) / np.timedelta64(1, "D")
            else:
                x_numeric = x_clean.astype(float, copy=False)

            y_numeric = y_clean.astype(float, copy=False)

            if len(x_numeric) < 2:
                return {"slope": 0, "intercept": 0, "r_squared": 0, "p_value": 1}

            slope, intercept = np.polyfit(x_numeric, y_numeric, 1)

            y_pred = slope * x_numeric + intercept
            ss_res = np.sum((y_numeric - y_pred) ** 2)
            ss_tot = np.sum((y_numeric - np.mean(y_numeric)) ** 2)
            r_squared = 1 - (ss_res / (ss_tot + 1e-10))

            n = len(x_numeric)
            t_stat = (
                slope
                * np.sqrt((n - 2) / (1 - r_squared + 1e-10))
                * np.sqrt(np.sum((x_numeric - np.mean(x_numeric)) ** 2))
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

    def _detect_seasonal_patterns(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Detect seasonal and cyclical patterns in transaction data"""
        patterns = {}

        if "day_of_week_mode" in time_series.columns and len(time_series) > 7:
            dow_analysis = self._analyze_day_of_week_patterns(time_series)
            patterns["day_of_week"] = dow_analysis

        if len(time_series) > 30:
            monthly_analysis = self._analyze_monthly_patterns(time_series)
            patterns["monthly"] = monthly_analysis

        cycle_analysis = self._detect_recurring_cycles(time_series)
        patterns["recurring_cycles"] = cycle_analysis

        return patterns

    def _analyze_day_of_week_patterns(
        self, time_series: pl.DataFrame
    ) -> Dict[str, Any]:
        """Analyze patterns by day of week"""

        return {
            "pattern_detected": False,
            "note": "Day-of-week analysis requires individual transaction timestamps",
        }

    def _analyze_monthly_patterns(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Analyze monthly patterns in transaction data"""
        try:
            time_series = time_series.with_columns(
                pl.col("time_key").cast(pl.Date).dt.month().alias("month")
            )

            monthly_stats = (
                time_series.group_by("month")
                .agg(
                    [
                        pl.col("DEBIT_sum").mean().alias("DEBIT_sum_mean"),
                        pl.col("DEBIT_sum").std().alias("DEBIT_sum_std"),
                        pl.col("CREDIT_sum").mean().alias("CREDIT_sum_mean"),
                        pl.col("CREDIT_sum").std().alias("CREDIT_sum_std"),
                        pl.col("activity_intensity").mean().alias(
                            "activity_intensity_mean"
                        ),
                    ]
                )
            )

            peak_debit_month = (
                monthly_stats.sort("DEBIT_sum_mean", descending=True)
                .get_column("month")[0]
                if len(monthly_stats) > 0
                else None
            )
            peak_credit_month = (
                monthly_stats.sort("CREDIT_sum_mean", descending=True)
                .get_column("month")[0]
                if len(monthly_stats) > 0
                else None
            )
            peak_activity_month = (
                monthly_stats.sort("activity_intensity_mean", descending=True)
                .get_column("month")[0]
                if len(monthly_stats) > 0
                else None
            )

            debit_cv = (
                float(
                    monthly_stats.get_column("DEBIT_sum_std").mean()
                    / (monthly_stats.get_column("DEBIT_sum_mean").mean() + 1e-10)
                )
                if len(monthly_stats) > 0
                else 0
            )
            credit_cv = (
                float(
                    monthly_stats.get_column("CREDIT_sum_std").mean()
                    / (monthly_stats.get_column("CREDIT_sum_mean").mean() + 1e-10)
                )
                if len(monthly_stats) > 0
                else 0
            )

            return {
                "monthly_statistics": monthly_stats.to_dicts(),
                "peak_debit_month": int(peak_debit_month) if peak_debit_month else None,
                "peak_credit_month": int(peak_credit_month) if peak_credit_month else None,
                "peak_activity_month": (
                    int(peak_activity_month) if peak_activity_month else None
                ),
                "seasonal_variation": {
                    "debit_cv": debit_cv,
                    "credit_cv": credit_cv,
                },
            }
        except Exception:
            return {
                "pattern_detected": False,
                "error": "Insufficient data for monthly analysis",
            }

    def _detect_recurring_cycles(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Detect recurring cycles in transaction patterns"""
        try:
            debit_series = time_series.get_column("DEBIT_sum").to_numpy()
            credit_series = time_series.get_column("CREDIT_sum").to_numpy()

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
        self, time_series: pl.DataFrame
    ) -> Dict[str, Any]:
        """Analyze transaction velocity and frequency patterns"""
        velocity_metrics = {}

        activity = time_series.get_column("activity_intensity")

        velocity_metrics["average_transactions_per_period"] = float(activity.mean())
        velocity_metrics["max_transactions_per_period"] = int(activity.max())
        velocity_metrics["velocity_volatility"] = float(activity.std())

        velocity_threshold = float(activity.quantile(0.8)) if len(activity) else 0
        high_velocity_periods = time_series.filter(
            pl.col("activity_intensity") > velocity_threshold
        )

        velocity_metrics["high_velocity_periods"] = {
            "count": len(high_velocity_periods),
            "threshold": float(velocity_threshold),
            "periods": high_velocity_periods.get_column("time_key").to_list(),
        }

        velocity_change = activity.diff()
        velocity_metrics["average_acceleration"] = float(velocity_change.mean())
        velocity_metrics["max_acceleration"] = float(velocity_change.max())
        velocity_metrics["max_deceleration"] = float(velocity_change.min())

        return velocity_metrics

    def _detect_time_based_anomalies(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Detect anomalies in time-based transaction patterns"""
        anomalies = {
            "statistical_anomalies": [],
            "pattern_anomalies": [],
            "velocity_anomalies": [],
        }

        for metric in ["DEBIT_sum", "CREDIT_sum", "activity_intensity"]:
            if metric in time_series.columns:
                series = time_series.get_column(metric)
                q1 = float(series.quantile(0.25))
                q3 = float(series.quantile(0.75))
                iqr = q3 - q1
                lower_bound = q1 - 1.5 * iqr
                upper_bound = q3 + 1.5 * iqr

                anomalous_periods = time_series.filter(
                    (pl.col(metric) < lower_bound) | (pl.col(metric) > upper_bound)
                )

                for period in anomalous_periods.iter_rows(named=True):
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

        velocity_mean = float(time_series.get_column("activity_intensity").mean())
        velocity_std = float(time_series.get_column("activity_intensity").std())
        velocity_threshold = velocity_mean + 2 * velocity_std

        velocity_anomalies = time_series.filter(
            pl.col("activity_intensity") > velocity_threshold
        )
        for period in velocity_anomalies.iter_rows(named=True):
            anomalies["velocity_anomalies"].append(
                {
                    "period": period["time_key"],
                    "transaction_count": int(period["activity_intensity"]),
                    "expected_max": float(velocity_threshold),
                    "severity": (
                        "high"
                        if period["activity_intensity"] > velocity_mean + 3 * velocity_std
                        else "moderate"
                    ),
                }
            )

        return anomalies

    def _analyze_debit_credit_correlation(
        self, time_series: pl.DataFrame
    ) -> Dict[str, float]:
        """Analyze correlation between debit and credit patterns"""
        try:
            cols = ["DEBIT_sum", "CREDIT_sum", "net_flow_sum", "activity_intensity"]
            data = np.column_stack(
                [time_series.get_column(c).to_numpy() for c in cols]
            )
            corr = np.corrcoef(data, rowvar=False)
            return {
                "debit_credit_correlation": float(corr[0, 1]),
                "debit_activity_correlation": float(corr[0, 3]),
                "credit_activity_correlation": float(corr[1, 3]),
                "net_flow_activity_correlation": float(corr[2, 3]),
            }
        except Exception:
            return {
                "debit_credit_correlation": 0.0,
                "debit_activity_correlation": 0.0,
                "credit_activity_correlation": 0.0,
                "net_flow_activity_correlation": 0.0,
            }

    def _detect_cyclical_patterns(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Detect cyclical patterns in transaction behavior"""
        cyclical_analysis = {}

        for metric in ["DEBIT_sum", "CREDIT_sum"]:
            if metric in time_series.columns and len(time_series) > 10:
                series_values = time_series.get_column(metric).to_numpy()

                window = min(5, len(series_values) // 3)
                if window >= 2:
                    moving_avg = self._rolling_mean(series_values, window)
                    if np.isnan(moving_avg).all():
                        continue
                    mean_val = np.nanmean(moving_avg)
                    moving_avg = np.where(np.isnan(moving_avg), mean_val, moving_avg)
                    detrended = series_values - moving_avg

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
                            np.std(detrended)
                            / (np.mean(np.abs(series_values)) + 1e-10)
                        ),
                    }

        return cyclical_analysis

    def _analyze_volatility(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Analyze volatility in transaction patterns"""
        volatility_analysis = {}

        for metric in ["DEBIT_sum", "CREDIT_sum", "net_flow_sum"]:
            if metric in time_series.columns:
                values = time_series.get_column(metric)

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

    def _calculate_volatility_trend(self, series: pl.Series) -> str:
        """Calculate whether volatility is increasing, decreasing, or stable"""
        try:
            window = min(5, len(series) // 3)
            if window < 2:
                return "insufficient_data"

            rolling_vol = self._rolling_std(series.to_numpy(), window)
            x_vals = pl.Series("x", list(range(len(rolling_vol))))
            y_vals = pl.Series("y", rolling_vol)
            vol_trend = self._calculate_linear_trend(x_vals, y_vals)

            if vol_trend["slope"] > 0 and vol_trend["r_squared"] > 0.3:
                return "increasing"
            elif vol_trend["slope"] < 0 and vol_trend["r_squared"] > 0.3:
                return "decreasing"
            else:
                return "stable"
        except Exception:
            return "unknown"

    def _analyze_cash_flow_patterns(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Analyze cash flow patterns and liquidity trends"""
        flow_analysis = {}

        net_flow = time_series.get_column("net_flow_sum").to_numpy()
        debits = time_series.get_column("DEBIT_sum").to_numpy()
        credits = time_series.get_column("CREDIT_sum").to_numpy()

        cumulative_net_flow = np.cumsum(net_flow)
        cumulative_debits = np.cumsum(debits)
        cumulative_credits = np.cumsum(credits)

        flow_analysis["net_flow_trend"] = self._calculate_linear_trend(
            pl.Series("x", list(range(len(cumulative_net_flow)))),
            pl.Series("y", cumulative_net_flow),
        )

        positive_flow_periods = int(np.sum(net_flow > 0))
        negative_flow_periods = int(np.sum(net_flow < 0))

        flow_analysis["flow_balance"] = {
            "positive_periods": positive_flow_periods,
            "negative_periods": negative_flow_periods,
            "neutral_periods": len(net_flow) - positive_flow_periods - negative_flow_periods,
            "net_positive_ratio": (
                positive_flow_periods / len(net_flow) if len(net_flow) > 0 else 0
            ),
        }

        max_negative_flow = float(np.min(cumulative_net_flow)) if len(cumulative_net_flow) else 0
        flow_analysis["liquidity_metrics"] = {
            "max_drawdown": float(max_negative_flow) if max_negative_flow < 0 else 0.0,
            "final_position": float(cumulative_net_flow[-1]) if len(cumulative_net_flow) else 0.0,
            "flow_volatility": float(np.std(net_flow)) if len(net_flow) else 0.0,
        }

        return flow_analysis

    def _create_trend_visualizations(self, time_series: pl.DataFrame) -> Dict[str, Any]:
        """Create visualization data for trend analysis"""
        viz_data = {
            "time_series_data": {
                "dates": time_series.get_column("time_key").to_list(),
                "debits": time_series.get_column("DEBIT_sum").to_list(),
                "credits": time_series.get_column("CREDIT_sum").to_list(),
                "net_flow": time_series.get_column("net_flow_sum").to_list(),
                "activity": time_series.get_column("activity_intensity").to_list(),
            }
        }

        window_size = min(7, len(time_series) // 3)
        if window_size >= 2:
            viz_data["moving_averages"] = {
                "debit_ma": self._rolling_mean(
                    time_series.get_column("DEBIT_sum").to_numpy(), window_size
                ).tolist(),
                "credit_ma": self._rolling_mean(
                    time_series.get_column("CREDIT_sum").to_numpy(), window_size
                ).tolist(),
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
            volatility = self._rolling_std(np.array(debits, dtype=float), 5)
            volatility = np.nan_to_num(volatility, nan=0.0).tolist()
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

    def _rolling_mean(self, values: np.ndarray, window: int) -> np.ndarray:
        if window < 1 or len(values) == 0:
            return np.array([])
        if len(values) < window:
            return np.full(len(values), np.nan)
        kernel = np.ones(window) / window
        rolled = np.convolve(values, kernel, mode="valid")
        return np.concatenate([np.full(window - 1, np.nan), rolled])

    def _rolling_std(self, values: np.ndarray, window: int) -> np.ndarray:
        if window < 1 or len(values) == 0:
            return np.array([])
        if len(values) < window:
            return np.full(len(values), np.nan)
        stds = []
        for i in range(len(values)):
            if i < window - 1:
                stds.append(np.nan)
            else:
                stds.append(float(np.std(values[i - window + 1 : i + 1])))
        return np.array(stds)
