def show_graph_network_analysis():
    """
    Display graph network analysis interface with tabbed layout for comprehensive
    network visualization, centrality analysis, cycle details, money flow, dashboard, and export.

    This function integrates with the existing UI framework to provide:
    - Network Overview: Main network visualization and round trip detection
    - Centrality Analysis: Entity importance and influence metrics
    - Cycle Details: Detailed cycle information in table format
    - Money Flow: Transaction flow patterns and suspicious movement analysis
    - Dashboard: Comprehensive network summary with law enforcement metrics
    - Export: Export functionality for all visualization types
    """
    st.header("🕸️ Graph Network Analysis")

    # Check if we have processed data with counterparty information
    df = get_analysis_dataframe()

    if df is None or df.empty:
        st.warning("⚠️ No processed transaction data available for graph analysis.")
        st.info(
            "💡 Please run the 'Counterparty Extraction' tab first to extract counterparty names from transaction descriptions."
        )
        return

    # Check if counterparty data is available
    if "counterparty" not in df.columns or df["counterparty"].isna().all():
        st.warning("⚠️ Counterparty data not found in processed data.")
        st.info(
            "💡 Please run the 'Counterparty Extraction' tab first to extract counterparty names from transaction descriptions."
        )
        return

    # Add entity_owner column if not present (needed for graph analysis)
    if "entity_owner" not in df.columns:
        # Try to get entity information from the analysis scope
        current_scope = st.session_state.get("analysis_scope")
        if current_scope and current_scope in st.session_state.entities:
            entity_name = st.session_state.entities[current_scope]["name"]
            df = df.copy()
            df["entity_owner"] = entity_name
            st.info(f"✅ Added entity_owner column with value: {entity_name}")
        else:
            st.warning("⚠️ Cannot determine entity owner for graph analysis.")
            st.info(
                "💡 Please select a specific entity from the analysis scope selector in the sidebar."
            )
            return

    # Import required components
    try:
        st.success("✅ All graph analysis components imported successfully")

        # Verify required columns are present
        required_columns = [
            "entity_owner",
            "counterparty",
            "DATE",
            "DESCRIPTION",
            "DEBIT",
            "CREDIT",
        ]
        missing_columns = [col for col in required_columns if col not in df.columns]

        if missing_columns:
            st.error(
                f"❌ Missing required columns for graph analysis: {missing_columns}"
            )
            st.info(
                "The following columns are required: entity_owner, counterparty, DATE, DESCRIPTION, DEBIT, CREDIT"
            )
            return

        # Check if we have actual counterparty data
        counterparty_count = df["counterparty"].notna().sum()
        if counterparty_count == 0:
            st.warning("⚠️ No counterparty data found in the processed dataset.")
            st.info(
                "💡 Please ensure counterparty extraction was successful in the 'Counterparty Extraction' tab."
            )
            return

        st.success(
            f"✅ All required columns present with {counterparty_count} counterparty records"
        )

    except ImportError as e:
        st.error(f"❌ Error importing graph analysis components: {str(e)}")
        st.info("Please ensure all graph analysis modules are available.")
        return

    # Initialize session state for graph analysis
    if "graph_analysis_state" not in st.session_state:
        st.session_state.graph_analysis_state = {
            "last_analysis_scope": None,
            "cached_graph": None,
            "cached_results": None,
            "analysis_in_progress": False,
        }

    # Configuration section
    with st.expander("🔧 Analysis Configuration", expanded=False):
        config = show_graph_analysis_config_ui()

    # Show current configuration summary
    show_config_summary(config)

    # Analysis controls
    st.markdown("### 🎯 Analysis Controls")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        run_analysis = st.button(
            "🚀 Run Graph Analysis",
            type="primary",
            help="Perform graph-based round trip detection on the selected data",
        )

    with col2:
        force_refresh = st.button(
            "🔄 Force Refresh", help="Clear cache and re-run analysis from scratch"
        )

    with col3:
        clear_cache = st.button("🗑️ Clear Cache", help="Clear all cached analysis data")

    # Handle control actions
    if clear_cache:
        st.session_state.graph_analysis_state = {
            "last_analysis_scope": None,
            "cached_graph": None,
            "cached_results": None,
            "analysis_in_progress": False,
        }
        st.success("✅ Cache cleared successfully!")
        st.rerun()

    # Check if we need to run analysis
    current_scope = st.session_state.get("analysis_scope")
    need_analysis = (
        run_analysis
        or force_refresh
        or st.session_state.graph_analysis_state["last_analysis_scope"] != current_scope
        or st.session_state.graph_analysis_state["cached_results"] is None
    )

    if (
        need_analysis
        and not st.session_state.graph_analysis_state["analysis_in_progress"]
    ):
        st.info("🚀 Starting graph network analysis...")
        _run_graph_network_analysis(df, config)
    elif (
        need_analysis and st.session_state.graph_analysis_state["analysis_in_progress"]
    ):
        st.warning("⏳ Analysis already in progress...")

    # Create tabbed interface for different visualization types
    tabs = st.tabs(
        [
            "🕸️ Network Overview",
            "📊 Centrality Analysis",
            "🔄 Cycle Details",
            "💰 Money Flow",
            "📈 Dashboard",
            "📥 Export",
        ]
    )

    # Get results for display in tabs
    results = st.session_state.graph_analysis_state.get("cached_results")
    graph = st.session_state.graph_analysis_state.get("cached_graph")

    # Network Overview Tab - Preserve existing network visualization
    with tabs[0]:
        st.markdown("### 🕸️ Network Overview")
        if results is not None:
            _display_network_overview_tab(results, config, graph)
        else:
            st.info("🔄 Please run the graph analysis to view network overview.")

    # Centrality Analysis Tab - Placeholder for future implementation
    with tabs[1]:
        st.markdown("### 📊 Centrality Analysis")
        if results is not None:
            _display_centrality_analysis_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view centrality analysis.")

    # Cycle Details Tab - Placeholder for future implementation
    with tabs[2]:
        st.markdown("### 🔄 Cycle Details")
        if results is not None:
            _display_cycle_details_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view cycle details.")

    # Money Flow Tab - Placeholder for future implementation
    with tabs[3]:
        st.markdown("### 💰 Money Flow Analysis")
        if results is not None:
            _display_money_flow_tab(results, config, graph)
        else:
            st.info("🔄 Please run the graph analysis to view money flow analysis.")

    # Dashboard Tab - Placeholder for future implementation
    with tabs[4]:
        st.markdown("### 📈 Network Dashboard")
        if results is not None:
            _display_dashboard_tab(results, config)
        else:
            st.info("🔄 Please run the graph analysis to view dashboard.")

    # Export Tab
    with tabs[5]:
        st.markdown("### 📥 Export Analysis Results")
        if results is not None:
            _handle_export_results(results, config)
        else:
            st.info("🔄 Please run the graph analysis to export results.")


