def find_roundtrips(df, tolerance, days, min_amount):
    results = []

    if "counterparty" in df.columns:
        counterparties = [c for c in df["counterparty"].dropna().unique() if c]
        for cp in counterparties:
            cp_df = df[df["counterparty"] == cp].copy()

            debits = cp_df[
                (cp_df["DEBIT"].notna()) & (cp_df["DEBIT"] >= min_amount)
            ].sort_values("DATE")
            credits = cp_df[
                (cp_df["CREDIT"].notna()) & (cp_df["CREDIT"] >= min_amount)
            ].sort_values("DATE")
            credits_used = set()

            for debit_idx, debit in debits.iterrows():
                for credit_idx, credit in credits.iterrows():
                    if credit_idx in credits_used:
                        continue
                    if credit["DATE"] > debit["DATE"]:
                        days_diff = (credit["DATE"] - debit["DATE"]).days
                        if days_diff <= days:
                            amount_diff = (
                                abs(debit["DEBIT"] - credit["CREDIT"])
                                / debit["DEBIT"]
                                * 100
                            )
                            if amount_diff <= tolerance:
                                results.append(
                                    {
                                        "counterparty": cp,
                                        "Outgoing Amount": f"₹{debit['DEBIT']:,.0f}",
                                        "Outgoing Date": debit["DATE"].date(),
                                        "Incoming Amount": f"₹{credit['CREDIT']:,.0f}",
                                        "Incoming Date": credit["DATE"].date(),
                                        "Days Gap": days_diff,
                                        "Amount Difference": f"{amount_diff:.1f}%",
                                    }
                                )
                                credits_used.add(credit_idx)
                                break  # Move to next debit after first match

    # Optionally, you could record unmatched debits if needed
    if results:
        st.success(f"Found {len(results)} potential round-trip transactions")
        st.dataframe(pd.DataFrame(results), use_container_width=True)
    else:
        st.info("No round-trip transactions found with current parameters")
