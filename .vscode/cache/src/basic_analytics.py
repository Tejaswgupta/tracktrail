
def basic_analytics_tab():
    st.header("📊 Basic Transaction Analytics")

    df = get_analysis_dataframe()
    if df.empty:
        st.info("🎯 Select an analysis scope from the sidebar to begin.")
        return

    # Use merged counterparty data if available and extract counterparty names if not
    df_analysis = df.copy()

    # Ensure proper data types to avoid column configuration issues
    if "DESCRIPTION" in df_analysis.columns:
        df_analysis["DESCRIPTION"] = df_analysis["DESCRIPTION"].astype(str).fillna("")
    if "DEBIT" in df_analysis.columns:
        df_analysis["DEBIT"] = pd.to_numeric(df_analysis["DEBIT"], errors="coerce")
    if "CREDIT" in df_analysis.columns:
        df_analysis["CREDIT"] = pd.to_numeric(df_analysis["CREDIT"], errors="coerce")

    merged_df = get_analysis_dataframe_with_context()

    # Check if we need to extract counterparty data
    if "counterparty" not in df_analysis.columns:
        if (
            merged_df is not None
            and not merged_df.empty
            and "counterparty" in merged_df.columns
        ):
            # Try to align merged counterparty data with current scope
            # Create a mapping based on DATE, DESCRIPTION, and amounts to match transactions
            try:
                # Create unique identifiers for transactions
                df_analysis["_temp_id"] = (
                    df_analysis["DATE"].astype(str)
                    + "_"
                    + df_analysis["DESCRIPTION"].astype(str)
                    + "_"
                    + df_analysis["DEBIT"].fillna(0).astype(str)
                    + "_"
                    + df_analysis["CREDIT"].fillna(0).astype(str)
                )
                merged_df["_temp_id"] = (
                    merged_df["DATE"].astype(str)
                    + "_"
                    + merged_df["DESCRIPTION"].astype(str)
                    + "_"
                    + merged_df["DEBIT"].fillna(0).astype(str)
                    + "_"
                    + merged_df["CREDIT"].fillna(0).astype(str)
                )

                # Merge counterparty data based on transaction matching
                counterparty_mapping = merged_df[
                    ["_temp_id", "counterparty", "COUNTERPARTY_ORIGINAL"]
                ].drop_duplicates()
                df_analysis = df_analysis.merge(
                    counterparty_mapping, on="_temp_id", how="left"
                )

                # Clean up temporary columns
                df_analysis = df_analysis.drop("_temp_id", axis=1)

                # Fill missing counterparty values with empty string
                df_analysis["counterparty"] = df_analysis["counterparty"].fillna("")
                df_analysis["COUNTERPARTY_ORIGINAL"] = df_analysis[
                    "COUNTERPARTY_ORIGINAL"
                ].fillna("")

                if df_analysis["counterparty"].notna().any():
                    st.info("✅ Using merged counterparty data for enhanced analysis")

            except Exception as e:
                st.warning(f"Could not align counterparty data: {str(e)}")
                # Fallback: extract counterparty names directly
                df_analysis = extract_counterparty_for_analysis(df_analysis)
        else:
            # Extract counterparty names directly from descriptions
            df_analysis = extract_counterparty_for_analysis(df_analysis)
    else:
        # Counterparty column already exists
        if (
            merged_df is not None
            and not merged_df.empty
            and "counterparty" in merged_df.columns
        ):
            st.info("✅ Using existing counterparty data")

    # Date is already converted when loading, no need to convert again

    # Helper function to categorize transactions as cash or bank
    def categorize_transaction_type(description):
        """Categorize transaction as 'cash' or 'bank' based on description"""
        if pd.isna(description):
            return "bank"

        desc_upper = str(description).upper()
        cash_keywords = ["CASH", "ATM", "WITHDRAWAL", "CHQ"]

        # Check for cash indicators
        if any(keyword in desc_upper for keyword in cash_keywords):
            return "cash"

        # Check for bank transfer indicators
        bank_keywords = ["NEFT", "RTGS", "IMPS", "UPI", "DEPOSIT BY", "TRANSFER"]
        if any(keyword in desc_upper for keyword in bank_keywords):
            return "bank"

        # Default to bank for unclear cases
        return "bank"

    # Add transaction type categorization
    df_analysis["txn_type"] = df_analysis["DESCRIPTION"].apply(
        categorize_transaction_type
    )

    # Overall metrics
    col1, col2, col3, col4 = st.columns(4)

    with col1:
        total_txns = len(df_analysis)
        st.metric("Total Transactions", f"{total_txns:,}")

    with col2:
        total_debit = df_analysis["DEBIT"].fillna(0).sum()
        st.metric("Total Debits", f"₹{total_debit:,.0f}")

    with col3:
        total_credit = df_analysis["CREDIT"].fillna(0).sum()
        st.metric("Total Credits", f"₹{total_credit:,.0f}")

    with col4:
        net_flow = total_credit - total_debit
        st.metric(
            "Net Flow",
            f"₹{net_flow:,.0f}",
            delta=f"{'Inflow' if net_flow > 0 else 'Outflow'}",
        )

    # Cash vs Bank bifurcation
    st.subheader("💰 Cash vs Bank Breakdown")

    # Calculate cash and bank amounts
    cash_txns = df_analysis[df_analysis["txn_type"] == "cash"]
    bank_txns = df_analysis[df_analysis["txn_type"] == "bank"]

    col1, col2, col3, col4 = st.columns(4)

    with col1:
        cash_debit = cash_txns["DEBIT"].fillna(0).sum()
        bank_debit = bank_txns["DEBIT"].fillna(0).sum()
        st.metric("Cash Debits", f"₹{cash_debit:,.0f}")
        st.caption(f"Bank Debits: ₹{bank_debit:,.0f}")

    with col2:
        cash_credit = cash_txns["CREDIT"].fillna(0).sum()
        bank_credit = bank_txns["CREDIT"].fillna(0).sum()
        st.metric("Cash Credits", f"₹{cash_credit:,.0f}")
        st.caption(f"Bank Credits: ₹{bank_credit:,.0f}")

    with col3:
        cash_count = len(cash_txns)
        bank_count = len(bank_txns)
        st.metric("Cash Transactions", f"{cash_count:,}")
        st.caption(f"Bank Transactions: {bank_count:,}")

    with col4:
        cash_net = cash_credit - cash_debit
        bank_net = bank_credit - bank_debit
        st.metric("Cash Net Flow", f"₹{cash_net:,.0f}")
        st.caption(f"Bank Net Flow: ₹{bank_net:,.0f}")

    st.divider()

    # counterparty analysis
    # Ensure counterparty column exists
    # if "counterparty" not in df_analysis.columns:
    #     # Extract counterparty names from descriptions
    #     standardizer = CounterpartyStandardizer(85)
    #     df_analysis["counterparty"] = ""

    #     for idx, row in df_analysis.iterrows():
    #         desc = row.get("DESCRIPTION", "")
    #         name = standardizer.extract_counterparty_name(desc)
    #         if name:
    #             df_analysis.at[idx, "counterparty"] = name

    if "counterparty" in df_analysis.columns:
        st.subheader("🏢 counterparty Analysis")

        df_cp = df_analysis[df_analysis["counterparty"] != ""].copy()

        if len(df_cp) > 0:
            # Calculate stats per counterparty
            cp_stats = (
                df_cp.groupby("counterparty")
                .agg(
                    {
                        "DEBIT": ["count", "sum", "mean", "max"],
                        "CREDIT": ["count", "sum", "mean", "max"],
                        "DATE": ["min", "max"],
                    }
                )
                .round(2)
            )

            # Flatten column names
            cp_stats.columns = [
                "_".join(col).strip() for col in cp_stats.columns.values
            ]

            # Calculate additional metrics
            cp_stats["total_transactions"] = (
                cp_stats["DEBIT_count"] + cp_stats["CREDIT_count"]
            )
            cp_stats["total_volume"] = cp_stats["DEBIT_sum"].fillna(0) + cp_stats[
                "CREDIT_sum"
            ].fillna(0)
            cp_stats["net_flow"] = cp_stats["CREDIT_sum"].fillna(0) - cp_stats[
                "DEBIT_sum"
            ].fillna(0)
            cp_stats["days_active"] = (
                cp_stats["DATE_max"] - cp_stats["DATE_min"]
            ).dt.days + 1
            cp_stats["txn_frequency"] = (
                cp_stats["total_transactions"] / cp_stats["days_active"]
            )

            # Sort by total volume
            cp_stats = cp_stats.sort_values("total_volume", ascending=False)

            # Display options
            col1, col2 = st.columns([1, 3])

            with col1:
                sort_by = st.selectbox(
                    "Sort by:",
                    options=[
                        "total_volume",
                        "total_transactions",
                        "net_flow",
                        "txn_frequency",
                    ],
                    format_func=lambda x: {
                        "total_volume": "Total Volume",
                        "total_transactions": "Transaction Count",
                        "net_flow": "Net Flow",
                        "txn_frequency": "Transaction Frequency",
                    }[x],
                )

                top_n = st.slider("Show top N counterparties:", 5, 50, 10)

            with col2:
                # Bar chart
                top_cp = cp_stats.nlargest(top_n, sort_by)

                fig = px.bar(
                    top_cp.reset_index(),
                    x="counterparty",
                    y=sort_by,
                    title=f"Top {top_n} Counterparties by {sort_by.replace('_', ' ').title()}",
                )
                st.plotly_chart(fig, use_container_width=True)

            # Detailed table
            st.subheader("📋 Detailed counterparty Statistics")

            # Format the display
            display_df = cp_stats.head(top_n).copy()
            display_df["DEBIT_sum"] = display_df["DEBIT_sum"].apply(
                lambda x: f"₹{x:,.0f}" if pd.notna(x) else "-"
            )
            display_df["CREDIT_sum"] = display_df["CREDIT_sum"].apply(
                lambda x: f"₹{x:,.0f}" if pd.notna(x) else "-"
            )
            display_df["total_volume"] = display_df["total_volume"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            display_df["net_flow"] = display_df["net_flow"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            display_df["txn_frequency"] = display_df["txn_frequency"].apply(
                lambda x: f"{x:.1f}/day"
            )

            # Select columns to display
            display_cols = [
                "total_transactions",
                "DEBIT_sum",
                "CREDIT_sum",
                "total_volume",
                "net_flow",
                "days_active",
                "txn_frequency",
            ]

            st.dataframe(
                display_df[display_cols],
                use_container_width=True,
                column_config={
                    "total_transactions": "Total Txns",
                    "DEBIT_sum": "Total Debits",
                    "CREDIT_sum": "Total Credits",
                    "total_volume": "Total Volume",
                    "net_flow": "Net Flow",
                    "days_active": "Days Active",
                    "txn_frequency": "Avg Frequency",
                },
            )

    # Time-based analysis
    st.divider()
    st.subheader("📅 Time-based Analysis")

    col1, col2 = st.columns(2)

    with col1:
        # Daily transaction volume
        daily_volume = (
            df_analysis.groupby(df_analysis["DATE"].dt.date)
            .agg({"DEBIT": "sum", "CREDIT": "sum"})
            .fillna(0)
        )

        fig = go.Figure()
        fig.add_trace(
            go.Scatter(
                x=daily_volume.index,
                y=daily_volume["DEBIT"],
                name="Debits",
                line=dict(color="red"),
            )
        )
        fig.add_trace(
            go.Scatter(
                x=daily_volume.index,
                y=daily_volume["CREDIT"],
                name="Credits",
                line=dict(color="green"),
            )
        )
        fig.update_layout(
            title="Daily Transaction Volume",
            xaxis_title="Date",
            yaxis_title="Amount (₹)",
        )
        st.plotly_chart(fig, use_container_width=True)

    with col2:
        # Transaction frequency heatmap
        df["day_of_week"] = df["DATE"].dt.day_name()
        df["week"] = df["DATE"].dt.isocalendar().week

        heatmap_data = (
            df.groupby(["week", "day_of_week"]).size().reset_index(name="count")
        )

        # Ensure proper day ordering
        day_order = [
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
        ]
        heatmap_pivot = heatmap_data.pivot(
            index="week", columns="day_of_week", values="count"
        ).fillna(0)
        heatmap_pivot = heatmap_pivot.reindex(columns=day_order, fill_value=0)

        fig = px.imshow(
            heatmap_pivot.T,
            labels=dict(x="Week", y="Day", color="Transactions"),
            title="Transaction Frequency Heatmap",
        )
        st.plotly_chart(fig, use_container_width=True)
