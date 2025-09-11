def _display_cycle_details_tab(results, config):
    """
    Display cycle details table visualization tab.
    Shows cycle ID, path, amounts, duration, confidence, and type with sorting and filtering capabilities.
    """
    if not results.detected_cycles:
        st.warning("⚠️ No round trip cycles detected in the current analysis.")
        st.info(
            "💡 Try adjusting the analysis configuration to detect more cycles, or ensure your data contains potential round trip patterns."
        )
        return

    st.markdown("#### 🔄 Detected Round Trip Cycles")
    st.markdown(
        f"Found **{len(results.detected_cycles)}** round trip cycles in the network analysis."
    )

    # Create NetworkVisualizer instance for cycle details table
    try:
        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Create cycle details table using NetworkVisualizer method
        cycle_table_fig = visualizer.create_cycle_details_table(results.detected_cycles)

        # Display the cycle details table
        st.plotly_chart(cycle_table_fig, use_container_width=True)

    except Exception as e:
        st.error(f"❌ Error creating cycle details table: {str(e)}")
        st.info("Falling back to basic cycle data display...")

        # Fallback: Create a basic table using Streamlit's dataframe
        _display_fallback_cycle_table(results.detected_cycles)

    # Add filtering and sorting controls
    st.markdown("#### 🔍 Filter and Sort Cycles")

    col1, col2, col3 = st.columns(3)

    with col1:
        # Filter by minimum amount
        min_amount = st.number_input(
            "Minimum Amount (₹)",
            min_value=0.0,
            value=0.0,
            step=1000.0,
            help="Filter cycles by minimum total amount",
        )

    with col2:
        # Filter by cycle type
        cycle_types = list(set(cycle.cycle_type for cycle in results.detected_cycles))
        selected_types = st.multiselect(
            "Cycle Types",
            options=cycle_types,
            default=cycle_types,
            help="Filter cycles by type",
        )

    with col3:
        # Sort options
        sort_options = {
            "Total Amount (High to Low)": ("total_amount", False),
            "Total Amount (Low to High)": ("total_amount", True),
            "Duration (Shortest First)": ("duration_days", True),
            "Duration (Longest First)": ("duration_days", False),
            "Confidence (High to Low)": ("confidence_score", False),
            "Confidence (Low to High)": ("confidence_score", True),
        }

        sort_choice = st.selectbox(
            "Sort By",
            options=list(sort_options.keys()),
            index=0,
            help="Sort cycles by selected criteria",
        )

    # Apply filters and sorting
    filtered_cycles = []
    for cycle in results.detected_cycles:
        # Apply amount filter
        if cycle.total_amount < min_amount:
            continue

        # Apply type filter
        if cycle.cycle_type not in selected_types:
            continue

        filtered_cycles.append(cycle)

    # Apply sorting
    sort_attr, ascending = sort_options[sort_choice]
    filtered_cycles.sort(key=lambda x: getattr(x, sort_attr), reverse=not ascending)

    # Display filtered results summary
    if len(filtered_cycles) != len(results.detected_cycles):
        st.info(
            f"📊 Showing {len(filtered_cycles)} of {len(results.detected_cycles)} cycles after filtering"
        )

    # Create detailed cycle information display
    if filtered_cycles:
        st.markdown("#### 📋 Detailed Cycle Information")

        # Create expandable sections for each cycle
        for i, cycle in enumerate(
            filtered_cycles[:20]
        ):  # Limit to first 20 for performance
            with st.expander(
                f"🔄 Cycle {i + 1}: {' → '.join(cycle.path[:3])}{'...' if len(cycle.path) > 3 else ''} (₹{cycle.total_amount:,.0f})",
                expanded=False,
            ):
                # Create columns for cycle details
                detail_col1, detail_col2 = st.columns(2)

                with detail_col1:
                    st.markdown("**Cycle Information:**")
                    st.write(f"• **ID:** RT-{i + 1:03d}")
                    st.write(f"• **Type:** {cycle.cycle_type.title()}")
                    st.write(f"• **Total Amount:** ₹{cycle.total_amount:,.2f}")
                    st.write(f"• **Net Flow:** ₹{cycle.net_flow:,.2f}")
                    st.write(f"• **Duration:** {cycle.duration_days} days")
                    st.write(f"• **Confidence:** {cycle.confidence_score:.3f}")

                with detail_col2:
                    st.markdown("**Transaction Path:**")
                    path_display = " → ".join(cycle.path)
                    st.write(f"• **Full Path:** {path_display}")
                    st.write(f"• **Path Length:** {len(cycle.path)} entities")

                    # Show risk indicators
                    risk_level = (
                        "🔴 High"
                        if cycle.confidence_score > 0.8
                        else "🟡 Medium"
                        if cycle.confidence_score > 0.5
                        else "🟢 Low"
                    )
                    st.write(f"• **Risk Level:** {risk_level}")

                # In/Out Analysis
                if cycle.transactions:
                    st.markdown("**💰 In/Out Analysis:**")

                    # Calculate in/out amounts and timing
                    first_tx = cycle.transactions[0]
                    last_tx = cycle.transactions[-1]
                    out_amount = first_tx["amount"]
                    in_amount = last_tx["amount"]
                    out_time = first_tx["date"]
                    in_time = last_tx["date"]

                    # Calculate percentage difference
                    if out_amount > 0:
                        percentage_diff = ((in_amount - out_amount) / out_amount) * 100
                    else:
                        percentage_diff = 0

                    # Calculate time difference
                    time_diff = (in_time - out_time).total_seconds()
                    time_diff_days = time_diff / (24 * 3600)

                    in_out_col1, in_out_col2, in_out_col3 = st.columns(3)

                    with in_out_col1:
                        st.write(f"• **Out:** ₹{out_amount:,.0f}")
                        st.write(
                            f"• **Out Time:** {out_time.strftime('%Y-%m-%d %H:%M')}"
                        )

                    with in_out_col2:
                        st.write(f"• **In:** ₹{in_amount:,.0f}")
                        st.write(f"• **In Time:** {in_time.strftime('%Y-%m-%d %H:%M')}")

                    with in_out_col3:
                        st.write(f"• **Difference:** {percentage_diff:+.1f}%")
                        if time_diff_days >= 1:
                            time_display = f"{time_diff_days:.1f} days"
                        else:
                            time_display = f"{time_diff_days * 24:.1f} hours"
                        st.write(f"• **Duration:** {time_display}")

                # Additional analysis if available
                if hasattr(cycle, "transaction_details") and cycle.transaction_details:
                    st.markdown("**Transaction Details:**")
                    # Display transaction details in a small table
                    details_df = pd.DataFrame(cycle.transaction_details)
                    st.dataframe(details_df, use_container_width=True, height=150)

    # Cycle analysis summary
    st.markdown("#### 📈 Cycle Analysis Summary")

    if filtered_cycles:
        summary_col1, summary_col2, summary_col3, summary_col4 = st.columns(4)

        with summary_col1:
            total_cycles = len(filtered_cycles)
            st.metric("Filtered Cycles", total_cycles)

        with summary_col2:
            total_amount = sum(cycle.total_amount for cycle in filtered_cycles)
            st.metric("Total Amount", f"₹{total_amount:,.0f}")

        with summary_col3:
            avg_confidence = np.mean(
                [cycle.confidence_score for cycle in filtered_cycles]
            )
            st.metric("Avg Confidence", f"{avg_confidence:.3f}")

        with summary_col4:
            avg_duration = np.mean([cycle.duration_days for cycle in filtered_cycles])
            st.metric("Avg Duration", f"{avg_duration:.1f} days")

    # Show interpretation guide
    with st.expander("📖 Understanding Cycle Analysis", expanded=False):
        st.markdown("""
        **Round Trip Cycle Analysis Explained:**
        
        - **Cycle ID**: Unique identifier for each detected cycle (RT-001, RT-002, etc.)
        - **Path**: The sequence of entities involved in the round trip transaction flow
        - **Total Amount**: Sum of all transaction amounts in the cycle
        - **Net Flow**: The net amount that flows through the cycle (should be close to zero for true round trips)
        - **Duration**: Time span from the first to last transaction in the cycle
        - **Confidence Score**: Algorithm confidence in the cycle detection (0.0 to 1.0)
        - **Type**: Classification of the cycle pattern (e.g., simple, complex, layered)
        
        **Law Enforcement Relevance:**
        - High-confidence cycles with large amounts may indicate money laundering
        - Short-duration cycles could suggest rapid movement to avoid detection
        - Complex paths might indicate sophisticated layering techniques
        - Multiple cycles involving the same entities could indicate systematic criminal activity
        """)
