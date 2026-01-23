"""
Mule Account Pattern Detection

This module specifically detects mule account patterns where accounts receive
multiple small amounts (credits) and then make large periodic debits.
This is a common money laundering technique.
"""

import polars as pl
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from collections import defaultdict
import warnings

warnings.filterwarnings("ignore")


@dataclass
class MuleAccountAlert:
    """Alert for detected mule account pattern"""

    account_id: str
    confidence_score: float
    pattern_type: str
    detection_period: Dict[str, Any]
    collection_phase: Dict[str, Any]
    disbursement_phase: Dict[str, Any]
    risk_indicators: List[str]
    recommended_actions: List[str]


class MuleAccountDetector:
    """
    Specialized detector for mule account patterns focusing on:
    1. Multiple small credits followed by large debits
    2. Periodic disbursement patterns (daily, weekly, monthly)
    3. Threshold avoidance behaviors
    4. Velocity and timing anomalies
    
    Scoring Methodology:
    Each detection pattern contributes to a confidence score (0.0 to 1.0) based on:
    - Pattern strength indicators (e.g., flow balance ratios, periodicity strength)
    - Transaction volume and frequency
    - Temporal concentration of activities
    - Behavioral consistency (amount patterns, timing patterns)
    
    The final confidence score is a weighted sum of these factors, with higher scores
    indicating stronger evidence of mule account activity.
    """

    def __init__(self):
        self.detection_cache = {}

        # Configuration parameters with documentation
        self.config = {
            # Minimum number of credit transactions required for classic mule pattern
            "min_collection_transactions": 5,
            
            # Minimum ratio of median debit to median credit amounts (classic pattern)
            "min_disbursement_amount_ratio": 3.0,
            
            # Maximum collection period in days for concentrated activity scoring
            "max_collection_period_days": 30,
            
            # Percentile threshold for defining "small" transactions
            "small_percentile_threshold": 0.3,
            
            # Percentile threshold for defining "large" transactions
            "large_percentile_threshold": 0.8,
            
            # Minimum velocity threshold for timing pattern scoring
            "velocity_threshold": 0.5,
            
            # Tolerance in days for periodicity detection (e.g., 7-day ±2 days)
            "periodicity_tolerance": 2,
            
            # Minimum ratio of credits to debits for asymmetric pattern scoring
            "collection_disbursement_ratio": 2.0,
            
            # Threshold for amount variance in periodic pattern detection
            "amount_variance_threshold": 2.0,
        }

    def detect_mule_patterns(
        self, df: pl.DataFrame, account_identifier: str = None
    ) -> List[MuleAccountAlert]:
        """
        Main detection function for mule account patterns.

        Core Definition: A mule account is a pass-through account where
        total inflow ≈ total outflow, indicating money laundering activity.

        Args:
            df: DataFrame with transaction data
            account_identifier: Optional identifier for the account being analyzed

        Returns:
            List of MuleAccountAlert objects
        """
        if df.is_empty():
            return []

        df_clean = self._prepare_mule_analysis_data(df)

        if df_clean.is_empty():
            return []

        alerts = []

        passthrough_alert = self._detect_passthrough_mule_pattern(
            df_clean, account_identifier
        )
        if passthrough_alert:
            alerts.append(passthrough_alert)

        if passthrough_alert:

            classic_alert = self._detect_classic_mule_pattern(
                df_clean, account_identifier
            )
            if classic_alert:
                alerts.append(classic_alert)

            periodic_alert = self._detect_periodic_mule_pattern(
                df_clean, account_identifier
            )
            if periodic_alert:
                alerts.append(periodic_alert)

            threshold_alert = self._detect_threshold_mule_pattern(
                df_clean, account_identifier
            )
            if threshold_alert:
                alerts.append(threshold_alert)

        return alerts

    def _prepare_mule_analysis_data(self, df: pl.DataFrame) -> pl.DataFrame:
        """Prepare data specifically for mule account analysis"""
        df_clean = df.clone()

        if "DATE" in df_clean.columns:
            df_clean = df_clean.with_columns(
                pl.col("DATE")
                .cast(pl.Utf8)
                .str.strptime(pl.Datetime, strict=False)
                .alias("DATE")
            )

        for col in ["DEBIT", "CREDIT"]:
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

        df_clean = df_clean.filter(pl.col("DATE").is_not_null())

        df_clean = df_clean.with_columns(
            [
                (pl.col("CREDIT") > 0).alias("is_credit"),
                (pl.col("DEBIT") > 0).alias("is_debit"),
                (pl.col("CREDIT") + pl.col("DEBIT")).alias("amount"),
                pl.when(pl.col("CREDIT") > 0)
                .then(pl.lit("credit"))
                .otherwise(pl.lit("debit"))
                .alias("transaction_type"),
            ]
        )

        if df_clean.height > 0:
            small_threshold = df_clean.select(
                pl.col("amount").quantile(self.config["small_percentile_threshold"])
            ).item()
            large_threshold = df_clean.select(
                pl.col("amount").quantile(self.config["large_percentile_threshold"])
            ).item()
            if small_threshold is None:
                small_threshold = 0.0
            if large_threshold is None:
                large_threshold = 0.0

            df_clean = df_clean.with_columns(
                [
                    (pl.col("amount") <= pl.lit(small_threshold)).alias(
                        "is_small_amount"
                    ),
                    (pl.col("amount") >= pl.lit(large_threshold)).alias(
                        "is_large_amount"
                    ),
                    pl.lit(small_threshold).alias("_adaptive_small_threshold"),
                    pl.lit(large_threshold).alias("_adaptive_large_threshold"),
                ]
            )
        else:
            df_clean = df_clean.with_columns(
                [
                    pl.lit(False).alias("is_small_amount"),
                    pl.lit(False).alias("is_large_amount"),
                ]
            )

        df_clean = df_clean.with_columns(
            [
                pl.col("DATE").dt.strftime("%A").alias("day_of_week"),
                pl.col("DATE").dt.day().alias("day_of_month"),
                pl.col("DATE").dt.week().alias("week_of_year"),
            ]
        )

        return df_clean.sort("DATE")

    def _analyze_multiple_time_intervals(
        self, df: pl.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Analyze pass-through behavior across multiple time intervals to catch
        sophisticated mule operations that balance at different frequencies.
        """
        results = []

        if df.is_empty():
            return results

        total_credits = df["CREDIT"].sum()
        total_debits = df["DEBIT"].sum()

        if total_credits > 0 or total_debits > 0:
            net_flow = total_credits - total_debits
            total_flow = total_credits + total_debits
            net_flow_ratio = abs(net_flow) / total_flow if total_flow > 0 else 1.0

            results.append(
                {
                    "interval_type": "lifetime",
                    "total_credits": total_credits,
                    "total_debits": total_debits,
                    "net_flow": net_flow,
                    "total_flow": total_flow,
                    "net_flow_ratio": net_flow_ratio,
                    "suspicion_score": 1.0 - net_flow_ratio,
                    "periods_analyzed": 1,
                    "description": "Overall account balance",
                }
            )

        daily_results = self._analyze_daily_balancing(df)
        if daily_results:
            results.extend(daily_results)

        weekly_results = self._analyze_weekly_balancing(df)
        if weekly_results:
            results.extend(weekly_results)

        monthly_results = self._analyze_monthly_balancing(df)
        if monthly_results:
            results.extend(monthly_results)

        rolling_results = self._analyze_rolling_windows(df)
        if rolling_results:
            results.extend(rolling_results)

        return results

    def _analyze_daily_balancing(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a daily basis"""
        results = []

        try:

            daily_summary = (
                df.with_columns(pl.col("DATE").dt.date().alias("date"))
                .group_by("date")
                .agg(
                    [
                        pl.col("CREDIT").sum().alias("day_credits"),
                        pl.col("DEBIT").sum().alias("day_debits"),
                    ]
                )
                .with_columns(
                    (pl.col("day_credits") + pl.col("day_debits")).alias(
                        "day_total_flow"
                    ),
                    (pl.col("day_credits") - pl.col("day_debits")).alias(
                        "day_net_flow"
                    ),
                )
                .with_columns(
                    pl.when(pl.col("day_total_flow") > 0)
                    .then(pl.col("day_net_flow").abs() / pl.col("day_total_flow"))
                    .otherwise(pl.lit(1.0))
                    .alias("day_ratio")
                )
            )

            total_days_with_both = (
                daily_summary.filter(
                    (pl.col("day_credits") > 0) & (pl.col("day_debits") > 0)
                )
                .height
            )
            balanced_days = (
                daily_summary.filter(
                    (pl.col("day_credits") > 0)
                    & (pl.col("day_debits") > 0)
                    & (pl.col("day_ratio") <= 0.1)
                )
                .height
            )

            if (
                total_days_with_both >= 3
                and balanced_days >= total_days_with_both * 0.6
            ):
                balance_ratio = balanced_days / total_days_with_both

                total_credits = df["CREDIT"].sum()
                total_debits = df["DEBIT"].sum()
                total_flow = total_credits + total_debits
                net_flow = total_credits - total_debits

                results.append(
                    {
                        "interval_type": "daily",
                        "total_credits": total_credits,
                        "total_debits": total_debits,
                        "net_flow": net_flow,
                        "total_flow": total_flow,
                        "net_flow_ratio": abs(net_flow) / total_flow
                        if total_flow > 0
                        else 1.0,
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_days_with_both,
                        "balanced_periods": balanced_days,
                        "description": f"Daily balancing: {balanced_days}/{total_days_with_both} days balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_weekly_balancing(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a weekly basis"""
        results = []

        try:

            weekly_summary = (
                df.with_columns(
                    [
                        pl.col("DATE").dt.week().alias("week"),
                        pl.col("DATE").dt.year().alias("year"),
                    ]
                )
                .group_by(["year", "week"])
                .agg(
                    [
                        pl.col("CREDIT").sum().alias("week_credits"),
                        pl.col("DEBIT").sum().alias("week_debits"),
                    ]
                )
                .with_columns(
                    (pl.col("week_credits") + pl.col("week_debits")).alias(
                        "week_total_flow"
                    ),
                    (pl.col("week_credits") - pl.col("week_debits")).alias(
                        "week_net_flow"
                    ),
                )
                .with_columns(
                    pl.when(pl.col("week_total_flow") > 0)
                    .then(pl.col("week_net_flow").abs() / pl.col("week_total_flow"))
                    .otherwise(pl.lit(1.0))
                    .alias("week_ratio")
                )
            )

            total_weeks_with_both = (
                weekly_summary.filter(
                    (pl.col("week_credits") > 0) & (pl.col("week_debits") > 0)
                )
                .height
            )
            balanced_weeks = (
                weekly_summary.filter(
                    (pl.col("week_credits") > 0)
                    & (pl.col("week_debits") > 0)
                    & (pl.col("week_ratio") <= 0.15)
                )
                .height
            )

            if (
                total_weeks_with_both >= 2
                and balanced_weeks >= total_weeks_with_both * 0.6
            ):
                balance_ratio = balanced_weeks / total_weeks_with_both

                total_credits = df["CREDIT"].sum()
                total_debits = df["DEBIT"].sum()
                total_flow = total_credits + total_debits
                net_flow = total_credits - total_debits

                results.append(
                    {
                        "interval_type": "weekly",
                        "total_credits": total_credits,
                        "total_debits": total_debits,
                        "net_flow": net_flow,
                        "total_flow": total_flow,
                        "net_flow_ratio": abs(net_flow) / total_flow
                        if total_flow > 0
                        else 1.0,
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_weeks_with_both,
                        "balanced_periods": balanced_weeks,
                        "description": f"Weekly balancing: {balanced_weeks}/{total_weeks_with_both} weeks balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_monthly_balancing(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a monthly basis"""
        results = []

        try:

            monthly_summary = (
                df.with_columns(
                    pl.col("DATE").dt.truncate("1mo").alias("year_month")
                )
                .group_by("year_month")
                .agg(
                    [
                        pl.col("CREDIT").sum().alias("month_credits"),
                        pl.col("DEBIT").sum().alias("month_debits"),
                    ]
                )
                .with_columns(
                    (pl.col("month_credits") + pl.col("month_debits")).alias(
                        "month_total_flow"
                    ),
                    (pl.col("month_credits") - pl.col("month_debits")).alias(
                        "month_net_flow"
                    ),
                )
                .with_columns(
                    pl.when(pl.col("month_total_flow") > 0)
                    .then(pl.col("month_net_flow").abs() / pl.col("month_total_flow"))
                    .otherwise(pl.lit(1.0))
                    .alias("month_ratio")
                )
            )

            total_months_with_both = (
                monthly_summary.filter(
                    (pl.col("month_credits") > 0) & (pl.col("month_debits") > 0)
                )
                .height
            )
            balanced_months = (
                monthly_summary.filter(
                    (pl.col("month_credits") > 0)
                    & (pl.col("month_debits") > 0)
                    & (pl.col("month_ratio") <= 0.2)
                )
                .height
            )

            if (
                total_months_with_both >= 2
                and balanced_months >= total_months_with_both * 0.6
            ):
                balance_ratio = balanced_months / total_months_with_both

                total_credits = df["CREDIT"].sum()
                total_debits = df["DEBIT"].sum()
                total_flow = total_credits + total_debits
                net_flow = total_credits - total_debits

                results.append(
                    {
                        "interval_type": "monthly",
                        "total_credits": total_credits,
                        "total_debits": total_debits,
                        "net_flow": net_flow,
                        "total_flow": total_flow,
                        "net_flow_ratio": abs(net_flow) / total_flow
                        if total_flow > 0
                        else 1.0,
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_months_with_both,
                        "balanced_periods": balanced_months,
                        "description": f"Monthly balancing: {balanced_months}/{total_months_with_both} months balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_rolling_windows(self, df: pl.DataFrame) -> List[Dict[str, Any]]:
        """Analyze rolling windows to catch sophisticated timing patterns"""
        results = []

        try:

            seven_day_results = self._analyze_rolling_window(
                df, window_days=7, window_name="7-day"
            )
            if seven_day_results:
                results.extend(seven_day_results)

            thirty_day_results = self._analyze_rolling_window(
                df, window_days=30, window_name="30-day"
            )
            if thirty_day_results:
                results.extend(thirty_day_results)

        except Exception:
            pass

        return results

    def _analyze_rolling_window(
        self, df: pl.DataFrame, window_days: int, window_name: str
    ) -> List[Dict[str, Any]]:
        """Analyze a specific rolling window size"""
        results = []

        try:
            if df.height < 5:
                return results

            date_range = (df["DATE"].max() - df["DATE"].min()).days
            if date_range < window_days:
                return results

            balanced_windows = 0
            total_windows = 0

            start_date = df["DATE"].min()
            end_date = df["DATE"].max() - timedelta(days=window_days)

            current_date = start_date
            while current_date <= end_date:
                window_end = current_date + timedelta(days=window_days)
                window_df = df.filter(
                    (pl.col("DATE") >= current_date) & (pl.col("DATE") < window_end)
                )

                if window_df.height >= 2:
                    window_credits = window_df["CREDIT"].sum()
                    window_debits = window_df["DEBIT"].sum()

                    if window_credits > 0 and window_debits > 0:
                        total_windows += 1
                        window_net_flow = window_credits - window_debits
                        window_total_flow = window_credits + window_debits

                        if window_total_flow > 0:
                            window_ratio = abs(window_net_flow) / window_total_flow
                            if window_ratio <= 0.15:
                                balanced_windows += 1

                current_date += timedelta(days=3)

            if total_windows >= 3 and balanced_windows >= total_windows * 0.5:
                balance_ratio = balanced_windows / total_windows

                total_credits = df["CREDIT"].sum()
                total_debits = df["DEBIT"].sum()
                total_flow = total_credits + total_debits
                net_flow = total_credits - total_debits

                results.append(
                    {
                        "interval_type": f"rolling_{window_days}d",
                        "total_credits": total_credits,
                        "total_debits": total_debits,
                        "net_flow": net_flow,
                        "total_flow": total_flow,
                        "net_flow_ratio": abs(net_flow) / total_flow
                        if total_flow > 0
                        else 1.0,
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_windows,
                        "balanced_periods": balanced_windows,
                        "description": f"{window_name} rolling windows: {balanced_windows}/{total_windows} windows balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _detect_passthrough_mule_pattern(
        self, df: pl.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect the core mule pattern: Pass-through account where inflow ≈ outflow
        This checks multiple time intervals to catch sophisticated mule operations.
        
        Scoring Methodology:
        Confidence Score Calculation (Max 1.0):
        1. Flow Balance (Max 0.70):
           - Net flow ratio <= 0.02: +0.70
           - Net flow ratio <= 0.05: +0.60
           - Net flow ratio <= 0.10: +0.45
           - Net flow ratio <= 0.20: +0.25
           
        2. Transaction Volume (Max 0.15):
           - >= 15 transactions: +0.15
           - >= 8 transactions: +0.10
           - >= 5 transactions: +0.05
           
        3. Concentrated Activity (Max 0.10):
           - <= 30 days with >= 8 transactions: +0.10
           - <= 60 days with >= 12 transactions: +0.05
           
        4. Bidirectional Flow (Max 0.05):
           - >= 3 credits and >= 2 debits: +0.05
           - >= 2 credits and >= 1 debit: +0.02
           
        Total Score: Sum of all applicable scores, capped at 1.0
        Minimum threshold for alert: 0.4 (adjusted by sensitivity multiplier)
        """
        try:

            interval_results = self._analyze_multiple_time_intervals(df)

            if not interval_results:
                return None

            # Use all interval results instead of just the best one
            all_intervals_summary = [
                {
                    "type": r["interval_type"],
                    "ratio": r["net_flow_ratio"],
                    "suspicion": r["suspicion_score"],
                    "description": r["description"],
                    "periods_analyzed": r.get("periods_analyzed", 0),
                    "balanced_periods": r.get("balanced_periods", 0),
                }
                for r in interval_results
            ]

            # Use the best result for scoring calculations
            best_result = max(interval_results, key=lambda x: x["suspicion_score"])

            net_flow_ratio = best_result["net_flow_ratio"]
            total_credits = best_result["total_credits"]
            total_debits = best_result["total_debits"]
            net_flow = best_result["net_flow"]
            total_flow = best_result["total_flow"]
            interval_type = best_result["interval_type"]

            confidence_score = 0.0
            risk_indicators = []

            if net_flow_ratio <= 0.02:
                confidence_score += 0.70
                risk_indicators.append(
                    f"Extremely balanced flow: {net_flow_ratio*100:.1f}% net flow ratio (strong pass-through indicator)"
                )
            elif net_flow_ratio <= 0.05:
                confidence_score += 0.60
                risk_indicators.append(
                    f"Highly balanced flow: {net_flow_ratio*100:.1f}% net flow ratio (pass-through indicator)"
                )
            elif net_flow_ratio <= 0.10:
                confidence_score += 0.45
                risk_indicators.append(
                    f"Balanced flow: {net_flow_ratio*100:.1f}% net flow ratio (potential pass-through)"
                )
            elif net_flow_ratio <= 0.20:
                confidence_score += 0.25
                risk_indicators.append(
                    f"Moderately balanced flow: {net_flow_ratio*100:.1f}% net flow ratio"
                )

            transaction_count = df.height
            if transaction_count >= 15:
                confidence_score += 0.15
                risk_indicators.append(
                    f"High transaction volume: {transaction_count} transactions"
                )
            elif transaction_count >= 8:
                confidence_score += 0.10
                risk_indicators.append(
                    f"Moderate transaction volume: {transaction_count} transactions"
                )
            elif transaction_count >= 5:
                confidence_score += 0.05
                risk_indicators.append(
                    f"Sufficient transaction volume: {transaction_count} transactions"
                )

            date_span = (df["DATE"].max() - df["DATE"].min()).days
            if date_span <= 30 and transaction_count >= 8:
                confidence_score += 0.10
                risk_indicators.append(
                    f"Concentrated activity: {transaction_count} transactions in {date_span} days"
                )
            elif date_span <= 60 and transaction_count >= 12:
                confidence_score += 0.05
                risk_indicators.append(
                    f"Active period: {transaction_count} transactions in {date_span} days"
                )

            credits_count = df.filter(pl.col("CREDIT") > 0).height
            debits_count = df.filter(pl.col("DEBIT") > 0).height

            if credits_count >= 3 and debits_count >= 2:
                confidence_score += 0.05
                risk_indicators.append(
                    f"Bidirectional flow: {credits_count} credits and {debits_count} debits"
                )
            elif credits_count >= 2 and debits_count >= 1:
                confidence_score += 0.02
                risk_indicators.append(
                    f"Mixed transactions: {credits_count} credits and {debits_count} debits"
                )

            sensitivity_multiplier = self.config.get("sensitivity_multiplier", 1.0)
            adjusted_confidence = confidence_score * sensitivity_multiplier

            if adjusted_confidence >= 0.4 and net_flow_ratio <= 0.25:

                analysis_data = {
                    "total_credits": float(total_credits),
                    "total_debits": float(total_debits),
                    "net_flow": float(net_flow),
                    "net_flow_ratio": float(net_flow_ratio),
                    "total_flow": float(total_flow),
                    "transaction_count": transaction_count,
                    "credits_count": credits_count,
                    "debits_count": debits_count,
                    "date_span_days": date_span,
                    "flow_balance_score": 1.0 - net_flow_ratio,
                    "pass_through_indicator": (
                        "HIGH"
                        if net_flow_ratio <= 0.05
                        else "MEDIUM" if net_flow_ratio <= 0.15 else "LOW"
                    ),
                    "detection_interval": interval_type,
                    "interval_analysis": best_result.get(
                        "description", "Overall account analysis"
                    ),
                    "all_intervals_analyzed": len(interval_results),
                    "intervals_summary": all_intervals_summary,
                }

                return MuleAccountAlert(
                    account_id=account_id or "Unknown",
                    confidence_score=min(1.0, adjusted_confidence),
                    pattern_type="passthrough_mule",
                    detection_period={
                        "start_date": df["DATE"].min().strftime("%Y-%m-%d"),
                        "end_date": df["DATE"].max().strftime("%Y-%m-%d"),
                        "total_days": date_span,
                    },
                    collection_phase={
                        "note": "Pass-through analysis - see disbursement_phase for details"
                    },
                    disbursement_phase=analysis_data,
                    risk_indicators=risk_indicators,
                    recommended_actions=self._generate_passthrough_recommendations(
                        adjusted_confidence, net_flow_ratio
                    ),
                )

            return None

        except Exception as e:
            print(f"Error in pass-through mule detection: {str(e)}")
            return None

    def _generate_passthrough_recommendations(
        self, confidence_score: float, net_flow_ratio: float
    ) -> List[str]:
        """Generate specific recommendations for pass-through mule accounts"""
        recommendations = []

        if net_flow_ratio <= 0.05:
            recommendations.append(
                "🚨 CRITICAL: Highly balanced inflow/outflow indicates pass-through money laundering"
            )
            recommendations.append("🔒 IMMEDIATE: Freeze account pending investigation")
            recommendations.append("📋 URGENT: File Suspicious Activity Report (SAR)")
            recommendations.append(
                "👮 NOTIFY: Law enforcement - potential money laundering operation"
            )
        elif net_flow_ratio <= 0.15:
            recommendations.append(
                "⚠️ HIGH RISK: Balanced flow pattern suggests mule account activity"
            )
            recommendations.append(
                "🔍 INVESTIGATE: Review all counterparties and transaction purposes"
            )
            recommendations.append(
                "📊 MONITOR: Enhanced transaction monitoring required"
            )
            recommendations.append(
                "📋 CONSIDER: SAR filing based on additional factors"
            )
        else:
            recommendations.append(
                "👀 MONITOR: Potential pass-through activity detected"
            )
            recommendations.append(
                "📊 ANALYZE: Review transaction patterns and counterparties"
            )

        recommendations.append(
            "🔗 CROSS-REFERENCE: Check against known mule account networks"
        )
        recommendations.append(
            "👥 INVESTIGATE: Beneficial ownership and account control"
        )
        recommendations.append("💰 TRACE: Source and destination of funds")

        return recommendations

    def _detect_classic_mule_pattern(
        self, df: pl.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect classic mule pattern: Many small credits → Few large debits
        
        Scoring Methodology:
        Confidence Score Calculation (Max 1.0):
        1. Asymmetric Pattern (Max 0.25):
           - Credit/Debit count ratio >= config ratio: Variable score based on ratio
           
        2. Amount Ratio Analysis (Max 0.25):
           - Median debit/credit ratio >= config ratio: Variable score based on ratio
           
        3. Small Credit Ratio (Max 0.25):
           - Small credit ratio > 0.6: Variable score based on ratio
           
        4. Large Debit Ratio (Max 0.25):
           - Large debit ratio > 0.4: Variable score based on ratio
           
        5. Timing Patterns (Max 0.15):
           - Suspicious timing between collections and disbursements: Up to 0.15
           
        Total Score: Sum of all applicable scores, capped at 1.0
        Minimum threshold for alert: 0.4 (adjusted by sensitivity multiplier)
        """
        try:

            credits = df.filter(pl.col("is_credit"))
            debits = df.filter(pl.col("is_debit"))

            if (
                credits.height < self.config["min_collection_transactions"]
                or debits.height == 0
            ):
                return None

            credit_amounts = credits["CREDIT"].to_numpy()
            credit_median = np.median(credit_amounts)
            credit_q1 = np.percentile(credit_amounts, 25)
            credit_q3 = np.percentile(credit_amounts, 75)

            small_credits = credits.filter(pl.col("CREDIT") <= credit_median)

            collection_analysis = {
                "total_credits": credits.height,
                "small_credits": small_credits.height,
                "small_credit_ratio": (
                    small_credits.height / credits.height if credits.height > 0 else 0
                ),
                "total_credit_amount": float(credits["CREDIT"].sum()),
                "average_credit_amount": float(credits["CREDIT"].mean()),
                "median_credit_amount": float(credit_median),
                "credit_q1": float(credit_q1),
                "credit_q3": float(credit_q3),
                "credit_coefficient_variation": float(
                    np.std(credit_amounts) / (np.mean(credit_amounts) + 1e-10)
                ),
                "credit_frequency_per_day": credits.height
                / max(1, (credits["DATE"].max() - credits["DATE"].min()).days),
                "collection_period_days": (
                    credits["DATE"].max() - credits["DATE"].min()
                ).days,
                "adaptive_small_threshold": float(credit_median),
            }

            debit_amounts = debits["DEBIT"].to_numpy()
            debit_median = np.median(debit_amounts)
            debit_q1 = np.percentile(debit_amounts, 25)
            debit_q3 = np.percentile(debit_amounts, 75)

            large_debits = debits.filter(pl.col("DEBIT") >= debit_median)

            disbursement_analysis = {
                "total_debits": debits.height,
                "large_debits": large_debits.height,
                "large_debit_ratio": (
                    large_debits.height / debits.height if debits.height > 0 else 0
                ),
                "total_debit_amount": float(debits["DEBIT"].sum()),
                "average_debit_amount": float(debits["DEBIT"].mean()),
                "median_debit_amount": float(debit_median),
                "debit_q1": float(debit_q1),
                "debit_q3": float(debit_q3),
                "largest_debit": float(debits["DEBIT"].max()),
                "debit_coefficient_variation": float(
                    np.std(debit_amounts) / (np.mean(debit_amounts) + 1e-10)
                ),
                "debit_frequency_per_day": debits.height
                / max(1, (debits["DATE"].max() - debits["DATE"].min()).days),
                "adaptive_large_threshold": float(debit_median),
            }

            confidence_score = 0.0
            risk_indicators = []

            credit_debit_count_ratio = credits.height / max(1, debits.height)
            if credit_debit_count_ratio >= self.config["collection_disbursement_ratio"]:
                score_weight = min(0.25, (credit_debit_count_ratio - 2) * 0.1)
                confidence_score += score_weight
                risk_indicators.append(
                    f"Asymmetric pattern: {credit_debit_count_ratio:.1f}x more credits than debits"
                )

            if collection_analysis["median_credit_amount"] > 0:
                debit_credit_ratio = (
                    disbursement_analysis["median_debit_amount"]
                    / collection_analysis["median_credit_amount"]
                )
                if debit_credit_ratio >= self.config["min_disbursement_amount_ratio"]:
                    score_weight = min(0.25, (debit_credit_ratio - 3) * 0.05)
                    confidence_score += score_weight
                    risk_indicators.append(
                        f"Median debit is {debit_credit_ratio:.1f}x larger than median credit"
                    )

            if collection_analysis["small_credit_ratio"] > 0.6:
                score_weight = (collection_analysis["small_credit_ratio"] - 0.6) * 0.5
                confidence_score += score_weight
                risk_indicators.append(
                    f"{collection_analysis['small_credit_ratio']*100:.1f}% of credits are below median amount"
                )

            if disbursement_analysis["large_debit_ratio"] > 0.4:
                score_weight = (disbursement_analysis["large_debit_ratio"] - 0.4) * 0.25
                confidence_score += score_weight
                risk_indicators.append(
                    f"{disbursement_analysis['large_debit_ratio']*100:.1f}% of debits are above median amount"
                )

            timing_score = self._analyze_mule_timing_patterns(credits, debits)
            confidence_score += timing_score * 0.15
            if timing_score > 0.3:
                risk_indicators.append(
                    "Suspicious timing patterns detected between collections and disbursements"
                )

            sensitivity_multiplier = self.config.get("sensitivity_multiplier", 1.0)
            adjusted_confidence = confidence_score * sensitivity_multiplier

            confidence_threshold = 0.4 / sensitivity_multiplier

            if adjusted_confidence >= confidence_threshold:
                return MuleAccountAlert(
                    account_id=account_id or "Unknown",
                    confidence_score=min(1.0, adjusted_confidence),
                    pattern_type="classic_mule",
                    detection_period={
                        "start_date": df["DATE"].min().strftime("%Y-%m-%d"),
                        "end_date": df["DATE"].max().strftime("%Y-%m-%d"),
                        "total_days": (df["DATE"].max() - df["DATE"].min()).days,
                    },
                    collection_phase=collection_analysis,
                    disbursement_phase=disbursement_analysis,
                    risk_indicators=risk_indicators,
                    recommended_actions=self._generate_mule_recommendations(
                        confidence_score, risk_indicators
                    ),
                )

            return None

        except Exception as e:
            print(f"Error in classic mule detection: {str(e)}")
            return None

    def _detect_periodic_mule_pattern(
        self, df: pl.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect periodic mule pattern: Regular disbursement cycles
        
        Scoring Methodology:
        Confidence Score Calculation (Max 1.0):
        1. Periodicity Strength (Max 0.40):
           - Periodicity strength > 0.7: +0.40
           
        2. Amount Consistency (Max 0.30):
           - Amount consistency > 0.6: +0.30
           
        3. Timing Regularity (Max 0.30):
           - Timing regularity > 0.5: +0.30
           
        Total Score: Sum of all applicable scores, capped at 1.0
        Minimum threshold for alert: 0.5
        """
        try:
            debits = df.filter(pl.col("is_debit"))

            if debits.height < 3:
                return None

            periodicity_analysis = self._analyze_disbursement_periodicity(debits)

            if not periodicity_analysis["is_periodic"]:
                return None

            confidence_score = 0.0
            risk_indicators = []

            if periodicity_analysis["periodicity_strength"] > 0.7:
                confidence_score += 0.40
                risk_indicators.append(
                    f"Strong {periodicity_analysis['detected_period']} disbursement pattern"
                )

            if periodicity_analysis["amount_consistency"] > 0.6:
                confidence_score += 0.30
                risk_indicators.append("Consistent disbursement amounts detected")

            if periodicity_analysis["timing_regularity"] > 0.5:
                confidence_score += 0.30
                risk_indicators.append("Highly regular disbursement timing")

            if confidence_score >= 0.5:
                return MuleAccountAlert(
                    account_id=account_id or "Unknown",
                    confidence_score=confidence_score,
                    pattern_type="periodic_mule",
                    detection_period={
                        "start_date": df["DATE"].min().strftime("%Y-%m-%d"),
                        "end_date": df["DATE"].max().strftime("%Y-%m-%d"),
                        "total_days": (df["DATE"].max() - df["DATE"].min()).days,
                    },
                    collection_phase={"note": "Analyzed as part of periodic pattern"},
                    disbursement_phase=periodicity_analysis,
                    risk_indicators=risk_indicators,
                    recommended_actions=self._generate_mule_recommendations(
                        confidence_score, risk_indicators
                    ),
                )

            return None

        except Exception as e:
            print(f"Error in periodic mule detection: {str(e)}")
            return None

    def _detect_threshold_mule_pattern(
        self, df: pl.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect threshold avoidance mule pattern
        
        Scoring Methodology:
        Confidence Score Calculation (Max 1.0):
        1. Near Threshold Transactions:
           - For each threshold, if ratio of near-threshold transactions > 0.2: Add ratio to score
           
        2. Round Number Transactions:
           - If round ratio > 0.6: +0.3
           
        Total Score: Sum of all applicable scores, capped at 1.0
        Minimum threshold for alert: 0.4
        """
        try:

            thresholds = [10000, 20000, 50000, 100000]

            threshold_analysis = {}
            total_threshold_score = 0.0
            risk_indicators = []

            for threshold in thresholds:

                near_threshold = df.filter(
                    (pl.col("amount") >= threshold * 0.85)
                    & (pl.col("amount") < threshold)
                )

                if near_threshold.height > 0:
                    threshold_ratio = near_threshold.height / df.height
                    if threshold_ratio > 0.2:
                        total_threshold_score += threshold_ratio
                        risk_indicators.append(
                            f"{near_threshold.height} transactions just below ₹{threshold:,} threshold"
                        )

            round_amounts = df.filter((pl.col("amount") % 1000) == 0)
            round_ratio = round_amounts.height / df.height if df.height > 0 else 0

            if round_ratio > 0.6:
                total_threshold_score += 0.3
                risk_indicators.append(
                    f"{round_ratio*100:.1f}% of transactions use round numbers"
                )

            confidence_score = min(1.0, total_threshold_score)

            if confidence_score >= 0.4:
                return MuleAccountAlert(
                    account_id=account_id or "Unknown",
                    confidence_score=confidence_score,
                    pattern_type="threshold_mule",
                    detection_period={
                        "start_date": df["DATE"].min().strftime("%Y-%m-%d"),
                        "end_date": df["DATE"].max().strftime("%Y-%m-%d"),
                        "total_days": (df["DATE"].max() - df["DATE"].min()).days,
                    },
                    collection_phase={"note": "Threshold analysis performed"},
                    disbursement_phase={"threshold_avoidance_score": confidence_score},
                    risk_indicators=risk_indicators,
                    recommended_actions=self._generate_mule_recommendations(
                        confidence_score, risk_indicators
                    ),
                )

            return None

        except Exception as e:
            print(f"Error in threshold mule detection: {str(e)}")
            return None

    def _analyze_mule_timing_patterns(
        self, credits: pl.DataFrame, debits: pl.DataFrame
    ) -> float:
        """Analyze timing patterns between collection and disbursement phases"""
        try:
            if credits.is_empty() or debits.is_empty():
                return 0.0

            timing_score = 0.0

            for debit in debits.to_dicts():
                debit_date = debit.get("DATE")
                if debit_date is None:
                    continue

                recent_credits = credits.filter(
                    (pl.col("DATE") >= debit_date - timedelta(days=7))
                    & (pl.col("DATE") < debit_date)
                )

                if recent_credits.height >= 3:
                    timing_score += 0.2

            if debits.height >= 3:
                debit_dates = debits.sort("DATE")["DATE"]
                debit_intervals = debit_dates.diff().dt.total_days().drop_nulls()
                if debit_intervals.len() > 0:
                    interval_std = debit_intervals.std()
                    interval_mean = debit_intervals.mean()

                    if interval_mean > 0 and interval_std / interval_mean < 0.3:
                        timing_score += 0.3

            return min(1.0, timing_score)

        except Exception:
            return 0.0

    def _analyze_disbursement_periodicity(self, debits: pl.DataFrame) -> Dict[str, Any]:
        """Analyze periodicity in disbursement patterns"""
        try:
            if debits.height < 3:
                return {"is_periodic": False}

            intervals = (
                debits.sort("DATE")["DATE"].diff().dt.total_days().drop_nulls()
            )

            if intervals.len() == 0:
                return {"is_periodic": False}

            common_periods = [7, 14, 30]
            best_period = None
            best_score = 0.0

            for period in common_periods:

                close_intervals = intervals.filter(
                    (intervals >= period - self.config["periodicity_tolerance"])
                    & (intervals <= period + self.config["periodicity_tolerance"])
                )

                period_score = close_intervals.len() / intervals.len()
                if period_score > best_score:
                    best_score = period_score
                    best_period = period

            amount_cv = debits["DEBIT"].std() / (debits["DEBIT"].mean() + 1e-10)
            amount_consistency = max(0.0, 1.0 - amount_cv)

            timing_regularity = best_score

            return {
                "is_periodic": best_score > 0.5,
                "detected_period": f"{best_period}-day" if best_period else "none",
                "periodicity_strength": best_score,
                "amount_consistency": amount_consistency,
                "timing_regularity": timing_regularity,
                "average_interval_days": float(intervals.mean()),
                "interval_variance": float(intervals.std()),
            }

        except Exception:
            return {"is_periodic": False}

    def _generate_mule_recommendations(
        self, confidence_score: float, risk_indicators: List[str]
    ) -> List[str]:
        """Generate specific recommendations for mule account alerts"""
        recommendations = []

        if confidence_score >= 0.8:
            recommendations.append(
                "🚨 IMMEDIATE INVESTIGATION REQUIRED - High confidence mule account pattern"
            )
            recommendations.append(
                "🔒 Consider account restrictions pending investigation"
            )
            recommendations.append("📋 File Suspicious Activity Report (SAR)")
        elif confidence_score >= 0.6:
            recommendations.append("⚠️ Enhanced monitoring recommended")
            recommendations.append("🔍 Detailed transaction review required")
            recommendations.append("📞 Customer due diligence review")
        else:
            recommendations.append("👀 Continue monitoring for pattern development")
            recommendations.append("📊 Review in context of other risk factors")

        if any("timing" in indicator.lower() for indicator in risk_indicators):
            recommendations.append("⏰ Analyze transaction timing patterns in detail")

        if any("threshold" in indicator.lower() for indicator in risk_indicators):
            recommendations.append("💰 Review for potential structuring violations")

        if any("periodic" in indicator.lower() for indicator in risk_indicators):
            recommendations.append("📅 Investigate source of periodic disbursements")

        recommendations.append("🔗 Cross-reference with known mule account databases")
        recommendations.append("👥 Investigate beneficial ownership and control")

        return recommendations

    def create_mule_detection_summary(
        self, alerts: List[MuleAccountAlert]
    ) -> Dict[str, Any]:
        """Create summary of mule detection results"""
        if not alerts:
            return {
                "total_alerts": 0,
                "highest_confidence": 0.0,
                "pattern_types": {},
                "summary": "No mule account patterns detected",
            }

        pattern_counts = {}
        for alert in alerts:
            pattern_counts[alert.pattern_type] = (
                pattern_counts.get(alert.pattern_type, 0) + 1
            )

        return {
            "total_alerts": len(alerts),
            "highest_confidence": max(alert.confidence_score for alert in alerts),
            "pattern_types": pattern_counts,
            "high_confidence_alerts": len(
                [a for a in alerts if a.confidence_score >= 0.7]
            ),
            "summary": f"Detected {len(alerts)} potential mule account patterns",
        }

    def export_mule_alerts_to_dataframe(
        self, alerts: List[MuleAccountAlert]
    ) -> pl.DataFrame:
        """Export mule alerts to DataFrame for analysis"""
        if not alerts:
            return pl.DataFrame()

        data = []
        for alert in alerts:
            row = {
                "account_id": alert.account_id,
                "confidence_score": alert.confidence_score,
                "pattern_type": alert.pattern_type,
                "detection_start_date": alert.detection_period["start_date"],
                "detection_end_date": alert.detection_period["end_date"],
                "detection_period_days": alert.detection_period["total_days"],
                "risk_indicators_count": len(alert.risk_indicators),
                "recommendations_count": len(alert.recommended_actions),
                "primary_risk_indicator": (
                    alert.risk_indicators[0] if alert.risk_indicators else "None"
                ),
            }

            if alert.pattern_type == "classic_mule":
                row.update(
                    {
                        "total_credits": alert.collection_phase.get("total_credits", 0),
                        "total_debits": alert.disbursement_phase.get("total_debits", 0),
                        "small_credit_ratio": alert.collection_phase.get(
                            "small_credit_ratio", 0
                        ),
                        "large_debit_ratio": alert.disbursement_phase.get(
                            "large_debit_ratio", 0
                        ),
                    }
                )

            data.append(row)

        return pl.DataFrame(data).sort("confidence_score", descending=True)
