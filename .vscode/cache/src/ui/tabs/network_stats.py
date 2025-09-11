def _display_basic_network_statistics(results):
    """
    Display basic network statistics as fallback when dashboard creation fails.
    """
    st.markdown("#### 📊 Basic Network Statistics")

    if results.network_statistics:
        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Network Nodes", results.network_statistics.get("total_nodes", 0))
        with col2:
            st.metric("Network Edges", results.network_statistics.get("total_edges", 0))
        with col3:
            st.metric(
                "Detected Cycles",
                len(results.detected_cycles) if results.detected_cycles else 0,
            )

    # Show basic cycle information
    if results.detected_cycles:
        st.markdown("##### Recent Cycles")
        for i, cycle in enumerate(results.detected_cycles[:3], 1):
            st.write(
                f"{i}. **₹{cycle.total_amount:,.0f}** - {cycle.duration_days} days - {cycle.cycle_type}"
            )

    # Show basic centrality information
    if results.centrality_metrics:
        st.markdown("##### Top Entities by Centrality")
        top_entities = sorted(
            results.centrality_metrics.items(),
            key=lambda x: x[1].get("pagerank", 0),
            reverse=True,
        )[:3]

        for i, (entity, metrics) in enumerate(top_entities, 1):
            display_name = entity[:40] + "..." if len(entity) > 40 else entity
            pagerank = metrics.get("pagerank", 0)
            st.write(f"{i}. **{display_name}** - PageRank: {pagerank:.3f}")
