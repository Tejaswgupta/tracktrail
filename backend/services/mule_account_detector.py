"""
Mule Account Pattern Detection

This module specifically detects mule account patterns where accounts receive
multiple small amounts (credits) and then make large periodic debits.
This is a common money laundering technique.
"""

import pandas as pd
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
    """

    def __init__(self):
        self.detection_cache = {}

        self.config = {
            "min_collection_transactions": 5,
            "min_disbursement_amount_ratio": 3.0,
            "max_collection_period_days": 30,
            "small_percentile_threshold": 0.3,
            "large_percentile_threshold": 0.8,
            "velocity_threshold": 0.5,
            "periodicity_tolerance": 2,
            "collection_disbursement_ratio": 2.0,
            "amount_variance_threshold": 2.0,
        }

    def detect_mule_patterns(
        self, df: pd.DataFrame, account_identifier: str = None
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
        if df.empty:
            return []

        df_clean = self._prepare_mule_analysis_data(df)

        if df_clean.empty:
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

    def _prepare_mule_analysis_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare data specifically for mule account analysis"""
        df_clean = df.copy()

        if "DATE" in df_clean.columns:
            df_clean["DATE"] = pd.to_datetime(df_clean["DATE"], errors="coerce")

        for col in ["DEBIT", "CREDIT"]:
            if col in df_clean.columns:
                df_clean[col] = pd.to_numeric(
                    df_clean[col].astype(str).str.replace(",", "").str.replace("₹", ""),
                    errors="coerce",
                )
                df_clean[col] = df_clean[col].fillna(0)

        df_clean = df_clean.dropna(subset=["DATE"])

        df_clean["is_credit"] = df_clean["CREDIT"] > 0
        df_clean["is_debit"] = df_clean["DEBIT"] > 0
        df_clean["amount"] = df_clean["CREDIT"] + df_clean["DEBIT"]
        df_clean["transaction_type"] = df_clean.apply(
            lambda row: "credit" if row["is_credit"] else "debit", axis=1
        )

        if len(df_clean) > 0:

            small_threshold = df_clean["amount"].quantile(
                self.config["small_percentile_threshold"]
            )
            large_threshold = df_clean["amount"].quantile(
                self.config["large_percentile_threshold"]
            )

            df_clean["is_small_amount"] = df_clean["amount"] <= small_threshold
            df_clean["is_large_amount"] = df_clean["amount"] >= large_threshold

            df_clean["_adaptive_small_threshold"] = small_threshold
            df_clean["_adaptive_large_threshold"] = large_threshold
        else:
            df_clean["is_small_amount"] = False
            df_clean["is_large_amount"] = False

        df_clean["day_of_week"] = df_clean["DATE"].dt.day_name()
        df_clean["day_of_month"] = df_clean["DATE"].dt.day
        df_clean["week_of_year"] = df_clean["DATE"].dt.isocalendar().week

        return df_clean.sort_values("DATE")

    def _analyze_multiple_time_intervals(
        self, df: pd.DataFrame
    ) -> List[Dict[str, Any]]:
        """
        Analyze pass-through behavior across multiple time intervals to catch
        sophisticated mule operations that balance at different frequencies.
        """
        results = []

        if df.empty:
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

    def _analyze_daily_balancing(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a daily basis"""
        results = []

        try:

            daily_groups = df.groupby(df["DATE"].dt.date)
            balanced_days = 0
            total_days_with_both = 0

            for date, day_df in daily_groups:
                day_credits = day_df["CREDIT"].sum()
                day_debits = day_df["DEBIT"].sum()

                if day_credits > 0 and day_debits > 0:
                    total_days_with_both += 1
                    day_net_flow = day_credits - day_debits
                    day_total_flow = day_credits + day_debits

                    if day_total_flow > 0:
                        day_ratio = abs(day_net_flow) / day_total_flow
                        if day_ratio <= 0.1:
                            balanced_days += 1

            if (
                total_days_with_both >= 3
                and balanced_days >= total_days_with_both * 0.6
            ):
                balance_ratio = balanced_days / total_days_with_both

                results.append(
                    {
                        "interval_type": "daily",
                        "total_credits": df["CREDIT"].sum(),
                        "total_debits": df["DEBIT"].sum(),
                        "net_flow": df["CREDIT"].sum() - df["DEBIT"].sum(),
                        "total_flow": df["CREDIT"].sum() + df["DEBIT"].sum(),
                        "net_flow_ratio": abs(df["CREDIT"].sum() - df["DEBIT"].sum())
                        / (df["CREDIT"].sum() + df["DEBIT"].sum()),
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_days_with_both,
                        "balanced_periods": balanced_days,
                        "description": f"Daily balancing: {balanced_days}/{total_days_with_both} days balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_weekly_balancing(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a weekly basis"""
        results = []

        try:

            df["week"] = df["DATE"].dt.isocalendar().week
            df["year"] = df["DATE"].dt.year
            df["year_week"] = df["year"].astype(str) + "_" + df["week"].astype(str)

            weekly_groups = df.groupby("year_week")
            balanced_weeks = 0
            total_weeks_with_both = 0

            for week, week_df in weekly_groups:
                week_credits = week_df["CREDIT"].sum()
                week_debits = week_df["DEBIT"].sum()

                if week_credits > 0 and week_debits > 0:
                    total_weeks_with_both += 1
                    week_net_flow = week_credits - week_debits
                    week_total_flow = week_credits + week_debits

                    if week_total_flow > 0:
                        week_ratio = abs(week_net_flow) / week_total_flow
                        if week_ratio <= 0.15:
                            balanced_weeks += 1

            if (
                total_weeks_with_both >= 2
                and balanced_weeks >= total_weeks_with_both * 0.6
            ):
                balance_ratio = balanced_weeks / total_weeks_with_both

                results.append(
                    {
                        "interval_type": "weekly",
                        "total_credits": df["CREDIT"].sum(),
                        "total_debits": df["DEBIT"].sum(),
                        "net_flow": df["CREDIT"].sum() - df["DEBIT"].sum(),
                        "total_flow": df["CREDIT"].sum() + df["DEBIT"].sum(),
                        "net_flow_ratio": abs(df["CREDIT"].sum() - df["DEBIT"].sum())
                        / (df["CREDIT"].sum() + df["DEBIT"].sum()),
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_weeks_with_both,
                        "balanced_periods": balanced_weeks,
                        "description": f"Weekly balancing: {balanced_weeks}/{total_weeks_with_both} weeks balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_monthly_balancing(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Analyze if the account balances out on a monthly basis"""
        results = []

        try:

            df["year_month"] = df["DATE"].dt.to_period("M")
            monthly_groups = df.groupby("year_month")
            balanced_months = 0
            total_months_with_both = 0

            for month, month_df in monthly_groups:
                month_credits = month_df["CREDIT"].sum()
                month_debits = month_df["DEBIT"].sum()

                if month_credits > 0 and month_debits > 0:
                    total_months_with_both += 1
                    month_net_flow = month_credits - month_debits
                    month_total_flow = month_credits + month_debits

                    if month_total_flow > 0:
                        month_ratio = abs(month_net_flow) / month_total_flow
                        if month_ratio <= 0.2:
                            balanced_months += 1

            if (
                total_months_with_both >= 2
                and balanced_months >= total_months_with_both * 0.6
            ):
                balance_ratio = balanced_months / total_months_with_both

                results.append(
                    {
                        "interval_type": "monthly",
                        "total_credits": df["CREDIT"].sum(),
                        "total_debits": df["DEBIT"].sum(),
                        "net_flow": df["CREDIT"].sum() - df["DEBIT"].sum(),
                        "total_flow": df["CREDIT"].sum() + df["DEBIT"].sum(),
                        "net_flow_ratio": abs(df["CREDIT"].sum() - df["DEBIT"].sum())
                        / (df["CREDIT"].sum() + df["DEBIT"].sum()),
                        "suspicion_score": balance_ratio,
                        "periods_analyzed": total_months_with_both,
                        "balanced_periods": balanced_months,
                        "description": f"Monthly balancing: {balanced_months}/{total_months_with_both} months balanced",
                    }
                )

        except Exception:
            pass

        return results

    def _analyze_rolling_windows(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
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
        self, df: pd.DataFrame, window_days: int, window_name: str
    ) -> List[Dict[str, Any]]:
        """Analyze a specific rolling window size"""
        results = []

        try:
            if len(df) < 5:
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
                window_df = df[(df["DATE"] >= current_date) & (df["DATE"] < window_end)]

                if len(window_df) >= 2:
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

                results.append(
                    {
                        "interval_type": f"rolling_{window_days}d",
                        "total_credits": df["CREDIT"].sum(),
                        "total_debits": df["DEBIT"].sum(),
                        "net_flow": df["CREDIT"].sum() - df["DEBIT"].sum(),
                        "total_flow": df["CREDIT"].sum() + df["DEBIT"].sum(),
                        "net_flow_ratio": abs(df["CREDIT"].sum() - df["DEBIT"].sum())
                        / (df["CREDIT"].sum() + df["DEBIT"].sum()),
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
        self, df: pd.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect the core mule pattern: Pass-through account where inflow ≈ outflow
        This checks multiple time intervals to catch sophisticated mule operations.
        """
        try:

            interval_results = self._analyze_multiple_time_intervals(df)

            if not interval_results:
                return None

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

            transaction_count = len(df)
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

            credits_count = len(df[df["CREDIT"] > 0])
            debits_count = len(df[df["DEBIT"] > 0])

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
                    "intervals_summary": [
                        {
                            "type": r["interval_type"],
                            "ratio": r["net_flow_ratio"],
                            "suspicion": r["suspicion_score"],
                            "description": r["description"],
                        }
                        for r in interval_results[:5]
                    ],
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
        self, df: pd.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect classic mule pattern: Many small credits → Few large debits
        """
        try:

            credits = df[df["is_credit"]].copy()
            debits = df[df["is_debit"]].copy()

            if (
                len(credits) < self.config["min_collection_transactions"]
                or len(debits) == 0
            ):
                return None

            credit_amounts = credits["CREDIT"].values
            credit_median = np.median(credit_amounts)
            credit_q1 = np.percentile(credit_amounts, 25)
            credit_q3 = np.percentile(credit_amounts, 75)

            small_credits = credits[credits["CREDIT"] <= credit_median]

            collection_analysis = {
                "total_credits": len(credits),
                "small_credits": len(small_credits),
                "small_credit_ratio": (
                    len(small_credits) / len(credits) if len(credits) > 0 else 0
                ),
                "total_credit_amount": float(credits["CREDIT"].sum()),
                "average_credit_amount": float(credits["CREDIT"].mean()),
                "median_credit_amount": float(credit_median),
                "credit_q1": float(credit_q1),
                "credit_q3": float(credit_q3),
                "credit_coefficient_variation": float(
                    np.std(credit_amounts) / (np.mean(credit_amounts) + 1e-10)
                ),
                "credit_frequency_per_day": len(credits)
                / max(1, (credits["DATE"].max() - credits["DATE"].min()).days),
                "collection_period_days": (
                    credits["DATE"].max() - credits["DATE"].min()
                ).days,
                "adaptive_small_threshold": float(credit_median),
            }

            debit_amounts = debits["DEBIT"].values
            debit_median = np.median(debit_amounts)
            debit_q1 = np.percentile(debit_amounts, 25)
            debit_q3 = np.percentile(debit_amounts, 75)

            large_debits = debits[debits["DEBIT"] >= debit_median]

            disbursement_analysis = {
                "total_debits": len(debits),
                "large_debits": len(large_debits),
                "large_debit_ratio": (
                    len(large_debits) / len(debits) if len(debits) > 0 else 0
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
                "debit_frequency_per_day": len(debits)
                / max(1, (debits["DATE"].max() - debits["DATE"].min()).days),
                "adaptive_large_threshold": float(debit_median),
            }

            confidence_score = 0.0
            risk_indicators = []

            credit_debit_count_ratio = len(credits) / max(1, len(debits))
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
        self, df: pd.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect periodic mule pattern: Regular disbursement cycles
        """
        try:
            debits = df[df["is_debit"]].copy()

            if len(debits) < 3:
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
        self, df: pd.DataFrame, account_id: str = None
    ) -> Optional[MuleAccountAlert]:
        """
        Detect threshold avoidance mule pattern
        """
        try:

            thresholds = [10000, 20000, 50000, 100000]

            threshold_analysis = {}
            total_threshold_score = 0.0
            risk_indicators = []

            for threshold in thresholds:

                near_threshold = df[
                    (df["amount"] >= threshold * 0.85) & (df["amount"] < threshold)
                ]

                if len(near_threshold) > 0:
                    threshold_ratio = len(near_threshold) / len(df)
                    if threshold_ratio > 0.2:
                        total_threshold_score += threshold_ratio
                        risk_indicators.append(
                            f"{len(near_threshold)} transactions just below ₹{threshold:,} threshold"
                        )

            round_amounts = df[df["amount"] % 1000 == 0]
            round_ratio = len(round_amounts) / len(df) if len(df) > 0 else 0

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
        self, credits: pd.DataFrame, debits: pd.DataFrame
    ) -> float:
        """Analyze timing patterns between collection and disbursement phases"""
        try:
            if credits.empty or debits.empty:
                return 0.0

            timing_score = 0.0

            for _, debit in debits.iterrows():
                debit_date = debit["DATE"]

                recent_credits = credits[
                    (credits["DATE"] >= debit_date - timedelta(days=7))
                    & (credits["DATE"] < debit_date)
                ]

                if len(recent_credits) >= 3:
                    timing_score += 0.2

            if len(debits) >= 3:
                debit_intervals = debits["DATE"].diff().dt.days.dropna()
                if len(debit_intervals) > 0:
                    interval_std = debit_intervals.std()
                    interval_mean = debit_intervals.mean()

                    if interval_mean > 0 and interval_std / interval_mean < 0.3:
                        timing_score += 0.3

            return min(1.0, timing_score)

        except Exception:
            return 0.0

    def _analyze_disbursement_periodicity(self, debits: pd.DataFrame) -> Dict[str, Any]:
        """Analyze periodicity in disbursement patterns"""
        try:
            if len(debits) < 3:
                return {"is_periodic": False}

            intervals = debits["DATE"].diff().dt.days.dropna()

            if len(intervals) == 0:
                return {"is_periodic": False}

            common_periods = [7, 14, 30]
            best_period = None
            best_score = 0.0

            for period in common_periods:

                close_intervals = intervals[
                    (intervals >= period - self.config["periodicity_tolerance"])
                    & (intervals <= period + self.config["periodicity_tolerance"])
                ]

                period_score = len(close_intervals) / len(intervals)
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
    ) -> pd.DataFrame:
        """Export mule alerts to DataFrame for analysis"""
        if not alerts:
            return pd.DataFrame()

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

        return pd.DataFrame(data).sort_values("confidence_score", ascending=False)
