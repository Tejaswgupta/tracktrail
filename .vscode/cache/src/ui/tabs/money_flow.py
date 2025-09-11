def _display_money_flow_tab(results, config, graph):
    """
    Display money flow analysis visualization tab.
    Shows transaction flow direction with arrows, edge thickness based on volume,
    color coding for timing patterns, and temporal flow analysis with animation.
    """
    st.markdown("#### 💰 Money Flow Analysis")
    st.markdown(
        "Analyze transaction flows over time to identify rapid movement patterns, "
        "smurfing indicators, and temporal sequences that may indicate suspicious activity."
    )

    if not graph or graph.number_of_edges() == 0:
        st.warning("⚠️ No transaction network available for money flow analysis.")
        return

    # Create NetworkVisualizer instance for flow visualization
    try:
        from datetime import datetime, timedelta

        import pandas as pd

        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Show basic flow information
        st.markdown("#### 📊 Flow Summary")
        col1, col2, col3, col4 = st.columns(4)

        total_edges = graph.number_of_edges()
        total_volume = sum(
            d.get("total_amount", 0) for _, _, d in graph.edges(data=True)
        )
        rapid_cycles = (
            len([c for c in results.detected_cycles if c.duration_days <= 7])
            if results.detected_cycles
            else 0
        )

        with col1:
            st.metric("Transaction Relationships", total_edges)
        with col2:
            st.metric("Total Volume", f"₹{total_volume:,.0f}")
        with col3:
            st.metric(
                "Detected Cycles",
                len(results.detected_cycles) if results.detected_cycles else 0,
            )
        with col4:
            st.metric("Rapid Cycles (≤7 days)", rapid_cycles)

        # Temporal Flow Analysis Section
        st.markdown("#### ⏰ Temporal Flow Analysis")

        # Temporal analysis controls
        col1, col2 = st.columns(2)

        with col1:
            st.markdown("**Time Period Filter**")
            # Get date range from graph data
            all_dates = []
            for _, _, data in graph.edges(data=True):
                if "first_transaction" in data and pd.notna(data["first_transaction"]):
                    all_dates.append(pd.to_datetime(data["first_transaction"]))
                if "last_transaction" in data and pd.notna(data["last_transaction"]):
                    all_dates.append(pd.to_datetime(data["last_transaction"]))

            if all_dates:
                min_date = min(all_dates).date()
                max_date = max(all_dates).date()

                date_range = st.date_input(
                    "Select date range for analysis",
                    value=(min_date, max_date),
                    min_value=min_date,
                    max_value=max_date,
                    help="Filter transactions to analyze specific time periods",
                )

                if isinstance(date_range, tuple) and len(date_range) == 2:
                    time_filter_start = datetime.combine(
                        date_range[0], datetime.min.time()
                    )
                    time_filter_end = datetime.combine(
                        date_range[1], datetime.max.time()
                    )
                else:
                    time_filter_start = None
                    time_filter_end = None
            else:
                st.info("No temporal data available in the transaction network.")
                time_filter_start = None
                time_filter_end = None

        with col2:
            st.markdown("**Analysis Parameters**")
            velocity_threshold = st.slider(
                "Velocity Threshold (transactions/day)",
                min_value=0.1,
                max_value=5.0,
                value=1.0,
                step=0.1,
                help="Highlight sequences with transaction velocity above this threshold",
            )

            animation_mode = st.selectbox(
                "Animation Mode",
                options=["sequence", "continuous"],
                index=0,
                help="Choose how temporal flows are animated",
            )

        # Create temporal flow visualization
        if st.button("🎬 Generate Temporal Flow Animation", type="primary"):
            with st.spinner("Creating temporal flow analysis..."):
                try:
                    temporal_fig = visualizer.create_temporal_flow_animation(
                        graph=graph,
                        cycles=results.detected_cycles or [],
                        time_filter_start=time_filter_start,
                        time_filter_end=time_filter_end,
                        velocity_threshold=velocity_threshold,
                        animation_mode=animation_mode,
                        title="Temporal Transaction Flow Analysis",
                    )

                    st.plotly_chart(temporal_fig, use_container_width=True)

                    # Show analysis insights
                    st.markdown("#### 🔍 Analysis Insights")

                    if temporal_fig.frames:
                        st.success(
                            f"✅ Created temporal animation with {len(temporal_fig.frames)} time periods"
                        )

                        # Show rapid sequence warnings if any
                        if rapid_cycles > 0:
                            st.warning(
                                f"⚠️ **{rapid_cycles} rapid cycles detected** (≤7 days duration)\n\n"
                                "These may indicate potential smurfing or layering activities. "
                                "Use the animation controls to examine the timing and sequence of these transactions."
                            )

                        # Usage instructions
                        with st.expander(
                            "📖 How to Use Temporal Analysis", expanded=False
                        ):
                            st.markdown("""
                            **Animation Controls:**
                            - **Play Button**: Start the temporal animation to see transactions unfold over time
                            - **Time Slider**: Jump to specific time periods or scrub through the timeline
                            - **Pause Button**: Stop the animation at any point for detailed examination
                            
                            **Visual Indicators:**
                            - **Blue Lines**: Normal transaction flows
                            - **Red Dashed Lines**: Rapid sequences (potential smurfing indicators)
                            - **Node Size**: Larger nodes indicate higher activity in the current time period
                            - **Node Brightness**: Brighter nodes are active in the current time period
                            
                            **Investigation Tips:**
                            - Look for rapid sequences of transactions between the same entities
                            - Pay attention to timing patterns that suggest coordinated activity
                            - Use the time filter to focus on specific suspicious periods
                            - Adjust velocity threshold to highlight different levels of activity
                            """)
                    else:
                        st.info(
                            "No temporal patterns found in the selected time range."
                        )

                except Exception as e:
                    st.error(f"❌ Error creating temporal flow analysis: {str(e)}")
                    st.info(
                        "Please check that your transaction data includes valid date information."
                    )

    except ImportError as e:
        st.error(f"❌ Error importing visualization components: {str(e)}")
        st.info("Please ensure all required visualization modules are available.")
    except Exception as e:
        st.error(f"❌ Unexpected error in money flow analysis: {str(e)}")

        # Fallback to basic flow information
        st.markdown("#### Basic Flow Information")
        total_edges = graph.number_of_edges()
        total_volume = sum(
            d.get("total_amount", 0) for _, _, d in graph.edges(data=True)
        )
        st.metric("Total Transaction Relationships", total_edges)
        st.metric("Total Transaction Volume", f"₹{total_volume:,.0f}")
