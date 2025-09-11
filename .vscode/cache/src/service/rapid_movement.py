def detect_rapid_movements(df, hours, tolerance, min_amount, show_visualization=False):
    df_with_index = df.reset_index()
    df_sorted = df_with_index.sort_values(by=["DATE", "index"])
    rapid_patterns = []

    # Track which transactions have already been matched to ensure 1:1 matching
    matched_in_transactions = set()
    matched_out_transactions = set()

    # Prepare counterparty extractor fallback if needed
    cp_extractor = None
    if "counterparty" not in df.columns:
        try:
            cp_extractor = CounterpartyStandardizer()
        except Exception:
            cp_extractor = None

    for i in range(len(df_sorted) - 1):
        curr = df_sorted.iloc[i]

        # Skip if this IN transaction has already been matched
        if i in matched_in_transactions:
            continue

        if pd.notna(curr["CREDIT"]) and curr["CREDIT"] >= min_amount:
            best_match = None
            best_match_index = None
            best_amount_diff = float("inf")

            # Find the best matching OUT transaction within the time window
            for j in range(i + 1, min(i + 20, len(df_sorted))):
                next_txn = df_sorted.iloc[j]

                # Skip if this OUT transaction has already been matched
                if j in matched_out_transactions:
                    continue

                if pd.notna(next_txn["DEBIT"]):
                    time_diff = (next_txn["DATE"] - curr["DATE"]).total_seconds() / 3600

                    if time_diff <= hours:
                        amount_diff = (
                            abs(curr["CREDIT"] - next_txn["DEBIT"])
                            / curr["CREDIT"]
                            * 100
                        )

                        if amount_diff <= tolerance and amount_diff < best_amount_diff:
                            best_match = next_txn
                            best_match_index = j
                            best_amount_diff = amount_diff

            # If we found a best match, record it and mark both transactions as matched
            if best_match is not None:
                matched_in_transactions.add(i)
                matched_out_transactions.add(best_match_index)

                time_diff = (best_match["DATE"] - curr["DATE"]).total_seconds() / 3600

                # Capture counterparties if the processed dataframe has that column
                if "counterparty" in df_sorted.columns:
                    cp_in = curr.get("counterparty", "") or ""
                    cp_out = best_match.get("counterparty", "") or ""
                else:
                    # Fallback to regex extraction from description
                    if cp_extractor:
                        cp_in = (
                            cp_extractor.extract_counterparty_name(curr["DESCRIPTION"])
                            or ""
                        )
                        cp_out = (
                            cp_extractor.extract_counterparty_name(
                                best_match["DESCRIPTION"]
                            )
                            or ""
                        )
                    else:
                        cp_in = cp_out = ""

                rapid_patterns.append(
                    {
                        "In Date": curr["DATE"],
                        "In Amount": f"₹{curr['CREDIT']:,.0f}",
                        "In CP": cp_in,
                        "In Description": curr["DESCRIPTION"][:50],
                        "Out Date": best_match["DATE"],
                        "Out Amount": f"₹{best_match['DEBIT']:,.0f}",
                        "Out CP": cp_out,
                        "Out Description": best_match["DESCRIPTION"][:50],
                        "Hours Gap": f"{time_diff:.1f}",
                        "Amount Diff": f"{best_amount_diff:.1f}%",
                    }
                )

    if rapid_patterns:
        rapid_df = pd.DataFrame(rapid_patterns)

        st.warning(f"⚠️ Found {len(rapid_df)} rapid money movements")
        st.dataframe(rapid_df, use_container_width=True)

        # Highlight repeated party pairs if counterparty columns are present
        if {"In CP", "Out CP"}.issubset(rapid_df.columns):
            pair_counts = (
                rapid_df.groupby(["In CP", "Out CP"])
                .size()
                .reset_index(name="Occurrences")
            )
            repeated_pairs = pair_counts[pair_counts["Occurrences"] >= 2].sort_values(
                "Occurrences", ascending=False
            )

            if len(repeated_pairs) > 0:
                st.subheader("🔁 Repeated Rapid Movements Between Parties")
                st.dataframe(repeated_pairs, use_container_width=True)
            else:
                st.info("No repeated party pairs detected within current parameters")

    else:
        st.info("No rapid movements detected with current parameters")