def _display_network_overview_tab(results, config, graph):
    """
    Display the Network Overview tab with the existing network visualization.
    This preserves the current functionality in the first tab.
    """
    # This contains the existing display logic from _display_graph_analysis_results
    _display_graph_analysis_results(results, config)


def _run_graph_network_analysis(df: pd.DataFrame, config):
    """
    Execute the graph network analysis with progress tracking.

    Args:
        df: Transaction data DataFrame
        config: Analysis configuration
    """

    # Set analysis in progress
    st.session_state.graph_analysis_state["analysis_in_progress"] = True

    try:
        # Show progress
        progress_bar = st.progress(0)
        status_text = st.empty()

        status_text.text("🔨 Building transaction network...")
        progress_bar.progress(10)

        # Build transaction network
        builder = GraphNetworkBuilder()
        graph = builder.build_transaction_network(df)

        if graph.number_of_nodes() == 0:
            st.warning("⚠️ No valid transaction network could be built from the data.")
            return

        status_text.text(
            f"📊 Analyzing network ({graph.number_of_nodes()} nodes, {graph.number_of_edges()} edges)..."
        )
        progress_bar.progress(30)

        # Add transaction metadata
        builder.add_transaction_metadata(graph, df)

        status_text.text("🔍 Detecting round trip cycles...")
        progress_bar.progress(50)

        # Detect cycles
        detector = NetworkCycleDetector()
        cycle_params = config.get_cycle_detection_params()

        detected_cycles = detector.detect_network_cycles(
            graph,
            min_length=cycle_params["min_length"],
            max_length=cycle_params["max_length"],
            min_amount=cycle_params["min_amount"],
            max_duration_days=cycle_params["max_duration_days"],
            net_flow_threshold=cycle_params["net_flow_threshold"],
        )

        status_text.text("📈 Calculating centrality metrics...")
        progress_bar.progress(70)

        # Calculate centrality metrics
        centrality_metrics = detector.calculate_centrality_metrics(graph)

        status_text.text("🎯 Identifying hub entities...")
        progress_bar.progress(80)

        # Identify hub entities
        hub_entities = detector.identify_hub_entities(
            graph,
            threshold=config.hub_centrality_threshold,
            centrality_metrics=centrality_metrics,
        )

        status_text.text("🔬 Analyzing temporal patterns...")
        progress_bar.progress(90)

        # Detect temporal patterns
        temporal_analysis = detector.detect_temporal_patterns(graph, detected_cycles)

        # Get network statistics
        network_stats = builder.get_graph_statistics(graph)
        network_stats.update(temporal_analysis)

        status_text.text("✅ Analysis complete!")
        progress_bar.progress(100)

        # Create results object
        results = NetworkAnalysisResults(
            detected_cycles=detected_cycles,
            centrality_metrics=centrality_metrics,
            hub_entities=hub_entities,
            network_statistics=network_stats,
            anomaly_scores={},  # Could be enhanced with anomaly detection
            analysis_timestamp=datetime.now(),
            configuration_used=config.to_dict(),
        )

        # Cache results
        st.session_state.graph_analysis_state.update(
            {
                "cached_graph": graph,
                "cached_results": results,
                "last_analysis_scope": st.session_state.get("analysis_scope"),
                "analysis_in_progress": False,
            }
        )

        # Clear progress indicators
        progress_bar.empty()
        status_text.empty()

        st.success(
            f"✅ Analysis completed! Found {len(detected_cycles)} round trip cycles."
        )

    except Exception as e:
        st.error(f"❌ Error during analysis: {str(e)}")
        st.session_state.graph_analysis_state["analysis_in_progress"] = False


