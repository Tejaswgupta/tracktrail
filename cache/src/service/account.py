def generate_account_id(account_name, account_number):
    """Generate a unique account ID from account name and number"""
    if account_number:
        return f"{account_name}_{account_number}".replace(" ", "_").upper()
    else:
        return f"{account_name}_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}".replace(
            " ", "_"
        ).upper()


def save_account_data(
    account_id,
    account_name,
    account_number,
    df_original,
    df_processed=None,
    entity_id=None,
):
    """Save account data to session state"""
    st.session_state.accounts[account_id] = {
        "account_name": account_name,
        "account_number": account_number,
        "entity_id": entity_id,  # New field for entity association
        "df_original": df_original,
        "df_processed": df_processed,
        "upload_timestamp": pd.Timestamp.now(),
        "transaction_count": len(df_original),
        "date_range": {
            "start": (
                df_original["DATE"].min()
                if not df_original["DATE"].isna().all()
                else None
            ),
            "end": (
                df_original["DATE"].max()
                if not df_original["DATE"].isna().all()
                else None
            ),
        },
        "total_debits": df_original["DEBIT"].fillna(0).sum(),
        "total_credits": df_original["CREDIT"].fillna(0).sum(),
    }


def resolve_primary_entity(entity_name):
    """
    Simple entity resolution - just checks if entity exists, doesn't do fuzzy matching.
    Returns (entity_id, is_new_entity)
    """
    if not entity_name or not entity_name.strip():
        raise ValueError("Entity name cannot be empty")

    entity_name = entity_name.strip()

    # Ensure required session state structures exist
    if "global_entity_registry" not in st.session_state:
        st.session_state.global_entity_registry = {}

    if "entities" not in st.session_state:
        st.session_state.entities = {}

    # More robust check using canonical name and aliases
    query_canonical = entity_name.upper().replace(" ", "_")
    for (
        canonical_name,
        registry_entry,
    ) in st.session_state.global_entity_registry.items():
        if registry_entry["primary_entity_id"] is not None:
            # Check if the canonical form of the input name matches the registry key
            # Or if the input name matches any of the stored aliases (case-insensitive)
            if query_canonical == canonical_name or entity_name.upper() in {
                alias.upper() for alias in registry_entry["aliases"]
            }:
                return registry_entry["primary_entity_id"], False

    # Create new entity
    entity_id = f"ENTITY_{len(st.session_state.entities) + 1}_{int(pd.Timestamp.now().timestamp())}"
    st.session_state.entities[entity_id] = {"name": entity_name, "account_ids": []}

    # Add to global registry
    canonical_name = entity_name.upper().replace(" ", "_")
    st.session_state.global_entity_registry[canonical_name] = {
        "primary_entity_id": entity_id,
        "aliases": {entity_name},
    }

    return entity_id, True


def create_and_save_account(entity_id, account_number, df_processed):
    """
    Create and save account data for a given entity.
    Returns the account_id
    """
    # Generate account ID
    entity_name = st.session_state.entities[entity_id]["name"]
    account_id = generate_account_id(entity_name, account_number)

    # Save account data with entity_id
    save_account_data(
        account_id=account_id,
        account_name=f"{entity_name} - {account_number[-4:] if account_number else 'Account'}",
        account_number=account_number,
        df_original=df_processed,
        df_processed=df_processed,
        entity_id=entity_id,
    )

    return account_id
