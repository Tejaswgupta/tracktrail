"""
Analysis service orchestration layer for financial analysis API.
Coordinates between database operations and existing analysis modules.
"""

import logging
import os
import networkx as nx
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

import pandas as pd
import polars as pl
from app.core.exceptions import AnalysisError, EntityNotFoundError, ValidationError
from app.services.database_service import DatabaseService, get_database_service

sys.path.append(os.path.join(os.path.dirname(__file__), "..", ".."))

from services.counterparty_trend_analyzer import CounterpartyTrendAnalyzer
from services.mule_account_detector import MuleAccountDetector
from services.network_cycle_detector import NetworkCycleDetector
from services.time_based_analytics import TimeBasedAnalytics

logger = logging.getLogger(__name__)


class AnalysisService:
    """
    Orchestration service that coordinates between database operations and analysis modules.

    This service handles:
    - Data retrieval from database
    - Data transformation between formats (Supabase -> Polars/Pandas)
    - Coordination with existing analysis services
    - Result formatting and error handling
    """

    def __init__(self, database_service: Optional[DatabaseService] = None):
        self.database_service = database_service

        self.counterparty_analyzer = CounterpartyTrendAnalyzer()
        self.mule_detector = MuleAccountDetector()
        self.network_detector = NetworkCycleDetector()
        self.time_analyzer = TimeBasedAnalytics()

    async def _get_database_service(self) -> DatabaseService:
        """Get database service instance (dependency injection)"""
        if self.database_service is None:
            self.database_service = await get_database_service()
        return self.database_service

    async def _fetch_and_prepare_data(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        convert_to_polars: bool = True,
    ) -> Union[pl.DataFrame, pd.DataFrame]:
        """
        Fetch transaction data and prepare it for analysis.

        Args:
            entity_ids: List of entity IDs
            date_from: Optional start date filter
            date_to: Optional end date filter
            convert_to_polars: Whether to return Polars DataFrame

        Returns:
            DataFrame with transaction data

        Raises:
            ValidationError: If input validation fails
            EntityNotFoundError: If entities don't exist
            AnalysisError: If data preparation fails
        """
        try:
            db_service = await self._get_database_service()

            df = await db_service.get_entity_transactions(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=convert_to_polars,
            )

            if (convert_to_polars and len(df) == 0) or (
                not convert_to_polars and df.empty
            ):
                logger.warning(f"No transactions found for entities: {entity_ids}")
                return df

            if convert_to_polars:
                df = self._prepare_polars_data(df)
            else:
                df = self._prepare_pandas_data(df)

            logger.info(f"Prepared {len(df)} transactions for analysis")
            return df

        except (ValidationError, EntityNotFoundError) as e:

            raise
        except Exception as e:
            logger.error(f"Data preparation failed: {str(e)}")
            raise AnalysisError(f"Failed to prepare data for analysis: {str(e)}")

    def _prepare_polars_data(self, df: pl.DataFrame) -> pl.DataFrame:
        """
        Prepare Polars DataFrame for analysis services.

        Args:
            df: Raw Polars DataFrame from database

        Returns:
            Prepared Polars DataFrame with standardized columns
        """
        try:

            required_columns = ["DATE", "DEBIT", "CREDIT", "DESCRIPTION"]

            for col in required_columns:
                if col not in df.columns:
                    if col == "DATE":
                        df = df.with_columns(pl.lit(None).cast(pl.Datetime).alias(col))
                    elif col in ["DEBIT", "CREDIT"]:
                        df = df.with_columns(pl.lit(0.0).alias(col))
                    else:
                        df = df.with_columns(pl.lit("").alias(col))

            df = df.with_columns(
                [
                    pl.col("DATE").cast(pl.Datetime),
                    pl.col("DEBIT").cast(pl.Float64),
                    pl.col("CREDIT").cast(pl.Float64),
                    pl.col("DESCRIPTION").cast(pl.Utf8),
                ]
            )

            if "counterparty" not in df.columns:
                df = df.with_columns(pl.lit("").alias("counterparty"))

            sort_columns = ["DATE"]
            if "original_index" in df.columns:
                sort_columns.append("original_index")
            df = df.sort(sort_columns)

            return df

        except Exception as e:
            logger.error(f"Polars data preparation failed: {str(e)}")
            raise AnalysisError(f"Failed to prepare Polars data: {str(e)}")

    def _prepare_pandas_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Prepare Pandas DataFrame for analysis services.

        Args:
            df: Raw Pandas DataFrame from database

        Returns:
            Prepared Pandas DataFrame with standardized columns
        """
        try:

            required_columns = ["DATE", "DEBIT", "CREDIT", "DESCRIPTION"]

            for col in required_columns:
                if col not in df.columns:
                    if col == "DATE":
                        df[col] = pd.NaT
                    elif col in ["DEBIT", "CREDIT"]:
                        df[col] = 0.0
                    else:
                        df[col] = ""

            df["DATE"] = pd.to_datetime(df["DATE"], errors="coerce")
            df["DEBIT"] = pd.to_numeric(df["DEBIT"], errors="coerce").fillna(0.0)
            df["CREDIT"] = pd.to_numeric(df["CREDIT"], errors="coerce").fillna(0.0)
            df["DESCRIPTION"] = df["DESCRIPTION"].astype(str).fillna("")

            if "counterparty" not in df.columns:
                df["counterparty"] = ""

            sort_columns = ["DATE"]
            if "original_index" in df.columns:
                sort_columns.append("original_index")
            df = df.sort_values(sort_columns).reset_index(drop=True)

            return df

        except Exception as e:
            logger.error(f"Pandas data preparation failed: {str(e)}")
            raise AnalysisError(f"Failed to prepare Pandas data: {str(e)}")

    async def analyze_cash_flow(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform cash flow analysis for specified entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for cash flow analysis

        Returns:
            Dictionary containing cash flow analysis results

        Raises:
            ValidationError: If input validation fails
            AnalysisError: If analysis fails
        """
        try:
            logger.info(f"Starting cash flow analysis for {len(entity_ids)} entities")

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("cash_flow", entity_ids)

            results = self._perform_cash_flow_analysis(df, **kwargs)

            return self._format_analysis_result(
                analysis_type="cash_flow",
                entity_ids=entity_ids,
                results=results,
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Cash flow analysis failed: {str(e)}")
            raise AnalysisError(f"Cash flow analysis failed: {str(e)}")

    def _perform_cash_flow_analysis(self, df: pd.DataFrame, **kwargs) -> Dict[str, Any]:
        """Extract core cash flow analysis logic"""
        try:

            cash_keywords = kwargs.get(
                "cash_keywords", ["CASH", "ATM", "WITHDRAWAL", "CHQ"]
            )
            threshold = kwargs.get("threshold", 50000)

            pattern = "|".join(cash_keywords)
            cash_mask = df["DESCRIPTION"].str.contains(pattern, case=False, na=False)
            cash_txns = df[cash_mask].copy()

            if len(cash_txns) == 0:
                return {
                    "cash_transactions_found": False,
                    "total_cash_transactions": 0,
                    "message": "No cash transactions found with specified keywords",
                }

            total_cash_out = cash_txns["DEBIT"].fillna(0).sum()
            total_cash_in = cash_txns["CREDIT"].fillna(0).sum()

            large_cash = cash_txns[
                (cash_txns["DEBIT"] > threshold) | (cash_txns["CREDIT"] > threshold)
            ]

            cash_txns["Month"] = cash_txns["DATE"].dt.to_period("M")
            monthly_freq = cash_txns.groupby("Month").size()

            monthly_freq_dict = {
                str(k): int(v) for k, v in monthly_freq.to_dict().items()
            }

            cash_txns["DayOfWeek"] = cash_txns["DATE"].dt.day_name()
            dow_freq = cash_txns["DayOfWeek"].value_counts()

            cash_amounts = pd.concat(
                [cash_txns["DEBIT"].dropna(), cash_txns["CREDIT"].dropna()]
            )

            results = {
                "cash_transactions_found": True,
                "total_cash_transactions": len(cash_txns),
                "total_cash_out": float(total_cash_out),
                "total_cash_in": float(total_cash_in),
                "large_cash_transactions": len(large_cash),
                "large_cash_threshold": threshold,
                "frequency_analysis": {
                    "monthly_frequency": monthly_freq_dict,
                    "avg_monthly_transactions": float(monthly_freq.mean()),
                    "day_of_week_pattern": dow_freq.to_dict(),
                    "peak_activity_day": (
                        dow_freq.idxmax() if not dow_freq.empty else None
                    ),
                },
                "amount_patterns": {
                    "average_amount": (
                        float(cash_amounts.mean()) if not cash_amounts.empty else 0
                    ),
                    "median_amount": (
                        float(cash_amounts.median()) if not cash_amounts.empty else 0
                    ),
                    "max_amount": (
                        float(cash_amounts.max()) if not cash_amounts.empty else 0
                    ),
                    "min_amount": (
                        float(cash_amounts.min()) if not cash_amounts.empty else 0
                    ),
                },
                "temporal_patterns": {
                    "date_range_days": (
                        cash_txns["DATE"].max() - cash_txns["DATE"].min()
                    ).days,
                    "analysis_period": {
                        "start": cash_txns["DATE"].min().isoformat(),
                        "end": cash_txns["DATE"].max().isoformat(),
                    },
                },
            }

            if len(large_cash) > 0:
                records = large_cash[
                    ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
                ].to_dict("records")

                for r in records:
                    date_val = r.get("DATE")
                    if isinstance(date_val, (pd.Timestamp, datetime)):
                        r["DATE"] = date_val.isoformat()
                    elif date_val is not None:

                        r["DATE"] = str(date_val)
                results["large_transactions"] = records

            return results

        except Exception as e:
            logger.error(f"Cash flow analysis computation failed: {str(e)}")
            raise AnalysisError(f"Cash flow analysis computation failed: {str(e)}")

    async def analyze_counterparty_trends(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform counterparty trend analysis for specified entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for counterparty analysis

        Returns:
            Dictionary containing counterparty trend analysis results
        """
        try:
            logger.info(
                f"Starting counterparty trend analysis for {len(entity_ids)} entities"
            )

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("counterparty_trends", entity_ids)

            min_transactions = kwargs.get("min_transactions", 3)
            counterparty_results = (
                self.counterparty_analyzer.analyze_counterparty_trends(
                    df=df,
                    counterparty_column="counterparty",
                    min_transactions=min_transactions,
                )
            )

            insights = self.counterparty_analyzer.generate_counterparty_insights(
                counterparty_results
            )

            high_risk_threshold = kwargs.get("risk_threshold", 0.6)
            high_risk_counterparties = (
                self.counterparty_analyzer.get_high_risk_counterparties(
                    counterparty_results, high_risk_threshold
                )
            )

            return self._format_analysis_result(
                analysis_type="counterparty_trends",
                entity_ids=entity_ids,
                results={
                    "counterparty_analysis": {
                        name: {
                            "counterparty_name": result.counterparty_name,
                            "transaction_count": result.transaction_count,
                            "total_volume": result.total_volume,
                            "net_flow": result.net_flow,
                            "trend_direction": result.trend_direction,
                            "risk_score": result.risk_score,
                            "behavioral_changes": result.behavioral_changes,
                            "seasonal_patterns": result.seasonal_patterns,
                            "velocity_metrics": result.velocity_metrics,
                        }
                        for name, result in counterparty_results.items()
                    },
                    "insights": insights,
                    "high_risk_counterparties": [
                        {
                            "name": cp.counterparty_name,
                            "risk_score": cp.risk_score,
                            "transaction_count": cp.transaction_count,
                            "total_volume": cp.total_volume,
                        }
                        for cp in high_risk_counterparties
                    ],
                    "summary": {
                        "total_counterparties_analyzed": len(counterparty_results),
                        "high_risk_count": len(high_risk_counterparties),
                        "average_risk_score": (
                            sum(r.risk_score for r in counterparty_results.values())
                            / len(counterparty_results)
                            if counterparty_results
                            else 0
                        ),
                    },
                },
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Counterparty trend analysis failed: {str(e)}")
            raise AnalysisError(f"Counterparty trend analysis failed: {str(e)}")

    async def detect_mule_accounts(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform mule account detection for specified entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for mule detection

        Returns:
            Dictionary containing mule account detection results
        """
        try:
            logger.info(
                f"Starting mule account detection for {len(entity_ids)} entities"
            )

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("mule_accounts", entity_ids)

            account_identifier = kwargs.get(
                "account_identifier", entity_ids[0] if entity_ids else None
            )

            sensitivity_multiplier = kwargs.get("sensitivity_multiplier", 1.0)
            if sensitivity_multiplier != 1.0:
                self.mule_detector.config["sensitivity_multiplier"] = (
                    sensitivity_multiplier
                )

            mule_alerts = self.mule_detector.detect_mule_patterns(
                df=df, account_identifier=account_identifier
            )

            formatted_alerts = []
            for alert in mule_alerts:
                formatted_alerts.append(
                    {
                        "account_id": alert.account_id,
                        "confidence_score": alert.confidence_score,
                        "pattern_type": alert.pattern_type,
                        "detection_period": alert.detection_period,
                        "collection_phase": alert.collection_phase,
                        "disbursement_phase": alert.disbursement_phase,
                        "risk_indicators": alert.risk_indicators,
                        "recommended_actions": alert.recommended_actions,
                    }
                )

            return self._format_analysis_result(
                analysis_type="mule_accounts",
                entity_ids=entity_ids,
                results={
                    "mule_alerts": formatted_alerts,
                    "alerts_count": len(mule_alerts),
                    "highest_confidence_alert": (
                        max(mule_alerts, key=lambda x: x.confidence_score)
                        if mule_alerts
                        else None
                    ),
                    "summary": {
                        "entities_analyzed": len(entity_ids),
                        "alerts_generated": len(mule_alerts),
                        "high_confidence_alerts": len(
                            [a for a in mule_alerts if a.confidence_score > 0.7]
                        ),
                        "pattern_types_detected": list(
                            set(a.pattern_type for a in mule_alerts)
                        ),
                    },
                },
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Mule account detection failed: {str(e)}")
            raise AnalysisError(f"Mule account detection failed: {str(e)}")

    async def detect_cycles(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform cycle detection for specified entities.
        For single entity: simple round trip detection
        For multiple entities: network cycle detection

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for cycle detection

        Returns:
            Dictionary containing cycle detection results
        """
        try:
            logger.info(f"Starting cycle detection for {len(entity_ids)} entities")

            if len(entity_ids) == 1:
                return await self._detect_simple_round_trips(
                    entity_ids, date_from, date_to, **kwargs
                )
            else:
                return await self._detect_network_cycles(
                    entity_ids, date_from, date_to, **kwargs
                )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Cycle detection failed: {str(e)}")
            raise AnalysisError(f"Cycle detection failed: {str(e)}")

    async def _detect_simple_round_trips(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Detect simple round trips for single entity using round_trip.py logic"""
        try:

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=True,
            )

            if len(df) == 0:
                return self._empty_analysis_result("round_trips", entity_ids)

            tolerance = kwargs.get("tolerance", 5.0)
            days = kwargs.get("days", 30)
            min_amount = kwargs.get("min_amount", 1000)

            results = self._find_round_trips(df, tolerance, days, min_amount)

            return self._format_analysis_result(
                analysis_type="round_trips",
                entity_ids=entity_ids,
                results=results,
                transaction_count=len(df),
                date_range=self._get_date_range_polars(df),
            )

        except Exception as e:
            logger.error(f"Simple round trip detection failed: {str(e)}")
            raise AnalysisError(f"Simple round trip detection failed: {str(e)}")

    def _find_round_trips(
        self, df: pl.DataFrame, tolerance: float, days: int, min_amount: float
    ) -> Dict[str, Any]:
        """Extract round trip detection logic with multiple fallback strategies"""
        try:
            logger.info(f"Starting round trip detection on {len(df)} transactions")

            counterparty_column = None
            if "counterparty_merged" in df.columns:
                counterparty_column = "counterparty_merged"
            elif "counterparty" in df.columns:
                counterparty_column = "counterparty"

            if counterparty_column:
                results = self._find_round_trips_with_counterparty(
                    df, counterparty_column, tolerance, days, min_amount
                )
                if results["round_trips_found"]:
                    return results

            logger.info("Starting emergency detection - parsing descriptions")
            return self._emergency_round_trip_detection(df, tolerance, days, min_amount)

        except Exception as e:
            logger.error(f"Round trip detection failed: {str(e)}")
            return {
                "round_trips_found": False,
                "message": f"Round trip detection failed: {str(e)}",
                "round_trips": [],
            }

    def _find_round_trips_with_counterparty(
        self,
        df: pl.DataFrame,
        counterparty_col: str,
        tolerance: float,
        days: int,
        min_amount: float,
    ) -> Dict[str, Any]:
        """Find round trips using counterparty column"""
        results = []

        counterparties = [
            c
            for c in df[counterparty_col].drop_nulls().unique().to_list()
            if c and c.strip()
        ]
        logger.info(
            f"Found {len(counterparties)} counterparties to analyze: {counterparties}"
        )

        for cp in counterparties:
            cp_df = df.filter(pl.col(counterparty_col) == cp)

            sort_columns = ["DATE"]
            if "original_index" in df.columns:
                sort_columns.append("original_index")

            debits = cp_df.filter(
                (pl.col("DEBIT").is_not_null()) & (pl.col("DEBIT") >= min_amount)
            ).sort(sort_columns)

            credits = cp_df.filter(
                (pl.col("CREDIT").is_not_null()) & (pl.col("CREDIT") >= min_amount)
            ).sort(sort_columns)

            logger.info(
                f"Counterparty {cp}: {len(debits)} debits, {len(credits)} credits"
            )

            credits_used = set()

            for debit_idx in range(len(debits)):
                debit = debits.row(debit_idx, named=True)
                for credit_idx in range(len(credits)):
                    if credit_idx in credits_used:
                        continue
                    credit = credits.row(credit_idx, named=True)
                    if credit["DATE"] > debit["DATE"]:
                        days_diff = (credit["DATE"] - debit["DATE"]).days
                        if days_diff <= days:
                            amount_diff = (
                                abs(debit["DEBIT"] - credit["CREDIT"])
                                / debit["DEBIT"]
                                * 100
                            )
                            if amount_diff <= tolerance:
                                results.append(
                                    {
                                        "counterparty": cp,
                                        "outgoing_amount": float(debit["DEBIT"]),
                                        "outgoing_date": debit["DATE"].strftime(
                                            "%Y-%m-%d"
                                        ),
                                        "incoming_amount": float(credit["CREDIT"]),
                                        "incoming_date": credit["DATE"].strftime(
                                            "%Y-%m-%d"
                                        ),
                                        "days_gap": days_diff,
                                        "amount_difference_percent": round(
                                            amount_diff, 1
                                        ),
                                    }
                                )
                                credits_used.add(credit_idx)
                                logger.info(
                                    f"Found round trip: {cp} - Out: {debit['DEBIT']}, In: {credit['CREDIT']}, Gap: {days_diff} days"
                                )
                                break

        return {
            "round_trips_found": len(results) > 0,
            "total_round_trips": len(results),
            "round_trips": results,
            "analysis_parameters": {
                "tolerance_percent": tolerance,
                "max_days_gap": days,
                "min_amount": min_amount,
            },
        }

    def _emergency_round_trip_detection(
        self, df: pl.DataFrame, tolerance: float, days: int, min_amount: float
    ) -> Dict[str, Any]:
        """Emergency round trip detection using description parsing"""
        try:
            results = []

            df_pandas = df.to_pandas()
            logger.info(
                f"Starting emergency detection on {len(df_pandas)} transactions"
            )

            counterparties = set()
            if "DESCRIPTION" in df_pandas.columns:
                for desc in df_pandas["DESCRIPTION"].dropna():
                    words = desc.upper().split()
                    for word in words:
                        if len(word) > 3 and any(
                            keyword in word
                            for keyword in ["ALPHA", "TRADING", "COMPANY", "PVT", "LTD"]
                        ):
                            counterparties.add(word)

            counterparties.update(
                ["ALPHA", "ALPHA TRADING", "ALPHA TRADERS", "ALPHA TRADING COMPANY"]
            )

            logger.info(
                f"Found {len(counterparties)} counterparties to analyze: {list(counterparties)}"
            )

            for cp in counterparties:

                if "DESCRIPTION" not in df_pandas.columns:
                    continue
                mask = df_pandas["DESCRIPTION"].str.contains(cp, case=False, na=False)
                cp_df = df_pandas[mask].copy()

                if len(cp_df) == 0:
                    continue

                cp_df = cp_df.sort_values("DATE")

                debits = cp_df[
                    (cp_df["DEBIT"].notna()) & (cp_df["DEBIT"] >= min_amount)
                ]
                credits = cp_df[
                    (cp_df["CREDIT"].notna()) & (cp_df["CREDIT"] >= min_amount)
                ]

                logger.info(
                    f"Counterparty {cp}: {len(debits)} debits, {len(credits)} credits"
                )

                credits_used = set()

                for _, debit in debits.iterrows():
                    for credit_idx, credit in credits.iterrows():
                        if credit_idx in credits_used:
                            continue
                        if credit["DATE"] > debit["DATE"]:
                            days_diff = (credit["DATE"] - debit["DATE"]).days
                            if days_diff <= days:
                                amount_diff = (
                                    abs(debit["DEBIT"] - credit["CREDIT"])
                                    / debit["DEBIT"]
                                    * 100
                                )
                                if amount_diff <= tolerance:
                                    results.append(
                                        {
                                            "counterparty": cp,
                                            "outgoing_amount": float(debit["DEBIT"]),
                                            "outgoing_date": debit["DATE"].strftime(
                                                "%Y-%m-%d"
                                            ),
                                            "incoming_amount": float(credit["CREDIT"]),
                                            "incoming_date": credit["DATE"].strftime(
                                                "%Y-%m-%d"
                                            ),
                                            "days_gap": days_diff,
                                            "amount_difference_percent": round(
                                                amount_diff, 1
                                            ),
                                        }
                                    )
                                    credits_used.add(credit_idx)
                                    logger.info(
                                        f"Found round trip: {cp} - Out: {debit['DEBIT']}, In: {credit['CREDIT']}, Gap: {days_diff} days"
                                    )
                                    break

            logger.info(
                f"Emergency detection completed: {len(results)} round trips found"
            )

            return {
                "round_trips_found": len(results) > 0,
                "total_round_trips": len(results),
                "round_trips": results,
                "detection_method": "emergency_description_parsing",
                "analysis_parameters": {
                    "tolerance_percent": tolerance,
                    "max_days_gap": days,
                    "min_amount": min_amount,
                },
            }

        except Exception as e:
            logger.error(f"Emergency round trip detection failed: {str(e)}")
            return {
                "round_trips_found": False,
                "message": f"Emergency detection failed: {str(e)}",
                "round_trips": [],
            }

    async def _detect_network_cycles(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Detect network cycles for multiple entities using NetworkCycleDetector"""
        try:

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("network_cycles", entity_ids)

            import networkx as nx

            graph = self._build_transaction_graph(df)

            min_length = kwargs.get("min_length", 2)
            max_length = kwargs.get("max_length", 10)
            min_amount = kwargs.get("min_amount", 0.0)
            max_duration_days = kwargs.get("max_duration_days", 365)
            net_flow_threshold = kwargs.get("net_flow_threshold", 0.1)

            detected_cycles = self.network_detector.detect_network_cycles(
                graph=graph,
                min_length=min_length,
                max_length=max_length,
                min_amount=min_amount,
                max_duration_days=max_duration_days,
                net_flow_threshold=net_flow_threshold,
            )

            centrality_metrics = self.network_detector.calculate_centrality_metrics(
                graph
            )

            hub_entities = self.network_detector.identify_hub_entities(
                graph, centrality_metrics=centrality_metrics
            )

            entity_insights = self._analyze_entity_relationships(graph)

            formatted_cycles = []
            for cycle in detected_cycles:
                formatted_cycles.append(
                    {
                        "path": cycle.path,
                        "cycle_length": cycle.cycle_length,
                        "total_amount": cycle.total_amount,
                        "net_flow": cycle.net_flow,
                        "duration_days": cycle.duration_days,
                        "confidence_score": cycle.confidence_score,
                        "cycle_type": cycle.cycle_type,
                        "first_transaction_date": (
                            cycle.first_transaction_date.isoformat()
                            if cycle.first_transaction_date
                            else None
                        ),
                        "last_transaction_date": (
                            cycle.last_transaction_date.isoformat()
                            if cycle.last_transaction_date
                            else None
                        ),
                        "transactions": cycle.transactions,
                    }
                )

            high_confidence_cycles = [
                c for c in detected_cycles if c.confidence_score > 0.7
            ]

            return self._format_analysis_result(
                analysis_type="network_cycles",
                entity_ids=entity_ids,
                results={
                    "detected_cycles": formatted_cycles,
                    "cycles_found": len(detected_cycles),
                    "cycles_count": len(detected_cycles),
                    "high_confidence_cycles": len(high_confidence_cycles),
                    "network_statistics": {
                        "nodes": graph.number_of_nodes(),
                        "edges": graph.number_of_edges(),
                        "hub_entities": hub_entities,
                        "centrality_metrics": centrality_metrics,
                        "entity_relationships": entity_insights,
                    },
                    "analysis_parameters": {
                        "min_length": min_length,
                        "max_length": max_length,
                        "min_amount": min_amount,
                        "max_duration_days": max_duration_days,
                        "net_flow_threshold": net_flow_threshold,
                    },
                },
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except Exception as e:
            logger.error(f"Network cycle detection failed: {str(e)}")
            raise AnalysisError(f"Network cycle detection failed: {str(e)}")

    def _build_transaction_graph(self, df: pd.DataFrame) -> "nx.DiGraph":
        """Build a directed graph from transaction data with entity resolution"""
        try:
            import networkx as nx

            graph = nx.DiGraph()

            entity_name_mapping = self._create_entity_name_mapping(df)

            entity_groups = df.groupby("entity_id")

            for entity_id, entity_df in entity_groups:
                entity_name = entity_df.iloc[0].get(
                    "entity_name", f"Entity_{entity_id}"
                )

                if not graph.has_node(entity_id):
                    graph.add_node(
                        entity_id,
                        name=entity_name,
                        entity_type=entity_df.iloc[0].get("entity_type", "Unknown"),
                        node_type="entity",
                        total_debits=0,
                        total_credits=0,
                        transaction_count=0,
                    )

                for _, row in entity_df.iterrows():
                    counterparty = row.get("counterparty", "").strip()
                    amount = row.get("amount", 0)
                    is_debit = row.get("DEBIT", 0) > 0
                    is_credit = row.get("CREDIT", 0) > 0

                    if is_debit:
                        graph.nodes[entity_id]["total_debits"] += amount
                    if is_credit:
                        graph.nodes[entity_id]["total_credits"] += amount
                    graph.nodes[entity_id]["transaction_count"] += 1

                    if counterparty and counterparty != "":

                        counterparty_entity_id = self._resolve_counterparty_to_entity(
                            counterparty, entity_name_mapping
                        )

                        if counterparty_entity_id:

                            target_node_id = counterparty_entity_id
                            target_node_type = "entity"

                            if not graph.has_node(target_node_id):

                                counterparty_data = df[
                                    df["entity_id"] == counterparty_entity_id
                                ].iloc[0]
                                graph.add_node(
                                    target_node_id,
                                    name=counterparty_data.get(
                                        "entity_name", counterparty
                                    ),
                                    entity_type=counterparty_data.get(
                                        "entity_type", "Unknown"
                                    ),
                                    node_type="entity",
                                    total_debits=0,
                                    total_credits=0,
                                    transaction_count=0,
                                )
                        else:

                            target_node_id = f"external_{hash(counterparty) % 10000}"
                            target_node_type = "external"

                            if not graph.has_node(target_node_id):
                                graph.add_node(
                                    target_node_id,
                                    name=counterparty,
                                    entity_type="External",
                                    node_type="external",
                                    total_debits=0,
                                    total_credits=0,
                                    transaction_count=0,
                                )

                        if is_debit:

                            source, target = entity_id, target_node_id
                        else:

                            source, target = target_node_id, entity_id

                        if graph.has_edge(source, target):

                            graph[source][target]["transactions"].append(
                                {
                                    "amount": amount,
                                    "date": (
                                        pd.to_datetime(row["DATE"])
                                        if pd.notna(row["DATE"])
                                        else datetime.now()
                                    ),
                                    "description": row.get("DESCRIPTION", ""),
                                    "transaction_id": row.get("transaction_id", ""),
                                    "transaction_type": (
                                        "debit" if is_debit else "credit"
                                    ),
                                    "counterparty": counterparty,
                                    "counterparty_resolved": counterparty_entity_id
                                    is not None,
                                }
                            )
                            graph[source][target]["total_amount"] += amount
                            graph[source][target]["transaction_count"] += 1
                        else:

                            graph.add_edge(
                                source,
                                target,
                                transactions=[
                                    {
                                        "amount": amount,
                                        "date": (
                                            pd.to_datetime(row["DATE"])
                                            if pd.notna(row["DATE"])
                                            else datetime.now()
                                        ),
                                        "description": row.get("DESCRIPTION", ""),
                                        "transaction_id": row.get("transaction_id", ""),
                                        "transaction_type": (
                                            "debit" if is_debit else "credit"
                                        ),
                                        "counterparty": counterparty,
                                        "counterparty_resolved": counterparty_entity_id
                                        is not None,
                                    }
                                ],
                                total_amount=amount,
                                transaction_count=1,
                                edge_type=(
                                    "internal" if counterparty_entity_id else "external"
                                ),
                            )

            entity_nodes = [
                n for n, d in graph.nodes(data=True) if d["node_type"] == "entity"
            ]
            external_nodes = [
                n for n, d in graph.nodes(data=True) if d["node_type"] == "external"
            ]
            internal_edges = [
                e for e in graph.edges(data=True) if e[2].get("edge_type") == "internal"
            ]

            logger.info(
                f"Built transaction graph with {graph.number_of_nodes()} nodes ({len(entity_nodes)} entities, {len(external_nodes)} external) and {graph.number_of_edges()} edges ({len(internal_edges)} internal)"
            )
            return graph

        except Exception as e:
            logger.error(f"Graph building failed: {str(e)}")
            raise AnalysisError(f"Failed to build transaction graph: {str(e)}")

    def _create_entity_name_mapping(self, df: pd.DataFrame) -> Dict[str, str]:
        """
        Create a mapping from entity names to entity IDs for counterparty resolution.

        Args:
            df: DataFrame with transaction data

        Returns:
            Dictionary mapping normalized entity names to entity IDs
        """
        try:
            entity_mapping = {}

            unique_entities = df[["entity_id", "entity_name"]].drop_duplicates()

            for _, row in unique_entities.iterrows():
                entity_id = row["entity_id"]
                entity_name = row["entity_name"]

                if pd.notna(entity_name) and entity_name.strip():

                    normalized_name = self._normalize_entity_name(entity_name)
                    entity_mapping[normalized_name] = entity_id

                    entity_mapping[entity_name.strip()] = entity_id

            logger.debug(
                f"Created entity name mapping with {len(entity_mapping)} entries"
            )
            return entity_mapping

        except Exception as e:
            logger.error(f"Failed to create entity name mapping: {str(e)}")
            return {}

    def _normalize_entity_name(self, name: str) -> str:
        """
        Normalize entity name for better matching.

        Args:
            name: Original entity name

        Returns:
            Normalized entity name
        """
        if not name:
            return ""

        normalized = name.strip().lower()

        suffixes_to_remove = [
            " ltd",
            " limited",
            " pvt",
            " private",
            " inc",
            " incorporated",
            " llp",
            " llc",
            " corp",
            " corporation",
            " co",
            " company",
        ]

        for suffix in suffixes_to_remove:
            if normalized.endswith(suffix):
                normalized = normalized[: -len(suffix)].strip()

        import re

        normalized = re.sub(r"[^\w\s]", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()

        return normalized

    def _resolve_counterparty_to_entity(
        self, counterparty: str, entity_mapping: Dict[str, str]
    ) -> Optional[str]:
        """
        Try to resolve a counterparty name to an actual entity ID.

        Args:
            counterparty: Counterparty name from transaction
            entity_mapping: Mapping of entity names to IDs

        Returns:
            Entity ID if resolved, None if not found
        """
        if not counterparty or not entity_mapping:
            return None

        if counterparty in entity_mapping:
            return entity_mapping[counterparty]

        normalized_counterparty = self._normalize_entity_name(counterparty)
        if normalized_counterparty in entity_mapping:
            return entity_mapping[normalized_counterparty]

        return self._fuzzy_match_entity(normalized_counterparty, entity_mapping)

    def _fuzzy_match_entity(
        self, counterparty: str, entity_mapping: Dict[str, str], threshold: float = 0.8
    ) -> Optional[str]:
        """
        Perform fuzzy matching to find similar entity names.

        Args:
            counterparty: Normalized counterparty name
            entity_mapping: Mapping of entity names to IDs
            threshold: Similarity threshold (0-1)

        Returns:
            Entity ID if match found above threshold, None otherwise
        """
        try:
            from difflib import SequenceMatcher

            best_match = None
            best_score = 0

            for entity_name in entity_mapping.keys():

                similarity = SequenceMatcher(None, counterparty, entity_name).ratio()

                if similarity > best_score and similarity >= threshold:
                    best_score = similarity
                    best_match = entity_mapping[entity_name]

            if best_match:
                logger.debug(
                    f"Fuzzy matched '{counterparty}' to entity {best_match} (score: {best_score:.3f})"
                )

            return best_match

        except Exception as e:
            logger.error(f"Fuzzy matching failed: {str(e)}")
            return None

    def _analyze_entity_relationships(self, graph: "nx.DiGraph") -> Dict[str, Any]:
        """
        Analyze the relationships between entities in the graph.

        Args:
            graph: NetworkX DiGraph

        Returns:
            Dictionary with entity relationship insights
        """
        try:

            entity_nodes = [
                n for n, d in graph.nodes(data=True) if d.get("node_type") == "entity"
            ]
            external_nodes = [
                n for n, d in graph.nodes(data=True) if d.get("node_type") == "external"
            ]

            entity_to_entity_edges = []
            entity_to_external_edges = []
            external_to_entity_edges = []

            for source, target, edge_data in graph.edges(data=True):
                source_type = graph.nodes[source].get("node_type", "unknown")
                target_type = graph.nodes[target].get("node_type", "unknown")

                if source_type == "entity" and target_type == "entity":
                    entity_to_entity_edges.append((source, target, edge_data))
                elif source_type == "entity" and target_type == "external":
                    entity_to_external_edges.append((source, target, edge_data))
                elif source_type == "external" and target_type == "entity":
                    external_to_entity_edges.append((source, target, edge_data))

            internal_flow = sum(
                edge[2]["total_amount"] for edge in entity_to_entity_edges
            )
            outgoing_flow = sum(
                edge[2]["total_amount"] for edge in entity_to_external_edges
            )
            incoming_flow = sum(
                edge[2]["total_amount"] for edge in external_to_entity_edges
            )

            entity_connections = {}
            for entity in entity_nodes:
                internal_connections = 0
                for source, target, _ in entity_to_entity_edges:
                    if source == entity or target == entity:
                        internal_connections += 1
                entity_connections[entity] = internal_connections

            most_connected = sorted(
                entity_connections.items(), key=lambda x: x[1], reverse=True
            )[:5]

            total_counterparty_edges = (
                len(entity_to_external_edges)
                + len(external_to_entity_edges)
                + len(entity_to_entity_edges)
            )
            resolved_edges = len(entity_to_entity_edges)
            resolution_rate = (
                (resolved_edges / total_counterparty_edges * 100)
                if total_counterparty_edges > 0
                else 0
            )

            return {
                "total_entities": len(entity_nodes),
                "total_external_counterparties": len(external_nodes),
                "entity_to_entity_relationships": len(entity_to_entity_edges),
                "entity_to_external_relationships": len(entity_to_external_edges),
                "external_to_entity_relationships": len(external_to_entity_edges),
                "internal_transaction_flow": internal_flow,
                "outgoing_transaction_flow": outgoing_flow,
                "incoming_transaction_flow": incoming_flow,
                "counterparty_resolution_rate": round(resolution_rate, 2),
                "most_connected_entities": [
                    {
                        "entity_id": entity_id,
                        "entity_name": graph.nodes[entity_id].get("name", "Unknown"),
                        "internal_connections": connections,
                    }
                    for entity_id, connections in most_connected[:5]
                ],
                "network_density": (
                    round(
                        len(entity_to_entity_edges)
                        / (len(entity_nodes) * (len(entity_nodes) - 1))
                        * 100,
                        2,
                    )
                    if len(entity_nodes) > 1
                    else 0
                ),
            }

        except Exception as e:
            logger.error(f"Entity relationship analysis failed: {str(e)}")
            return {
                "error": "Failed to analyze entity relationships",
                "total_entities": 0,
                "total_external_counterparties": 0,
                "counterparty_resolution_rate": 0,
            }

    async def analyze_rapid_movements(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform rapid movement analysis for specified entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for rapid movement analysis

        Returns:
            Dictionary containing rapid movement analysis results
        """
        try:
            logger.info(
                f"Starting rapid movement analysis for {len(entity_ids)} entities"
            )

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("rapid_movements", entity_ids)

            hours = kwargs.get("hours", 24)
            tolerance = kwargs.get("tolerance", 5.0)
            min_amount = kwargs.get("min_amount", 1000)

            rapid_patterns = self._detect_rapid_movements(
                df, hours, tolerance, min_amount
            )

            return self._format_analysis_result(
                analysis_type="rapid_movements",
                entity_ids=entity_ids,
                results=rapid_patterns,
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Rapid movement analysis failed: {str(e)}")
            raise AnalysisError(f"Rapid movement analysis failed: {str(e)}")

    def _detect_rapid_movements(
        self, df: pd.DataFrame, hours: int, tolerance: float, min_amount: float
    ) -> Dict[str, Any]:
        """Extract rapid movement detection logic from rapid_movement.py"""
        try:

            sort_columns = ["DATE"]
            if "original_index" in df.columns:
                sort_columns.append("original_index")
            df_sorted = df.sort_values(by=sort_columns).reset_index(drop=True)
            rapid_patterns = []

            matched_in_transactions = set()
            matched_out_transactions = set()

            for i in range(len(df_sorted) - 1):
                curr = df_sorted.iloc[i]

                if i in matched_in_transactions:
                    continue

                if pd.notna(curr["CREDIT"]) and curr["CREDIT"] >= min_amount:
                    best_match = None
                    best_match_index = None
                    best_amount_diff = float("inf")

                    for j in range(i + 1, min(i + 20, len(df_sorted))):
                        next_txn = df_sorted.iloc[j]

                        if j in matched_out_transactions:
                            continue

                        if pd.notna(next_txn["DEBIT"]):

                            time_diff = (
                                next_txn["DATE"] - curr["DATE"]
                            ).total_seconds() / 3600

                            if time_diff <= hours:

                                amount_diff = (
                                    abs(curr["CREDIT"] - next_txn["DEBIT"])
                                    / curr["CREDIT"]
                                    * 100
                                )

                                if (
                                    amount_diff <= tolerance
                                    and amount_diff < best_amount_diff
                                ):
                                    best_match = next_txn
                                    best_match_index = j
                                    best_amount_diff = amount_diff

                    if best_match is not None:
                        matched_in_transactions.add(i)
                        matched_out_transactions.add(best_match_index)

                        time_diff = (
                            best_match["DATE"] - curr["DATE"]
                        ).total_seconds() / 3600

                        rapid_patterns.append(
                            {
                                "in_date": curr["DATE"].isoformat(),
                                "in_amount": float(curr["CREDIT"]),
                                "in_counterparty": curr.get("counterparty", ""),
                                "in_description": curr["DESCRIPTION"][:50],
                                "out_date": best_match["DATE"].isoformat(),
                                "out_amount": float(best_match["DEBIT"]),
                                "out_counterparty": best_match.get("counterparty", ""),
                                "out_description": best_match["DESCRIPTION"][:50],
                                "hours_gap": round(time_diff, 1),
                                "amount_difference_percent": round(best_amount_diff, 1),
                            }
                        )

            repeated_pairs = []
            if rapid_patterns:
                patterns_df = pd.DataFrame(rapid_patterns)
                if {"in_counterparty", "out_counterparty"}.issubset(
                    patterns_df.columns
                ):
                    pair_counts = (
                        patterns_df.groupby(["in_counterparty", "out_counterparty"])
                        .size()
                        .reset_index(name="occurrences")
                    )
                    repeated_pairs = (
                        pair_counts[pair_counts["occurrences"] >= 2]
                        .sort_values("occurrences", ascending=False)
                        .to_dict("records")
                    )

            return {
                "rapid_movements_found": len(rapid_patterns) > 0,
                "total_rapid_movements": len(rapid_patterns),
                "rapid_movements": rapid_patterns,
                "repeated_pairs": repeated_pairs,
                "repeated_pairs_count": len(repeated_pairs),
                "analysis_parameters": {
                    "time_window_hours": hours,
                    "amount_tolerance_percent": tolerance,
                    "min_amount": min_amount,
                },
            }

        except Exception as e:
            logger.error(f"Rapid movement computation failed: {str(e)}")
            raise AnalysisError(f"Rapid movement computation failed: {str(e)}")

    async def analyze_time_trends(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform time-based trend analysis for specified entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for time trend analysis

        Returns:
            Dictionary containing time trend analysis results
        """
        try:
            logger.info(f"Starting time trend analysis for {len(entity_ids)} entities")

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("time_trends", entity_ids)

            time_granularity = kwargs.get("time_granularity", "daily")

            analysis_results = self.time_analyzer.analyze_transaction_trends(
                df=df,
                date_column="DATE",
                debit_column="DEBIT",
                credit_column="CREDIT",
                time_granularity=time_granularity,
            )

            return self._format_analysis_result(
                analysis_type="time_trends",
                entity_ids=entity_ids,
                results=analysis_results,
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Time trend analysis failed: {str(e)}")
            raise AnalysisError(f"Time trend analysis failed: {str(e)}")

    async def analyze_transfer_patterns(
        self,
        entity_ids: List[str],
        date_from: Optional[datetime] = None,
        date_to: Optional[datetime] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """
        Perform transfer pattern analysis for multiple entities.

        Args:
            entity_ids: List of entity IDs to analyze
            date_from: Optional start date filter
            date_to: Optional end date filter
            **kwargs: Additional parameters for transfer pattern analysis

        Returns:
            Dictionary containing transfer pattern analysis results
        """
        try:
            logger.info(
                f"Starting transfer pattern analysis for {len(entity_ids)} entities"
            )

            df = await self._fetch_and_prepare_data(
                entity_ids=entity_ids,
                date_from=date_from,
                date_to=date_to,
                convert_to_polars=False,
            )

            if df.empty:
                return self._empty_analysis_result("transfer_patterns", entity_ids)

            time_window = kwargs.get("time_window", 7)
            percentage_match = kwargs.get("percentage_match", 90)
            deviance = kwargs.get("deviance", 10)
            min_amount = kwargs.get("min_amount", 1000)
            min_occurrences = kwargs.get("min_occurrences", 2)

            transfer_patterns = self._find_transfer_patterns(
                df, time_window, percentage_match, deviance, min_amount, min_occurrences
            )

            return self._format_analysis_result(
                analysis_type="transfer_patterns",
                entity_ids=entity_ids,
                results=transfer_patterns,
                transaction_count=len(df),
                date_range=self._get_date_range(df),
            )

        except (ValidationError, EntityNotFoundError) as e:
            raise
        except Exception as e:
            logger.error(f"Transfer pattern analysis failed: {str(e)}")
            raise AnalysisError(f"Transfer pattern analysis failed: {str(e)}")

    def _find_transfer_patterns(
        self,
        df: pd.DataFrame,
        time_window: int,
        percentage_match: float,
        deviance: float,
        min_amount: float,
        min_occurrences: int,
    ) -> Dict[str, Any]:
        """Extract transfer pattern detection logic from transfer_pattern.py"""
        try:
            if "counterparty" not in df.columns or df["counterparty"].nunique() < 2:
                return {
                    "transfer_patterns_found": False,
                    "message": "Transfer pattern analysis requires at least two counterparties",
                    "patterns": [],
                }

            sort_columns = ["DATE"]
            if "original_index" in df.columns:
                sort_columns.append("original_index")
            df_sorted = df.sort_values(sort_columns).reset_index(drop=True)

            credits = df_sorted[
                (df_sorted["CREDIT"].notna())
                & (df_sorted["CREDIT"] >= min_amount)
                & (df_sorted["counterparty"] != "")
            ].copy()

            debits = df_sorted[
                (df_sorted["DEBIT"].notna())
                & (df_sorted["DEBIT"] >= min_amount)
                & (df_sorted["counterparty"] != "")
            ].copy()

            potential_patterns = []
            used_debits = set()

            for _, credit_txn in credits.iterrows():
                credit_amount = credit_txn["CREDIT"]
                credit_date = credit_txn["DATE"]
                source_cp = credit_txn["counterparty"]

                time_limit = credit_date + pd.Timedelta(days=time_window)
                lower_bound = credit_amount * (percentage_match - deviance) / 100
                upper_bound = credit_amount * (percentage_match + deviance) / 100

                candidate_debits = debits[
                    (debits["DATE"] > credit_date)
                    & (debits["DATE"] <= time_limit)
                    & (debits["DEBIT"] >= lower_bound)
                    & (debits["DEBIT"] <= upper_bound)
                    & (debits["counterparty"] != source_cp)
                    & (~debits.index.isin(used_debits))
                ]

                if len(candidate_debits) > 0:
                    candidate_debits = candidate_debits.copy()
                    candidate_debits["amount_diff"] = abs(
                        candidate_debits["DEBIT"] - credit_amount
                    )
                    candidate_debits["date_diff"] = (
                        candidate_debits["DATE"] - credit_date
                    ).dt.days

                    candidate_debits["match_score"] = (
                        1 - candidate_debits["amount_diff"] / credit_amount
                    ) * 0.7 + (1 - candidate_debits["date_diff"] / time_window) * 0.3

                    best_match = candidate_debits.loc[
                        candidate_debits["match_score"].idxmax()
                    ]
                    used_debits.add(best_match.name)

                    dest_cp = best_match["counterparty"]
                    potential_patterns.append(
                        {
                            "source": source_cp,
                            "destination": dest_cp,
                            "in_date": credit_txn["DATE"].strftime("%Y-%m-%d"),
                            "in_amount": float(credit_txn["CREDIT"]),
                            "out_date": best_match["DATE"].strftime("%Y-%m-%d"),
                            "out_amount": float(best_match["DEBIT"]),
                            "days_gap": (best_match["DATE"] - credit_txn["DATE"]).days,
                            "percentage_transferred": (
                                best_match["DEBIT"] / credit_txn["CREDIT"]
                            )
                            * 100,
                        }
                    )

            if not potential_patterns:
                return {
                    "transfer_patterns_found": False,
                    "message": "No individual transfer links found",
                    "patterns": [],
                }

            patterns_df = pd.DataFrame(potential_patterns)
            pattern_groups = patterns_df.groupby(["source", "destination"])

            final_results = []
            for (source, destination), group in pattern_groups:
                if len(group) >= min_occurrences:
                    summary = {
                        "source": source,
                        "destination": destination,
                        "occurrences": len(group),
                        "average_in_amount": float(group["in_amount"].mean()),
                        "average_out_amount": float(group["out_amount"].mean()),
                        "average_percentage_transferred": float(
                            group["percentage_transferred"].mean()
                        ),
                        "first_occurrence": group["in_date"].min(),
                        "last_occurrence": group["out_date"].max(),
                        "details": group.to_dict("records"),
                    }
                    final_results.append(summary)

            return {
                "transfer_patterns_found": len(final_results) > 0,
                "total_patterns": len(final_results),
                "patterns": final_results,
                "analysis_parameters": {
                    "time_window_days": time_window,
                    "percentage_match": percentage_match,
                    "deviance": deviance,
                    "min_amount": min_amount,
                    "min_occurrences": min_occurrences,
                },
            }

        except Exception as e:
            logger.error(f"Transfer pattern computation failed: {str(e)}")
            raise AnalysisError(f"Transfer pattern computation failed: {str(e)}")

    def _format_analysis_result(
        self,
        analysis_type: str,
        entity_ids: List[str],
        results: Dict[str, Any],
        transaction_count: int,
        date_range: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Format analysis results in standardized format"""
        return {
            "analysis_type": analysis_type,
            "entity_count": len(entity_ids),
            "entity_ids": entity_ids,
            "transaction_count": transaction_count,
            "date_range": date_range,
            "results": results,
            "insights": self._generate_insights(analysis_type, results),
            "risk_indicators": self._extract_risk_indicators(analysis_type, results),
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _empty_analysis_result(
        self, analysis_type: str, entity_ids: List[str]
    ) -> Dict[str, Any]:
        """Return empty analysis result for cases with no data"""
        return {
            "analysis_type": analysis_type,
            "entity_count": len(entity_ids),
            "entity_ids": entity_ids,
            "transaction_count": 0,
            "date_range": {"start": None, "end": None},
            "results": {"message": "No transaction data found for analysis"},
            "insights": ["No data available for analysis"],
            "risk_indicators": [],
            "timestamp": datetime.utcnow().isoformat(),
        }

    def _get_date_range(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Extract date range from DataFrame"""
        if df.empty or "DATE" not in df.columns:
            return {"start": None, "end": None}

        return {
            "start": (
                df["DATE"].min().isoformat() if pd.notna(df["DATE"].min()) else None
            ),
            "end": df["DATE"].max().isoformat() if pd.notna(df["DATE"].max()) else None,
        }

    def _get_date_range_polars(self, df: pl.DataFrame) -> Dict[str, Any]:
        """Extract date range from Polars DataFrame"""
        if len(df) == 0 or "DATE" not in df.columns:
            return {"start": None, "end": None}

        try:
            start_date = df["DATE"].min()
            end_date = df["DATE"].max()

            return {
                "start": (
                    start_date.strftime("%Y-%m-%dT%H:%M:%S") if start_date else None
                ),
                "end": end_date.strftime("%Y-%m-%dT%H:%M:%S") if end_date else None,
            }
        except Exception:
            return {"start": None, "end": None}

    def _generate_insights(
        self, analysis_type: str, results: Dict[str, Any]
    ) -> List[str]:
        """Generate insights based on analysis type and results"""
        insights = []

        try:
            if analysis_type == "cash_flow":
                if results.get("cash_transactions_found"):
                    insights.append(
                        f"Found {results.get('total_cash_transactions', 0)} cash transactions"
                    )
                    if results.get("large_cash_transactions", 0) > 0:
                        insights.append(
                            f"⚠️ {results['large_cash_transactions']} large cash transactions detected"
                        )
                else:
                    insights.append(
                        "No cash transactions detected with specified keywords"
                    )

            elif analysis_type == "counterparty_trends":
                summary = results.get("summary", {})
                if summary.get("high_risk_count", 0) > 0:
                    insights.append(
                        f"🚨 {summary['high_risk_count']} high-risk counterparties identified"
                    )
                insights.append(
                    f"Analyzed {summary.get('total_counterparties_analyzed', 0)} counterparties"
                )

            elif analysis_type == "mule_accounts":
                summary = results.get("summary", {})
                if summary.get("alerts_generated", 0) > 0:
                    insights.append(
                        f"🚨 {summary['alerts_generated']} mule account alerts generated"
                    )
                    if summary.get("high_confidence_alerts", 0) > 0:
                        insights.append(
                            f"⚠️ {summary['high_confidence_alerts']} high-confidence alerts"
                        )

            elif analysis_type in ["round_trips", "network_cycles"]:
                if analysis_type == "round_trips":
                    if results.get("round_trips_found"):
                        insights.append(
                            f"Found {results.get('total_round_trips', 0)} round trip patterns"
                        )
                elif analysis_type == "network_cycles":
                    if results.get("cycles_count", 0) > 0:
                        insights.append(
                            f"Detected {results['cycles_count']} network cycles"
                        )

            elif analysis_type == "rapid_movements":
                if results.get("rapid_movements_found"):
                    insights.append(
                        f"Found {results.get('total_rapid_movements', 0)} rapid money movements"
                    )
                    if results.get("repeated_pairs"):
                        insights.append(
                            f"⚠️ {len(results['repeated_pairs'])} repeated party pairs detected"
                        )

            elif analysis_type == "transfer_patterns":
                if results.get("transfer_patterns_found"):
                    insights.append(
                        f"Found {results.get('total_patterns', 0)} repeated transfer patterns"
                    )

            if not insights:
                insights.append("Analysis completed successfully")

        except Exception as e:
            logger.warning(f"Failed to generate insights: {str(e)}")
            insights.append("Analysis completed with limited insights")

        return insights

    def _extract_risk_indicators(
        self, analysis_type: str, results: Dict[str, Any]
    ) -> List[str]:
        """Extract risk indicators based on analysis results"""
        risk_indicators = []

        try:
            if analysis_type == "cash_flow":
                if results.get("large_cash_transactions", 0) > 0:
                    risk_indicators.append("Large cash transactions detected")

            elif analysis_type == "counterparty_trends":
                high_risk = results.get("high_risk_counterparties", [])
                for cp in high_risk[:3]:
                    risk_indicators.append(
                        f"High-risk counterparty: {cp.get('name', 'Unknown')} (score: {cp.get('risk_score', 0):.2f})"
                    )

            elif analysis_type == "mule_accounts":
                alerts = results.get("mule_alerts", [])
                for alert in alerts[:3]:
                    risk_indicators.append(
                        f"Mule account pattern: {alert.get('pattern_type', 'Unknown')} (confidence: {alert.get('confidence_score', 0):.2f})"
                    )

            elif analysis_type in ["round_trips", "network_cycles"]:
                if analysis_type == "round_trips" and results.get("round_trips_found"):
                    risk_indicators.append("Round trip transactions detected")
                elif (
                    analysis_type == "network_cycles"
                    and results.get("cycles_count", 0) > 0
                ):
                    risk_indicators.append("Network cycle patterns detected")

            elif analysis_type == "rapid_movements":
                if results.get("rapid_movements_found"):
                    risk_indicators.append("Rapid money movement patterns detected")

            elif analysis_type == "transfer_patterns":
                if results.get("transfer_patterns_found"):
                    risk_indicators.append("Repeated transfer patterns detected")

        except Exception as e:
            logger.warning(f"Failed to extract risk indicators: {str(e)}")

        return risk_indicators


analysis_service = AnalysisService()


async def get_analysis_service() -> AnalysisService:
    """
    Dependency injection function for FastAPI.

    Returns:
        AnalysisService instance
    """
    return analysis_service