def _display_graph_analysis_results(results, config):
    """
    Display focused analysis results showing only suspect entities and relations.

    Args:
        results: Analysis results to display
        config: Analysis configuration used
    """

    if not results.detected_cycles:
        st.info("🔍 No round trip cycles detected in the transaction data.")
        return

    # Summary of findings
    st.markdown("### 🚨 Suspicious Activity Detected")

    col1, col2 = st.columns(2)

    with col1:
        st.metric(
            "Suspect Round Trips",
            len(results.detected_cycles),
            help="High-confidence suspicious round trip patterns",
        )

    with col2:
        total_volume = sum(cycle.total_amount for cycle in results.detected_cycles)
        st.metric(
            "Total Suspect Volume",
            f"₹{total_volume:,.0f}",
            help="Combined volume in suspicious cycles",
        )

    # Get suspect entities involved in cycles
    suspect_entities = set()
    for cycle in results.detected_cycles:
        suspect_entities.update(cycle.path)

    # Show suspect entities with their involvement
    st.markdown("### 🎯 Suspect Entities")

    entity_data = []
    for entity in suspect_entities:
        cycles_involved = [c for c in results.detected_cycles if entity in c.path]
        print("\n-----\n".join([str(c) for c in cycles_involved]))
        total_entity_volume = sum(c.total_amount for c in cycles_involved)
        avg_confidence = sum(c.confidence_score for c in cycles_involved) / len(
            cycles_involved
        )

        entity_data.append(
            {
                "Entity": entity,
                "Cycles Involved": len(cycles_involved),
                "Total Volume": f"₹{total_entity_volume:,.0f}",
                "Avg Confidence": f"{avg_confidence:.2f}",
                "Risk Level": "🔴 High" if avg_confidence >= 0.9 else "🟡 Medium",
            }
        )

    # Sort by involvement and display
    entity_data.sort(key=lambda x: x["Cycles Involved"], reverse=True)
    entity_df = pd.DataFrame(entity_data)
    st.dataframe(entity_df, use_container_width=True)

    # Show suspect cycles
    st.markdown("### 🔄 Suspect Round Trip Patterns")

    for i, cycle in enumerate(
        results.detected_cycles[:10]
    ):  # Show top 10 most suspicious
        with st.expander(
            f"🚨 RT-{i + 1:03d}: {' → '.join(cycle.path[:3])}{'...' if len(cycle.path) > 3 else ''} (₹{cycle.total_amount:,.0f})"
        ):
            # Calculate in/out amounts and timing
            if cycle.transactions:
                # First transaction (money going out from origin)
                first_tx = cycle.transactions[0]
                out_amount = first_tx["amount"]
                out_time = first_tx["date"]

                # Last transaction (money coming back to origin)
                last_tx = cycle.transactions[-1]
                in_amount = last_tx["amount"]
                in_time = last_tx["date"]

                # Calculate percentage difference
                if out_amount > 0:
                    percentage_diff = ((in_amount - out_amount) / out_amount) * 100
                else:
                    percentage_diff = 0

                # Calculate time difference
                time_diff = (in_time - out_time).total_seconds()
                time_diff_days = time_diff / (24 * 3600)
                time_diff_hours = (time_diff % (24 * 3600)) / 3600
                time_diff_minutes = (time_diff % 3600) / 60

            # Top row metrics
            col1, col2, col3, col4 = st.columns(4)

            with col1:
                st.metric("Confidence Score", f"{cycle.confidence_score:.2f}")

            with col2:
                st.metric("Cycle Length", len(cycle.path))

            with col3:
                st.metric("Total Amount", f"₹{cycle.total_amount:,.0f}")

            with col4:
                st.metric("Net Flow", f"₹{cycle.net_flow:,.0f}")

            # In/Out Analysis
            if cycle.transactions:
                st.markdown("**💰 In/Out Analysis:**")

                in_out_col1, in_out_col2, in_out_col3 = st.columns(3)

                with in_out_col1:
                    st.metric(
                        "Amount Out",
                        f"₹{out_amount:,.0f}",
                        help="Initial amount leaving the origin entity",
                    )

                with in_out_col2:
                    st.metric(
                        "Amount In",
                        f"₹{in_amount:,.0f}",
                        help="Final amount returning to the origin entity",
                    )

                with in_out_col3:
                    diff_color = "normal"
                    if percentage_diff > 5:
                        diff_color = "inverse"  # Red for gains
                    elif percentage_diff < -5:
                        diff_color = "off"  # Gray for losses

                    st.metric(
                        "Difference",
                        f"{percentage_diff:+.1f}%",
                        delta=f"₹{in_amount - out_amount:+,.0f}",
                        help="Percentage and absolute difference between in and out amounts",
                    )

                # Timing Analysis
                st.markdown("**⏱️ Timing Analysis:**")

                timing_col1, timing_col2, timing_col3 = st.columns(3)

                with timing_col1:
                    st.write(f"**Out Time:** {out_time.strftime('%Y-%m-%d %H:%M:%S')}")

                with timing_col2:
                    st.write(f"**In Time:** {in_time.strftime('%Y-%m-%d %H:%M:%S')}")

                with timing_col3:
                    if time_diff_days >= 1:
                        time_display = f"{time_diff_days:.1f} days"
                    elif time_diff_hours >= 1:
                        time_display = f"{time_diff_hours:.1f} hours"
                    else:
                        time_display = f"{time_diff_minutes:.0f} minutes"

                    st.write(f"**Duration:** {time_display}")

            # Show full path
            st.markdown("**🔄 Transaction Path:**")
            path_display = " → ".join(cycle.path)
            st.code(path_display, language=None)

            # Show detailed transaction flow
            if (
                cycle.transactions and len(cycle.transactions) <= 10
            ):  # Only show for shorter cycles
                st.markdown("**📊 Transaction Details:**")

                tx_data = []
                for j, tx in enumerate(cycle.transactions):
                    tx_data.append(
                        {
                            "Step": j + 1,
                            "From": tx["source"],
                            "To": tx["target"],
                            "Amount": f"₹{tx['amount']:,.0f}",
                            "Date": tx["date"].strftime("%Y-%m-%d %H:%M"),
                            "Type": tx["transaction_type"],
                        }
                    )

                tx_df = pd.DataFrame(tx_data)
                st.dataframe(tx_df, use_container_width=True, hide_index=True)

    # Network visualization focused on suspect entities only
    st.markdown("### 🕸️ Suspect Entity Network")

    graph = st.session_state.graph_analysis_state.get("cached_graph")

    if graph is not None:
        # Create subgraph with only suspect entities and their direct connections
        visualizer = NetworkVisualizer()

        VisualizationConfig(
            highlight_cycles=True,
            show_labels=True,
            node_size_range=(20, 80),
            edge_width_range=(2.0, 10.0),
        )

        # Create focused network visualization
        network_fig = visualizer.create_entity_network_visualization(
            graph=graph,
            cycles=results.detected_cycles,
            centrality_metrics=results.centrality_metrics,
            title=f"Suspect Entity Network - {len(results.detected_cycles)} Suspicious Patterns",
        )

        st.plotly_chart(network_fig, use_container_width=True, height=600)

    else:
        st.error("❌ Network graph not available. Please re-run the analysis.")
