def cash_flow_analysis(df):
    st.subheader("💵 Cash Transaction Analysis")

    # Use merged counterparty data if available
    df_analysis = df.copy()
    merged_df = get_analysis_dataframe_with_context()
    if (
        merged_df is not None
        and not merged_df.empty
        and "counterparty" in merged_df.columns
    ):
        st.info("✅ Using merged counterparty data for enhanced analysis")
        df_analysis["counterparty"] = merged_df["counterparty"]
        df_analysis["COUNTERPARTY_ORIGINAL"] = merged_df["COUNTERPARTY_ORIGINAL"]

    # Add entity_owner column if not present (needed for network visualization)
    if "entity_owner" not in df_analysis.columns:
        current_scope = st.session_state.get("analysis_scope")
        if current_scope and current_scope in st.session_state.entities:
            entity_name = st.session_state.entities[current_scope]["name"]
            df_analysis["entity_owner"] = entity_name

    col1, col2 = st.columns(2)

    with col1:
        cash_keywords = st.text_area(
            "Cash Keywords (one per line):",
            value="CASH\nATM\nWITHDRAWAL\nCHQ",
            height=100,
        )
        keywords = [k.strip() for k in cash_keywords.split("\n") if k.strip()]

    with col2:
        threshold = st.number_input(
            "Large Cash Threshold (₹)", min_value=0, value=50000, step=10000
        )

    # Find cash transactions
    pattern = "|".join(keywords)
    cash_mask = df_analysis["DESCRIPTION"].str.contains(pattern, case=False, na=False)
    cash_txns = df_analysis[cash_mask].copy()

    if len(cash_txns) > 0:
        col1, col2, col3 = st.columns(3)

        with col1:
            st.metric("Total Cash Transactions", len(cash_txns))
        with col2:
            st.metric("Total Cash Out", f"₹{cash_txns['DEBIT'].fillna(0).sum():,.0f}")
        with col3:
            st.metric("Total Cash In", f"₹{cash_txns['CREDIT'].fillna(0).sum():,.0f}")

        # Large cash transactions
        large_cash = cash_txns[
            (cash_txns["DEBIT"] > threshold) | (cash_txns["CREDIT"] > threshold)
        ]

        # Frequency Analysis
        st.subheader("📊 Cash Transaction Frequency & Patterns")

        # Monthly frequency
        cash_txns["Month"] = cash_txns["DATE"].dt.to_period("M")
        monthly_freq = cash_txns.groupby("Month").size()

        col1, col2 = st.columns(2)

        with col1:
            st.write("**Monthly Frequency**")
            monthly_chart = monthly_freq.reset_index()
            monthly_chart["Month"] = monthly_chart["Month"].astype(str)
            st.bar_chart(monthly_chart.set_index("Month"))

            # Average transactions per month
            avg_monthly = monthly_freq.mean()
            st.metric("Avg Cash Txns/Month", f"{avg_monthly:.1f}")

        with col2:
            st.write("**Day of Week Pattern**")
            cash_txns["DayOfWeek"] = cash_txns["DATE"].dt.day_name()
            dow_freq = cash_txns["DayOfWeek"].value_counts()
            dow_order = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ]
            dow_freq = dow_freq.reindex(
                [day for day in dow_order if day in dow_freq.index]
            )
            st.bar_chart(dow_freq)

        # Time-based patterns
        st.write("**Temporal Patterns**")
        col1, col2, col3 = st.columns(3)

        with col1:
            # Date range analysis
            date_range = (cash_txns["DATE"].max() - cash_txns["DATE"].min()).days
            st.metric("Analysis Period (Days)", date_range)

        with col2:
            # Average frequency
            if date_range > 0:
                avg_freq = len(cash_txns) / (date_range / 30)  # per month
                st.metric("Frequency (Txns/Month)", f"{avg_freq:.1f}")

        with col3:
            # Peak activity day
            peak_day = dow_freq.idxmax() if not dow_freq.empty else "N/A"
            st.metric("Peak Activity Day", peak_day)

        # Amount patterns
        st.write("**Amount Patterns**")
        col1, col2 = st.columns(2)

        with col1:
            # Common amounts (rounded to nearest 1000)
            cash_amounts = pd.concat(
                [cash_txns["DEBIT"].dropna(), cash_txns["CREDIT"].dropna()]
            )

            if not cash_amounts.empty:
                rounded_amounts = (cash_amounts / 1000).round() * 1000
                common_amounts = rounded_amounts.value_counts().head(5)
                st.write("**Most Common Amounts (₹)**")
                for amount, count in common_amounts.items():
                    st.write(f"₹{amount:,.0f}: {count} times")

        with col2:
            # Amount distribution
            if not cash_amounts.empty:
                st.write("**Amount Statistics**")
                st.write(f"Average: ₹{cash_amounts.mean():,.0f}")
                st.write(f"Median: ₹{cash_amounts.median():,.0f}")
                st.write(f"Max: ₹{cash_amounts.max():,.0f}")
                st.write(f"Min: ₹{cash_amounts.min():,.0f}")

        if len(large_cash) > 0:
            st.warning(
                f"⚠️ Found {len(large_cash)} cash transactions above ₹{threshold:,}"
            )

            display_df = large_cash[["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]].copy()
            display_df["DATE"] = display_df["DATE"].dt.date
            display_df["Amount"] = display_df.apply(
                lambda x: (
                    f"₹{x['DEBIT']:,.0f}"
                    if pd.notna(x["DEBIT"])
                    else f"₹{x['CREDIT']:,.0f}"
                ),
                axis=1,
            )
            display_df["Type"] = display_df.apply(
                lambda x: "Withdrawal" if pd.notna(x["DEBIT"]) else "Deposit", axis=1
            )

            st.dataframe(
                display_df[["DATE", "Type", "Amount", "DESCRIPTION"]],
                use_container_width=True,
            )

    else:
        st.info("No cash transactions found with the specified keywords.")
