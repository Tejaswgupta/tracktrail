def _display_dashboard_tab(results, config):
    """
    Display comprehensive network dashboard tab.
    Shows network overview, cycle distribution, top entities, anomaly scores, and financial crime indicators
    in an organized, multi-panel layout with law enforcement-focused metrics.
    """
    st.markdown("#### 📈 Comprehensive Network Dashboard")
    st.markdown(
        "Overview of network analysis results including financial crime indicators and law enforcement metrics."
    )

    # Import NetworkVisualizer for dashboard creation
    try:
        # Create visualizer instance
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Get the graph from session state
        graph = st.session_state.graph_analysis_state.get("cached_graph")

        if graph is None:
            st.error(
                "❌ Graph data not available for dashboard. Please run the analysis first."
            )
            return

        # Create the dashboard visualization
        dashboard_fig = visualizer.create_network_summary_dashboard(
            graph=graph,
            cycles=results.detected_cycles,
            centrality_metrics=results.centrality_metrics,
            anomaly_scores=results.anomaly_scores,
        )

        # Display the dashboard
        st.plotly_chart(dashboard_fig, use_container_width=True)

    except ImportError as e:
        st.error(f"❌ Error importing NetworkVisualizer: {str(e)}")
        st.info("Please ensure the network_visualizer module is available.")
        return
    except Exception as e:
        st.error(f"❌ Error creating dashboard: {str(e)}")
        st.info("Falling back to basic statistics display.")

        # Fallback to basic statistics if dashboard creation fails
        _display_basic_network_statistics(results)
        return

    # Additional law enforcement-focused metrics below the main dashboard
    st.markdown("---")
    st.markdown("#### 🚨 Financial Crime Indicators")

    # Create metrics columns for law enforcement indicators
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        # High-risk cycles (short duration, high amounts)
        high_risk_cycles = [
            cycle
            for cycle in results.detected_cycles
            if cycle.duration_days <= 7 and cycle.total_amount >= 100000
        ]
        st.metric(
            "High-Risk Cycles",
            len(high_risk_cycles),
            help="Cycles completed within 7 days with amounts ≥ ₹1,00,000",
        )

    with col2:
        # Suspicious velocity patterns
        rapid_cycles = [
            cycle for cycle in results.detected_cycles if cycle.duration_days <= 3
        ]
        st.metric(
            "Rapid Movement",
            len(rapid_cycles),
            help="Cycles completed within 3 days (potential smurfing)",
        )

    with col3:
        # High centrality entities (potential hubs)
        high_centrality_entities = [
            entity
            for entity, metrics in results.centrality_metrics.items()
            if (
                metrics.get("betweenness", 0) * 0.4
                + metrics.get("pagerank", 0) * 0.4
                + (
                    metrics.get("total_degree", 0)
                    / max(1, len(results.centrality_metrics))
                )
                * 0.2
            )
            > 0.5
        ]
        st.metric(
            "Hub Entities",
            len(high_centrality_entities),
            help="Entities with high combined centrality scores (>0.5)",
        )

    with col4:
        # High anomaly score entities
        high_anomaly_entities = [
            entity for entity, score in results.anomaly_scores.items() if score > 0.7
        ]
        st.metric(
            "Anomalous Entities",
            len(high_anomaly_entities),
            help="Entities with anomaly scores > 0.7",
        )

    # Detailed breakdown sections
    col_left, col_right = st.columns(2)

    with col_left:
        st.markdown("##### 🔍 Top Risk Entities")
        if results.anomaly_scores:
            # Sort entities by anomaly score
            top_anomalies = sorted(
                results.anomaly_scores.items(), key=lambda x: x[1], reverse=True
            )[:5]

            for i, (entity, score) in enumerate(top_anomalies, 1):
                # Truncate long entity names
                display_name = entity[:30] + "..." if len(entity) > 30 else entity
                st.write(f"{i}. **{display_name}** - Risk Score: {score:.3f}")
        else:
            st.info("No anomaly scores available")

    with col_right:
        st.markdown("##### 💰 Largest Cycles")
        if results.detected_cycles:
            # Sort cycles by total amount
            largest_cycles = sorted(
                results.detected_cycles, key=lambda x: x.total_amount, reverse=True
            )[:5]

            for i, cycle in enumerate(largest_cycles, 1):
                path_display = " → ".join(cycle.path[:3]) + (
                    "..." if len(cycle.path) > 3 else ""
                )
                st.write(
                    f"{i}. **₹{cycle.total_amount:,.0f}** - {path_display} ({cycle.duration_days}d)"
                )
        else:
            st.info("No cycles detected")

    # Network health indicators
    st.markdown("---")
    st.markdown("##### 📊 Network Health Indicators")

    if results.network_statistics:
        health_col1, health_col2, health_col3 = st.columns(3)

        with health_col1:
            # Network density
            total_nodes = results.network_statistics.get("total_nodes", 0)
            total_edges = results.network_statistics.get("total_edges", 0)
            max_possible_edges = (
                total_nodes * (total_nodes - 1) if total_nodes > 1 else 1
            )
            density = total_edges / max_possible_edges if max_possible_edges > 0 else 0

            st.metric(
                "Network Density",
                f"{density:.3f}",
                help="Ratio of actual edges to maximum possible edges",
            )

        with health_col2:
            # Average cycle amount
            if results.detected_cycles:
                avg_cycle_amount = sum(
                    cycle.total_amount for cycle in results.detected_cycles
                ) / len(results.detected_cycles)
                st.metric(
                    "Avg Cycle Amount",
                    f"₹{avg_cycle_amount:,.0f}",
                    help="Average amount involved in detected cycles",
                )
            else:
                st.metric("Avg Cycle Amount", "₹0", help="No cycles detected")

        with health_col3:
            # Network complexity score
            complexity_score = (
                (total_nodes / 100) * 0.3  # Node complexity
                + (total_edges / (total_nodes * 10) if total_nodes > 0 else 0)
                * 0.4  # Edge complexity
                + (len(results.detected_cycles) / 10) * 0.3  # Cycle complexity
            )
            complexity_score = min(1.0, complexity_score)  # Cap at 1.0

            st.metric(
                "Complexity Score",
                f"{complexity_score:.3f}",
                help="Overall network complexity indicator (0-1)",
            )
