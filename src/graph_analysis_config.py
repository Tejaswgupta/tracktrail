"""
Graph Analysis Configuration Management

This module implements the GraphAnalysisConfig class that manages parameters for
graph-based round trip analysis, including cycle detection thresholds, time windows,
and analysis configuration with validation and persistence capabilities.
"""

import json
from dataclasses import asdict, dataclass, fields
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import streamlit as st


@dataclass
class GraphAnalysisConfig:
    """
    Configuration class for graph analysis parameters with validation and persistence.

    This class manages all configurable parameters for graph-based round trip detection,
    including cycle lengths, thresholds, time windows, and analysis options.
    """

    # Cycle detection parameters
    min_cycle_length: int = 2
    max_cycle_length: int = 10

    # Transaction filtering thresholds
    min_transaction_amount: float = 0.0
    max_transaction_amount: Optional[float] = None

    # Time window constraints
    max_round_trip_duration: int = 365  # days
    min_round_trip_duration: int = 0  # days

    # Net flow analysis
    net_flow_threshold: float = 0.1  # Percentage of total flow
    absolute_net_flow_threshold: Optional[float] = None

    # Centrality analysis
    centrality_threshold: float = 0.1
    calculate_betweenness_centrality: bool = True
    calculate_closeness_centrality: bool = True
    calculate_degree_centrality: bool = True

    # Hub detection
    hub_detection_enabled: bool = True
    hub_centrality_threshold: float = 0.2
    min_hub_connections: int = 3

    # Performance optimization
    max_nodes_for_analysis: int = 1000
    enable_caching: bool = True
    analysis_timeout_seconds: int = 300

    # Visualization preferences
    highlight_cycles: bool = True
    show_centrality_scores: bool = True
    node_size_scaling: bool = True
    edge_weight_scaling: bool = True

    # Export options
    include_metadata_in_export: bool = True
    export_format: str = "json"  # json, csv, graphml

    def validate_parameters(self) -> Tuple[bool, List[str]]:
        """
        Validates configuration parameters for consistency and validity.

        Returns:
            Tuple of (is_valid, error_messages)
        """
        errors = []

        # Validate cycle length parameters
        if self.min_cycle_length < 2:
            errors.append("Minimum cycle length must be at least 2")

        if self.max_cycle_length < self.min_cycle_length:
            errors.append(
                "Maximum cycle length must be greater than or equal to minimum cycle length"
            )

        if self.max_cycle_length > 20:
            errors.append(
                "Maximum cycle length should not exceed 20 for performance reasons"
            )

        # Validate transaction amount thresholds
        if self.min_transaction_amount < 0:
            errors.append("Minimum transaction amount cannot be negative")

        if (
            self.max_transaction_amount is not None
            and self.max_transaction_amount <= self.min_transaction_amount
        ):
            errors.append(
                "Maximum transaction amount must be greater than minimum transaction amount"
            )

        # Validate time window parameters
        if self.min_round_trip_duration < 0:
            errors.append("Minimum round trip duration cannot be negative")

        if self.max_round_trip_duration <= self.min_round_trip_duration:
            errors.append(
                "Maximum round trip duration must be greater than minimum duration"
            )

        if self.max_round_trip_duration > 3650:  # 10 years
            errors.append(
                "Maximum round trip duration should not exceed 3650 days (10 years)"
            )

        # Validate threshold parameters
        if not (0.0 <= self.net_flow_threshold <= 1.0):
            errors.append("Net flow threshold must be between 0.0 and 1.0")

        if not (0.0 <= self.centrality_threshold <= 1.0):
            errors.append("Centrality threshold must be between 0.0 and 1.0")

        if not (0.0 <= self.hub_centrality_threshold <= 1.0):
            errors.append("Hub centrality threshold must be between 0.0 and 1.0")

        # Validate hub detection parameters
        if self.min_hub_connections < 1:
            errors.append("Minimum hub connections must be at least 1")

        # Validate performance parameters
        if self.max_nodes_for_analysis < 10:
            errors.append("Maximum nodes for analysis must be at least 10")

        if self.analysis_timeout_seconds < 10:
            errors.append("Analysis timeout must be at least 10 seconds")

        # Validate export format
        valid_formats = ["json", "csv", "graphml", "gexf"]
        if self.export_format not in valid_formats:
            errors.append(f"Export format must be one of: {', '.join(valid_formats)}")

        return len(errors) == 0, errors

    def to_dict(self) -> Dict[str, Any]:
        """
        Converts configuration to dictionary for serialization.

        Returns:
            Dictionary representation of the configuration
        """
        config_dict = asdict(self)
        config_dict["_metadata"] = {
            "created_at": datetime.now().isoformat(),
            "version": "1.0.0",
            "config_type": "GraphAnalysisConfig",
        }
        return config_dict

    @classmethod
    def from_dict(cls, config_dict: Dict[str, Any]) -> "GraphAnalysisConfig":
        """
        Creates configuration instance from dictionary.

        Args:
            config_dict: Dictionary containing configuration parameters

        Returns:
            GraphAnalysisConfig instance
        """
        # Remove metadata if present
        config_data = {k: v for k, v in config_dict.items() if k != "_metadata"}

        # Get valid field names for the dataclass
        valid_fields = {f.name for f in fields(cls)}

        # Filter out any invalid fields
        filtered_data = {k: v for k, v in config_data.items() if k in valid_fields}

        return cls(**filtered_data)

    def save_to_session(self, key: str = "graph_analysis_config") -> None:
        """
        Saves configuration to Streamlit session state.

        Args:
            key: Session state key to use for storage
        """
        st.session_state[key] = self.to_dict()

    @classmethod
    def load_from_session(
        cls, key: str = "graph_analysis_config"
    ) -> "GraphAnalysisConfig":
        """
        Loads configuration from Streamlit session state.

        Args:
            key: Session state key to load from

        Returns:
            GraphAnalysisConfig instance, or default if not found
        """
        if key in st.session_state:
            try:
                return cls.from_dict(st.session_state[key])
            except Exception:
                # Return default config if loading fails
                pass

        return cls()

    def export_to_json(self, filepath: str) -> None:
        """
        Exports configuration to JSON file.

        Args:
            filepath: Path to save the JSON file
        """
        with open(filepath, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def import_from_json(cls, filepath: str) -> "GraphAnalysisConfig":
        """
        Imports configuration from JSON file.

        Args:
            filepath: Path to the JSON file

        Returns:
            GraphAnalysisConfig instance
        """
        with open(filepath, "r") as f:
            config_dict = json.load(f)

        return cls.from_dict(config_dict)

    def get_cycle_detection_params(self) -> Dict[str, Any]:
        """
        Returns parameters specifically for cycle detection algorithms.

        Returns:
            Dictionary with cycle detection parameters
        """
        return {
            "min_length": self.min_cycle_length,
            "max_length": self.max_cycle_length,
            "min_amount": self.min_transaction_amount,
            "max_amount": self.max_transaction_amount,
            "max_duration_days": self.max_round_trip_duration,
            "min_duration_days": self.min_round_trip_duration,
            "net_flow_threshold": self.net_flow_threshold,
            "absolute_net_flow_threshold": self.absolute_net_flow_threshold,
        }

    def get_centrality_params(self) -> Dict[str, Any]:
        """
        Returns parameters for centrality calculations.

        Returns:
            Dictionary with centrality parameters
        """
        return {
            "threshold": self.centrality_threshold,
            "calculate_betweenness": self.calculate_betweenness_centrality,
            "calculate_closeness": self.calculate_closeness_centrality,
            "calculate_degree": self.calculate_degree_centrality,
            "hub_threshold": self.hub_centrality_threshold,
            "min_hub_connections": self.min_hub_connections,
        }

    def get_performance_params(self) -> Dict[str, Any]:
        """
        Returns parameters for performance optimization.

        Returns:
            Dictionary with performance parameters
        """
        return {
            "max_nodes": self.max_nodes_for_analysis,
            "enable_caching": self.enable_caching,
            "timeout_seconds": self.analysis_timeout_seconds,
        }

    def get_visualization_params(self) -> Dict[str, Any]:
        """
        Returns parameters for visualization settings.

        Returns:
            Dictionary with visualization parameters
        """
        return {
            "highlight_cycles": self.highlight_cycles,
            "show_centrality_scores": self.show_centrality_scores,
            "node_size_scaling": self.node_size_scaling,
            "edge_weight_scaling": self.edge_weight_scaling,
        }

    def reset_to_defaults(self) -> None:
        """Resets all parameters to their default values."""
        default_config = GraphAnalysisConfig()
        for field in fields(self):
            setattr(self, field.name, getattr(default_config, field.name))

    def copy(self) -> "GraphAnalysisConfig":
        """
        Creates a deep copy of the configuration.

        Returns:
            New GraphAnalysisConfig instance with same parameters
        """
        return GraphAnalysisConfig.from_dict(self.to_dict())

    def __str__(self) -> str:
        """String representation of the configuration."""
        return (
            f"GraphAnalysisConfig(cycles: {self.min_cycle_length}-{self.max_cycle_length}, "
            f"amount: ≥{self.min_transaction_amount}, duration: ≤{self.max_round_trip_duration}d)"
        )


def show_graph_analysis_config_ui(
    config: Optional[GraphAnalysisConfig] = None,
) -> GraphAnalysisConfig:
    """
    Displays Streamlit UI controls for configuring graph analysis parameters.

    Args:
        config: Existing configuration to display, or None for default

    Returns:
        Updated GraphAnalysisConfig instance
    """
    if config is None:
        config = GraphAnalysisConfig.load_from_session()

    st.subheader("🔧 Graph Analysis Configuration")

    # Create tabs for different parameter categories
    tab1, tab2, tab3, tab4, tab5 = st.tabs(
        [
            "🔄 Cycle Detection",
            "💰 Transaction Filters",
            "⏱️ Time Windows",
            "📊 Analysis Options",
            "🎨 Visualization",
        ]
    )

    with tab1:
        st.markdown("#### Cycle Detection Parameters")

        col1, col2 = st.columns(2)
        with col1:
            config.min_cycle_length = st.number_input(
                "Minimum Cycle Length",
                min_value=2,
                max_value=20,
                value=config.min_cycle_length,
                help="Minimum number of entities in a round trip cycle",
            )

        with col2:
            config.max_cycle_length = st.number_input(
                "Maximum Cycle Length",
                min_value=config.min_cycle_length,
                max_value=20,
                value=config.max_cycle_length,
                help="Maximum number of entities in a round trip cycle",
            )

        st.markdown("#### Net Flow Analysis")

        col1, col2 = st.columns(2)
        with col1:
            config.net_flow_threshold = st.slider(
                "Net Flow Threshold (%)",
                min_value=0.0,
                max_value=1.0,
                value=config.net_flow_threshold,
                step=0.01,
                format="%.2f",
                help="Maximum allowed net flow as percentage of total flow",
            )

        with col2:
            enable_absolute = st.checkbox(
                "Enable Absolute Net Flow Threshold",
                value=config.absolute_net_flow_threshold is not None,
            )

            if enable_absolute:
                config.absolute_net_flow_threshold = st.number_input(
                    "Absolute Net Flow Threshold",
                    min_value=0.0,
                    value=config.absolute_net_flow_threshold or 1000.0,
                    help="Maximum allowed absolute net flow amount",
                )
            else:
                config.absolute_net_flow_threshold = None

    with tab2:
        st.markdown("#### Transaction Amount Filters")

        col1, col2 = st.columns(2)
        with col1:
            config.min_transaction_amount = st.number_input(
                "Minimum Transaction Amount",
                min_value=0.0,
                value=config.min_transaction_amount,
                help="Minimum transaction amount to include in analysis",
            )

        with col2:
            enable_max_amount = st.checkbox(
                "Enable Maximum Amount Filter",
                value=config.max_transaction_amount is not None,
            )

            if enable_max_amount:
                config.max_transaction_amount = st.number_input(
                    "Maximum Transaction Amount",
                    min_value=config.min_transaction_amount,
                    value=config.max_transaction_amount or 1000000.0,
                    help="Maximum transaction amount to include in analysis",
                )
            else:
                config.max_transaction_amount = None

    with tab3:
        st.markdown("#### Time Window Constraints")

        col1, col2 = st.columns(2)
        with col1:
            config.min_round_trip_duration = st.number_input(
                "Minimum Round Trip Duration (days)",
                min_value=0,
                max_value=3650,
                value=config.min_round_trip_duration,
                help="Minimum time span for a valid round trip",
            )

        with col2:
            config.max_round_trip_duration = st.number_input(
                "Maximum Round Trip Duration (days)",
                min_value=config.min_round_trip_duration,
                max_value=3650,
                value=config.max_round_trip_duration,
                help="Maximum time span for a valid round trip",
            )

        # Display time window summary
        if config.max_round_trip_duration > 0:
            st.info(
                f"📅 Round trips must occur within {config.min_round_trip_duration} to "
                f"{config.max_round_trip_duration} days ({config.max_round_trip_duration / 365:.1f} years)"
            )

    with tab4:
        st.markdown("#### Centrality Analysis")

        col1, col2 = st.columns(2)
        with col1:
            config.centrality_threshold = st.slider(
                "Centrality Threshold",
                min_value=0.0,
                max_value=1.0,
                value=config.centrality_threshold,
                step=0.01,
                format="%.2f",
                help="Minimum centrality score to highlight entities",
            )

            config.calculate_betweenness_centrality = st.checkbox(
                "Calculate Betweenness Centrality",
                value=config.calculate_betweenness_centrality,
                help="Identifies entities that act as bridges in transaction flows",
            )

            config.calculate_closeness_centrality = st.checkbox(
                "Calculate Closeness Centrality",
                value=config.calculate_closeness_centrality,
                help="Identifies entities with shortest paths to all others",
            )

            config.calculate_degree_centrality = st.checkbox(
                "Calculate Degree Centrality",
                value=config.calculate_degree_centrality,
                help="Identifies entities with the most direct connections",
            )

        with col2:
            st.markdown("##### Hub Detection")

            config.hub_detection_enabled = st.checkbox(
                "Enable Hub Detection",
                value=config.hub_detection_enabled,
                help="Identify entities that facilitate multiple round trips",
            )

            if config.hub_detection_enabled:
                config.hub_centrality_threshold = st.slider(
                    "Hub Centrality Threshold",
                    min_value=0.0,
                    max_value=1.0,
                    value=config.hub_centrality_threshold,
                    step=0.01,
                    format="%.2f",
                    help="Minimum centrality score to classify as hub",
                )

                config.min_hub_connections = st.number_input(
                    "Minimum Hub Connections",
                    min_value=1,
                    max_value=100,
                    value=config.min_hub_connections,
                    help="Minimum number of connections for hub classification",
                )

        st.markdown("#### Performance Settings")

        col1, col2 = st.columns(2)
        with col1:
            config.max_nodes_for_analysis = st.number_input(
                "Maximum Nodes for Analysis",
                min_value=10,
                max_value=10000,
                value=config.max_nodes_for_analysis,
                help="Maximum number of entities to analyze (for performance)",
            )

            config.enable_caching = st.checkbox(
                "Enable Result Caching",
                value=config.enable_caching,
                help="Cache analysis results to improve performance",
            )

        with col2:
            config.analysis_timeout_seconds = st.number_input(
                "Analysis Timeout (seconds)",
                min_value=10,
                max_value=3600,
                value=config.analysis_timeout_seconds,
                help="Maximum time to spend on analysis before timeout",
            )

    with tab5:
        st.markdown("#### Visualization Settings")

        col1, col2 = st.columns(2)
        with col1:
            config.highlight_cycles = st.checkbox(
                "Highlight Detected Cycles",
                value=config.highlight_cycles,
                help="Use distinct colors/styling for round trip paths",
            )

            config.show_centrality_scores = st.checkbox(
                "Show Centrality Scores",
                value=config.show_centrality_scores,
                help="Display centrality values on nodes",
            )

        with col2:
            config.node_size_scaling = st.checkbox(
                "Scale Node Sizes",
                value=config.node_size_scaling,
                help="Scale node sizes based on transaction volume",
            )

            config.edge_weight_scaling = st.checkbox(
                "Scale Edge Weights",
                value=config.edge_weight_scaling,
                help="Scale edge thickness based on transaction amounts",
            )

        st.markdown("#### Export Options")

        col1, col2 = st.columns(2)
        with col1:
            config.export_format = st.selectbox(
                "Export Format",
                options=["json", "csv", "graphml", "gexf"],
                index=["json", "csv", "graphml", "gexf"].index(config.export_format),
                help="Default format for exporting analysis results",
            )

        with col2:
            config.include_metadata_in_export = st.checkbox(
                "Include Metadata in Export",
                value=config.include_metadata_in_export,
                help="Include analysis metadata in exported files",
            )

    # Validation and action buttons
    st.markdown("---")

    # Validate configuration
    is_valid, errors = config.validate_parameters()

    if not is_valid:
        st.error("❌ Configuration has errors:")
        for error in errors:
            st.error(f"• {error}")
    else:
        st.success("✅ Configuration is valid")

    # Action buttons
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        if st.button(
            "💾 Save Configuration", key="save_config_btn", disabled=not is_valid
        ):
            config.save_to_session()
            st.success("Configuration saved!")
            st.rerun()

    with col2:
        if st.button("🔄 Reset to Defaults", key="reset_config_btn"):
            config.reset_to_defaults()
            config.save_to_session()
            st.success("Configuration reset to defaults!")
            st.rerun()

    with col3:
        if st.button("📥 Export Config", key="export_config_btn"):
            config_json = json.dumps(config.to_dict(), indent=2)
            st.download_button(
                label="📥 Download JSON",
                data=config_json,
                file_name=f"graph_analysis_config_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
                mime="application/json",
            )

    with col4:
        uploaded_config = st.file_uploader(
            "📤 Import Config",
            type=["json"],
            help="Upload a previously exported configuration file",
        )

        if uploaded_config is not None:
            try:
                config_data = json.load(uploaded_config)
                imported_config = GraphAnalysisConfig.from_dict(config_data)

                # Validate imported config
                is_valid_import, import_errors = imported_config.validate_parameters()

                if is_valid_import:
                    # Update current config with imported values
                    for field in fields(imported_config):
                        setattr(
                            config, field.name, getattr(imported_config, field.name)
                        )

                    config.save_to_session()
                    st.success("✅ Configuration imported successfully!")
                    st.rerun()
                else:
                    st.error("❌ Imported configuration is invalid:")
                    for error in import_errors:
                        st.error(f"• {error}")

            except Exception as e:
                st.error(f"❌ Error importing configuration: {str(e)}")

    return config


def show_config_summary(config: GraphAnalysisConfig) -> None:
    """
    Displays a compact summary of the current configuration.

    Args:
        config: Configuration to summarize
    """
    st.markdown("#### 📋 Current Configuration Summary")

    col1, col2, col3 = st.columns(3)

    with col1:
        st.metric(
            "Cycle Length Range",
            f"{config.min_cycle_length} - {config.max_cycle_length}",
            help="Range of cycle lengths to detect",
        )

        st.metric(
            "Min Transaction Amount",
            f"₹{config.min_transaction_amount:,.2f}",
            help="Minimum transaction amount for analysis",
        )

    with col2:
        st.metric(
            "Max Duration",
            f"{config.max_round_trip_duration} days",
            help="Maximum time span for round trips",
        )

        st.metric(
            "Net Flow Threshold",
            f"{config.net_flow_threshold:.1%}",
            help="Maximum allowed net flow percentage",
        )

    with col3:
        centrality_count = sum(
            [
                config.calculate_betweenness_centrality,
                config.calculate_closeness_centrality,
                config.calculate_degree_centrality,
            ]
        )

        st.metric(
            "Centrality Measures",
            f"{centrality_count}/3 enabled",
            help="Number of centrality measures to calculate",
        )

        st.metric(
            "Hub Detection",
            "Enabled" if config.hub_detection_enabled else "Disabled",
            help="Whether hub detection is enabled",
        )
