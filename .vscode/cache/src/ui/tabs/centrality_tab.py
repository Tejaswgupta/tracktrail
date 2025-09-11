def _display_centrality_analysis_tab(results, config):
    """
    Display centrality analysis visualization tab.
    Shows betweenness, PageRank, and degree centrality metrics with top entities ranked by combined centrality scores.
    """
    if not results.centrality_metrics:
        st.warning(
            "⚠️ No centrality metrics available. Please ensure centrality analysis is enabled in configuration."
        )
        return

    st.markdown("#### 📊 Entity Centrality Analysis")
    st.markdown(
        "Centrality analysis identifies the most important entities in the network based on their connectivity and influence."
    )

    # Create NetworkVisualizer instance for centrality visualization
    try:
        # Create visualization config
        viz_config = VisualizationConfig()
        visualizer = NetworkVisualizer(config=viz_config)

        # Create centrality visualization using NetworkVisualizer method
        centrality_fig = visualizer.create_centrality_visualization(
            centrality_data=results.centrality_metrics, top_n=20
        )

        # Display the centrality visualization
        st.plotly_chart(centrality_fig, use_container_width=True)

    except Exception as e:
        st.error(f"❌ Error creating centrality visualization: {str(e)}")
        st.info("Falling back to basic centrality data display...")

    # Display top entities ranked by combined centrality scores
    st.markdown("#### 🏆 Top Entities by Combined Centrality Score")

    # Calculate combined centrality scores
    entity_scores = []
    for entity, metrics in results.centrality_metrics.items():
        betweenness = metrics.get("betweenness", 0)
        pagerank = metrics.get("pagerank", 0)
        degree = metrics.get("total_degree", 0)

        # Normalize degree by total number of entities for fair comparison
        max_degree = (
            max([m.get("total_degree", 0) for m in results.centrality_metrics.values()])
            or 1
        )
        normalized_degree = degree / max_degree

        # Combined score (weighted average)
        combined_score = (
            (betweenness * 0.4) + (pagerank * 0.4) + (normalized_degree * 0.2)
        )

        entity_scores.append(
            {
                "Entity": entity,
                "Betweenness Centrality": f"{betweenness:.4f}",
                "PageRank Centrality": f"{pagerank:.4f}",
                "Degree Centrality": degree,
                "Combined Score": f"{combined_score:.4f}",
            }
        )

    # Sort by combined score and display top entities
    entity_scores.sort(key=lambda x: float(x["Combined Score"]), reverse=True)

    # Display top 15 entities in a table
    top_entities_df = pd.DataFrame(entity_scores[:15])
    st.dataframe(top_entities_df, use_container_width=True)

    # Show interpretation guide
    with st.expander("📖 Understanding Centrality Metrics", expanded=False):
        st.markdown("""
        **Centrality Metrics Explained:**
        
        - **Betweenness Centrality**: Measures how often an entity acts as a bridge between other entities. High values indicate entities that control information or transaction flow.
        
        - **PageRank Centrality**: Measures the importance of an entity based on the importance of entities connected to it. High values indicate influential entities in the network.
        
        - **Degree Centrality**: Simply counts the number of direct connections. High values indicate entities with many direct relationships.
        
        - **Combined Score**: A weighted average of all centrality measures, providing an overall importance ranking.
        
        **Law Enforcement Relevance:**
        - High centrality entities may be key players in money laundering networks
        - Entities with high betweenness centrality could be intermediaries or money brokers
        - High PageRank entities might be influential figures in criminal networks
        """)

    # Additional metrics summary
    st.markdown("#### 📈 Centrality Analysis Summary")

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        total_entities = len(results.centrality_metrics)
        st.metric("Total Entities", total_entities)

    with col2:
        # Count high centrality entities (combined score > 0.5)
        high_centrality_count = sum(
            1 for scores in entity_scores if float(scores["Combined Score"]) > 0.5
        )
        st.metric("High Centrality Entities", high_centrality_count)

    with col3:
        # Average betweenness centrality
        avg_betweenness = np.mean(
            [
                metrics.get("betweenness", 0)
                for metrics in results.centrality_metrics.values()
            ]
        )
        st.metric("Avg Betweenness", f"{avg_betweenness:.4f}")

    with col4:
        # Average PageRank
        avg_pagerank = np.mean(
            [
                metrics.get("pagerank", 0)
                for metrics in results.centrality_metrics.values()
            ]
        )
        st.metric("Avg PageRank", f"{avg_pagerank:.4f}")
