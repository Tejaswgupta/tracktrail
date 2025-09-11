"""
Network Visualization System for Round Trip Analysis

This module implements the NetworkVisualizer class that creates interactive network
visualizations with round trip highlighting, centrality displays, and force-directed layouts.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from network_cycle_detector import DetectedCycle


def make_graph_json_serializable(graph: nx.DiGraph) -> nx.DiGraph:
    """Converts non-serializable attributes in the graph to JSON-compatible types."""

    def serialize_value(value):
        """Recursively serialize values to make them JSON compatible"""
        if isinstance(value, pd.Timestamp):
            return value.isoformat()  # Convert to ISO format string
        elif isinstance(value, np.integer):
            return int(value)  # Convert numpy integers to Python int
        elif isinstance(value, np.floating):
            return float(value)  # Convert numpy floats to Python float
        elif isinstance(value, np.ndarray):
            return value.tolist()  # Convert numpy arrays to lists
        elif isinstance(value, (pd.Timedelta, datetime)):
            return str(value)
        elif isinstance(value, dict):
            return {k: serialize_value(v) for k, v in value.items()}
        elif isinstance(value, (list, tuple)):
            return [serialize_value(item) for item in value]
        elif isinstance(value, set):
            return list(value)
        return value

    # Process node attributes
    for node, attrs in graph.nodes(data=True):
        for key, value in attrs.items():
            graph.nodes[node][key] = serialize_value(value)

    # Process edge attributes
    for u, v, attrs in graph.edges(data=True):
        for key, value in attrs.items():
            graph[u][v][key] = serialize_value(value)

    return graph


@dataclass
class VisualizationConfig:
    """
    Configuration for network visualization parameters with law enforcement-specific styling.

    This enhanced configuration class provides comprehensive styling options for financial
    crime detection visualizations, including:

    - Flow edge colors for different transaction types (rapid, cash, normal, suspicious, etc.)
    - Node styles for different entity types (hub, cash_heavy, rapid_mover, high_risk, etc.)
    - Temporal animation settings for time-based flow analysis
    - Velocity indicators for rapid movement detection
    - Risk-based opacity and border styling
    - Law enforcement-friendly color schemes and patterns

    The configuration supports advanced features like:
    - Animated transaction flows with configurable speed and frame counts
    - Risk score-based visual opacity
    - Velocity-based color coding for smurfing detection
    - Dash patterns for different edge types
    - Border styling for risk level indication
    """

    node_size_range: Tuple[int, int] = (10, 50)
    edge_width_range: Tuple[float, float] = (1.0, 8.0)
    layout_algorithm: str = "spring"  # 'spring', 'circular', 'kamada_kawai'
    show_labels: bool = True
    highlight_cycles: bool = True
    color_scheme: str = "viridis"  # plotly color scheme
    background_color: str = "white"
    cycle_colors: List[str] = None

    # Enhanced flow visualization configuration for law enforcement
    flow_edge_colors: Dict[str, str] = None
    node_styles: Dict[str, Dict] = None

    # Temporal animation configuration
    enable_temporal_animation: bool = False
    animation_speed: float = 1.0  # seconds per frame
    animation_frame_count: int = 50
    show_time_slider: bool = True

    # Velocity indicators configuration
    show_velocity_indicators: bool = True
    velocity_threshold_rapid: float = 10000.0  # amount per day for rapid classification
    velocity_arrow_size: float = 1.5
    velocity_color_scale: str = "Reds"  # plotly color scale for velocity

    # Law enforcement specific styling
    suspicious_pattern_highlight: bool = True
    risk_score_opacity: bool = True  # Use opacity to show risk scores
    law_enforcement_color_scheme: bool = True  # Use LE-friendly colors

    # Edge styling for different transaction types
    edge_dash_patterns: Dict[str, str] = None  # dash patterns for different edge types
    edge_opacity_range: Tuple[float, float] = (0.3, 1.0)

    # Node border and highlighting
    node_border_colors: Dict[str, str] = None
    node_border_widths: Dict[str, float] = None

    # Animation and interaction settings
    hover_highlight_intensity: float = 1.2
    selection_highlight_color: str = "#FFD700"  # Gold for selected nodes
    fade_unselected: bool = True

    def __post_init__(self):
        if self.cycle_colors is None:
            self.cycle_colors = [
                "#FF6B6B",
                "#4ECDC4",
                "#45B7D1",
                "#96CEB4",
                "#FFEAA7",
                "#DDA0DD",
                "#98D8C8",
                "#F7DC6F",
            ]

        if self.flow_edge_colors is None:
            self.flow_edge_colors = {
                "rapid": "#FF4444",  # Red for rapid movements (smurfing)
                "cash": "#FFA500",  # Orange for cash transactions
                "normal": "#CCCCCC",  # Gray for normal transactions
                "suspicious": "#FF69B4",  # Pink for flagged patterns
                "layering": "#8A2BE2",  # Blue-violet for layering patterns
                "integration": "#32CD32",  # Lime green for integration phase
                "structuring": "#DC143C",  # Crimson for structuring activities
            }

        if self.node_styles is None:
            self.node_styles = {
                "hub": {
                    "color": "#FF0000",
                    "size_multiplier": 2.0,
                    "border_width": 3,
                    "border_color": "#8B0000",
                },
                "cash_heavy": {
                    "color": "#FFA500",
                    "border_width": 4,
                    "border_color": "#FF8C00",
                    "size_multiplier": 1.5,
                },
                "rapid_mover": {
                    "color": "#FF4444",
                    "pulse": True,
                    "border_width": 2,
                    "border_color": "#CC0000",
                },
                "normal": {
                    "color": "#4169E1",
                    "size_multiplier": 1.0,
                    "border_width": 1,
                    "border_color": "#1E90FF",
                },
                "high_risk": {
                    "color": "#8B0000",
                    "size_multiplier": 1.8,
                    "border_width": 5,
                    "border_color": "#FF0000",
                },
                "shell_company": {
                    "color": "#800080",
                    "size_multiplier": 1.3,
                    "border_width": 3,
                    "border_color": "#9932CC",
                },
            }

        if self.edge_dash_patterns is None:
            self.edge_dash_patterns = {
                "rapid": "solid",  # Solid line for rapid movements
                "cash": "dash",  # Dashed for cash transactions
                "normal": "solid",  # Solid for normal
                "suspicious": "dot",  # Dotted for suspicious
                "layering": "dashdot",  # Dash-dot for layering
                "structuring": "longdash",  # Long dash for structuring
            }

        if self.node_border_colors is None:
            self.node_border_colors = {
                "high_risk": "#FF0000",
                "medium_risk": "#FFA500",
                "low_risk": "#32CD32",
                "unknown": "#808080",
                "flagged": "#8B0000",
            }

        if self.node_border_widths is None:
            self.node_border_widths = {
                "high_risk": 4.0,
                "medium_risk": 2.5,
                "low_risk": 1.5,
                "unknown": 1.0,
                "flagged": 5.0,
            }

    def get_edge_style(self, transaction_type: str) -> Dict[str, any]:
        """Get complete edge styling for a transaction type"""
        return {
            "color": self.flow_edge_colors.get(
                transaction_type, self.flow_edge_colors["normal"]
            ),
            "dash": self.edge_dash_patterns.get(transaction_type, "solid"),
            "width_multiplier": 1.5
            if transaction_type in ["rapid", "suspicious"]
            else 1.0,
        }

    def get_node_style(self, entity_type: str) -> Dict[str, any]:
        """Get complete node styling for an entity type"""
        base_style = self.node_styles.get(entity_type, self.node_styles["normal"])
        return {**base_style, "opacity": 0.7 if self.risk_score_opacity else 1.0}

    def get_velocity_color(self, velocity: float) -> str:
        """Get color for velocity indicator based on transaction speed"""
        if velocity >= self.velocity_threshold_rapid:
            return self.flow_edge_colors["rapid"]
        elif velocity >= self.velocity_threshold_rapid * 0.5:
            return self.flow_edge_colors["suspicious"]
        else:
            return self.flow_edge_colors["normal"]

    def get_risk_based_opacity(self, risk_score: float) -> float:
        """Get opacity based on risk score (0-1 scale)"""
        if not self.risk_score_opacity:
            return 1.0
        # Higher risk = more opaque
        return self.edge_opacity_range[0] + (
            risk_score * (self.edge_opacity_range[1] - self.edge_opacity_range[0])
        )

    def get_temporal_frame_settings(self, total_timespan_days: int) -> Dict[str, any]:
        """Get temporal animation frame settings based on data timespan"""
        if not self.enable_temporal_animation:
            return {"enabled": False}

        # Adjust frame count based on timespan
        optimal_frames = min(self.animation_frame_count, max(10, total_timespan_days))

        return {
            "enabled": True,
            "frame_count": optimal_frames,
            "frame_duration": self.animation_speed * 1000,  # Convert to milliseconds
            "show_slider": self.show_time_slider,
        }


class NetworkVisualizer:
    """
    Creates interactive network visualizations with round trip highlighting.

    This class provides methods to visualize transaction networks, highlight detected
    cycles, display centrality metrics, and create interactive graphs with drill-down
    capabilities for detailed transaction analysis.
    """

    def __init__(
        self,
        config: Optional[VisualizationConfig] = None,
        logger: Optional[logging.Logger] = None,
    ):
        """
        Initialize the NetworkVisualizer.

        Args:
            config: Visualization configuration parameters
            logger: Optional logger for debugging and monitoring
        """
        self.config = config or VisualizationConfig()
        self.logger = logger or logging.getLogger(__name__)
        self.layout_cache = {}

    def create_entity_network_visualization(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Optional[Dict[str, Dict[str, float]]] = None,
        title: str = "Transaction Network Analysis",
    ):
        """
        Creates an interactive network graph showing only nodes and edges involved in cycles.
        Uses force-directed layout for optimal node positioning.

        Args:
            graph: NetworkX DiGraph to visualize
            cycles: List of detected cycles to highlight
            centrality_metrics: Optional centrality metrics for node sizing
            title: Title for the visualization

        Returns:
            Plotly Figure with interactive network visualization of only cycle-related components
        """
        if graph.number_of_nodes() == 0 or not cycles:
            # Return empty figure if no data or no cycles
            fig = go.Figure()
            fig.add_annotation(
                text="No cycles found for visualization",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        self.logger.info(f"Creating cycle-only visualization for {len(cycles)} cycles")

        # Step 1: Extract all nodes and edges from cycles
        cycle_nodes = set()
        cycle_edges = set()

        for cycle in cycles:
            path = cycle.path  # assuming DetectedCycle has a 'path' attribute
            cycle_nodes.update(path)
            # Add edges along the path
            cycle_edges.update(zip(path, path[1:] + [path[0]]))

        # Step 2: Build subgraph with only cycle-related nodes/edges
        subgraph = graph.subgraph(cycle_nodes).copy()
        # Ensure we only keep the cycle edges
        subgraph_edge_set = set(subgraph.edges())
        filtered_edges = [edge for edge in cycle_edges if edge in subgraph_edge_set]

        # Store edge data before clearing
        edge_data_backup = {}
        for edge in filtered_edges:
            if subgraph.has_edge(*edge):
                edge_data_backup[edge] = subgraph[edge[0]][edge[1]].copy()

        subgraph.clear_edges()
        # Add edges back with their data
        for edge in filtered_edges:
            if edge in edge_data_backup:
                subgraph.add_edge(edge[0], edge[1], **edge_data_backup[edge])
            else:
                subgraph.add_edge(edge[0], edge[1])

        # Step 3: Compute layout on the subgraph
        pos = self._calculate_layout_positions(subgraph)

        edge_traces = self._create_edge_traces(subgraph, pos)

        # Step 4: Create traces for the filtered subgraph
        node_trace, node_info = self._create_node_trace(
            subgraph, pos, centrality_metrics
        )

        # Step 5: Assemble Plotly figure
        fig = go.Figure()

        # Add edge traces first
        for edge_trace in edge_traces:
            fig.add_trace(edge_trace)

        # Then add cycle-highlight traces
        # for cycle_trace in cycle_traces:
        #     fig.add_trace(cycle_trace)

        # Finally, add node trace
        fig.add_trace(node_trace)

        # Step 6: Add directional arrows to show money flow
        arrow_annotations = self._create_arrow_annotations(subgraph, pos)

        # Update layout
        fig.update_layout(
            title=dict(text=title, x=0.5, font=dict(size=20)),
            showlegend=True,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            annotations=arrow_annotations
            + [
                dict(
                    text=f"Highlighted Nodes: {len(cycle_nodes)}, Highlighted Edges: {len(filtered_edges)}, Cycles: {len(cycles)}",
                    showarrow=False,
                    xref="paper",
                    yref="paper",
                    x=0.005,
                    y=-0.002,
                    xanchor="left",
                    yanchor="bottom",
                    font=dict(size=12, color="gray"),
                )
            ],
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            plot_bgcolor=self.config.background_color,
            paper_bgcolor=self.config.background_color,
        )

        return fig

    def create_centrality_visualization(
        self, centrality_data: Dict[str, Dict[str, float]], top_n: int = 20
    ) -> go.Figure:
        """
        Visualizes entity importance through node sizing and coloring.

        Args:
            centrality_data: Dictionary mapping entities to centrality metrics
            top_n: Number of top entities to display

        Returns:
            Plotly Figure with centrality visualization
        """
        if not centrality_data:
            fig = go.Figure()
            fig.add_annotation(
                text="No centrality data available",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            return fig

        self.logger.info(
            f"Creating centrality visualization for {len(centrality_data)} entities"
        )

        # Prepare data for visualization
        entities = []
        betweenness_scores = []
        pagerank_scores = []
        degree_scores = []

        for entity, metrics in centrality_data.items():
            entities.append(entity)
            betweenness_scores.append(metrics.get("betweenness", 0))
            pagerank_scores.append(metrics.get("pagerank", 0))
            degree_scores.append(metrics.get("total_degree", 0))

        # Sort by combined centrality score and take top N
        combined_scores = []
        for i in range(len(entities)):
            combined = (
                betweenness_scores[i] * 0.4
                + pagerank_scores[i] * 0.4
                + (degree_scores[i] / max(1, max(degree_scores))) * 0.2
            )
            combined_scores.append(combined)

        # Create DataFrame and sort
        df = pd.DataFrame(
            {
                "Entity": entities,
                "Betweenness": betweenness_scores,
                "PageRank": pagerank_scores,
                "Degree": degree_scores,
                "Combined": combined_scores,
            }
        )

        df = df.sort_values("Combined", ascending=False).head(top_n)

        # Create subplots
        fig = make_subplots(
            rows=2,
            cols=2,
            subplot_titles=(
                "Betweenness Centrality",
                "PageRank Centrality",
                "Degree Centrality",
                "Combined Centrality Score",
            ),
            specs=[
                [{"secondary_y": False}, {"secondary_y": False}],
                [{"secondary_y": False}, {"secondary_y": False}],
            ],
        )

        # Betweenness centrality
        fig.add_trace(
            go.Bar(
                x=df["Entity"][:10],
                y=df["Betweenness"][:10],
                name="Betweenness",
                marker_color="lightblue",
                showlegend=False,
            ),
            row=1,
            col=1,
        )

        # PageRank centrality
        fig.add_trace(
            go.Bar(
                x=df["Entity"][:10],
                y=df["PageRank"][:10],
                name="PageRank",
                marker_color="lightgreen",
                showlegend=False,
            ),
            row=1,
            col=2,
        )

        # Degree centrality
        fig.add_trace(
            go.Bar(
                x=df["Entity"][:10],
                y=df["Degree"][:10],
                name="Degree",
                marker_color="lightcoral",
                showlegend=False,
            ),
            row=2,
            col=1,
        )

        # Combined score
        fig.add_trace(
            go.Bar(
                x=df["Entity"][:10],
                y=df["Combined"][:10],
                name="Combined",
                marker_color="gold",
                showlegend=False,
            ),
            row=2,
            col=2,
        )

        # Update layout
        fig.update_layout(
            title=dict(text="Entity Centrality Analysis", x=0.5, font=dict(size=20)),
            height=800,
            showlegend=False,
        )

        # Rotate x-axis labels for better readability
        fig.update_xaxes(tickangle=45)

        return fig

    def _calculate_layout_positions(
        self, graph: nx.DiGraph
    ) -> Dict[str, Tuple[float, float]]:
        """
        Calculate node positions using force-directed layout algorithms.

        Args:
            graph: NetworkX DiGraph

        Returns:
            Dictionary mapping node names to (x, y) positions
        """
        # Check cache first - convert to strings to handle mixed types
        nodes_str = tuple(sorted(str(node) for node in graph.nodes()))
        edges_str = tuple(sorted(str(edge) for edge in graph.edges()))
        graph_hash = hash(nodes_str + edges_str)
        if graph_hash in self.layout_cache:
            return self.layout_cache[graph_hash]

        # Calculate positions based on layout algorithm
        if self.config.layout_algorithm == "spring":
            pos = nx.spring_layout(graph, k=1, iterations=50, seed=42)
        elif self.config.layout_algorithm == "circular":
            pos = nx.circular_layout(graph)
        elif self.config.layout_algorithm == "kamada_kawai":
            try:
                pos = nx.kamada_kawai_layout(graph)
            except:
                # Fallback to spring layout if kamada_kawai fails
                pos = nx.spring_layout(graph, k=1, iterations=50, seed=42)
        else:
            # Default to spring layout
            pos = nx.spring_layout(graph, k=1, iterations=50, seed=42)

        # Cache the result
        self.layout_cache[graph_hash] = pos

        return pos

    def _clean_graph_for_json_serialization(self, graph: nx.DiGraph) -> nx.DiGraph:
        """
        Create a cleaned copy of the graph with JSON-serializable data.
        Converts pandas Timestamps and other non-serializable objects to strings.

        Args:
            graph: Original NetworkX DiGraph

        Returns:
            Cleaned NetworkX DiGraph with JSON-serializable data
        """
        import copy

        # Create a deep copy of the graph
        cleaned_graph = copy.deepcopy(graph)

        # Clean node attributes
        for node in cleaned_graph.nodes():
            node_data = cleaned_graph.nodes[node]
            for key, value in node_data.items():
                if hasattr(value, "strftime"):  # pandas Timestamp or datetime
                    node_data[key] = str(value)
                elif isinstance(value, (pd.Timestamp, datetime)):
                    node_data[key] = str(value)

        # Clean edge attributes
        for source, target in cleaned_graph.edges():
            edge_data = cleaned_graph[source][target]
            for key, value in edge_data.items():
                if hasattr(value, "strftime"):  # pandas Timestamp or datetime
                    edge_data[key] = str(value)
                elif isinstance(value, (pd.Timestamp, datetime)):
                    edge_data[key] = str(value)

        return cleaned_graph

    def _create_node_trace(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        centrality_metrics: Optional[Dict[str, Dict[str, float]]] = None,
    ) -> Tuple[go.Scatter, List[str]]:
        """
        Create node trace for plotly visualization.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            centrality_metrics: Optional centrality metrics for sizing

        Returns:
            Tuple of (node trace, node info list)
        """
        node_x = []
        node_y = []
        node_info = []
        node_sizes = []
        node_colors = []

        for node in graph.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)

            # Get node data
            node_data = graph.nodes[node]

            # Calculate node size based on centrality or degree
            if centrality_metrics and node in centrality_metrics:
                metrics = centrality_metrics[node]
                # Use combined centrality score for sizing
                centrality_score = (
                    metrics.get("betweenness", 0) * 0.4
                    + metrics.get("pagerank", 0) * 0.4
                    + (metrics.get("total_degree", 0) / max(1, graph.number_of_nodes()))
                    * 0.2
                )
                size = self.config.node_size_range[0] + (
                    centrality_score
                    * (self.config.node_size_range[1] - self.config.node_size_range[0])
                )
                node_sizes.append(
                    max(
                        self.config.node_size_range[0],
                        min(self.config.node_size_range[1], size),
                    )
                )
                node_colors.append(centrality_score)
            else:
                # Use degree for sizing
                degree = graph.degree(node)
                max_degree = (
                    max(dict(graph.degree()).values())
                    if graph.number_of_nodes() > 0
                    else 1
                )
                normalized_degree = degree / max(1, max_degree)
                size = self.config.node_size_range[0] + (
                    normalized_degree
                    * (self.config.node_size_range[1] - self.config.node_size_range[0])
                )
                node_sizes.append(size)
                node_colors.append(normalized_degree)

            # Create hover info
            info_lines = [
                f"Entity: {node}",
                f"Connections: {graph.degree(node)}",
                f"In-degree: {graph.in_degree(node)}",
                f"Out-degree: {graph.out_degree(node)}",
                f"Total Volume: ₹{node_data.get('total_outgoing', 0) + node_data.get('total_incoming', 0):,.2f}",
            ]

            if centrality_metrics and node in centrality_metrics:
                metrics = centrality_metrics[node]
                info_lines.extend(
                    [
                        f"Betweenness: {metrics.get('betweenness', 0):.3f}",
                        f"PageRank: {metrics.get('pagerank', 0):.3f}",
                    ]
                )

            node_info.append("<br>".join(info_lines))

        # Create node trace
        node_trace = go.Scatter(
            x=node_x,
            y=node_y,
            mode="markers+text" if self.config.show_labels else "markers",
            hoverinfo="text",
            text=[
                str(node)[:15] + "..." if len(str(node)) > 15 else str(node)
                for node in graph.nodes()
            ]
            if self.config.show_labels
            else None,
            textposition="middle center",
            hovertext=node_info,
            marker=dict(
                showscale=True,
                colorscale=self.config.color_scheme,
                reversescale=True,
                color=node_colors,
                size=node_sizes,
                colorbar=dict(
                    thickness=15, len=0.5, x=1.02, title="Centrality<br>Score"
                ),
                line=dict(width=2, color="white"),
            ),
            name="Entities",
        )

        return node_trace, node_info

    def _create_edge_traces(
        self, graph: nx.DiGraph, pos: Dict[str, Tuple[float, float]]
    ) -> List[go.Scatter]:
        """
        Create edge traces with curved lines for bidirectional flows.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions

        Returns:
            List of edge traces including curved paths for bidirectional flows
        """
        edge_traces = []
        processed_pairs = set()

        for edge in graph.edges():
            node_a, node_b = edge[0], edge[1]

            # Skip if we've already processed this pair
            pair_key = tuple(sorted([node_a, node_b]))
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)

            x0, y0 = pos[node_a]
            x1, y1 = pos[node_b]

            # Check for bidirectional flow
            has_forward = graph.has_edge(node_a, node_b)
            has_reverse = graph.has_edge(node_b, node_a)

            if has_forward and has_reverse:
                # Create curved traces for bidirectional flow
                edge_traces.extend(
                    self._create_bidirectional_edge_traces(
                        graph, node_a, node_b, x0, y0, x1, y1
                    )
                )
            elif has_forward:
                # Create straight trace for unidirectional flow
                edge_traces.append(
                    self._create_unidirectional_edge_trace(
                        graph, node_a, node_b, x0, y0, x1, y1
                    )
                )

        return edge_traces

    def _create_bidirectional_edge_traces(
        self,
        graph: nx.DiGraph,
        node_a: str,
        node_b: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
    ) -> List[go.Scatter]:
        """Create curved edge traces for bidirectional flows."""
        import math

        traces = []

        # Calculate curve parameters
        dx = x1 - x0
        dy = y1 - y0
        length = math.sqrt(dx**2 + dy**2)

        # Perpendicular vector for curve offset
        perp_x = -dy / length
        perp_y = dx / length
        curve_offset = length * 0.25  # Increased for more pronounced curves

        # Create curved trace for A → B (upper curve)
        if graph.has_edge(node_a, node_b):
            edge_data = graph[node_a][node_b]
            total_amount = edge_data.get("total_amount", 0)
            transaction_count = edge_data.get("transaction_count", 0)

            # Calculate curved path points
            mid_x = (x0 + x1) / 2 + perp_x * curve_offset
            mid_y = (y0 + y1) / 2 + perp_y * curve_offset

            # Create smooth curve using multiple points
            curve_x, curve_y = self._generate_curve_points(x0, y0, mid_x, mid_y, x1, y1)

            # Line width based on amount
            line_width = 1 + min(3, total_amount / 200000)

            trace = go.Scatter(
                x=curve_x,
                y=curve_y,
                line=dict(
                    width=line_width, color="rgba(70, 130, 180, 0.6)"
                ),  # Steel blue
                hoverinfo="text",
                hovertext=f"Outward: {node_a} → {node_b}<br>Amount: ₹{total_amount:,.2f}<br>Transactions: {transaction_count}",
                mode="lines",
                name="Outward Flow",
                showlegend=False,
            )
            traces.append(trace)

        # Create curved trace for B → A (lower curve)
        if graph.has_edge(node_b, node_a):
            edge_data = graph[node_b][node_a]
            total_amount = edge_data.get("total_amount", 0)
            transaction_count = edge_data.get("transaction_count", 0)

            # Calculate curved path points (opposite curve)
            mid_x = (x0 + x1) / 2 - perp_x * curve_offset
            mid_y = (y0 + y1) / 2 - perp_y * curve_offset

            # Create smooth curve using multiple points (reverse direction)
            curve_x, curve_y = self._generate_curve_points(x1, y1, mid_x, mid_y, x0, y0)

            # Line width based on amount
            line_width = 1 + min(3, total_amount / 200000)

            trace = go.Scatter(
                x=curve_x,
                y=curve_y,
                line=dict(
                    width=line_width, color="rgba(34, 139, 34, 0.6)"
                ),  # Forest green
                hoverinfo="text",
                hovertext=f"Inward: {node_b} → {node_a}<br>Amount: ₹{total_amount:,.2f}<br>Transactions: {transaction_count}",
                mode="lines",
                name="Inward Flow",
                showlegend=False,
            )
            traces.append(trace)

        return traces

    def _create_unidirectional_edge_trace(
        self,
        graph: nx.DiGraph,
        node_a: str,
        node_b: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
    ) -> go.Scatter:
        """Create straight edge trace for unidirectional flow."""

        edge_data = graph[node_a][node_b]
        total_amount = edge_data.get("total_amount", 0)
        transaction_count = edge_data.get("transaction_count", 0)

        # Line width based on amount
        line_width = 1 + min(3, total_amount / 200000)

        return go.Scatter(
            x=[x0, x1, None],
            y=[y0, y1, None],
            line=dict(width=line_width, color="lightgray"),
            hoverinfo="text",
            hovertext=f"From: {node_a}<br>To: {node_b}<br>Amount: ₹{total_amount:,.2f}<br>Transactions: {transaction_count}",
            mode="lines",
            name="Transaction",
            showlegend=False,
        )

    def _generate_curve_points(
        self,
        x0: float,
        y0: float,
        mx: float,
        my: float,
        x1: float,
        y1: float,
        num_points: int = 20,
    ) -> tuple:
        """Generate smooth curve points using quadratic Bezier curve."""

        curve_x = []
        curve_y = []

        for i in range(num_points + 1):
            t = i / num_points
            # Quadratic Bezier curve formula
            x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t**2 * x1
            y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t**2 * y1
            curve_x.append(x)
            curve_y.append(y)

        curve_x.append(None)  # Add separator for plotly
        curve_y.append(None)

        return curve_x, curve_y

    def _create_arrow_annotations(
        self, graph: nx.DiGraph, pos: Dict[str, Tuple[float, float]]
    ) -> List[dict]:
        """
        Create curved arrow annotations to show bidirectional money flows.
        When there are flows in both directions between nodes, shows them as separate curved arrows.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions

        Returns:
            List of annotation dictionaries for curved arrows
        """
        import math

        annotations = []
        processed_pairs = set()  # Track processed node pairs to avoid duplicates

        for edge in graph.edges():
            node_a, node_b = edge[0], edge[1]

            # Skip if we've already processed this pair
            pair_key = tuple(sorted([node_a, node_b]))
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)

            x0, y0 = pos[node_a]
            x1, y1 = pos[node_b]

            # Calculate edge length and skip very short edges
            dx = x1 - x0
            dy = y1 - y0
            length = math.sqrt(dx**2 + dy**2)

            if length < 0.1:  # Skip very short edges
                continue

            # Check for bidirectional flow
            has_forward = graph.has_edge(node_a, node_b)
            has_reverse = graph.has_edge(node_b, node_a)

            if has_forward and has_reverse:
                # Bidirectional flow - create two curved arrows
                annotations.extend(
                    self._create_bidirectional_arrows(
                        graph, node_a, node_b, x0, y0, x1, y1, length
                    )
                )
            elif has_forward:
                # Unidirectional flow - create single straight arrow
                annotations.append(
                    self._create_unidirectional_arrow(
                        graph, node_a, node_b, x0, y0, x1, y1, length
                    )
                )

        return annotations

    def _create_bidirectional_arrows(
        self,
        graph: nx.DiGraph,
        node_a: str,
        node_b: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        length: float,
    ) -> List[dict]:
        """Create two curved arrows for bidirectional flow."""

        arrows = []

        # Calculate perpendicular offset for curves
        dx = x1 - x0
        dy = y1 - y0

        # Perpendicular vector (rotated 90 degrees)
        perp_x = -dy / length
        perp_y = dx / length

        # Curve offset (adjust this to make curves more/less pronounced)
        curve_offset = length * 0.25  # Increased for more pronounced curves

        # Create arrow for A → B (curved upward)
        if graph.has_edge(node_a, node_b):
            edge_data = graph[node_a][node_b]
            arrow = self._create_curved_arrow(
                x0,
                y0,
                x1,
                y1,
                perp_x * curve_offset,
                perp_y * curve_offset,
                edge_data,
                "outward",
            )
            arrows.append(arrow)

        # Create arrow for B → A (curved downward)
        if graph.has_edge(node_b, node_a):
            edge_data = graph[node_b][node_a]
            arrow = self._create_curved_arrow(
                x1,
                y1,
                x0,
                y0,
                -perp_x * curve_offset,  # Opposite direction for separate curve
                -perp_y * curve_offset,  # Opposite direction for separate curve
                edge_data,
                "inward",
            )
            arrows.append(arrow)

        return arrows

    def _create_curved_arrow(
        self,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        offset_x: float,
        offset_y: float,
        edge_data: dict,
        flow_type: str,
    ) -> dict:
        """Create a single curved arrow annotation following the curve direction."""

        # Calculate curved path control point
        mid_x = (x0 + x1) / 2 + offset_x
        mid_y = (y0 + y1) / 2 + offset_y

        # Position arrow at 70% along the curve using Bezier curve formula
        t = 0.7  # Parameter along curve (0 = start, 1 = end)
        arrow_x = (1 - t) ** 2 * x0 + 2 * (1 - t) * t * mid_x + t**2 * x1
        arrow_y = (1 - t) ** 2 * y0 + 2 * (1 - t) * t * mid_y + t**2 * y1

        # Calculate tangent direction at t=0.7 (derivative of Bezier curve)
        # Derivative: 2(1-t)(mid - start) + 2t(end - mid)
        tangent_x = 2 * (1 - t) * (mid_x - x0) + 2 * t * (x1 - mid_x)
        tangent_y = 2 * (1 - t) * (mid_y - y0) + 2 * t * (y1 - mid_y)

        # Normalize tangent vector
        tangent_length = (tangent_x**2 + tangent_y**2) ** 0.5
        if tangent_length > 0:
            tangent_x /= tangent_length
            tangent_y /= tangent_length

        # Calculate arrow tail position along the tangent
        arrow_length = 0.08
        tail_x = arrow_x - arrow_length * tangent_x
        tail_y = arrow_y - arrow_length * tangent_y

        # Style based on transaction data
        print("-------")
        print(edge_data)
        print("-------")
        total_amount = edge_data.get("total_amount", 0)
        transaction_count = edge_data.get("transaction_count", 1)

        # Color coding with flow type distinction
        if flow_type == "outward":
            if total_amount > 500000:
                arrow_color = "darkred"
            elif total_amount > 100000:
                arrow_color = "red"
            elif total_amount > 50000:
                arrow_color = "orange"
            else:
                arrow_color = "steelblue"
        else:  # inward
            if total_amount > 500000:
                arrow_color = "darkgreen"
            elif total_amount > 100000:
                arrow_color = "green"
            elif total_amount > 50000:
                arrow_color = "yellowgreen"
            else:
                arrow_color = "teal"

        # Size based on amount
        if total_amount > 500000:
            arrow_width = 3
            arrow_size = 2.0
        elif total_amount > 100000:
            arrow_width = 2.5
            arrow_size = 1.8
        elif total_amount > 50000:
            arrow_width = 2
            arrow_size = 1.5
        else:
            arrow_width = 1.5
            arrow_size = 1.2

        # Enhance for high frequency
        if transaction_count > 5:
            arrow_width += 0.5
            arrow_size += 0.2

        # Format amount text
        if total_amount >= 1000000:
            amount_text = f"₹{total_amount / 1000000:.1f}M"
        elif total_amount >= 1000:
            amount_text = f"₹{total_amount / 1000:.0f}K"
        else:
            amount_text = f"₹{total_amount:.0f}"

        # Add transaction count if more than 1
        if transaction_count > 1:
            amount_text += f" ({transaction_count}x)"

        return dict(
            x=arrow_x,
            y=arrow_y,
            ax=tail_x,
            ay=tail_y,
            xref="x",
            yref="y",
            axref="x",
            ayref="y",
            showarrow=True,
            arrowhead=2,
            arrowsize=arrow_size,
            arrowwidth=arrow_width,
            arrowcolor=arrow_color,
            text=amount_text,
            font=dict(size=10, color=arrow_color),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor=arrow_color,
            borderwidth=1,
            opacity=0.9,
        )

    def _create_unidirectional_arrow(
        self,
        graph: nx.DiGraph,
        node_a: str,
        node_b: str,
        x0: float,
        y0: float,
        x1: float,
        y1: float,
        length: float,
    ) -> dict:
        """Create a single straight arrow for unidirectional flow."""

        # Position arrow at 70% along the edge
        arrow_ratio = 0.7
        arrow_x = x0 + arrow_ratio * (x1 - x0)
        arrow_y = y0 + arrow_ratio * (y1 - y0)

        # Arrow tail position
        arrow_length = min(0.08, length * 0.3)
        dx = x1 - x0
        dy = y1 - y0
        tail_x = arrow_x - (arrow_length * dx / length)
        tail_y = arrow_y - (arrow_length * dy / length)

        # Get edge data for styling
        edge_data = graph[node_a][node_b]
        total_amount = edge_data.get("total_amount", 0)
        transaction_count = edge_data.get("transaction_count", 1)

        # Style arrows based on transaction volume
        if total_amount > 500000:
            arrow_color = "darkred"
            arrow_width = 3
            arrow_size = 2.0
        elif total_amount > 100000:
            arrow_color = "red"
            arrow_width = 2.5
            arrow_size = 1.8
        elif total_amount > 50000:
            arrow_color = "orange"
            arrow_width = 2
            arrow_size = 1.5
        else:
            arrow_color = "steelblue"
            arrow_width = 1.5
            arrow_size = 1.2

        if transaction_count > 5:
            arrow_width += 0.5
            arrow_size += 0.2

        # Format amount text
        if total_amount >= 1000000:
            amount_text = f"₹{total_amount / 1000000:.1f}M"
        elif total_amount >= 1000:
            amount_text = f"₹{total_amount / 1000:.0f}K"
        else:
            amount_text = f"₹{total_amount:.0f}"

        # Add transaction count if more than 1
        if transaction_count > 1:
            amount_text += f" ({transaction_count}x)"

        return dict(
            x=arrow_x,
            y=arrow_y,
            ax=tail_x,
            ay=tail_y,
            xref="x",
            yref="y",
            axref="x",
            ayref="y",
            showarrow=True,
            arrowhead=2,
            arrowsize=arrow_size,
            arrowwidth=arrow_width,
            arrowcolor=arrow_color,
            text=amount_text,
            font=dict(size=10, color=arrow_color),
            bgcolor="rgba(255,255,255,0.8)",
            bordercolor=arrow_color,
            borderwidth=1,
            opacity=0.8,
        )

    def _create_cycle_traces(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        cycles: List[DetectedCycle],
    ) -> List[go.Scatter]:
        """
        Create highlighted traces for detected cycles.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            cycles: List of detected cycles

        Returns:
            List of cycle traces
        """
        cycle_traces = []

        for i, cycle in enumerate(cycles[: len(self.config.cycle_colors)]):
            cycle_x = []
            cycle_y = []

            # Create path for the cycle
            cycle_path = cycle.path + [cycle.path[0]]  # Close the cycle

            for j in range(len(cycle_path) - 1):
                source = cycle_path[j]
                target = cycle_path[j + 1]

                if source in pos and target in pos:
                    x0, y0 = pos[source]
                    x1, y1 = pos[target]

                    cycle_x.extend([x0, x1, None])
                    cycle_y.extend([y0, y1, None])

            # Create cycle trace
            color = self.config.cycle_colors[i % len(self.config.cycle_colors)]

            cycle_trace = go.Scatter(
                x=cycle_x,
                y=cycle_y,
                line=dict(width=4, color=color),
                mode="lines",
                name=f"Round Trip {i + 1} (₹{cycle.total_amount:,.0f})",
                hoverinfo="text",
                hovertext=(
                    f"Round Trip {i + 1}<br>"
                    f"Path: {' → '.join(cycle.path)}<br>"
                    f"Total Amount: ₹{cycle.total_amount:,.2f}<br>"
                    f"Net Flow: ₹{cycle.net_flow:,.2f}<br>"
                    f"Duration: {cycle.duration_days} days<br>"
                    f"Confidence: {cycle.confidence_score:.2f}<br>"
                    f"Type: {cycle.cycle_type}"
                ),
                showlegend=True,
            )

            cycle_traces.append(cycle_trace)

        return cycle_traces

    def create_cycle_details_table(self, cycles: List[DetectedCycle]) -> go.Figure:
        """
        Create a detailed table view of detected cycles.

        Args:
            cycles: List of detected cycles

        Returns:
            Plotly Figure with cycle details table
        """
        if not cycles:
            fig = go.Figure()
            fig.add_annotation(
                text="No cycles detected",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            return fig

        # Prepare table data
        cycle_ids = []
        paths = []
        amounts = []
        net_flows = []
        durations = []
        confidence_scores = []
        cycle_types = []

        for i, cycle in enumerate(cycles):
            cycle_ids.append(f"RT-{i + 1:03d}")
            paths.append(" → ".join(cycle.path))
            amounts.append(f"₹{cycle.total_amount:,.2f}")
            net_flows.append(f"₹{cycle.net_flow:,.2f}")
            durations.append(f"{cycle.duration_days} days")
            confidence_scores.append(f"{cycle.confidence_score:.3f}")
            cycle_types.append(cycle.cycle_type.title())

        # Create table
        fig = go.Figure(
            data=[
                go.Table(
                    header=dict(
                        values=[
                            "ID",
                            "Path",
                            "Total Amount",
                            "Net Flow",
                            "Duration",
                            "Confidence",
                            "Type",
                        ],
                        fill_color="lightblue",
                        align="left",
                        font=dict(size=12, color="black"),
                    ),
                    cells=dict(
                        values=[
                            cycle_ids,
                            paths,
                            amounts,
                            net_flows,
                            durations,
                            confidence_scores,
                            cycle_types,
                        ],
                        fill_color="white",
                        align="left",
                        font=dict(size=11),
                    ),
                )
            ]
        )

        fig.update_layout(
            title="Detected Round Trip Cycles - Details",
            height=min(600, 50 + len(cycles) * 30),
        )

        return fig

    def export_visualization(
        self,
        figure: go.Figure,
        filename: str,
        format: str = "html",
        width: int = 1200,
        height: int = 800,
    ) -> str:
        """
        Export visualization to various formats.

        Args:
            figure: Plotly figure to export
            filename: Output filename (without extension)
            format: Export format ('html', 'png', 'svg', 'pdf')
            width: Image width for static formats
            height: Image height for static formats

        Returns:
            Path to exported file
        """
        try:
            if format.lower() == "html":
                output_path = f"{filename}.html"
                figure.write_html(output_path)
            elif format.lower() == "png":
                output_path = f"{filename}.png"
                figure.write_image(
                    output_path, width=width, height=height, format="png"
                )
            elif format.lower() == "svg":
                output_path = f"{filename}.svg"
                figure.write_image(
                    output_path, width=width, height=height, format="svg"
                )
            elif format.lower() == "pdf":
                output_path = f"{filename}.pdf"
                figure.write_image(
                    output_path, width=width, height=height, format="pdf"
                )
            else:
                raise ValueError(f"Unsupported export format: {format}")

            self.logger.info(f"Visualization exported to {output_path}")
            return output_path

        except Exception as e:
            self.logger.error(f"Error exporting visualization: {str(e)}")
            raise

    def create_flow_analysis_visualization(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        title: str = "Money Flow Analysis",
    ) -> go.Figure:
        """
        Creates enhanced money flow visualization with volume-based edge thickness,
        temporal color coding, and rapid movement highlighting.

        Args:
            graph: NetworkX DiGraph to visualize
            cycles: List of detected cycles for highlighting rapid movements
            title: Title for the visualization

        Returns:
            Plotly Figure with enhanced flow visualization
        """
        if graph.number_of_nodes() == 0:
            # Return empty figure for empty graph
            fig = go.Figure()
            fig.add_annotation(
                text="No data available for flow visualization",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        self.logger.info(
            f"Creating flow analysis visualization for graph with {graph.number_of_nodes()} nodes"
        )

        # Calculate layout positions
        pos = self._calculate_layout_positions(graph)

        # Analyze transaction patterns for flow visualization
        flow_data = self._analyze_transaction_flows(graph, cycles)

        # Create enhanced node trace with flow-based styling
        node_trace = self._create_flow_node_trace(graph, pos, flow_data)

        # Create enhanced edge traces with volume and timing
        edge_traces = self._create_flow_edge_traces(graph, pos, flow_data)

        # Create rapid movement highlights
        rapid_traces = self._create_rapid_movement_traces(graph, pos, cycles, flow_data)

        # Create figure
        fig = go.Figure()

        # Add edge traces first (background)
        for edge_trace in edge_traces:
            fig.add_trace(edge_trace)

        # Add rapid movement traces (highlights)
        for rapid_trace in rapid_traces:
            fig.add_trace(rapid_trace)

        # Add node trace (foreground)
        fig.add_trace(node_trace)

        # Add directional arrows to show money flow
        arrow_annotations = self._create_arrow_annotations(graph, pos)

        # Update layout with flow-specific styling
        fig.update_layout(
            title=dict(text=title, x=0.5, font=dict(size=20)),
            showlegend=True,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            annotations=arrow_annotations
            + [
                dict(
                    text=f"Nodes: {graph.number_of_nodes()}, Edges: {graph.number_of_edges()}, Rapid Sequences: {len([c for c in cycles if c.duration_days <= 7])}",
                    showarrow=False,
                    xref="paper",
                    yref="paper",
                    x=0.005,
                    y=-0.002,
                    xanchor="left",
                    yanchor="bottom",
                    font=dict(size=12, color="gray"),
                )
            ],
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            plot_bgcolor=self.config.background_color,
            paper_bgcolor=self.config.background_color,
        )

        return fig

    def _analyze_transaction_flows(
        self, graph: nx.DiGraph, cycles: List[DetectedCycle]
    ) -> Dict[str, Any]:
        """
        Analyze transaction flows to identify patterns for visualization.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles

        Returns:
            Dictionary containing flow analysis data
        """
        flow_data = {
            "edge_volumes": {},
            "edge_velocities": {},
            "rapid_edges": set(),
            "cash_edges": set(),
            "node_flow_types": {},
            "temporal_patterns": {},
        }

        # Analyze edge volumes and calculate normalized thickness
        edge_amounts = []
        for source, target, data in graph.edges(data=True):
            amount = data.get("total_amount", 0)
            edge_amounts.append(amount)
            flow_data["edge_volumes"][(source, target)] = amount

        if edge_amounts:
            max_amount = max(edge_amounts)
            min_amount = min(edge_amounts)
            amount_range = max_amount - min_amount if max_amount > min_amount else 1

            # Normalize edge volumes for thickness scaling
            for (source, target), amount in flow_data["edge_volumes"].items():
                normalized = (amount - min_amount) / amount_range
                flow_data["edge_volumes"][(source, target)] = {
                    "amount": amount,
                    "normalized": normalized,
                    "thickness": self.config.edge_width_range[0]
                    + normalized
                    * (
                        self.config.edge_width_range[1]
                        - self.config.edge_width_range[0]
                    ),
                }

        # Analyze transaction velocities and timing patterns
        for source, target, data in graph.edges(data=True):
            edge_key = (source, target)

            # Calculate transaction velocity (frequency)
            duration_days = data.get("duration_days", 1)
            transaction_count = data.get("transaction_count", 1)
            velocity = transaction_count / max(1, duration_days)

            flow_data["edge_velocities"][edge_key] = {
                "velocity": velocity,
                "duration_days": duration_days,
                "transaction_count": transaction_count,
            }

            # Identify rapid movement patterns (high velocity or short duration)
            if (
                velocity > 1.0 or duration_days <= 3
            ):  # More than 1 transaction per day or very short duration
                flow_data["rapid_edges"].add(edge_key)

            # Identify cash-related transactions
            edge_transactions = data.get("transactions", [])
            if any(
                "cash" in str(tx.get("transaction_type", "")).lower()
                or "withdrawal" in str(tx.get("description", "")).lower()
                for tx in edge_transactions
            ):
                flow_data["cash_edges"].add(edge_key)

        # Analyze node flow characteristics
        for node in graph.nodes():
            in_degree = graph.in_degree(node)
            out_degree = graph.out_degree(node)
            total_degree = in_degree + out_degree

            # Classify nodes based on flow patterns
            if total_degree > 5:  # Hub nodes
                flow_data["node_flow_types"][node] = "hub"
            elif node in [edge[0] for edge in flow_data["cash_edges"]] or node in [
                edge[1] for edge in flow_data["cash_edges"]
            ]:
                flow_data["node_flow_types"][node] = "cash_heavy"
            elif node in [edge[0] for edge in flow_data["rapid_edges"]] or node in [
                edge[1] for edge in flow_data["rapid_edges"]
            ]:
                flow_data["node_flow_types"][node] = "rapid_mover"
            else:
                flow_data["node_flow_types"][node] = "normal"

        # Analyze cycles for rapid movement sequences
        for cycle in cycles:
            if cycle.duration_days <= 7:  # Rapid cycles (smurfing indicators)
                for i in range(len(cycle.path) - 1):
                    edge_key = (cycle.path[i], cycle.path[i + 1])
                    flow_data["rapid_edges"].add(edge_key)

        return flow_data

    def _create_flow_node_trace(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        flow_data: Dict[str, Any],
    ) -> go.Scatter:
        """
        Create node trace with flow-based styling.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            flow_data: Flow analysis data

        Returns:
            Plotly Scatter trace for nodes
        """
        node_x = []
        node_y = []
        node_info = []
        node_sizes = []
        node_colors = []
        node_symbols = []

        # Define flow-based color scheme
        flow_colors = {
            "hub": "#FF4444",  # Red for hub nodes
            "cash_heavy": "#FFA500",  # Orange for cash-heavy nodes
            "rapid_mover": "#FF69B4",  # Pink for rapid movers
            "normal": "#4169E1",  # Blue for normal nodes
        }

        for node in graph.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)

            # Get node data
            node_data = graph.nodes[node]
            flow_type = flow_data["node_flow_types"].get(node, "normal")

            # Calculate node size based on total flow volume
            total_volume = node_data.get("total_outgoing", 0) + node_data.get(
                "total_incoming", 0
            )
            degree = graph.degree(node)

            # Size based on combination of volume and connectivity
            max_degree = (
                max(dict(graph.degree()).values()) if graph.number_of_nodes() > 0 else 1
            )
            normalized_degree = degree / max(1, max_degree)

            size = self.config.node_size_range[0] + (
                normalized_degree
                * (self.config.node_size_range[1] - self.config.node_size_range[0])
            )

            # Increase size for special flow types
            if flow_type == "hub":
                size *= 1.5
            elif flow_type in ["cash_heavy", "rapid_mover"]:
                size *= 1.2

            node_sizes.append(min(self.config.node_size_range[1], size))
            node_colors.append(flow_colors[flow_type])

            # Set symbol based on flow type
            if flow_type == "hub":
                node_symbols.append("diamond")
            elif flow_type == "cash_heavy":
                node_symbols.append("square")
            elif flow_type == "rapid_mover":
                node_symbols.append("triangle-up")
            else:
                node_symbols.append("circle")

            # Create hover info with flow characteristics
            rapid_connections = sum(
                1 for edge in flow_data["rapid_edges"] if node in edge
            )
            cash_connections = sum(
                1 for edge in flow_data["cash_edges"] if node in edge
            )

            info_lines = [
                f"Entity: {node}",
                f"Flow Type: {flow_type.replace('_', ' ').title()}",
                f"Total Connections: {degree}",
                f"In-degree: {graph.in_degree(node)}",
                f"Out-degree: {graph.out_degree(node)}",
                f"Total Volume: ₹{total_volume:,.2f}",
                f"Rapid Connections: {rapid_connections}",
                f"Cash Connections: {cash_connections}",
            ]

            node_info.append("<br>".join(info_lines))

        # Create node trace
        node_trace = go.Scatter(
            x=node_x,
            y=node_y,
            mode="markers+text" if self.config.show_labels else "markers",
            hoverinfo="text",
            text=[
                node[:10] + "..." if len(node) > 10 else node for node in graph.nodes()
            ]
            if self.config.show_labels
            else None,
            textposition="middle center",
            hovertext=node_info,
            marker=dict(
                color=node_colors,
                size=node_sizes,
                symbol=node_symbols,
                line=dict(width=2, color="white"),
            ),
            name="Entities",
            showlegend=False,
        )

        return node_trace

    def _create_flow_edge_traces(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        flow_data: Dict[str, Any],
    ) -> List[go.Scatter]:
        """
        Create edge traces with volume-based thickness and timing-based colors.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            flow_data: Flow analysis data

        Returns:
            List of edge traces
        """
        edge_traces = []

        # Group edges by type for different styling
        normal_edges = []
        rapid_edges = []
        cash_edges = []

        for source, target, data in graph.edges(data=True):
            edge_key = (source, target)
            x0, y0 = pos[source]
            x1, y1 = pos[target]

            edge_info = {
                "coords": ([x0, x1, None], [y0, y1, None]),
                "data": data,
                "volume_info": flow_data["edge_volumes"].get(
                    edge_key, {"thickness": 1.0, "amount": 0}
                ),
                "velocity_info": flow_data["edge_velocities"].get(
                    edge_key, {"velocity": 0, "duration_days": 0}
                ),
            }

            # Categorize edges
            if edge_key in flow_data["rapid_edges"]:
                rapid_edges.append(edge_info)
            elif edge_key in flow_data["cash_edges"]:
                cash_edges.append(edge_info)
            else:
                normal_edges.append(edge_info)

        # Create normal edges trace
        if normal_edges:
            edge_traces.append(
                self._create_edge_trace_by_type(
                    normal_edges, "normal", "#CCCCCC", "Normal Transactions"
                )
            )

        # Create cash edges trace
        if cash_edges:
            edge_traces.append(
                self._create_edge_trace_by_type(
                    cash_edges, "cash", "#FFA500", "Cash Transactions"
                )
            )

        # Create rapid edges trace
        if rapid_edges:
            edge_traces.append(
                self._create_edge_trace_by_type(
                    rapid_edges, "rapid", "#FF4444", "Rapid Movements"
                )
            )

        return edge_traces

    def _create_edge_trace_by_type(
        self, edges: List[Dict], edge_type: str, color: str, name: str
    ) -> go.Scatter:
        """
        Create a single edge trace for a specific type of edges.

        Args:
            edges: List of edge information dictionaries
            edge_type: Type of edges ('normal', 'cash', 'rapid')
            color: Color for the edges
            name: Name for the trace legend

        Returns:
            Plotly Scatter trace for edges
        """
        edge_x = []
        edge_y = []
        edge_widths = []
        hover_texts = []

        for edge in edges:
            coords_x, coords_y = edge["coords"]
            edge_x.extend(coords_x)
            edge_y.extend(coords_y)

            # Get thickness from volume analysis
            thickness = edge["volume_info"].get("thickness", 1.0)
            edge_widths.extend([thickness, thickness, None])

            # Create hover text
            data = edge["data"]
            volume_info = edge["volume_info"]
            velocity_info = edge["velocity_info"]

            hover_text = (
                f"Amount: ₹{volume_info.get('amount', 0):,.2f}<br>"
                f"Transactions: {data.get('transaction_count', 0)}<br>"
                f"Duration: {velocity_info.get('duration_days', 0)} days<br>"
                f"Velocity: {velocity_info.get('velocity', 0):.2f} tx/day<br>"
                f"Type: {edge_type.title()}"
            )
            hover_texts.extend([hover_text, hover_text, None])

        # Determine line style based on edge type
        line_style = dict(width=2, color=color)
        if edge_type == "rapid":
            line_style["dash"] = "dash"  # Dashed lines for rapid movements
        elif edge_type == "cash":
            line_style["dash"] = "dot"  # Dotted lines for cash transactions

        return go.Scatter(
            x=edge_x,
            y=edge_y,
            line=line_style,
            hoverinfo="text",
            hovertext=hover_texts,
            mode="lines",
            name=name,
            showlegend=True,
        )

    def _create_rapid_movement_traces(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        cycles: List[DetectedCycle],
        flow_data: Dict[str, Any],
    ) -> List[go.Scatter]:
        """
        Create highlighted traces for rapid movement sequences (smurfing indicators).

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            cycles: List of detected cycles
            flow_data: Flow analysis data

        Returns:
            List of rapid movement highlight traces
        """
        rapid_traces = []

        # Identify rapid cycles (potential smurfing)
        rapid_cycles = [cycle for cycle in cycles if cycle.duration_days <= 7]

        for i, cycle in enumerate(rapid_cycles[:5]):  # Limit to top 5 for clarity
            cycle_x = []
            cycle_y = []

            # Create path for the rapid cycle
            cycle_path = cycle.path

            for j in range(len(cycle_path) - 1):
                source = cycle_path[j]
                target = cycle_path[j + 1]

                if source in pos and target in pos:
                    x0, y0 = pos[source]
                    x1, y1 = pos[target]

                    cycle_x.extend([x0, x1, None])
                    cycle_y.extend([y0, y1, None])

            # Create rapid movement trace with pulsing effect
            color = "#FF1493"  # Deep pink for rapid movements

            rapid_trace = go.Scatter(
                x=cycle_x,
                y=cycle_y,
                line=dict(width=6, color=color, dash="dashdot"),
                mode="lines",
                name=f"Rapid Sequence {i + 1} ({cycle.duration_days}d)",
                hoverinfo="text",
                hovertext=(
                    f"⚠️ RAPID MOVEMENT DETECTED<br>"
                    f"Path: {' → '.join(cycle.path[:3])}{'...' if len(cycle.path) > 3 else ''}<br>"
                    f"Total Amount: ₹{cycle.total_amount:,.2f}<br>"
                    f"Duration: {cycle.duration_days} days<br>"
                    f"Velocity: {len(cycle.path) / max(1, cycle.duration_days):.1f} hops/day<br>"
                    f"⚠️ POTENTIAL SMURFING INDICATOR"
                ),
                showlegend=True,
                opacity=0.8,
            )

            rapid_traces.append(rapid_trace)

        return rapid_traces

    def create_temporal_flow_animation(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        time_filter_start: Optional[datetime] = None,
        time_filter_end: Optional[datetime] = None,
        velocity_threshold: float = 1.0,
        animation_mode: str = "sequence",
        title: str = "Temporal Flow Analysis",
    ) -> go.Figure:
        """
        Creates temporal flow analysis visualization with chronological sequencing.

        Args:
            graph: NetworkX DiGraph to visualize
            cycles: List of detected cycles for rapid movement analysis
            time_filter_start: Optional start date for filtering transactions
            time_filter_end: Optional end date for filtering transactions
            velocity_threshold: Minimum velocity (transactions/day) to highlight
            animation_mode: 'sequence' for step-by-step or 'continuous' for smooth animation
            title: Title for the visualization

        Returns:
            Plotly Figure with temporal flow visualization and animation controls
        """
        if graph.number_of_nodes() == 0:
            # Return empty figure for empty graph
            fig = go.Figure()
            fig.add_annotation(
                text="No data available for temporal flow analysis",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        self.logger.info(
            f"Creating temporal flow animation for graph with {graph.number_of_nodes()} nodes"
        )

        # Calculate layout positions
        pos = self._calculate_layout_positions(graph)

        # Analyze temporal patterns in the graph
        temporal_data = self._analyze_temporal_patterns(
            graph, cycles, time_filter_start, time_filter_end, velocity_threshold
        )

        # Create time-based animation frames
        animation_frames = self._create_temporal_animation_frames(
            graph, pos, temporal_data, animation_mode
        )

        # Create base visualization
        fig = self._create_base_temporal_visualization(graph, pos, temporal_data, title)

        # Add animation frames
        if animation_frames:
            fig.frames = animation_frames

            # Add animation controls
            fig.update_layout(
                updatemenus=[
                    dict(
                        type="buttons",
                        direction="left",
                        buttons=list(
                            [
                                dict(
                                    args=[
                                        {
                                            "frame": {"duration": 1000, "redraw": True},
                                            "fromcurrent": True,
                                            "transition": {"duration": 300},
                                        }
                                    ],
                                    label="Play",
                                    method="animate",
                                ),
                                dict(
                                    args=[
                                        {
                                            "frame": {"duration": 0, "redraw": True},
                                            "mode": "immediate",
                                            "transition": {"duration": 0},
                                        }
                                    ],
                                    label="Pause",
                                    method="animate",
                                ),
                            ]
                        ),
                        pad={"r": 10, "t": 87},
                        showactive=False,
                        x=0.011,
                        xanchor="right",
                        y=0,
                        yanchor="top",
                    ),
                ],
                sliders=[
                    dict(
                        active=0,
                        yanchor="top",
                        xanchor="left",
                        currentvalue={
                            "font": {"size": 20},
                            "prefix": "Time Period: ",
                            "visible": True,
                            "xanchor": "right",
                        },
                        transition={"duration": 300, "easing": "cubic-in-out"},
                        pad={"b": 10, "t": 50},
                        len=0.9,
                        x=0.1,
                        y=0,
                        steps=[
                            dict(
                                args=[
                                    [frame.name],
                                    {
                                        "frame": {"duration": 300, "redraw": True},
                                        "mode": "immediate",
                                        "transition": {"duration": 300},
                                    },
                                ],
                                label=frame.name,
                                method="animate",
                            )
                            for frame in animation_frames
                        ],
                    )
                ],
            )

        return fig

    def _analyze_temporal_patterns(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        time_filter_start: Optional[datetime],
        time_filter_end: Optional[datetime],
        velocity_threshold: float,
    ) -> Dict[str, Any]:
        """
        Analyze temporal patterns in transaction flows.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            time_filter_start: Optional start date filter
            time_filter_end: Optional end date filter
            velocity_threshold: Velocity threshold for highlighting

        Returns:
            Dictionary containing temporal analysis data
        """
        temporal_data = {
            "time_periods": [],
            "edge_timeline": {},
            "rapid_sequences": [],
            "velocity_analysis": {},
            "filtered_edges": set(),
            "time_range": None,
        }

        # Collect all transaction dates from edges
        all_dates = []
        edge_dates = {}

        for source, target, data in graph.edges(data=True):
            edge_key = (source, target)

            # Get transaction dates from edge data
            edge_transactions = data.get("transactions", [])
            if edge_transactions:
                dates = []
                for tx in edge_transactions:
                    if "date" in tx and pd.notna(tx["date"]):
                        try:
                            if isinstance(tx["date"], str):
                                date = pd.to_datetime(tx["date"])
                            else:
                                date = tx["date"]
                            dates.append(date)
                        except:
                            continue

                if dates:
                    edge_dates[edge_key] = sorted(dates)
                    all_dates.extend(dates)
            else:
                # Fallback to edge-level date information
                first_date = data.get("first_transaction")
                last_date = data.get("last_transaction")

                if first_date and pd.notna(first_date):
                    if isinstance(first_date, str):
                        first_date = pd.to_datetime(first_date)
                    edge_dates[edge_key] = [first_date]
                    all_dates.append(first_date)

                    if last_date and pd.notna(last_date) and last_date != first_date:
                        if isinstance(last_date, str):
                            last_date = pd.to_datetime(last_date)
                        edge_dates[edge_key].append(last_date)
                        all_dates.append(last_date)

        if not all_dates:
            self.logger.warning(
                "No valid transaction dates found for temporal analysis"
            )
            return temporal_data

        # Sort all dates and determine time range
        all_dates = sorted(pd.to_datetime(all_dates))
        data_start = all_dates[0]
        data_end = all_dates[-1]

        # Apply time filters
        if time_filter_start:
            filter_start = max(data_start, pd.to_datetime(time_filter_start))
        else:
            filter_start = data_start

        if time_filter_end:
            filter_end = min(data_end, pd.to_datetime(time_filter_end))
        else:
            filter_end = data_end

        temporal_data["time_range"] = (filter_start, filter_end)

        # Create time periods for animation (weekly or monthly based on range)
        total_days = (filter_end - filter_start).days
        if total_days <= 30:
            # Daily periods for short ranges
            period_delta = pd.Timedelta(days=1)
        elif total_days <= 180:
            # Weekly periods for medium ranges
            period_delta = pd.Timedelta(weeks=1)
        else:
            # Monthly periods for long ranges
            period_delta = pd.Timedelta(days=30)

        current_date = filter_start
        while current_date <= filter_end:
            period_end = min(current_date + period_delta, filter_end)
            temporal_data["time_periods"].append((current_date, period_end))
            current_date = period_end + pd.Timedelta(days=1)

        # Analyze edge timeline and velocities
        for edge_key, dates in edge_dates.items():
            # Filter dates within time range
            filtered_dates = [d for d in dates if filter_start <= d <= filter_end]

            if filtered_dates:
                temporal_data["filtered_edges"].add(edge_key)
                temporal_data["edge_timeline"][edge_key] = filtered_dates

                # Calculate velocity
                if len(filtered_dates) > 1:
                    duration = (max(filtered_dates) - min(filtered_dates)).days
                    velocity = len(filtered_dates) / max(1, duration)
                    temporal_data["velocity_analysis"][edge_key] = {
                        "velocity": velocity,
                        "transaction_count": len(filtered_dates),
                        "duration_days": duration,
                        "first_date": min(filtered_dates),
                        "last_date": max(filtered_dates),
                    }

                    # Check if velocity exceeds threshold
                    if velocity >= velocity_threshold:
                        temporal_data["rapid_sequences"].append(
                            {
                                "edge": edge_key,
                                "velocity": velocity,
                                "dates": filtered_dates,
                                "is_rapid": True,
                            }
                        )

        # Analyze cycles for rapid temporal sequences
        for cycle in cycles:
            if hasattr(cycle, "first_transaction_date") and hasattr(
                cycle, "last_transaction_date"
            ):
                cycle_start = cycle.first_transaction_date
                cycle_end = cycle.last_transaction_date

                if (
                    cycle_start
                    and cycle_end
                    and filter_start <= cycle_start <= filter_end
                    and filter_start <= cycle_end <= filter_end
                ):
                    cycle_duration = (cycle_end - cycle_start).days
                    cycle_velocity = len(cycle.path) / max(1, cycle_duration)

                    if cycle_velocity >= velocity_threshold or cycle_duration <= 7:
                        temporal_data["rapid_sequences"].append(
                            {
                                "cycle": cycle,
                                "velocity": cycle_velocity,
                                "duration": cycle_duration,
                                "is_cycle": True,
                                "is_rapid": True,
                            }
                        )

        return temporal_data

    def _create_temporal_animation_frames(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        temporal_data: Dict[str, Any],
        animation_mode: str,
    ) -> List[go.Frame]:
        """
        Create animation frames for temporal flow visualization.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            temporal_data: Temporal analysis data
            animation_mode: Animation mode ('sequence' or 'continuous')

        Returns:
            List of Plotly animation frames
        """
        frames = []
        time_periods = temporal_data["time_periods"]
        edge_timeline = temporal_data["edge_timeline"]
        rapid_sequences = temporal_data["rapid_sequences"]

        if not time_periods:
            return frames

        for i, (period_start, period_end) in enumerate(time_periods):
            frame_name = f"{period_start.strftime('%Y-%m-%d')} to {period_end.strftime('%Y-%m-%d')}"

            # Find active edges for this time period
            active_edges = []
            rapid_edges = []

            for edge_key, dates in edge_timeline.items():
                # Check if any transactions fall within this period
                period_dates = [d for d in dates if period_start <= d <= period_end]

                if period_dates:
                    active_edges.append(
                        {
                            "edge": edge_key,
                            "dates": period_dates,
                            "transaction_count": len(period_dates),
                        }
                    )

                    # Check if this is a rapid sequence
                    for seq in rapid_sequences:
                        if "edge" in seq and seq["edge"] == edge_key:
                            rapid_edges.append(
                                {
                                    "edge": edge_key,
                                    "velocity": seq["velocity"],
                                    "dates": period_dates,
                                }
                            )

            # Create frame data
            frame_data = self._create_frame_visualization_data(
                graph, pos, active_edges, rapid_edges, period_start, period_end
            )

            frame = go.Frame(
                data=frame_data,
                name=frame_name,
                layout=dict(
                    title=f"Temporal Flow Analysis - {frame_name}",
                    annotations=[
                        dict(
                            text=f"Active Transactions: {len(active_edges)} | Rapid Sequences: {len(rapid_edges)}",
                            showarrow=False,
                            xref="paper",
                            yref="paper",
                            x=0.005,
                            y=-0.002,
                            xanchor="left",
                            yanchor="bottom",
                            font=dict(size=12, color="gray"),
                        )
                    ],
                ),
            )

            frames.append(frame)

        return frames

    def _create_frame_visualization_data(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        active_edges: List[Dict],
        rapid_edges: List[Dict],
        period_start: datetime,
        period_end: datetime,
    ) -> List[go.Scatter]:
        """
        Create visualization data for a single animation frame.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            active_edges: List of active edges in this time period
            rapid_edges: List of rapid edges in this time period
            period_start: Start of time period
            period_end: End of time period

        Returns:
            List of Plotly traces for the frame
        """
        traces = []

        # Create node trace (always visible)
        node_x = []
        node_y = []
        node_info = []
        node_sizes = []
        node_colors = []

        # Track node activity in this period
        active_nodes = set()
        for edge_info in active_edges:
            edge = edge_info["edge"]
            active_nodes.add(edge[0])
            active_nodes.add(edge[1])

        for node in graph.nodes():
            x, y = pos[node]
            node_x.append(x)
            node_y.append(y)

            # Determine node activity and styling
            is_active = node in active_nodes
            node_data = graph.nodes[node]

            # Size based on activity
            base_size = 15
            if is_active:
                # Count transactions involving this node in current period
                node_activity = sum(
                    edge_info["transaction_count"]
                    for edge_info in active_edges
                    if node in edge_info["edge"]
                )
                size = base_size + min(20, node_activity * 2)
                color = 1.0  # Active nodes are bright
            else:
                size = base_size * 0.6
                color = 0.2  # Inactive nodes are dim

            node_sizes.append(size)
            node_colors.append(color)

            # Create hover info
            activity_info = "Active" if is_active else "Inactive"
            node_transactions = sum(
                edge_info["transaction_count"]
                for edge_info in active_edges
                if node in edge_info["edge"]
            )

            info_lines = [
                f"Entity: {node}",
                f"Status: {activity_info}",
                f"Period Transactions: {node_transactions}",
                f"Total Connections: {graph.degree(node)}",
            ]

            node_info.append("<br>".join(info_lines))

        # Add node trace
        node_trace = go.Scatter(
            x=node_x,
            y=node_y,
            mode="markers+text",
            text=[
                node[:10] + "..." if len(node) > 10 else node for node in graph.nodes()
            ],
            textposition="middle center",
            hovertext=node_info,
            hoverinfo="text",
            marker=dict(
                size=node_sizes,
                color=node_colors,
                colorscale="Viridis",
                showscale=False,
                line=dict(width=1, color="white"),
            ),
            name="Entities",
            showlegend=False,
        )
        traces.append(node_trace)

        # Create active edge traces
        if active_edges:
            normal_edge_x = []
            normal_edge_y = []
            normal_edge_info = []

            for edge_info in active_edges:
                edge = edge_info["edge"]
                source, target = edge

                if source in pos and target in pos:
                    x0, y0 = pos[source]
                    x1, y1 = pos[target]

                    normal_edge_x.extend([x0, x1, None])
                    normal_edge_y.extend([y0, y1, None])

                    # Create hover info
                    hover_text = (
                        f"From: {source}<br>"
                        f"To: {target}<br>"
                        f"Period Transactions: {edge_info['transaction_count']}<br>"
                        f"Dates: {', '.join([d.strftime('%Y-%m-%d') for d in edge_info['dates'][:3]])}"
                        + ("..." if len(edge_info["dates"]) > 3 else "")
                    )
                    normal_edge_info.extend([hover_text, hover_text, None])

            # Add normal active edges
            if normal_edge_x:
                normal_edge_trace = go.Scatter(
                    x=normal_edge_x,
                    y=normal_edge_y,
                    line=dict(width=2, color="lightblue"),
                    hovertext=normal_edge_info,
                    hoverinfo="text",
                    mode="lines",
                    name="Active Transactions",
                    showlegend=True,
                )
                traces.append(normal_edge_trace)

        # Create rapid edge traces (highlighted)
        if rapid_edges:
            rapid_edge_x = []
            rapid_edge_y = []
            rapid_edge_info = []

            for edge_info in rapid_edges:
                edge = edge_info["edge"]
                source, target = edge

                if source in pos and target in pos:
                    x0, y0 = pos[source]
                    x1, y1 = pos[target]

                    rapid_edge_x.extend([x0, x1, None])
                    rapid_edge_y.extend([y0, y1, None])

                    # Create hover info with velocity warning
                    hover_text = (
                        f"⚠️ RAPID SEQUENCE<br>"
                        f"From: {source}<br>"
                        f"To: {target}<br>"
                        f"Velocity: {edge_info['velocity']:.2f} tx/day<br>"
                        f"Period Transactions: {len(edge_info['dates'])}<br>"
                        f"⚠️ POTENTIAL SMURFING"
                    )
                    rapid_edge_info.extend([hover_text, hover_text, None])

            # Add rapid edges with warning styling
            if rapid_edge_x:
                rapid_edge_trace = go.Scatter(
                    x=rapid_edge_x,
                    y=rapid_edge_y,
                    line=dict(width=4, color="red", dash="dash"),
                    hovertext=rapid_edge_info,
                    hoverinfo="text",
                    mode="lines",
                    name="⚠️ Rapid Sequences",
                    showlegend=True,
                )
                traces.append(rapid_edge_trace)

        return traces

    def _create_base_temporal_visualization(
        self,
        graph: nx.DiGraph,
        pos: Dict[str, Tuple[float, float]],
        temporal_data: Dict[str, Any],
        title: str,
    ) -> go.Figure:
        """
        Create base visualization for temporal flow analysis.

        Args:
            graph: NetworkX DiGraph
            pos: Node positions
            temporal_data: Temporal analysis data
            title: Title for the visualization

        Returns:
            Base Plotly Figure for temporal analysis
        """
        # Create initial frame (first time period)
        if temporal_data["time_periods"]:
            period_start, period_end = temporal_data["time_periods"][0]

            # Find active edges for first period
            active_edges = []
            rapid_edges = []

            for edge_key, dates in temporal_data["edge_timeline"].items():
                period_dates = [d for d in dates if period_start <= d <= period_end]

                if period_dates:
                    active_edges.append(
                        {
                            "edge": edge_key,
                            "dates": period_dates,
                            "transaction_count": len(period_dates),
                        }
                    )

                    # Check for rapid sequences
                    for seq in temporal_data["rapid_sequences"]:
                        if "edge" in seq and seq["edge"] == edge_key:
                            rapid_edges.append(
                                {
                                    "edge": edge_key,
                                    "velocity": seq["velocity"],
                                    "dates": period_dates,
                                }
                            )

            # Create initial visualization data
            initial_data = self._create_frame_visualization_data(
                graph, pos, active_edges, rapid_edges, period_start, period_end
            )
        else:
            # Fallback to static visualization
            initial_data = []

            # Add basic node trace
            node_x = [pos[node][0] for node in graph.nodes()]
            node_y = [pos[node][1] for node in graph.nodes()]

            node_trace = go.Scatter(
                x=node_x,
                y=node_y,
                mode="markers",
                marker=dict(size=15, color="lightblue"),
                name="Entities",
                showlegend=False,
            )
            initial_data.append(node_trace)

        # Create figure
        fig = go.Figure(data=initial_data)

        # Update layout
        time_range = temporal_data.get("time_range")
        range_text = ""
        if time_range:
            range_text = f" ({time_range[0].strftime('%Y-%m-%d')} to {time_range[1].strftime('%Y-%m-%d')})"

        fig.update_layout(
            title=dict(text=f"{title}{range_text}", x=0.5, font=dict(size=20)),
            showlegend=True,
            hovermode="closest",
            margin=dict(b=100, l=5, r=5, t=40),  # Extra bottom margin for controls
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            plot_bgcolor=self.config.background_color,
            paper_bgcolor=self.config.background_color,
            height=700,  # Taller to accommodate controls
        )

        return fig

    def create_network_summary_dashboard(
        self,
        graph: nx.DiGraph,
        cycles: List[DetectedCycle],
        centrality_metrics: Dict[str, Dict[str, float]],
        anomaly_scores: Dict[str, float],
    ) -> go.Figure:
        """
        Create a comprehensive dashboard with network overview.

        Args:
            graph: NetworkX DiGraph
            cycles: List of detected cycles
            centrality_metrics: Centrality metrics for entities
            anomaly_scores: Anomaly scores for entities

        Returns:
            Plotly Figure with dashboard layout
        """
        # Create subplots
        fig = make_subplots(
            rows=2,
            cols=2,
            subplot_titles=(
                "Network Overview",
                "Cycle Distribution",
                "Top Entities by Centrality",
                "Anomaly Scores",
            ),
            specs=[
                [{"type": "scatter"}, {"type": "bar"}],
                [{"type": "bar"}, {"type": "bar"}],
            ],
        )

        # Network overview (simplified network)
        pos = self._calculate_layout_positions(graph)
        node_trace, _ = self._create_node_trace(graph, pos, centrality_metrics)

        # Add simplified network to subplot
        fig.add_trace(
            go.Scatter(
                x=node_trace.x,
                y=node_trace.y,
                mode="markers",
                marker=dict(size=8, color="lightblue"),
                showlegend=False,
                hoverinfo="skip",
            ),
            row=1,
            col=1,
        )

        # Cycle distribution
        if cycles:
            cycle_types = [cycle.cycle_type for cycle in cycles]
            type_counts = pd.Series(cycle_types).value_counts()

            fig.add_trace(
                go.Bar(
                    x=type_counts.index,
                    y=type_counts.values,
                    marker_color="lightcoral",
                    showlegend=False,
                ),
                row=1,
                col=2,
            )

        # Top entities by centrality
        if centrality_metrics:
            entities = list(centrality_metrics.keys())[:10]
            combined_scores = []

            for entity in entities:
                metrics = centrality_metrics[entity]
                combined = (
                    metrics.get("betweenness", 0) * 0.4
                    + metrics.get("pagerank", 0) * 0.4
                    + (metrics.get("total_degree", 0) / max(1, graph.number_of_nodes()))
                    * 0.2
                )
                combined_scores.append(combined)

            fig.add_trace(
                go.Bar(
                    x=[e[:20] + "..." if len(e) > 20 else e for e in entities],
                    y=combined_scores,
                    marker_color="lightgreen",
                    showlegend=False,
                ),
                row=2,
                col=1,
            )

        # Anomaly scores
        if anomaly_scores:
            top_anomalies = sorted(
                anomaly_scores.items(), key=lambda x: x[1], reverse=True
            )[:10]
            entities, scores = zip(*top_anomalies)

            fig.add_trace(
                go.Bar(
                    x=[e[:20] + "..." if len(e) > 20 else e for e in entities],
                    y=scores,
                    marker_color="orange",
                    showlegend=False,
                ),
                row=2,
                col=2,
            )

        # Update layout
        fig.update_layout(
            title=dict(text="Network Analysis Dashboard", x=0.5, font=dict(size=20)),
            height=800,
            showlegend=False,
        )

        # Update x-axis labels
        fig.update_xaxes(tickangle=45, row=2, col=1)
        fig.update_xaxes(tickangle=45, row=2, col=2)

        return fig

    def create_common_counterparty_visualization(
        self, df: pd.DataFrame, title: str = "Common Counterparty Network Analysis"
    ) -> go.Figure:
        """
        Creates network visualization highlighting common counterparty relationships.
        Shows entities and counterparties with node size and color based on connectivity levels.

        Args:
            df: DataFrame with transaction data including entity_owner and counterparty columns
            title: Title for the visualization

        Returns:
            Plotly Figure with common counterparty network visualization
        """
        if (
            df.empty
            or "counterparty" not in df.columns
            or "entity_owner" not in df.columns
        ):
            # Return empty figure for invalid data
            fig = go.Figure()
            fig.add_annotation(
                text="No counterparty data available for visualization",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        self.logger.info(
            f"Creating common counterparty visualization for {len(df)} transactions"
        )

        # Filter data for common counterparties (those transacting with multiple entities)
        df_filtered = df.dropna(subset=["counterparty", "entity_owner"])
        df_filtered = df_filtered[df_filtered["counterparty"] != ""]

        if df_filtered.empty:
            fig = go.Figure()
            fig.add_annotation(
                text="No valid counterparty transactions found",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        # Find common counterparties (those with multiple entity relationships)
        cp_entities = (
            df_filtered.groupby("counterparty")["entity_owner"].unique().apply(list)
        )
        common_cps = cp_entities[cp_entities.apply(len) > 1]

        if common_cps.empty:
            fig = go.Figure()
            fig.add_annotation(
                text="No common counterparties found",
                xref="paper",
                yref="paper",
                x=0.5,
                y=0.5,
                xanchor="center",
                yanchor="middle",
                showarrow=False,
                font=dict(size=16),
            )
            fig.update_layout(title=title)
            return fig

        # Build network graph
        G = nx.Graph()  # Use undirected graph for counterparty relationships

        # Track metrics for enhanced visualization
        counterparty_metrics = {}
        entity_metrics = {}

        # Process common counterparties
        for cp, entities in common_cps.items():
            cp_txns = df_filtered[df_filtered["counterparty"] == cp]

            # Calculate counterparty metrics
            total_volume = (
                cp_txns["DEBIT"].fillna(0).sum() + cp_txns["CREDIT"].fillna(0).sum()
            )
            transaction_count = len(cp_txns)
            entity_count = len(entities)

            counterparty_metrics[cp] = {
                "total_volume": total_volume,
                "transaction_count": transaction_count,
                "entity_count": entity_count,
                "entities": entities,
            }

            # Add counterparty node
            G.add_node(
                cp,
                node_type="counterparty",
                total_volume=total_volume,
                transaction_count=transaction_count,
                entity_count=entity_count,
            )

            # Process entity relationships
            for entity in entities:
                entity_cp_txns = cp_txns[cp_txns["entity_owner"] == entity]
                entity_volume = (
                    entity_cp_txns["DEBIT"].fillna(0).sum()
                    + entity_cp_txns["CREDIT"].fillna(0).sum()
                )
                entity_txn_count = len(entity_cp_txns)

                # Track entity metrics
                if entity not in entity_metrics:
                    entity_metrics[entity] = {
                        "total_volume": 0,
                        "transaction_count": 0,
                        "counterparty_count": 0,
                        "counterparties": set(),
                    }

                entity_metrics[entity]["total_volume"] += entity_volume
                entity_metrics[entity]["transaction_count"] += entity_txn_count
                entity_metrics[entity]["counterparties"].add(cp)
                entity_metrics[entity]["counterparty_count"] = len(
                    entity_metrics[entity]["counterparties"]
                )

                # Add entity node
                if not G.has_node(entity):
                    G.add_node(
                        entity,
                        node_type="entity",
                        total_volume=0,
                        transaction_count=0,
                        counterparty_count=0,
                    )

                # Update entity node attributes
                G.nodes[entity]["total_volume"] = entity_metrics[entity]["total_volume"]
                G.nodes[entity]["transaction_count"] = entity_metrics[entity][
                    "transaction_count"
                ]
                G.nodes[entity]["counterparty_count"] = entity_metrics[entity][
                    "counterparty_count"
                ]

                # Add edge
                G.add_edge(
                    entity, cp, weight=entity_volume, transaction_count=entity_txn_count
                )

        # Create visualization using enhanced styling
        fig = self._create_enhanced_counterparty_graph(
            G, counterparty_metrics, entity_metrics, title
        )

        return fig

    def _create_enhanced_counterparty_graph(
        self, G: nx.Graph, counterparty_metrics: dict, entity_metrics: dict, title: str
    ) -> go.Figure:
        """
        Create enhanced network graph for common counterparty visualization.
        Uses node size and color to highlight hub entities and high-volume counterparties.
        """
        # Calculate layout positions
        pos = nx.spring_layout(G, k=2, iterations=50, seed=42)

        # Prepare node data with enhanced styling
        entity_nodes = {
            "x": [],
            "y": [],
            "text": [],
            "hovertext": [],
            "size": [],
            "color": [],
        }
        counterparty_nodes = {
            "x": [],
            "y": [],
            "text": [],
            "hovertext": [],
            "size": [],
            "color": [],
        }

        # Calculate scaling factors
        max(
            [m["total_volume"] for m in entity_metrics.values()]
        ) if entity_metrics else 1
        max_cp_volume = (
            max([m["total_volume"] for m in counterparty_metrics.values()])
            if counterparty_metrics
            else 1
        )
        max_entity_connections = (
            max([m["counterparty_count"] for m in entity_metrics.values()])
            if entity_metrics
            else 1
        )
        max_cp_connections = (
            max([m["entity_count"] for m in counterparty_metrics.values()])
            if counterparty_metrics
            else 1
        )

        # Process nodes with enhanced styling
        for node in G.nodes():
            x, y = pos[node]
            node_data = G.nodes[node]

            if node_data["node_type"] == "entity":
                # Entity nodes: size based on counterparty count (hub detection), color based on volume
                metrics = entity_metrics.get(node, {})
                counterparty_count = metrics.get("counterparty_count", 0)
                total_volume = metrics.get("total_volume", 0)

                # Enhanced size calculation for hub detection
                base_size = 25
                connection_factor = (
                    counterparty_count / max_entity_connections
                    if max_entity_connections > 0
                    else 0
                )

                # Apply hub styling from config
                if counterparty_count >= 3:  # Hub entity threshold
                    node_size = (
                        base_size * self.config.node_styles["hub"]["size_multiplier"]
                    )
                    node_color = connection_factor
                else:
                    node_size = base_size * (1 + connection_factor * 0.8)
                    node_color = connection_factor * 0.7

                entity_nodes["x"].append(x)
                entity_nodes["y"].append(y)
                entity_nodes["text"].append(
                    node[:15] + "..." if len(node) > 15 else node
                )
                entity_nodes["size"].append(min(60, node_size))
                entity_nodes["color"].append(node_color)

                # Enhanced hover information
                hub_status = (
                    "🔴 Hub Entity" if counterparty_count >= 3 else "🔵 Regular Entity"
                )
                hover_text = (
                    f"<b>{hub_status}</b><br>"
                    f"<b>Entity: {node}</b><br>"
                    f"Counterparty Relationships: {counterparty_count}<br>"
                    f"Total Volume: ₹{total_volume:,.2f}<br>"
                    f"Total Transactions: {metrics.get('transaction_count', 0)}<br>"
                    f"Connected Counterparties: {', '.join(list(metrics.get('counterparties', set()))[:3])}"
                    + ("..." if len(metrics.get("counterparties", set())) > 3 else "")
                )
                entity_nodes["hovertext"].append(hover_text)

            else:  # counterparty node
                # Counterparty nodes: size based on entity count, color based on volume
                metrics = counterparty_metrics.get(node, {})
                entity_count = metrics.get("entity_count", 0)
                total_volume = metrics.get("total_volume", 0)

                # Size based on entity relationships
                base_size = 20
                connection_factor = (
                    entity_count / max_cp_connections if max_cp_connections > 0 else 0
                )
                node_size = base_size * (1 + connection_factor * 0.6)

                # Color based on transaction volume
                volume_factor = total_volume / max_cp_volume if max_cp_volume > 0 else 0

                counterparty_nodes["x"].append(x)
                counterparty_nodes["y"].append(y)
                counterparty_nodes["text"].append(
                    node[:12] + "..." if len(node) > 12 else node
                )
                counterparty_nodes["size"].append(min(50, node_size))
                counterparty_nodes["color"].append(volume_factor)

                # Enhanced hover information
                hover_text = (
                    f"<b>💎 Common Counterparty</b><br>"
                    f"<b>Name: {node}</b><br>"
                    f"Entity Relationships: {entity_count}<br>"
                    f"Total Volume: ₹{total_volume:,.2f}<br>"
                    f"Total Transactions: {metrics.get('transaction_count', 0)}<br>"
                    f"Connected Entities: {', '.join(metrics.get('entities', [])[:3])}"
                    + ("..." if len(metrics.get("entities", [])) > 3 else "")
                )
                counterparty_nodes["hovertext"].append(hover_text)

        # Create edge traces with volume-based thickness
        edge_x = []
        edge_y = []
        edge_weights = []

        for edge in G.edges():
            x0, y0 = pos[edge[0]]
            x1, y1 = pos[edge[1]]

            edge_x.extend([x0, x1, None])
            edge_y.extend([y0, y1, None])

            weight = G[edge[0]][edge[1]].get("weight", 0)
            edge_weights.append(weight)

        # Create figure
        fig = go.Figure()

        # Add edges with volume-based thickness
        fig.add_trace(
            go.Scatter(
                x=edge_x,
                y=edge_y,
                line=dict(width=2, color="lightgray"),
                hoverinfo="none",
                mode="lines",
                name="Relationships",
                showlegend=False,
            )
        )

        # Add entity nodes with hub highlighting
        fig.add_trace(
            go.Scatter(
                x=entity_nodes["x"],
                y=entity_nodes["y"],
                mode="markers+text",
                text=entity_nodes["text"],
                textposition="middle center",
                hovertext=entity_nodes["hovertext"],
                hoverinfo="text",
                marker=dict(
                    size=entity_nodes["size"],
                    color=entity_nodes["color"],
                    colorscale="Reds",
                    showscale=True,
                    colorbar=dict(title="Hub<br>Score", x=1.02, len=0.5, y=0.8),
                    line=dict(width=3, color=self.config.node_styles["hub"]["color"]),
                    symbol="circle",
                ),
                name="Entities (🔴 = Hub)",
                showlegend=True,
            )
        )

        # Add counterparty nodes
        fig.add_trace(
            go.Scatter(
                x=counterparty_nodes["x"],
                y=counterparty_nodes["y"],
                mode="markers+text",
                text=counterparty_nodes["text"],
                textposition="middle center",
                hovertext=counterparty_nodes["hovertext"],
                hoverinfo="text",
                marker=dict(
                    size=counterparty_nodes["size"],
                    color=counterparty_nodes["color"],
                    colorscale="Blues",
                    showscale=True,
                    colorbar=dict(title="Volume<br>Score", x=1.02, len=0.5, y=0.2),
                    line=dict(width=2, color="darkblue"),
                    symbol="diamond",
                ),
                name="Common Counterparties",
                showlegend=True,
            )
        )

        # Update layout with enhanced styling
        fig.update_layout(
            title=dict(text=title, x=0.5, font=dict(size=18)),
            showlegend=True,
            hovermode="closest",
            margin=dict(b=20, l=5, r=5, t=40),
            annotations=[
                dict(
                    text="🔴 Hub entities (3+ counterparties) • 💎 Common counterparties • Node size = connections • Color = volume",
                    showarrow=False,
                    xref="paper",
                    yref="paper",
                    x=0.5,
                    y=-0.05,
                    xanchor="center",
                    yanchor="top",
                    font=dict(size=11, color="gray"),
                )
            ],
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            plot_bgcolor=self.config.background_color,
            paper_bgcolor=self.config.background_color,
            height=600,
        )

        return fig
