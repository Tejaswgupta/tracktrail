def find_transfer_patterns(
    df,
    time_window,
    percentage_match,
    deviance,
    min_amount,
    min_occurrences,
    show_visualization=False,
):
    if "counterparty" not in df.columns or df["counterparty"].nunique() < 2:
        st.warning(
            "This analysis requires at least two counterparties. Please merge names first."
        )
        return

    df_sorted = df.sort_values("DATE").reset_index(drop=True)

    credits = df_sorted[
        (df_sorted["CREDIT"].notna())
        & (df_sorted["CREDIT"] >= min_amount)
        & (df_sorted["counterparty"] != "")
    ].copy()
    debits = df_sorted[
        (df_sorted["DEBIT"].notna())
        & (df_sorted["DEBIT"] >= min_amount)
        & (df_sorted["counterparty"] != "")
    ].copy()

    potential_patterns = []
    used_debits = (
        set()
    )  # Track which debits have already been matched to prevent double-counting

    # IMPORTANT: Each credit transaction should only match to ONE debit transaction
    # to avoid the logical error of one inflow creating multiple outflows
    for _, credit_txn in credits.iterrows():
        credit_amount = credit_txn["CREDIT"]
        credit_date = credit_txn["DATE"]
        source_cp = credit_txn["counterparty"]

        time_limit = credit_date + timedelta(days=time_window)
        lower_bound = credit_amount * (percentage_match - deviance) / 100
        upper_bound = credit_amount * (percentage_match + deviance) / 100

        candidate_debits = debits[
            (debits["DATE"] > credit_date)
            & (debits["DATE"] <= time_limit)
            & (debits["DEBIT"] >= lower_bound)
            & (debits["DEBIT"] <= upper_bound)
            & (debits["counterparty"] != source_cp)
            & (~debits.index.isin(used_debits))  # Exclude already matched debits
        ]

        if len(candidate_debits) > 0:
            # Find the best match: closest amount and earliest date
            candidate_debits = candidate_debits.copy()
            candidate_debits["amount_diff"] = abs(
                candidate_debits["DEBIT"] - credit_amount
            )
            candidate_debits["date_diff"] = (
                candidate_debits["DATE"] - credit_date
            ).dt.days

            # Score: prioritize amount match (70%) and time proximity (30%)
            candidate_debits["match_score"] = (
                1 - candidate_debits["amount_diff"] / credit_amount
            ) * 0.7 + (1 - candidate_debits["date_diff"] / time_window) * 0.3

            # Select the best match
            best_match = candidate_debits.loc[candidate_debits["match_score"].idxmax()]
            used_debits.add(best_match.name)  # Mark this debit as used

            dest_cp = best_match["counterparty"]
            potential_patterns.append(
                {
                    "Source": source_cp,
                    "Destination": dest_cp,
                    "In Date": credit_txn["DATE"].date(),
                    "In Amount": credit_txn["CREDIT"],
                    "Out Date": best_match["DATE"].date(),
                    "Out Amount": best_match["DEBIT"],
                    "Days Gap": (best_match["DATE"] - credit_txn["DATE"]).days,
                    "% Transferred": (best_match["DEBIT"] / credit_txn["CREDIT"]) * 100,
                }
            )

    if not potential_patterns:
        st.info(
            "No individual transfer links found. Cannot identify repeated patterns."
        )
        return

    patterns_df = pd.DataFrame(potential_patterns)
    pattern_groups = patterns_df.groupby(["Source", "Destination"])

    final_results = []
    for (source, destination), group in pattern_groups:
        if len(group) >= min_occurrences:
            summary = {
                "Source": source,
                "Destination": destination,
                "Occurrences": len(group),
                "Avg. In Amount": group["In Amount"].mean(),
                "Avg. Out Amount": group["Out Amount"].mean(),
                "Avg. % Transferred": group["% Transferred"].mean(),
                "First Occurrence": group["In Date"].min(),
                "Last Occurrence": group["Out Date"].max(),
                "details": group.to_dict("records"),
            }
            final_results.append(summary)

    if not final_results:
        st.info(
            f"No transfer patterns found with at least {min_occurrences} occurrences."
        )
        return

    st.success(f"Found {len(final_results)} repeated transfer patterns.")
    results_df = pd.DataFrame(final_results).sort_values("Occurrences", ascending=False)

    st.subheader("Repeated Transfer Patterns Summary")
    display_summary_df = results_df.copy()
    display_summary_df["Avg. In Amount"] = display_summary_df["Avg. In Amount"].apply(
        lambda x: f"₹{x:,.0f}"
    )
    display_summary_df["Avg. Out Amount"] = display_summary_df["Avg. Out Amount"].apply(
        lambda x: f"₹{x:,.0f}"
    )
    display_summary_df["Avg. % Transferred"] = display_summary_df[
        "Avg. % Transferred"
    ].apply(lambda x: f"{x:.1f}%")

    st.dataframe(
        display_summary_df[
            [
                "Source",
                "Destination",
                "Occurrences",
                "Avg. In Amount",
                "Avg. Out Amount",
                "Avg. % Transferred",
                "First Occurrence",
                "Last Occurrence",
            ]
        ],
        use_container_width=True,
    )

    st.subheader("Detailed Transactions for Each Pattern")
    for _, row in results_df.iterrows():
        with st.expander(
            f"Pattern: {row['Source']} -> {row['Destination']} ({row['Occurrences']} times)"
        ):
            details_df = pd.DataFrame(row["details"])
            details_df["In Amount"] = details_df["In Amount"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            details_df["Out Amount"] = details_df["Out Amount"].apply(
                lambda x: f"₹{x:,.0f}"
            )
            details_df["% Transferred"] = details_df["% Transferred"].apply(
                lambda x: f"{x:.1f}%"
            )
            st.dataframe(
                details_df[
                    [
                        "In Date",
                        "In Amount",
                        "Out Date",
                        "Out Amount",
                        "Days Gap",
                        "% Transferred",
                    ]
                ],
                use_container_width=True,
            )
