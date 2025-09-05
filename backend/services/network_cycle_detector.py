"""
Network Cycle Detection Engine for Round Trip Analysis

This module implements the NetworkCycleDetector class that identifies round trip patterns
using graph algorithms, calculates centrality metrics, and detects network-based anomalies.
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import pandas as pd
import networkx as nx
from dataclasses import dataclass
import logging
from collections import defaultdict
import numpy as np

# sklearn imports for clustering
from sklearn.cluster import DBSCAN, KMeans, SpectralClustering
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score


@dataclass
class DetectedCycle:
    """Represents a detected cycle in the transaction network"""

    path: List[str]
    transactions: List[Dict[str, Any]]
    total_amount: float
    net_flow: float
    duration_days: int
    confidence_score: float
    cycle_type: str  # 'simple', 'complex', 'hub-mediated'
    cycle_length: int
    first_transaction_date: datetime
    last_transaction_date: datetime


@dataclass
class NetworkAnalysisResults:
    """Encapsulates complete network analysis results"""

    graph: nx.DiGraph
    detected_cycles: List[DetectedCycle]
    centrality_metrics: Dict[str, Dict[str, float]]
    hub_entities: List[str]
    network_statistics: Dict[str, Any]
    anomaly_scores: Dict[str, float]
    analysis_timestamp: datetime
    configuration_used: Dict[str, Any]


class NetworkCycleDetector:
    """
    Detects round trip patterns using graph algorithms and network analysis.

    This class implements sophisticated cycle detection using NetworkX algorithms,
    calculates centrality metrics to identify key entities, and provides filtering
    capabilities for net flow and duration constraints.
    """

    def __init__(self, logger: Optional[logging.Logger] = None):
        """
        Initialize the NetworkCycleDetector.

        Args:
            logger: Optional logger for debugging and monitoring
        """
        self.logger = logger or logging.getLogger(__name__)
        self.analysis_cache = {}

    def detect_network_cycles(
        self,
        graph: nx.DiGraph,
        min_length: int = 2,
        max_length: int = 10,
        min_amount: float = 0.0,
        max_duration_days: int = 365,
        net_flow_threshold: float = 0.1,
    ) -> List[DetectedCycle]:
        """
        Uses NetworkX cycle detection to find all cycles within length bounds.

        Args:
            graph: NetworkX DiGraph to analyze
            min_length: Minimum cycle length to detect
            max_length: Maximum cycle length to detect
            min_amount: Minimum transaction amount for inclusion
            max_duration_days: Maximum time duration for valid round trips
            net_flow_threshold: Maximum net flow ratio for round trip classification

        Returns:
            List of DetectedCycle objects with metadata
        """
        if graph.number_of_nodes() == 0:
            return []

        self.logger.info(
            f"Starting cycle detection on graph with {graph.number_of_nodes()} nodes and {graph.number_of_edges()} edges"
        )

        detected_cycles = []

        try:
            # Find all simple cycles using Johnson's algorithm
            # Note: NetworkX simple_cycles can be memory intensive for large graphs
            all_cycles = list(nx.simple_cycles(graph))

            self.logger.info(f"Found {len(all_cycles)} raw cycles")

            # Debug: Print all raw cycles for debugging
            print(f"🔍 DEBUG: Found {len(all_cycles)} raw cycles:")
            for i, cycle in enumerate(all_cycles[:10]):  # Show first 10
                print(f"  Cycle {i + 1}: {cycle}")
            all_cycles = [c for c in all_cycles if len(set(c)) >= 3]
            for cycle_path in all_cycles:
                cycle_length = len(cycle_path)

                # Filter by length constraints
                if cycle_length < min_length or cycle_length > max_length:
                    continue

                # Analyze the cycle
                cycle_analysis = self._analyze_cycle(graph, cycle_path)

                if cycle_analysis is None:
                    continue

                # Apply filtering constraints
                if not self._passes_cycle_filters(
                    cycle_analysis, min_amount, max_duration_days, net_flow_threshold
                ):
                    # Debug: Show why cycle was filtered out
                    print(f"🚫 DEBUG: Cycle {cycle_path} filtered out:")
                    print(
                        f"   Total amount: {cycle_analysis['total_amount']} (min: {min_amount})"
                    )
                    print(
                        f"   Duration: {cycle_analysis['duration_days']} days (max: {max_duration_days})"
                    )
                    if cycle_analysis["total_amount"] > 0:
                        net_flow_ratio = (
                            abs(cycle_analysis["net_flow"])
                            / cycle_analysis["total_amount"]
                        )
                        print(
                            f"   Net flow ratio: {net_flow_ratio:.3f} (max: {net_flow_threshold})"
                        )
                    continue

                # Create DetectedCycle object
                detected_cycle = DetectedCycle(
                    path=cycle_path,
                    transactions=cycle_analysis["transactions"],
                    total_amount=cycle_analysis["total_amount"],
                    net_flow=cycle_analysis["net_flow"],
                    duration_days=cycle_analysis["duration_days"],
                    confidence_score=cycle_analysis["confidence_score"],
                    cycle_type=cycle_analysis["cycle_type"],
                    cycle_length=cycle_length,
                    first_transaction_date=cycle_analysis["first_date"],
                    last_transaction_date=cycle_analysis["last_date"],
                )

                detected_cycles.append(detected_cycle)

            # Sort cycles by confidence score (descending)
            detected_cycles.sort(key=lambda x: x.confidence_score, reverse=True)

            self.logger.info(
                f"Detected {len(detected_cycles)} valid cycles after filtering"
            )

        except Exception as e:
            self.logger.error(f"Error during cycle detection: {str(e)}")
            raise

        return detected_cycles

    def _analyze_cycle(
        self, graph: nx.DiGraph, cycle_path: List[str]
    ) -> Optional[Dict[str, Any]]:
        """
        Analyzes a single cycle to extract transaction details and metadata.

        Args:
            graph: NetworkX DiGraph
            cycle_path: List of nodes forming the cycle

        Returns:
            Dictionary with cycle analysis results or None if invalid
        """
        try:
            transactions = []
            total_amount = 0.0
            amounts_in_cycle = []
            dates_in_cycle = []

            # Analyze each edge in the cycle
            for i in range(len(cycle_path)):
                source = cycle_path[i]
                target = cycle_path[(i + 1) % len(cycle_path)]

                if not graph.has_edge(source, target):
                    # Cycle is invalid if any edge is missing
                    return None

                edge_data = graph[source][target]
                edge_transactions = edge_data.get("transactions", [])

                if not edge_transactions:
                    continue

                # Get the most recent transaction for this edge
                latest_tx = max(
                    edge_transactions, key=lambda x: x.get("date", datetime.min)
                )
                transactions.append(
                    {
                        "source": source,
                        "target": target,
                        "amount": latest_tx.get("amount", 0),
                        "date": latest_tx.get("date"),
                        "transaction_type": latest_tx.get("transaction_type"),
                        "transaction_id": latest_tx.get("transaction_id"),
                        "description": latest_tx.get("description", ""),
                    }
                )

                amount = latest_tx.get("amount", 0)
                total_amount += amount
                amounts_in_cycle.append(amount)

                if latest_tx.get("date"):
                    dates_in_cycle.append(latest_tx["date"])

            if not transactions:
                return None

            # 🔧 PATCH: tag debit/credit direction on every tx
            for tx in transactions:
                tx["direction"] = "credit" if tx.get("amount", 0) > 0 else "debit"

            # Calculate temporal metrics
            if dates_in_cycle:
                dates_in_cycle = pd.to_datetime(dates_in_cycle)
                first_date = dates_in_cycle.min()
                last_date = dates_in_cycle.max()
                duration_days = (last_date - first_date).days
            else:
                first_date = datetime.min
                last_date = datetime.min
                duration_days = 0

            # Calculate net flow (ideally should be close to zero for true round trips)
            net_flow = self._calculate_net_flow(cycle_path, transactions)

            # Calculate confidence score
            confidence_score = self._calculate_confidence_score(
                amounts_in_cycle, net_flow, duration_days, len(cycle_path)
            )

            # Determine cycle type
            cycle_type = self._classify_cycle_type(graph, cycle_path, amounts_in_cycle)

            return {
                "transactions": transactions,
                "total_amount": total_amount,
                "net_flow": net_flow,
                "duration_days": duration_days,
                "confidence_score": confidence_score,
                "cycle_type": cycle_type,
                "first_date": first_date,
                "last_date": last_date,
            }

        except Exception as e:
            self.logger.error(f"Error analyzing cycle {cycle_path}: {str(e)}")
            return None

    def _calculate_net_flow(
        self, cycle_path: List[str], transactions: List[Dict[str, Any]]
    ) -> float:
        """
        Calculate net flow for a cycle based on what the starting entity sends vs receives.
        For true round trips, this should be close to zero.

        Args:
            cycle_path: List of nodes forming the cycle
            transactions: List of transactions in the cycle

        Returns:
            Net flow value (positive = net outflow, negative = net inflow)
        """
        if not transactions or not cycle_path:
            return 0.0

        starting_entity = cycle_path[0]
        outgoing_amount = 0.0
        incoming_amount = 0.0

        # Calculate what the starting entity sends out and receives back
        for tx in transactions:
            if tx["source"] == starting_entity:
                outgoing_amount += tx["amount"]
            elif tx["target"] == starting_entity:
                incoming_amount += tx["amount"]

        # Net flow = what goes out - what comes back
        # Positive = net outflow, Negative = net inflow, ~0 = balanced round trip
        return outgoing_amount - incoming_amount

    def _calculate_confidence_score(
        self,
        amounts: List[float],
        net_flow: float,
        duration_days: int,
        cycle_length: int,
    ) -> float:
        """
        Calculate confidence score for a detected cycle.

        Args:
            amounts: Transaction amounts in the cycle
            net_flow: Net flow of the cycle
            duration_days: Duration of the cycle in days
            cycle_length: Number of nodes in the cycle

        Returns:
            Confidence score between 0.0 and 1.0
        """
        if not amounts:
            return 0.0

        score = 1.0

        # Penalize high net flow (perfect round trips have low net flow)
        if sum(amounts) > 0:
            net_flow_ratio = abs(net_flow) / sum(amounts)
            score *= max(0.0, 1.0 - net_flow_ratio)

        # Penalize very long durations (suspicious round trips are often quick)
        if duration_days > 30:
            duration_penalty = min(0.5, duration_days / 365)
            score *= 1.0 - duration_penalty

        # Slight preference for shorter cycles (more direct round trips)
        if cycle_length > 3:
            length_penalty = min(0.2, (cycle_length - 3) * 0.05)
            score *= 1.0 - length_penalty

        # Boost score for consistent amounts (typical of structured round trips)
        if len(amounts) > 1:
            amount_variance = pd.Series(amounts).var()
            amount_mean = pd.Series(amounts).mean()
            if amount_mean > 0:
                consistency_bonus = max(0.0, 1.0 - (amount_variance / (amount_mean**2)))
                score *= 1.0 + consistency_bonus * 0.2

        return max(0.0, min(1.0, score))

    def _calculate_aml_confidence_score(
        self,
        amounts: List[float],
        net_flow: float,
        duration_days: int,
        cycle_length: int,
        transactions: List[Dict[str, Any]],
    ) -> float:
        """
        Calculate confidence score based on real AML detection patterns.

        Args:
            amounts: Transaction amounts in the cycle
            net_flow: Net flow of the cycle
            duration_days: Duration of the cycle in days
            cycle_length: Number of nodes in the cycle
            transactions: Transaction details for pattern analysis

        Returns:
            Confidence score between 0.0 and 1.0
        """
        if not amounts or not transactions:
            return 0.0

        score = 0.0
        total_amount = sum(amounts)

        # 1. ROUND TRIP EFFICIENCY (30% weight)
        # Perfect round trips have minimal net flow
        if total_amount > 0:
            net_flow_ratio = abs(net_flow) / total_amount
            round_trip_score = max(
                0.0, 1.0 - (net_flow_ratio * 2)
            )  # Penalize >50% loss
            score += round_trip_score * 0.30

        # 2. VELOCITY SUSPICION (25% weight)
        # Money laundering often happens quickly to avoid detection
        if duration_days <= 1:
            velocity_score = 1.0  # Same day = highly suspicious
        elif duration_days <= 7:
            velocity_score = 0.8  # Within a week = suspicious
        elif duration_days <= 30:
            velocity_score = 0.5  # Within a month = moderate
        else:
            velocity_score = max(
                0.0, 1.0 - (duration_days / 365)
            )  # Longer = less suspicious
        score += velocity_score * 0.25

        # 3. STRUCTURING INDICATORS (20% weight)
        structuring_score = self._detect_structuring_patterns(amounts, transactions)
        score += structuring_score * 0.20

        # 4. LAYERING COMPLEXITY (15% weight)
        # More complex paths can indicate sophisticated layering
        if cycle_length == 2:
            complexity_score = 0.3  # Direct back-and-forth (less sophisticated)
        elif cycle_length <= 4:
            complexity_score = 1.0  # Optimal complexity for layering
        elif cycle_length <= 6:
            complexity_score = 0.7  # Complex but manageable
        else:
            complexity_score = 0.4  # Too complex, might be legitimate business
        score += complexity_score * 0.15

        # 5. AMOUNT CONSISTENCY (10% weight)
        # Structured operations often use consistent amounts
        if len(amounts) > 1:
            amount_cv = pd.Series(amounts).std() / pd.Series(amounts).mean()
            consistency_score = max(0.0, 1.0 - amount_cv)  # Lower CV = more consistent
            score += consistency_score * 0.10

        return max(0.0, min(1.0, score))

    def _detect_structuring_patterns(
        self, amounts: List[float], transactions: List[Dict[str, Any]]
    ) -> float:
        """
        Detect structuring patterns that indicate deliberate threshold avoidance.

        Args:
            amounts: Transaction amounts
            transactions: Transaction details

        Returns:
            Structuring suspicion score (0.0 to 1.0)
        """
        if not amounts:
            return 0.0

        score = 0.0

        # Check for amounts just under common reporting thresholds
        reporting_thresholds = [10000, 5000, 3000]  # Common CTR and internal thresholds

        for threshold in reporting_thresholds:
            near_threshold_count = sum(
                1 for amt in amounts if threshold * 0.8 <= amt < threshold
            )
            if near_threshold_count > 0:
                score += (near_threshold_count / len(amounts)) * 0.5

        # Check for round numbers (humans prefer round numbers in structuring)
        round_number_count = sum(
            1 for amt in amounts if amt % 100 == 0 or amt % 1000 == 0
        )
        if round_number_count > len(amounts) * 0.7:  # >70% are round numbers
            score += 0.3

        # Check for repeated exact amounts (sign of coordination)
        from collections import Counter

        amount_counts = Counter(amounts)
        repeated_amounts = sum(1 for count in amount_counts.values() if count > 1)
        if repeated_amounts > 0:
            score += min(0.4, repeated_amounts / len(amounts))

        return min(1.0, score)

    def _classify_cycle_type(
        self, graph: nx.DiGraph, cycle_path: List[str], amounts: List[float]
    ) -> str:
        """
        Classify the type of cycle detected.

        Args:
            graph: NetworkX DiGraph
            cycle_path: List of nodes in the cycle
            amounts: Transaction amounts in the cycle

        Returns:
            Cycle type classification
        """
        cycle_length = len(cycle_path)

        if cycle_length == 2:
            return "simple"
        elif cycle_length <= 4:
            # Check if any node in the cycle is a hub
            self.calculate_centrality_metrics(graph)
            hub_entities = self.identify_hub_entities(graph, threshold=0.1)

            has_hub = any(node in hub_entities for node in cycle_path)
            if has_hub:
                return "hub-mediated"
            else:
                return "complex"
        else:
            return "complex"

    def _passes_cycle_filters(
        self,
        cycle_analysis: Dict[str, Any],
        min_amount: float,
        max_duration_days: int,
        net_flow_threshold: float,
    ) -> bool:
        """
        Check if a cycle passes the filtering constraints.

        Args:
            cycle_analysis: Analysis results for the cycle
            min_amount: Minimum transaction amount threshold
            max_duration_days: Maximum duration threshold
            net_flow_threshold: Maximum net flow ratio threshold

        Returns:
            True if cycle passes all filters
        """
        # Check minimum amount
        if cycle_analysis["total_amount"] < min_amount:
            return False

        # Check duration constraint
        if cycle_analysis["duration_days"] > max_duration_days:
            return False

        # Check net flow constraint
        if cycle_analysis["total_amount"] > 0:
            net_flow_ratio = (
                abs(cycle_analysis["net_flow"]) / cycle_analysis["total_amount"]
            )
            if net_flow_ratio > net_flow_threshold:
                return False

        return True

    def calculate_centrality_metrics(
        self, graph: nx.DiGraph
    ) -> Dict[str, Dict[str, float]]:
        """
        Calculates betweenness, closeness, and degree centrality for all nodes.
        Identifies key entities in transaction flows.

        Args:
            graph: NetworkX DiGraph to analyze

        Returns:
            Dictionary mapping node names to centrality metrics
        """
        if graph.number_of_nodes() == 0:
            return {}

        self.logger.info("Calculating centrality metrics")

        centrality_metrics = {}

        try:
            # Calculate different centrality measures
            betweenness = nx.betweenness_centrality(graph)
            closeness = nx.closeness_centrality(graph)
            in_degree = dict(graph.in_degree())
            out_degree = dict(graph.out_degree())

            # Normalize degree centrality
            max_possible_degree = graph.number_of_nodes() - 1

            for node in graph.nodes():
                centrality_metrics[node] = {
                    "betweenness": betweenness.get(node, 0.0),
                    "closeness": closeness.get(node, 0.0),
                    "in_degree": in_degree.get(node, 0),
                    "out_degree": out_degree.get(node, 0),
                    "total_degree": in_degree.get(node, 0) + out_degree.get(node, 0),
                    "in_degree_centrality": in_degree.get(node, 0)
                    / max(1, max_possible_degree),
                    "out_degree_centrality": out_degree.get(node, 0)
                    / max(1, max_possible_degree),
                }

            # Calculate eigenvector centrality (if graph is strongly connected)
            try:
                if nx.is_strongly_connected(graph):
                    eigenvector = nx.eigenvector_centrality(graph, max_iter=1000)
                    for node in centrality_metrics:
                        centrality_metrics[node]["eigenvector"] = eigenvector.get(
                            node, 0.0
                        )
                else:
                    # Use PageRank as alternative for non-strongly connected graphs
                    pagerank = nx.pagerank(graph)
                    for node in centrality_metrics:
                        centrality_metrics[node]["pagerank"] = pagerank.get(node, 0.0)
            except (nx.NetworkXError, nx.PowerIterationFailedConvergence):
                # Fallback: set eigenvector/pagerank to 0 for all nodes
                for node in centrality_metrics:
                    centrality_metrics[node]["eigenvector"] = 0.0
                    centrality_metrics[node]["pagerank"] = 0.0

            self.logger.info(
                f"Calculated centrality metrics for {len(centrality_metrics)} nodes"
            )

        except Exception as e:
            self.logger.error(f"Error calculating centrality metrics: {str(e)}")
            raise

        return centrality_metrics

    def identify_hub_entities(
        self,
        graph: nx.DiGraph,
        threshold: float = 0.1,
        centrality_metrics: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> List[str]:
        """
        Finds entities with high centrality scores that facilitate multiple round trips.

        Args:
            graph: NetworkX DiGraph to analyze
            threshold: Minimum centrality threshold for hub classification
            centrality_metrics: Pre-calculated centrality metrics (optional)

        Returns:
            List of entity names identified as hubs
        """
        if graph.number_of_nodes() == 0:
            return []

        if centrality_metrics is None:
            centrality_metrics = self.calculate_centrality_metrics(graph)

        hub_entities = []

        for node, metrics in centrality_metrics.items():
            # Consider multiple centrality measures for hub identification
            is_hub = (
                metrics.get("betweenness", 0) >= threshold
                or metrics.get("total_degree", 0) >= graph.number_of_nodes() * threshold
                or metrics.get("pagerank", 0) >= threshold
                or metrics.get("eigenvector", 0) >= threshold
            )

            if is_hub:
                hub_entities.append(node)

        # Sort by combined centrality score
        def combined_centrality_score(node: str) -> float:
            metrics = centrality_metrics[node]
            return (
                metrics.get("betweenness", 0) * 0.4
                + metrics.get("pagerank", 0) * 0.3
                + metrics.get("eigenvector", 0) * 0.2
                + (metrics.get("total_degree", 0) / max(1, graph.number_of_nodes()))
                * 0.1
            )

        hub_entities.sort(key=combined_centrality_score, reverse=True)

        self.logger.info(f"Identified {len(hub_entities)} hub entities")

        return hub_entities

    def detect_temporal_patterns(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        time_window_hours: int = 24,
    ) -> Dict[str, Any]:
        """
        Detect synchronized or coordinated transaction timing patterns.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            time_window_hours: Time window for synchronization detection

        Returns:
            Dictionary with temporal pattern analysis results
        """
        if not cycles:
            return {
                "synchronized_cycles": [],
                "temporal_clusters": [],
                "synchronization_score": 0.0,
                "temporal_statistics": {},
                "periodic_patterns": [],
                "burst_patterns": [],
            }

        synchronized_cycles = []
        temporal_clusters = []

        # Extract cycle timestamps
        cycle_timestamps = []
        valid_cycles = []

        for cycle in cycles:
            if (
                hasattr(cycle, "first_transaction_date")
                and cycle.first_transaction_date
            ):
                cycle_timestamps.append(cycle.first_transaction_date)
                valid_cycles.append(cycle)

        if not cycle_timestamps:
            return {
                "synchronized_cycles": [],
                "temporal_clusters": [],
                "synchronization_score": 0.0,
                "temporal_statistics": {},
                "periodic_patterns": [],
                "burst_patterns": [],
            }

        # Convert to pandas datetime for easier manipulation
        cycle_timestamps = pd.to_datetime(cycle_timestamps)

        # Group cycles by time proximity
        time_groups = defaultdict(list)

        for i, cycle in enumerate(valid_cycles):
            cycle_time = cycle_timestamps[i]

            # Round to nearest time window
            time_key = cycle_time.replace(
                minute=0, second=0, microsecond=0
            ) + timedelta(
                hours=(cycle_time.hour // time_window_hours) * time_window_hours
            )

            time_groups[time_key].append(cycle)

        # Identify synchronized cycles (multiple cycles in same time window)
        for time_key, group_cycles in time_groups.items():
            if len(group_cycles) > 1:
                synchronized_cycles.extend(group_cycles)
                temporal_clusters.append(
                    {
                        "timestamp": time_key.isoformat(),
                        "cycle_count": len(group_cycles),
                        "total_amount": sum(c.total_amount for c in group_cycles),
                        "average_confidence": sum(
                            c.confidence_score for c in group_cycles
                        )
                        / len(group_cycles),
                        "cycles": [c.path for c in group_cycles],
                        "entities_involved": list(
                            set().union(*[set(c.path) for c in group_cycles])
                        ),
                    }
                )

        # Calculate temporal statistics
        temporal_stats = self._calculate_temporal_statistics(
            cycle_timestamps, valid_cycles
        )

        # Detect periodic patterns
        periodic_patterns = self._detect_periodic_patterns(
            cycle_timestamps, valid_cycles
        )

        # Detect burst patterns (high activity in short periods)
        burst_patterns = self._detect_burst_patterns(
            cycle_timestamps, valid_cycles, time_window_hours
        )

        return {
            "synchronized_cycles": synchronized_cycles,
            "temporal_clusters": temporal_clusters,
            "synchronization_score": len(synchronized_cycles) / max(1, len(cycles)),
            "temporal_statistics": temporal_stats,
            "periodic_patterns": periodic_patterns,
            "burst_patterns": burst_patterns,
        }

    def _calculate_temporal_statistics(
        self, timestamps: pd.DatetimeIndex, cycles: List[DetectedCycle]
    ) -> Dict[str, Any]:
        """
        Calculate comprehensive temporal statistics for cycles.

        Args:
            timestamps: Pandas DatetimeIndex of cycle timestamps
            cycles: List of cycles corresponding to timestamps

        Returns:
            Dictionary with temporal statistics
        """
        if len(timestamps) == 0:
            return {}

        stats = {
            "time_span_days": (timestamps.max() - timestamps.min()).days,
            "first_cycle": timestamps.min().isoformat(),
            "last_cycle": timestamps.max().isoformat(),
            "cycles_per_day": len(timestamps)
            / max(1, (timestamps.max() - timestamps.min()).days),
            "hourly_distribution": {},
            "daily_distribution": {},
            "weekly_distribution": {},
            "monthly_distribution": {},
        }

        # Hourly distribution
        hourly_counts = timestamps.hour.value_counts().sort_index()
        stats["hourly_distribution"] = {
            str(hour): count for hour, count in hourly_counts.items()
        }

        # Daily distribution (day of week)
        daily_counts = timestamps.day_name().value_counts()
        stats["daily_distribution"] = {
            day: count for day, count in daily_counts.items()
        }

        # Weekly distribution (week number)
        weekly_counts = timestamps.isocalendar().week.value_counts().sort_index()
        stats["weekly_distribution"] = {
            f"week_{week}": count for week, count in weekly_counts.items()
        }

        # Monthly distribution
        monthly_counts = timestamps.to_period("M").value_counts().sort_index()
        stats["monthly_distribution"] = {
            str(month): count for month, count in monthly_counts.items()
        }

        # Calculate inter-arrival times
        if len(timestamps) > 1:
            sorted_timestamps = timestamps.sort_values()
            inter_arrival_times = sorted_timestamps.diff().dropna()

            stats["inter_arrival_statistics"] = {
                "mean_hours": inter_arrival_times.mean().total_seconds() / 3600,
                "median_hours": inter_arrival_times.median().total_seconds() / 3600,
                "std_hours": inter_arrival_times.std().total_seconds() / 3600,
                "min_hours": inter_arrival_times.min().total_seconds() / 3600,
                "max_hours": inter_arrival_times.max().total_seconds() / 3600,
            }

        return stats

    def _detect_periodic_patterns(
        self, timestamps: pd.DatetimeIndex, cycles: List[DetectedCycle]
    ) -> List[Dict[str, Any]]:
        """
        Detect periodic patterns in cycle timing.

        Args:
            timestamps: Pandas DatetimeIndex of cycle timestamps
            cycles: List of cycles corresponding to timestamps

        Returns:
            List of detected periodic patterns
        """
        if len(timestamps) < 3:
            return []

        patterns = []

        # Check for daily patterns (same hour of day)
        hourly_counts = timestamps.hour.value_counts()
        peak_hours = hourly_counts[
            hourly_counts >= 3
        ].index.tolist()  # At least 3 occurrences

        for hour in peak_hours:
            hour_cycles = [
                cycle for i, cycle in enumerate(cycles) if timestamps[i].hour == hour
            ]
            patterns.append(
                {
                    "pattern_type": "daily",
                    "description": f"Recurring activity at hour {hour}:00",
                    "frequency": len(hour_cycles),
                    "hour": hour,
                    "cycles": [c.path for c in hour_cycles[:5]],  # Sample of cycles
                }
            )

        # Check for weekly patterns (same day of week)
        daily_counts = timestamps.day_name().value_counts()
        peak_days = daily_counts[
            daily_counts >= 2
        ].index.tolist()  # At least 2 occurrences

        for day in peak_days:
            day_cycles = [
                cycle
                for i, cycle in enumerate(cycles)
                if timestamps[i].day_name() == day
            ]
            patterns.append(
                {
                    "pattern_type": "weekly",
                    "description": f"Recurring activity on {day}s",
                    "frequency": len(day_cycles),
                    "day_of_week": day,
                    "cycles": [c.path for c in day_cycles[:5]],  # Sample of cycles
                }
            )

        # Check for regular intervals
        if len(timestamps) > 2:
            sorted_timestamps = timestamps.sort_values()
            intervals = sorted_timestamps.diff().dropna()

            # Look for common intervals (within 1 hour tolerance)
            interval_hours = intervals.total_seconds() / 3600

            # Group similar intervals
            from collections import Counter

            rounded_intervals = [
                round(h) for h in interval_hours if 1 <= h <= 168
            ]  # 1 hour to 1 week
            interval_counts = Counter(rounded_intervals)

            for interval_h, count in interval_counts.items():
                if count >= 2:  # At least 2 occurrences of this interval
                    patterns.append(
                        {
                            "pattern_type": "interval",
                            "description": f"Regular {interval_h}-hour intervals",
                            "frequency": count,
                            "interval_hours": interval_h,
                            "regularity_score": count / len(intervals),
                        }
                    )

        return patterns

    def _detect_burst_patterns(
        self,
        timestamps: pd.DatetimeIndex,
        cycles: List[DetectedCycle],
        time_window_hours: int,
    ) -> List[Dict[str, Any]]:
        """
        Detect burst patterns (high activity in short periods).

        Args:
            timestamps: Pandas DatetimeIndex of cycle timestamps
            cycles: List of cycles corresponding to timestamps
            time_window_hours: Time window for burst detection

        Returns:
            List of detected burst patterns
        """
        if len(timestamps) < 3:
            return []

        bursts = []
        sorted_timestamps = timestamps.sort_values()

        # Define burst criteria
        min_cycles_for_burst = max(
            3, len(timestamps) // 10
        )  # At least 3 or 10% of total
        burst_window = timedelta(hours=time_window_hours)

        i = 0
        while i < len(sorted_timestamps):
            window_start = sorted_timestamps[i]
            window_end = window_start + burst_window

            # Count cycles in this window
            cycles_in_window = []
            j = i
            while j < len(sorted_timestamps) and sorted_timestamps[j] <= window_end:
                cycles_in_window.append(
                    cycles[sorted_timestamps.get_loc(sorted_timestamps[j])]
                )
                j += 1

            # Check if this constitutes a burst
            if len(cycles_in_window) >= min_cycles_for_burst:
                total_volume = sum(c.total_amount for c in cycles_in_window)
                avg_confidence = sum(
                    c.confidence_score for c in cycles_in_window
                ) / len(cycles_in_window)

                # Get unique entities involved
                entities_involved = set()
                for cycle in cycles_in_window:
                    entities_involved.update(cycle.path)

                bursts.append(
                    {
                        "start_time": window_start.isoformat(),
                        "end_time": window_end.isoformat(),
                        "duration_hours": time_window_hours,
                        "cycle_count": len(cycles_in_window),
                        "total_volume": total_volume,
                        "average_confidence": avg_confidence,
                        "entities_count": len(entities_involved),
                        "entities_involved": list(entities_involved)[
                            :10
                        ],  # Limit for readability
                        "intensity": len(cycles_in_window)
                        / time_window_hours,  # Cycles per hour
                    }
                )

                # Skip ahead to avoid overlapping bursts
                i = j
            else:
                i += 1

        # Sort bursts by intensity (cycles per hour)
        bursts.sort(key=lambda x: x["intensity"], reverse=True)

        return bursts

    def calculate_anomaly_scores(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
    ) -> Dict[str, float]:
        """
        Calculate anomaly scores for entities based on network patterns.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for all nodes

        Returns:
            Dictionary mapping entity names to anomaly scores
        """
        anomaly_scores = {}

        for node in graph.nodes():
            score = 0.0

            # Score based on centrality (high centrality = higher anomaly potential)
            metrics = centrality_metrics.get(node, {})
            centrality_score = (
                metrics.get("betweenness", 0) * 0.4
                + metrics.get("pagerank", 0) * 0.3
                + (metrics.get("total_degree", 0) / max(1, graph.number_of_nodes()))
                * 0.3
            )
            score += centrality_score * 0.5

            # Score based on cycle participation
            cycle_participation = sum(1 for cycle in cycles if node in cycle.path)
            if len(cycles) > 0:
                participation_ratio = cycle_participation / len(cycles)
                score += participation_ratio * 0.3

            # Score based on transaction volume
            node_data = graph.nodes[node]
            total_volume = node_data.get("total_outgoing", 0) + node_data.get(
                "total_incoming", 0
            )
            if total_volume > 0:
                # Normalize by graph's total volume
                graph_total_volume = sum(
                    data.get("total_amount", 0) for _, _, data in graph.edges(data=True)
                )
                if graph_total_volume > 0:
                    volume_ratio = total_volume / graph_total_volume
                    score += min(volume_ratio, 1.0) * 0.2

            anomaly_scores[node] = min(1.0, score)

        return anomaly_scores

    def cluster_entities_by_patterns(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
        clustering_method: str = "dbscan",
        n_clusters: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        Group related entities based on transaction patterns using clustering algorithms.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for all nodes
            clustering_method: 'dbscan', 'kmeans', or 'spectral'
            n_clusters: Number of clusters for methods that require it

        Returns:
            Dictionary with clustering results and analysis
        """
        if graph.number_of_nodes() < 2:
            return {"clusters": {}, "cluster_labels": {}, "cluster_statistics": {}}

        self.logger.info(f"Starting entity clustering using {clustering_method}")

        # Extract features for clustering
        features = self._extract_entity_features(graph, cycles, centrality_metrics)

        if not features:
            return {"clusters": {}, "cluster_labels": {}, "cluster_statistics": {}}

        # Prepare feature matrix
        entity_names = list(features.keys())
        feature_matrix = np.array(
            [list(features[entity].values()) for entity in entity_names]
        )

        # Standardize features
        scaler = StandardScaler()
        feature_matrix_scaled = scaler.fit_transform(feature_matrix)

        # Apply clustering algorithm
        cluster_labels = self._apply_clustering_algorithm(
            feature_matrix_scaled, clustering_method, n_clusters
        )

        # Organize results
        clusters = defaultdict(list)
        cluster_label_map = {}

        for i, entity in enumerate(entity_names):
            label = cluster_labels[i]
            clusters[label].append(entity)
            cluster_label_map[entity] = label

        # Calculate cluster statistics
        cluster_statistics = self._calculate_cluster_statistics(
            clusters, features, graph, cycles
        )

        # Calculate clustering quality metrics
        quality_metrics = self._calculate_clustering_quality(
            feature_matrix_scaled, cluster_labels
        )

        self.logger.info(f"Clustering completed: {len(clusters)} clusters identified")

        return {
            "clusters": dict(clusters),
            "cluster_labels": cluster_label_map,
            "cluster_statistics": cluster_statistics,
            "quality_metrics": quality_metrics,
            "feature_names": (
                list(next(iter(features.values())).keys()) if features else []
            ),
            "clustering_method": clustering_method,
        }

    def _apply_clustering_algorithm(
        self, feature_matrix: np.ndarray, method: str, n_clusters: Optional[int] = None
    ) -> np.ndarray:
        """
        Apply the specified clustering algorithm to the feature matrix.

        Args:
            feature_matrix: Standardized feature matrix
            method: Clustering method ('dbscan', 'kmeans', 'spectral')
            n_clusters: Number of clusters for methods that require it

        Returns:
            Array of cluster labels
        """
        if method == "dbscan":
            # DBSCAN - density-based clustering
            eps = 0.5  # Distance threshold
            min_samples = max(2, int(len(feature_matrix) * 0.05))  # 5% of data points

            clusterer = DBSCAN(eps=eps, min_samples=min_samples)
            labels = clusterer.fit_predict(feature_matrix)

        elif method == "kmeans":
            # K-means clustering
            if n_clusters is None:
                # Estimate optimal number of clusters using elbow method
                n_clusters = min(8, max(2, int(np.sqrt(len(feature_matrix) / 2))))

            clusterer = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = clusterer.fit_predict(feature_matrix)

        elif method == "spectral":
            # Spectral clustering
            if n_clusters is None:
                n_clusters = min(8, max(2, int(np.sqrt(len(feature_matrix) / 2))))

            # Adjust parameters for small datasets
            n_neighbors = (
                min(3, len(feature_matrix) - 1) if len(feature_matrix) > 1 else 1
            )

            clusterer = SpectralClustering(
                n_clusters=n_clusters,
                random_state=42,
                affinity="nearest_neighbors",
                n_neighbors=n_neighbors,
            )
            labels = clusterer.fit_predict(feature_matrix)

        else:
            raise ValueError(f"Unknown clustering method: {method}")

        return labels

    def _calculate_clustering_quality(
        self, feature_matrix: np.ndarray, labels: np.ndarray
    ) -> Dict[str, float]:
        """
        Calculate clustering quality metrics.

        Args:
            feature_matrix: Feature matrix used for clustering
            labels: Cluster labels

        Returns:
            Dictionary with quality metrics
        """
        quality_metrics = {
            "n_clusters": len(set(labels)) - (1 if -1 in labels else 0),
            "noise_points": np.sum(labels == -1),
            "noise_ratio": (
                np.sum(labels == -1) / len(labels) if len(labels) > 0 else 0.0
            ),
        }

        # Calculate silhouette score if we have enough clusters and points
        if (
            quality_metrics["n_clusters"] > 1
            and len(feature_matrix) > quality_metrics["n_clusters"]
            and quality_metrics["noise_ratio"] < 1.0
        ):
            try:
                # Filter out noise points for silhouette calculation
                non_noise_mask = labels != -1
                if np.sum(non_noise_mask) > 1:
                    silhouette = silhouette_score(
                        feature_matrix[non_noise_mask], labels[non_noise_mask]
                    )
                    quality_metrics["silhouette_score"] = silhouette
                else:
                    quality_metrics["silhouette_score"] = 0.0
            except:
                quality_metrics["silhouette_score"] = 0.0
        else:
            quality_metrics["silhouette_score"] = 0.0

        return quality_metrics

    def _extract_entity_features(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
    ) -> Dict[str, Dict[str, float]]:
        """
        Extract features for each entity to use in clustering.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for all nodes

        Returns:
            Dictionary mapping entity names to feature vectors
        """
        features = {}

        for node in graph.nodes():
            node_features = {}

            # Centrality-based features
            metrics = centrality_metrics.get(node, {})
            node_features["betweenness_centrality"] = metrics.get("betweenness", 0.0)
            node_features["closeness_centrality"] = metrics.get("closeness", 0.0)
            node_features["pagerank"] = metrics.get("pagerank", 0.0)
            node_features["in_degree"] = metrics.get("in_degree", 0)
            node_features["out_degree"] = metrics.get("out_degree", 0)
            node_features["total_degree"] = metrics.get("total_degree", 0)

            # Cycle participation features
            cycle_participation = sum(1 for cycle in cycles if node in cycle.path)
            node_features["cycle_participation_count"] = cycle_participation
            node_features["cycle_participation_ratio"] = cycle_participation / max(
                1, len(cycles)
            )

            # Transaction volume features
            node_data = graph.nodes[node]
            node_features["total_outgoing_volume"] = node_data.get(
                "total_outgoing", 0.0
            )
            node_features["total_incoming_volume"] = node_data.get(
                "total_incoming", 0.0
            )
            node_features["total_volume"] = (
                node_features["total_outgoing_volume"]
                + node_features["total_incoming_volume"]
            )

            # Transaction count features
            node_features["outgoing_transaction_count"] = len(
                list(graph.successors(node))
            )
            node_features["incoming_transaction_count"] = len(
                list(graph.predecessors(node))
            )
            node_features["total_transaction_count"] = (
                node_features["outgoing_transaction_count"]
                + node_features["incoming_transaction_count"]
            )

            # Network position features
            try:
                # Calculate clustering coefficient (local connectivity)
                node_features["clustering_coefficient"] = nx.clustering(
                    graph.to_undirected(), node
                )
            except:
                node_features["clustering_coefficient"] = 0.0

            # Temporal features (if cycles have temporal data)
            cycle_dates = []
            for cycle in cycles:
                if node in cycle.path and hasattr(cycle, "first_transaction_date"):
                    cycle_dates.append(cycle.first_transaction_date)

            if cycle_dates:
                cycle_dates = pd.to_datetime(cycle_dates)
                node_features["first_cycle_date"] = cycle_dates.min().timestamp()
                node_features["last_cycle_date"] = cycle_dates.max().timestamp()
                node_features["cycle_date_span"] = (
                    cycle_dates.max() - cycle_dates.min()
                ).total_seconds() / (
                    24 * 3600
                )  # Convert to days
            else:
                node_features["first_cycle_date"] = 0.0
                node_features["last_cycle_date"] = 0.0
                node_features["cycle_date_span"] = 0.0

            features[node] = node_features

        return features

    def _estimate_optimal_clusters(self, feature_matrix: np.ndarray) -> int:
        """
        Estimate optimal number of clusters using elbow method.

        Args:
            feature_matrix: Feature matrix for clustering

        Returns:
            Estimated optimal number of clusters
        """
        max_clusters = min(10, feature_matrix.shape[0] // 2)
        if max_clusters < 2:
            return 2

        inertias = []
        k_range = range(2, max_clusters + 1)

        for k in k_range:
            kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
            kmeans.fit(feature_matrix)
            inertias.append(kmeans.inertia_)

        # Simple elbow detection - find the point with maximum curvature
        if len(inertias) >= 3:
            # Calculate second derivative to find elbow
            second_derivatives = []
            for i in range(1, len(inertias) - 1):
                second_deriv = inertias[i - 1] - 2 * inertias[i] + inertias[i + 1]
                second_derivatives.append(second_deriv)

            if second_derivatives:
                elbow_idx = (
                    np.argmax(second_derivatives) + 1
                )  # +1 because we start from index 1
                return k_range[elbow_idx]

        # Default to middle value if elbow detection fails
        return k_range[len(k_range) // 2]

    def _calculate_cluster_statistics(
        self,
        clusters: Dict[int, List[str]],
        features: Dict[str, Dict[str, float]],
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
    ) -> Dict[int, Dict[str, Any]]:
        """
        Calculate statistics for each cluster.

        Args:
            clusters: Dictionary mapping cluster labels to entity lists
            features: Entity features used for clustering
            graph: NetworkX DiGraph
            cycles: List of detected cycles

        Returns:
            Dictionary with statistics for each cluster
        """
        cluster_stats = {}

        for cluster_id, entities in clusters.items():
            if not entities:
                continue

            stats = {
                "size": len(entities),
                "entities": entities,
                "avg_centrality": {},
                "total_volume": 0.0,
                "cycle_involvement": 0,
                "internal_connections": 0,
                "external_connections": 0,
            }

            # Calculate average centrality metrics
            centrality_sums = defaultdict(float)
            for entity in entities:
                entity_features = features.get(entity, {})
                for metric in [
                    "betweenness_centrality",
                    "closeness_centrality",
                    "degree_centrality",
                    "pagerank",
                ]:
                    centrality_sums[metric] += entity_features.get(metric, 0.0)

            for metric, total in centrality_sums.items():
                stats["avg_centrality"][metric] = total / len(entities)

            # Calculate total volume
            for entity in entities:
                entity_features = features.get(entity, {})
                stats["total_volume"] += entity_features.get(
                    "total_outgoing_volume", 0.0
                )
                stats["total_volume"] += entity_features.get(
                    "total_incoming_volume", 0.0
                )

            # Count cycle involvement
            for cycle in cycles:
                if any(entity in cycle.path for entity in entities):
                    stats["cycle_involvement"] += 1

            # Count internal vs external connections
            entity_set = set(entities)
            for entity in entities:
                for neighbor in graph.neighbors(entity):
                    if neighbor in entity_set:
                        stats["internal_connections"] += 1
                    else:
                        stats["external_connections"] += 1

            # Calculate cluster cohesion (internal connections / total possible internal connections)
            max_internal = len(entities) * (len(entities) - 1)
            stats["cohesion"] = stats["internal_connections"] / max(1, max_internal)

            cluster_stats[cluster_id] = stats

        return cluster_stats

    def _generate_risk_indicators(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
        clustering_results: Optional[Dict[str, Any]],
        temporal_patterns: Optional[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Generate risk indicators based on network analysis."""
        indicators = []

        # High centrality concentration
        centrality_scores = [
            m.get("betweenness", 0) for m in centrality_metrics.values()
        ]
        if centrality_scores and np.std(centrality_scores) > 0.2:
            indicators.append(
                {
                    "type": "centrality_concentration",
                    "severity": "high",
                    "description": "High concentration of transaction flow through few entities",
                    "metric": f"Centrality std dev: {np.std(centrality_scores):.3f}",
                }
            )

        # Rapid round trips
        rapid_cycles = [c for c in cycles if c.duration_days <= 1]
        if len(rapid_cycles) > len(cycles) * 0.3:  # More than 30% are rapid
            indicators.append(
                {
                    "type": "rapid_round_trips",
                    "severity": "medium",
                    "description": "High proportion of same-day round trip transactions",
                    "metric": f"{len(rapid_cycles)}/{len(cycles)} cycles completed within 1 day",
                }
            )

        # Large volume cycles
        if cycles:
            avg_cycle_volume = np.mean([c.total_amount for c in cycles])
            large_cycles = [c for c in cycles if c.total_amount > avg_cycle_volume * 3]
            if large_cycles:
                indicators.append(
                    {
                        "type": "large_volume_cycles",
                        "severity": "high",
                        "description": "Round trips involving unusually large transaction volumes",
                        "metric": f"{len(large_cycles)} cycles with volume > 3x average",
                    }
                )

        # Synchronized patterns
        if temporal_patterns:
            sync_score = temporal_patterns.get("synchronization_score", 0)
            if sync_score > 0.2:  # More than 20% synchronized
                indicators.append(
                    {
                        "type": "synchronized_activity",
                        "severity": "high",
                        "description": "High level of synchronized transaction timing",
                        "metric": f"Synchronization score: {sync_score:.3f}",
                    }
                )

        return indicators

    def _generate_entity_profile(
        self,
        entity: str,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
    ) -> Dict[str, Any]:
        """Generate detailed profile for a specific entity."""
        profile = {
            "entity_id": entity,
            "centrality_metrics": centrality_metrics.get(entity, {}),
            "transaction_summary": {},
            "cycle_involvement": {},
            "risk_assessment": {},
        }

        # Transaction summary
        in_edges = list(graph.in_edges(entity, data=True))
        out_edges = list(graph.out_edges(entity, data=True))

        total_incoming = sum(
            sum(tx.get("amount", 0) for tx in data.get("transactions", []))
            for _, _, data in in_edges
        )
        total_outgoing = sum(
            sum(tx.get("amount", 0) for tx in data.get("transactions", []))
            for _, _, data in out_edges
        )

        profile["transaction_summary"] = {
            "total_incoming": total_incoming,
            "total_outgoing": total_outgoing,
            "net_flow": total_outgoing - total_incoming,
            "in_degree": len(in_edges),
            "out_degree": len(out_edges),
            "unique_counterparties": len(
                set([s for s, _, _ in in_edges] + [t for _, t, _ in out_edges])
            ),
        }

        # Cycle involvement
        involving_cycles = [c for c in cycles if entity in c.path]
        profile["cycle_involvement"] = {
            "total_cycles": len(involving_cycles),
            "avg_confidence": (
                np.mean([c.confidence_score for c in involving_cycles])
                if involving_cycles
                else 0
            ),
            "cycle_types": {
                "simple": len(
                    [c for c in involving_cycles if c.cycle_type == "simple"]
                ),
                "complex": len(
                    [c for c in involving_cycles if c.cycle_type == "complex"]
                ),
                "hub_mediated": len(
                    [c for c in involving_cycles if c.cycle_type == "hub-mediated"]
                ),
            },
        }

        # Risk assessment
        metrics = centrality_metrics.get(entity, {})
        risk_score = (
            metrics.get("betweenness", 0) * 0.4
            + metrics.get("pagerank", 0) * 0.3
            + (len(involving_cycles) / max(1, len(cycles))) * 0.3
        )

        profile["risk_assessment"] = {
            "risk_score": min(1.0, risk_score),
            "risk_level": (
                "high" if risk_score > 0.7 else "medium" if risk_score > 0.3 else "low"
            ),
            "key_indicators": [],
        }

        # Add specific risk indicators
        if metrics.get("betweenness", 0) > 0.1:
            profile["risk_assessment"]["key_indicators"].append(
                "High betweenness centrality - acts as bridge"
            )
        if len(involving_cycles) > len(cycles) * 0.1:
            profile["risk_assessment"]["key_indicators"].append(
                "High cycle participation rate"
            )
        if (
            abs(profile["transaction_summary"]["net_flow"])
            < profile["transaction_summary"]["total_incoming"] * 0.1
        ):
            profile["risk_assessment"]["key_indicators"].append(
                "Balanced inflow/outflow - potential layering"
            )

        return profile

    def _analyze_cycle_length_distribution(
        self, cycles: List[DetectedCycle]
    ) -> Dict[int, int]:
        """Analyze distribution of cycle lengths."""
        distribution = defaultdict(int)
        for cycle in cycles:
            length = len(cycle.path) - 1  # Subtract 1 because start/end are same
            distribution[length] += 1
        return dict(distribution)

    def _analyze_cycle_type_distribution(
        self, cycles: List[DetectedCycle]
    ) -> Dict[str, int]:
        """Analyze distribution of cycle types."""
        distribution = defaultdict(int)
        for cycle in cycles:
            distribution[cycle.cycle_type] += 1
        return dict(distribution)

    def _analyze_cycle_confidence_distribution(
        self, cycles: List[DetectedCycle]
    ) -> Dict[str, int]:
        """Analyze distribution of cycle confidence scores."""
        distribution = {"high": 0, "medium": 0, "low": 0}
        for cycle in cycles:
            if cycle.confidence_score > 0.7:
                distribution["high"] += 1
            elif cycle.confidence_score > 0.4:
                distribution["medium"] += 1
            else:
                distribution["low"] += 1
        return distribution

    def _analyze_network_topology(self, graph: nx.DiGraph) -> Dict[str, Any]:
        """Analyze network topology characteristics."""
        return {
            "density": nx.density(graph),
            "clustering_coefficient": nx.average_clustering(graph.to_undirected()),
            "assortativity": (
                nx.degree_assortativity_coefficient(graph)
                if graph.number_of_edges() > 0
                else 0
            ),
            "reciprocity": nx.reciprocity(graph),
        }

    def _analyze_flow_patterns(
        self, graph: nx.DiGraph, cycles: List[DetectedCycle]
    ) -> Dict[str, Any]:
        """Analyze transaction flow patterns."""
        patterns = {
            "total_flow_volume": 0,
            "cycle_flow_volume": sum(c.total_amount for c in cycles),
            "avg_transaction_size": 0,
            "flow_concentration": 0,
        }

        # Calculate total flow and average transaction size
        all_amounts = []
        for _, _, data in graph.edges(data=True):
            for tx in data.get("transactions", []):
                amount = tx.get("amount", 0)
                patterns["total_flow_volume"] += amount
                all_amounts.append(amount)

        if all_amounts:
            patterns["avg_transaction_size"] = np.mean(all_amounts)
            # Flow concentration (Gini coefficient approximation)
            sorted_amounts = sorted(all_amounts)
            n = len(sorted_amounts)
            patterns["flow_concentration"] = (
                2 * sum(i * amount for i, amount in enumerate(sorted_amounts, 1))
            ) / (n * sum(sorted_amounts)) - (n + 1) / n

        return patterns

    def _generate_recommendations(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
        clustering_results: Optional[Dict[str, Any]],
        temporal_patterns: Optional[Dict[str, Any]],
    ) -> List[Dict[str, str]]:
        """Generate investigation recommendations based on analysis."""
        recommendations = []

        # High-priority entities
        high_centrality_entities = [
            entity
            for entity, metrics in centrality_metrics.items()
            if metrics.get("betweenness", 0) > 0.1 or metrics.get("pagerank", 0) > 0.1
        ]

        if high_centrality_entities:
            recommendations.append(
                {
                    "priority": "high",
                    "category": "entity_investigation",
                    "description": f"Investigate {len(high_centrality_entities)} high-centrality entities that may be facilitating money laundering",
                    "action": f"Focus on entities: {', '.join(high_centrality_entities[:5])}",
                }
            )

        # High-confidence cycles
        high_confidence_cycles = [c for c in cycles if c.confidence_score > 0.8]
        if high_confidence_cycles:
            recommendations.append(
                {
                    "priority": "high",
                    "category": "transaction_review",
                    "description": f"Review {len(high_confidence_cycles)} high-confidence round trip patterns",
                    "action": "Examine transaction details and timing for potential structuring or layering",
                }
            )

        # Synchronized patterns
        if (
            temporal_patterns
            and temporal_patterns.get("synchronization_score", 0) > 0.3
        ):
            recommendations.append(
                {
                    "priority": "medium",
                    "category": "temporal_analysis",
                    "description": "Investigate synchronized transaction patterns that may indicate coordination",
                    "action": "Analyze timing patterns and look for external triggers or coordination mechanisms",
                }
            )

        # Clustering insights
        if clustering_results:
            clusters = clustering_results.get("clusters", {})
            large_clusters = [c for c in clusters.values() if len(c) > 5]
            if large_clusters:
                recommendations.append(
                    {
                        "priority": "medium",
                        "category": "network_analysis",
                        "description": f"Investigate {len(large_clusters)} large entity clusters with similar transaction patterns",
                        "action": "Look for common ownership, control, or coordination among clustered entities",
                    }
                )

        # Performance recommendations
        if graph.number_of_nodes() > 500:
            recommendations.append(
                {
                    "priority": "low",
                    "category": "system_optimization",
                    "description": "Consider implementing performance optimizations for large network analysis",
                    "action": "Enable caching and consider sampling strategies for very large datasets",
                }
            )

        return recommendations

    def calculate_network_statistics(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
    ) -> Dict[str, Any]:
        """
        Calculate comprehensive network statistics for reporting and analysis.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for all nodes

        Returns:
            Dictionary with comprehensive network statistics
        """
        stats = {
            "basic_metrics": {},
            "connectivity_metrics": {},
            "cycle_metrics": {},
            "centrality_summary": {},
            "temporal_metrics": {},
            "volume_metrics": {},
        }

        # Basic network metrics
        stats["basic_metrics"] = {
            "total_nodes": graph.number_of_nodes(),
            "total_edges": graph.number_of_edges(),
            "density": nx.density(graph),
            "is_strongly_connected": nx.is_strongly_connected(graph),
            "is_weakly_connected": nx.is_weakly_connected(graph),
            "number_of_strongly_connected_components": nx.number_strongly_connected_components(
                graph
            ),
            "number_of_weakly_connected_components": nx.number_weakly_connected_components(
                graph
            ),
        }

        # Connectivity metrics
        if graph.number_of_nodes() > 0:
            try:
                # Calculate average shortest path length for largest component
                if nx.is_weakly_connected(graph):
                    undirected_graph = graph.to_undirected()
                    stats["connectivity_metrics"]["average_shortest_path_length"] = (
                        nx.average_shortest_path_length(undirected_graph)
                    )
                    stats["connectivity_metrics"]["diameter"] = nx.diameter(
                        undirected_graph
                    )
                    stats["connectivity_metrics"]["radius"] = nx.radius(
                        undirected_graph
                    )
                else:
                    # Use largest weakly connected component
                    largest_wcc = max(nx.weakly_connected_components(graph), key=len)
                    subgraph = graph.subgraph(largest_wcc).to_undirected()

                    if len(subgraph) > 1:
                        stats["connectivity_metrics"][
                            "average_shortest_path_length"
                        ] = nx.average_shortest_path_length(subgraph)
                        stats["connectivity_metrics"]["diameter"] = nx.diameter(
                            subgraph
                        )
                        stats["connectivity_metrics"]["radius"] = nx.radius(subgraph)
                    else:
                        stats["connectivity_metrics"][
                            "average_shortest_path_length"
                        ] = 0.0
                        stats["connectivity_metrics"]["diameter"] = 0
                        stats["connectivity_metrics"]["radius"] = 0

                # Calculate clustering coefficient
                undirected_graph = graph.to_undirected()
                stats["connectivity_metrics"]["average_clustering_coefficient"] = (
                    nx.average_clustering(undirected_graph)
                )

            except (nx.NetworkXError, ValueError):
                stats["connectivity_metrics"] = {
                    "average_shortest_path_length": 0.0,
                    "diameter": 0,
                    "radius": 0,
                    "average_clustering_coefficient": 0.0,
                }

        # Cycle metrics
        stats["cycle_metrics"] = {
            "total_cycles_detected": len(cycles),
            "cycle_types": {
                "simple": len([c for c in cycles if c.cycle_type == "simple"]),
                "complex": len([c for c in cycles if c.cycle_type == "complex"]),
                "hub_mediated": len(
                    [c for c in cycles if c.cycle_type == "hub-mediated"]
                ),
            },
            "cycle_length_distribution": {},
            "average_cycle_confidence": 0.0,
            "total_cycle_volume": 0.0,
            "average_cycle_duration": 0.0,
        }

        if cycles:
            # Cycle length distribution
            cycle_lengths = [
                len(set(cycle.path)) - 1 for cycle in cycles
            ]  # Unique entities
            for length in set(cycle_lengths):
                stats["cycle_metrics"]["cycle_length_distribution"][length] = (
                    cycle_lengths.count(length)
                )

            # Average metrics
            stats["cycle_metrics"]["average_cycle_confidence"] = sum(
                cycle.confidence_score for cycle in cycles
            ) / len(cycles)
            stats["cycle_metrics"]["total_cycle_volume"] = sum(
                cycle.total_amount for cycle in cycles
            )
            stats["cycle_metrics"]["average_cycle_duration"] = sum(
                cycle.duration_days for cycle in cycles
            ) / len(cycles)

        # Centrality summary
        if centrality_metrics:
            centrality_values = {
                "betweenness": [
                    metrics.get("betweenness", 0)
                    for metrics in centrality_metrics.values()
                ],
                "closeness": [
                    metrics.get("closeness", 0)
                    for metrics in centrality_metrics.values()
                ],
                "pagerank": [
                    metrics.get("pagerank", 0)
                    for metrics in centrality_metrics.values()
                ],
                "degree": [
                    metrics.get("total_degree", 0)
                    for metrics in centrality_metrics.values()
                ],
            }

            for centrality_type, values in centrality_values.items():
                if values:
                    stats["centrality_summary"][centrality_type] = {
                        "mean": np.mean(values),
                        "std": np.std(values),
                        "min": np.min(values),
                        "max": np.max(values),
                        "median": np.median(values),
                    }

        # Temporal metrics
        if cycles:
            cycle_dates = []
            for cycle in cycles:
                if (
                    hasattr(cycle, "first_transaction_date")
                    and cycle.first_transaction_date
                ):
                    cycle_dates.append(cycle.first_transaction_date)

            if cycle_dates:
                cycle_dates = pd.to_datetime(cycle_dates)
                stats["temporal_metrics"] = {
                    "analysis_time_span_days": (
                        cycle_dates.max() - cycle_dates.min()
                    ).days,
                    "first_cycle_date": cycle_dates.min().isoformat(),
                    "last_cycle_date": cycle_dates.max().isoformat(),
                    "cycles_per_day": len(cycles)
                    / max(1, (cycle_dates.max() - cycle_dates.min()).days),
                }

        # Volume metrics
        total_graph_volume = 0.0
        volume_distribution = []

        for _, _, edge_data in graph.edges(data=True):
            edge_volume = edge_data.get("total_amount", 0.0)
            total_graph_volume += edge_volume
            volume_distribution.append(edge_volume)

        if volume_distribution:
            stats["volume_metrics"] = {
                "total_network_volume": total_graph_volume,
                "average_transaction_amount": np.mean(volume_distribution),
                "median_transaction_amount": np.median(volume_distribution),
                "volume_std": np.std(volume_distribution),
                "max_transaction_amount": np.max(volume_distribution),
                "min_transaction_amount": np.min(volume_distribution),
            }

        return stats

    def generate_pattern_summary(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
        clustering_results: Optional[Dict[str, Any]] = None,
        temporal_patterns: Optional[Dict[str, Any]] = None,
        anomaly_scores: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        Generate comprehensive pattern summary for investigation reports.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for all nodes
            clustering_results: Results from entity clustering (optional)
            temporal_patterns: Results from temporal pattern analysis (optional)
            anomaly_scores: Anomaly scores for entities (optional)

        Returns:
            Dictionary with comprehensive pattern summary
        """
        summary = {
            "executive_summary": {},
            "key_findings": [],
            "suspicious_patterns": [],
            "entity_analysis": {},
            "risk_assessment": {},
            "recommendations": [],
        }

        # Executive summary
        summary["executive_summary"] = {
            "total_entities_analyzed": graph.number_of_nodes(),
            "total_transactions_analyzed": graph.number_of_edges(),
            "round_trips_detected": len(cycles),
            "high_risk_entities": 0,
            "analysis_timestamp": datetime.now().isoformat(),
        }

        # Identify high-risk entities
        high_risk_entities = []
        if anomaly_scores:
            high_risk_threshold = 0.7
            high_risk_entities = [
                entity
                for entity, score in anomaly_scores.items()
                if score >= high_risk_threshold
            ]
            summary["executive_summary"]["high_risk_entities"] = len(high_risk_entities)

        # Key findings
        if cycles:
            # Most complex cycles
            complex_cycles = [c for c in cycles if len(set(c.path)) > 3]
            if complex_cycles:
                summary["key_findings"].append(
                    {
                        "type": "complex_round_trips",
                        "count": len(complex_cycles),
                        "description": f"Detected {len(complex_cycles)} complex round trips involving 4+ entities",
                        "severity": "high" if len(complex_cycles) > 5 else "medium",
                    }
                )

            # High-confidence cycles
            high_confidence_cycles = [c for c in cycles if c.confidence_score >= 0.8]
            if high_confidence_cycles:
                summary["key_findings"].append(
                    {
                        "type": "high_confidence_patterns",
                        "count": len(high_confidence_cycles),
                        "description": f"Identified {len(high_confidence_cycles)} high-confidence round trip patterns",
                        "severity": "high",
                    }
                )

            # Large volume cycles
            total_cycle_volume = sum(cycle.total_amount for cycle in cycles)
            if total_cycle_volume > 0:
                large_volume_cycles = [
                    c
                    for c in cycles
                    if c.total_amount >= total_cycle_volume * 0.1  # 10% of total volume
                ]
                if large_volume_cycles:
                    summary["key_findings"].append(
                        {
                            "type": "high_volume_patterns",
                            "count": len(large_volume_cycles),
                            "total_volume": sum(
                                c.total_amount for c in large_volume_cycles
                            ),
                            "description": f"Found {len(large_volume_cycles)} high-volume round trips",
                            "severity": "high",
                        }
                    )

        # Suspicious patterns
        if temporal_patterns and temporal_patterns.get("synchronized_cycles"):
            summary["suspicious_patterns"].append(
                {
                    "pattern_type": "synchronized_transactions",
                    "description": "Multiple round trips occurring within short time windows",
                    "count": len(temporal_patterns["synchronized_cycles"]),
                    "risk_level": "high",
                    "details": temporal_patterns.get("temporal_clusters", []),
                }
            )

        if clustering_results and clustering_results.get("clusters"):
            # Identify suspicious clusters
            suspicious_clusters = []
            for cluster_id, cluster_stats in clustering_results.get(
                "cluster_statistics", {}
            ).items():
                if (
                    cluster_stats.get("cycle_involvement", 0) > 2
                    and cluster_stats.get("size", 0) >= 3
                ):
                    suspicious_clusters.append(
                        {
                            "cluster_id": cluster_id,
                            "size": cluster_stats["size"],
                            "cycle_involvement": cluster_stats["cycle_involvement"],
                            "entities": cluster_stats.get("entities", []),
                        }
                    )

            if suspicious_clusters:
                summary["suspicious_patterns"].append(
                    {
                        "pattern_type": "entity_clustering",
                        "description": "Groups of entities with coordinated round trip activity",
                        "count": len(suspicious_clusters),
                        "risk_level": "medium",
                        "details": suspicious_clusters,
                    }
                )

        # Entity analysis
        hub_entities = self.identify_hub_entities(
            graph, centrality_metrics=centrality_metrics
        )

        summary["entity_analysis"] = {
            "hub_entities": {
                "count": len(hub_entities),
                "entities": hub_entities[:10],  # Top 10 hubs
                "description": "Entities that facilitate multiple transactions and round trips",
            },
            "high_centrality_entities": [],
            "frequent_cycle_participants": [],
        }

        # High centrality entities
        if centrality_metrics:
            high_centrality = [
                (entity, metrics.get("betweenness", 0) + metrics.get("pagerank", 0))
                for entity, metrics in centrality_metrics.items()
            ]
            high_centrality.sort(key=lambda x: x[1], reverse=True)

            summary["entity_analysis"]["high_centrality_entities"] = [
                {"entity": entity, "centrality_score": score}
                for entity, score in high_centrality[:10]
            ]

        # Frequent cycle participants
        if cycles:
            entity_cycle_counts = defaultdict(int)
            for cycle in cycles:
                for entity in set(cycle.path):  # Unique entities in cycle
                    entity_cycle_counts[entity] += 1

            frequent_participants = sorted(
                entity_cycle_counts.items(), key=lambda x: x[1], reverse=True
            )[:10]

            summary["entity_analysis"]["frequent_cycle_participants"] = [
                {"entity": entity, "cycle_count": count}
                for entity, count in frequent_participants
            ]

        # Risk assessment
        risk_factors = []
        risk_score = 0.0

        if len(cycles) > 10:
            risk_factors.append("High number of round trip patterns detected")
            risk_score += 0.3

        if high_risk_entities:
            risk_factors.append(
                f"{len(high_risk_entities)} entities with high anomaly scores"
            )
            risk_score += 0.4

        if (
            temporal_patterns
            and temporal_patterns.get("synchronization_score", 0) > 0.3
        ):
            risk_factors.append("Significant temporal synchronization in transactions")
            risk_score += 0.3

        if len(hub_entities) > graph.number_of_nodes() * 0.1:  # More than 10% are hubs
            risk_factors.append("High concentration of hub entities")
            risk_score += 0.2

        summary["risk_assessment"] = {
            "overall_risk_score": min(1.0, risk_score),
            "risk_level": (
                "high"
                if risk_score >= 0.7
                else "medium" if risk_score >= 0.4 else "low"
            ),
            "risk_factors": risk_factors,
        }

        # Recommendations
        recommendations = []

        if len(cycles) > 0:
            recommendations.append(
                {
                    "priority": "high",
                    "action": "investigate_round_trips",
                    "description": f"Investigate the {len(cycles)} detected round trip patterns for potential money laundering",
                }
            )

        if high_risk_entities:
            recommendations.append(
                {
                    "priority": "high",
                    "action": "review_high_risk_entities",
                    "description": f"Conduct detailed review of {len(high_risk_entities)} high-risk entities",
                    "entities": high_risk_entities[:5],  # Top 5 for immediate action
                }
            )

        if hub_entities:
            recommendations.append(
                {
                    "priority": "medium",
                    "action": "monitor_hub_entities",
                    "description": f"Implement enhanced monitoring for {len(hub_entities)} hub entities",
                    "entities": hub_entities[:5],
                }
            )

        if temporal_patterns and temporal_patterns.get("synchronized_cycles"):
            recommendations.append(
                {
                    "priority": "medium",
                    "action": "investigate_synchronized_patterns",
                    "description": "Investigate synchronized transaction patterns for coordination",
                }
            )

        summary["recommendations"] = recommendations

        return summary

    def generate_investigation_report(
        self,
        analysis_results: NetworkAnalysisResults,
        include_detailed_cycles: bool = True,
        include_entity_details: bool = True,
        max_cycles_to_include: int = 50,
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive investigation report from analysis results.

        Args:
            analysis_results: Complete network analysis results
            include_detailed_cycles: Whether to include detailed cycle information
            include_entity_details: Whether to include detailed entity information
            max_cycles_to_include: Maximum number of cycles to include in detail

        Returns:
            Dictionary with comprehensive investigation report
        """
        report = {
            "report_metadata": {
                "generated_at": datetime.now().isoformat(),
                "analysis_timestamp": analysis_results.analysis_timestamp.isoformat(),
                "report_version": "1.0.0",
                "configuration_used": analysis_results.configuration_used,
            },
            "executive_summary": {},
            "network_overview": {},
            "cycle_analysis": {},
            "entity_analysis": {},
            "risk_assessment": {},
            "detailed_findings": {},
            "recommendations": [],
        }

        # Generate pattern summary
        pattern_summary = self.generate_pattern_summary(
            # Note: We would need the graph here, but it's not stored in NetworkAnalysisResults
            # This is a design limitation that should be addressed
            graph=nx.DiGraph(),  # Placeholder
            cycles=analysis_results.detected_cycles,
            centrality_metrics=analysis_results.centrality_metrics,
            anomaly_scores=analysis_results.anomaly_scores,
        )

        # Populate report sections
        report["executive_summary"] = pattern_summary["executive_summary"]
        report["risk_assessment"] = pattern_summary["risk_assessment"]
        report["recommendations"] = pattern_summary["recommendations"]

        # Network overview
        report["network_overview"] = {
            "total_entities": len(analysis_results.centrality_metrics),
            "hub_entities_count": len(analysis_results.hub_entities),
            "total_cycles_detected": len(analysis_results.detected_cycles),
            "network_statistics": analysis_results.network_statistics,
        }

        # Cycle analysis
        cycles_by_type = defaultdict(list)
        for cycle in analysis_results.detected_cycles:
            cycles_by_type[cycle.cycle_type].append(cycle)

        report["cycle_analysis"] = {
            "summary": {
                "total_cycles": len(analysis_results.detected_cycles),
                "by_type": {
                    cycle_type: len(cycles)
                    for cycle_type, cycles in cycles_by_type.items()
                },
                "average_confidence": (
                    sum(c.confidence_score for c in analysis_results.detected_cycles)
                    / max(1, len(analysis_results.detected_cycles))
                ),
                "total_volume": sum(
                    c.total_amount for c in analysis_results.detected_cycles
                ),
            }
        }

        if include_detailed_cycles:
            # Include top cycles by confidence score
            top_cycles = sorted(
                analysis_results.detected_cycles,
                key=lambda x: x.confidence_score,
                reverse=True,
            )[:max_cycles_to_include]

            report["cycle_analysis"]["detailed_cycles"] = [
                {
                    "path": cycle.path,
                    "cycle_type": cycle.cycle_type,
                    "total_amount": cycle.total_amount,
                    "net_flow": cycle.net_flow,
                    "duration_days": cycle.duration_days,
                    "confidence_score": cycle.confidence_score,
                    "transaction_count": (
                        len(cycle.transactions) if hasattr(cycle, "transactions") else 0
                    ),
                }
                for cycle in top_cycles
            ]

        # Entity analysis
        report["entity_analysis"] = {
            "hub_entities": analysis_results.hub_entities,
            "high_anomaly_entities": [
                {"entity": entity, "anomaly_score": score}
                for entity, score in sorted(
                    analysis_results.anomaly_scores.items(),
                    key=lambda x: x[1],
                    reverse=True,
                )[
                    :20
                ]  # Top 20 by anomaly score
            ],
        }

        if include_entity_details:
            # Add detailed centrality information
            report["entity_analysis"]["centrality_details"] = {
                entity: metrics
                for entity, metrics in analysis_results.centrality_metrics.items()
                if entity in analysis_results.hub_entities
                or analysis_results.anomaly_scores.get(entity, 0) > 0.5
            }

        return report

    def _detect_smurfing_network(
        self, graph: nx.DiGraph, central_entity: str
    ) -> Dict[str, Any]:
        """
        Detect smurfing networks where one entity coordinates multiple small transactions.

        Args:
            graph: NetworkX DiGraph
            central_entity: Potential central coordinator

        Returns:
            Dictionary with smurfing analysis results
        """
        analysis = {
            "is_potential_smurf_hub": False,
            "smurf_accounts": [],
            "coordination_score": 0.0,
            "total_smurf_volume": 0.0,
            "avg_smurf_amount": 0.0,
            "time_clustering_score": 0.0,
        }

        # Get all outgoing connections from central entity
        outgoing_edges = list(graph.out_edges(central_entity, data=True))

        if len(outgoing_edges) < 3:  # Need at least 3 connections for smurfing
            return analysis

        smurf_candidates = []
        total_volume = 0.0
        all_amounts = []
        all_timestamps = []

        for _, target, edge_data in outgoing_edges:
            transactions = edge_data.get("transactions", [])
            if not transactions:
                continue

            # Check if target behaves like a smurf (small, consistent amounts)
            target_amounts = [tx.get("amount", 0) for tx in transactions]
            target_volume = sum(target_amounts)

            # Smurf characteristics: multiple small transactions under thresholds
            under_threshold = sum(1 for amt in target_amounts if amt < 10000)
            if under_threshold > 0 and target_volume < 50000:  # Small total volume
                smurf_candidates.append(
                    {
                        "entity": target,
                        "transaction_count": len(transactions),
                        "total_volume": target_volume,
                        "avg_amount": target_volume / len(transactions),
                        "under_threshold_ratio": under_threshold / len(transactions),
                    }
                )

                total_volume += target_volume
                all_amounts.extend(target_amounts)

                # Collect timestamps for temporal analysis
                for tx in transactions:
                    if tx.get("date"):
                        all_timestamps.append(tx["date"])

        if len(smurf_candidates) >= 3:  # Minimum for smurfing network
            analysis["is_potential_smurf_hub"] = True
            analysis["smurf_accounts"] = smurf_candidates
            analysis["total_smurf_volume"] = total_volume
            analysis["avg_smurf_amount"] = (
                sum(all_amounts) / len(all_amounts) if all_amounts else 0
            )

            # Calculate coordination score based on amount consistency
            if all_amounts:
                amount_cv = pd.Series(all_amounts).std() / pd.Series(all_amounts).mean()
                analysis["coordination_score"] = max(0.0, 1.0 - amount_cv)

            # Calculate temporal clustering (are transactions coordinated in time?)
            if all_timestamps:
                timestamps = pd.to_datetime(all_timestamps)
                # Check if transactions cluster within short time windows
                time_diffs = timestamps.sort_values().diff().dropna()
                short_intervals = sum(
                    1 for diff in time_diffs if diff.total_seconds() < 3600
                )  # Within 1 hour
                analysis["time_clustering_score"] = (
                    short_intervals / len(time_diffs) if len(time_diffs) > 0 else 0
                )

        return analysis

    def _detect_rapid_movement_pattern(
        self, graph: nx.DiGraph, entity: str, time_threshold_hours: int = 24
    ) -> Dict[str, Any]:
        """
        Detect rapid movement patterns where money flows through an entity very quickly.
        This is a key indicator of layering in money laundering.

        Args:
            graph: NetworkX DiGraph
            entity: Entity to analyze
            time_threshold_hours: Maximum time for rapid movement detection

        Returns:
            Dictionary with rapid movement analysis
        """
        analysis = {
            "has_rapid_movement": False,
            "rapid_sequences": [],
            "avg_dwell_time_hours": 0.0,
            "velocity_score": 0.0,
        }

        # Get incoming and outgoing transactions
        incoming_edges = list(graph.in_edges(entity, data=True))
        outgoing_edges = list(graph.out_edges(entity, data=True))

        if not incoming_edges or not outgoing_edges:
            return analysis

        # Collect all transactions with timestamps
        incoming_txs = []
        outgoing_txs = []

        for _, _, edge_data in incoming_edges:
            for tx in edge_data.get("transactions", []):
                if tx.get("date"):
                    incoming_txs.append(tx)

        for _, _, edge_data in outgoing_edges:
            for tx in edge_data.get("transactions", []):
                if tx.get("date"):
                    outgoing_txs.append(tx)

        if not incoming_txs or not outgoing_txs:
            return analysis

        # Sort by timestamp
        incoming_txs.sort(key=lambda x: x["date"])
        outgoing_txs.sort(key=lambda x: x["date"])

        rapid_sequences = []
        dwell_times = []

        # Find rapid in-out sequences
        for in_tx in incoming_txs:
            in_time = pd.to_datetime(in_tx["date"])
            in_amount = in_tx.get("amount", 0)

            # Look for outgoing transactions shortly after
            for out_tx in outgoing_txs:
                out_time = pd.to_datetime(out_tx["date"])
                out_amount = out_tx.get("amount", 0)

                if out_time > in_time:
                    time_diff_hours = (out_time - in_time).total_seconds() / 3600

                    if time_diff_hours <= time_threshold_hours:
                        # Check if amounts are similar (potential layering)
                        amount_similarity = 1.0 - abs(in_amount - out_amount) / max(
                            in_amount, out_amount
                        )

                        if amount_similarity > 0.8:  # 80% similar amounts
                            rapid_sequences.append(
                                {
                                    "in_amount": in_amount,
                                    "out_amount": out_amount,
                                    "dwell_time_hours": time_diff_hours,
                                    "amount_similarity": amount_similarity,
                                    "in_date": in_time.isoformat(),
                                    "out_date": out_time.isoformat(),
                                }
                            )
                            dwell_times.append(time_diff_hours)

        if rapid_sequences:
            analysis["has_rapid_movement"] = True
            analysis["rapid_sequences"] = rapid_sequences
            analysis["avg_dwell_time_hours"] = sum(dwell_times) / len(dwell_times)

            # Calculate velocity score (lower dwell time = higher velocity = more suspicious)
            max_dwell = max(dwell_times)
            analysis["velocity_score"] = 1.0 - (
                analysis["avg_dwell_time_hours"] / max(max_dwell, time_threshold_hours)
            )

        return analysis

    def detect_real_world_patterns(self, graph: nx.DiGraph) -> Dict[str, Any]:
        """
        Comprehensive real-world financial crime pattern detection.

        Args:
            graph: NetworkX DiGraph to analyze

        Returns:
            Dictionary with all detected patterns
        """
        patterns = {
            "structuring_alerts": [],
            "smurfing_networks": [],
            "rapid_movement_entities": [],
            "threshold_avoidance": [],
            "coordination_indicators": [],
        }

        # Analyze each entity for various patterns
        for entity in graph.nodes():
            # Check for smurfing hub behavior
            smurf_analysis = self._detect_smurfing_network(graph, entity)
            if smurf_analysis["is_potential_smurf_hub"]:
                patterns["smurfing_networks"].append(
                    {"hub_entity": entity, "analysis": smurf_analysis}
                )

            # Check for rapid movement patterns
            rapid_analysis = self._detect_rapid_movement_pattern(graph, entity)
            if rapid_analysis["has_rapid_movement"]:
                patterns["rapid_movement_entities"].append(
                    {"entity": entity, "analysis": rapid_analysis}
                )

            # Check for threshold avoidance in outgoing transactions
            outgoing_edges = list(graph.out_edges(entity, data=True))
            all_amounts = []
            for _, _, edge_data in outgoing_edges:
                for tx in edge_data.get("transactions", []):
                    all_amounts.append(tx.get("amount", 0))

        return patterns
