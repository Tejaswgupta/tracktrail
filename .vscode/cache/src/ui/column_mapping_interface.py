import streamlit as st
from utils import convert_unified_to_separate_columns


def show_column_mapping_interface(df):
    """Allow users to manually map their columns to required format"""
    st.subheader("🔗 Column Mapping")
    st.write("Map your CSV columns to the required format:")

    # Add option to go back
    col_back, col_info = st.columns([1, 3])
    with col_back:
        if st.button("⬅️ Upload Different File"):
            st.session_state.show_column_mapping = False
            st.session_state.df_for_mapping = None
            st.session_state.mapping_entity_name = None
            st.session_state.mapping_account_number = None
            st.rerun()
    with col_info:
        st.info("Choose which column in your CSV corresponds to each required field.")

    # Entity Information Section for column mapping
    st.markdown("#### 👤 Entity Information for this Upload")

    # Get stored entity and account info from session state. These are read-only during mapping.
    entity_name = st.session_state.get("mapping_entity_name", "")
    account_number = st.session_state.get("mapping_account_number", "")

    # Display the entity and account as non-editable info
    if entity_name:
        st.markdown(f"**Entity:** `{entity_name}`")
        st.markdown(f"**Account Number:** `{account_number or 'Not specified'}`")
    else:
        st.error(
            "❌ Entity name was not provided before upload. Please go back and specify an entity."
        )
        # Invalidate the entity_name to prevent the 'Apply' button from working
        entity_name = ""

    st.divider()

    # Format selection
    st.markdown("#### 📊 Select Your Bank Statement Format")

    format_choice = st.radio(
        "Choose the format that matches your CSV:",
        options=[
            "Separate Debit/Credit Columns",
            "Unified Amount with DR/CR Indicator",
        ],
        help="Select the format that matches your bank statement structure",
        key="format_choice",
    )

    st.divider()

    # Show data preview
    with st.expander("📋 Your Data Preview", expanded=True):
        st.dataframe(df.head(), use_container_width=True)

    # Set required columns based on format choice
    if format_choice == "Separate Debit/Credit Columns":
        required_columns = ["DATE", "DESCRIPTION", "DEBIT", "CREDIT"]
        format_help = """
        **Separate Columns Format:**
        - DATE: Transaction date
        - DESCRIPTION: Transaction description/particulars
        - DEBIT: Debit amount (money going out)
        - CREDIT: Credit amount (money coming in)
        """
    else:
        required_columns = ["DATE", "DESCRIPTION", "AMOUNT", "DR_CR"]
        format_help = """
        **Unified Amount Format:**
        - DATE: Transaction date
        - DESCRIPTION: Transaction description/particulars  
        - AMOUNT: Transaction amount (unified column)
        - DR_CR: Debit/Credit indicator (DR/CR, D/C, DEBIT/CREDIT)
        """

    st.info(format_help)

    column_mapping = {}

    col1, col2 = st.columns(2)

    with col1:
        st.write("**Your Columns:**")
        for i, col in enumerate(df.columns):
            st.write(f"{i + 1}. `{col}`")

    with col2:
        st.write("**Map to Required Columns:**")
        for req_col in required_columns:
            help_text = {
                "DATE": "Select the column containing transaction dates",
                "DESCRIPTION": "Select the column with transaction descriptions/particulars",
                "DEBIT": "Select the column with debit amounts (money going out)",
                "CREDIT": "Select the column with credit amounts (money coming in)",
                "AMOUNT": "Select the column with transaction amounts",
                "DR_CR": "Select the column indicating DR/CR (should contain values like DR, CR, D, C, DEBIT, CREDIT)",
            }

            column_mapping[req_col] = st.selectbox(
                f"Map {req_col} to:",
                options=[""] + list(df.columns),
                key=f"map_{req_col}",
                help=help_text.get(
                    req_col, f"Select which column corresponds to {req_col}"
                ),
            )

    # Show mapping summary
    if any(column_mapping.values()):
        st.write("**Current Mapping:**")
        for req_col, mapped_col in column_mapping.items():
            if mapped_col:
                st.write(f"• {req_col} ← `{mapped_col}`")

    if all(column_mapping.values()) and entity_name:
        # Show summary of what will be processed
        st.success(f"✅ Ready to process: **{entity_name}** ({len(df)} transactions)")
        if account_number:
            st.caption(f"Account: {account_number}")

        if st.button("✅ Apply Column Mapping", type="primary"):
            # Validate entity name is provided
            if not entity_name:
                st.error(
                    "❌ Please provide an entity name before applying column mapping."
                )
                return df, False

            # Store entity info in session state for processing
            st.session_state.mapping_entity_name = entity_name
            st.session_state.mapping_account_number = account_number

            # Create reverse mapping
            reverse_mapping = {v: k for k, v in column_mapping.items() if v}
            df_mapped = df.rename(columns=reverse_mapping)

            # Convert unified format to separate columns if needed
            if format_choice == "Unified Amount with DR/CR Indicator":
                df_mapped = convert_unified_to_separate_columns(df_mapped)
                st.success(
                    "✅ Converted unified amount format to separate DEBIT/CREDIT columns"
                )

            return df_mapped, True
    else:
        missing_items = []
        missing_maps = [k for k, v in column_mapping.items() if not v]
        if missing_maps:
            missing_items.append(f"columns: {', '.join(missing_maps)}")
        if not entity_name:
            missing_items.append("entity name")

        if missing_items:
            st.warning(f"Please provide: {', '.join(missing_items)}")

    return df, False
