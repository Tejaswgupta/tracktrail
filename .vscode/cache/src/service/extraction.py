class CounterpartyStandardizer:
    def __init__(self, similarity_threshold=85, bank_preset="generic"):
        self.similarity_threshold = similarity_threshold
        self.name_mappings = {}
        self.bank_preset = bank_preset

        # Bank-specific regex patterns
        self.bank_patterns = {
            "generic": [
                r"UPI/([^/]+)/[^/]+/?",  # UPI/COUNTERPARTY/number/optional
                r"(?:NEFT|RTGS)/[^/]+/([^/\n]+)/?",
                r"POS/([^/\n]+)/?",
                r"IMPS(?:-[A-Z]+)?/[^/]+/[^/]+/([^/\n]+)/?",
                r"(?:.*/)?([^/\n]+)$",  # General fallback: last segment after slash
            ],
            "axis": [
                # 1. INB/RTGS/{ref}/{name}/... (MOST SPECIFIC FIRST)
                r"^INB/RTGS/[^/]+/([^/]+)/",
                r"^INB/RTGS/[^/]+/([^/]+)$",
                # 2. INB/NEFT/{ref}/{name}/...
                r"^INB/NEFT/[^/]+/([^/]+)/",
                r"^INB/NEFT/[^/]+/([^/]+)$",
                # 3. INB/IFT/{name}/TPARTY TRANSFER
                r"^INB/IFT/([^/]+)/TPARTY TRANSFER",
                # 4. RTGS patterns (as before)
                r"^RTGS/[^/]+/[^/]+/([^/]+)/[^/]+",
                r"^RTGS/[^/]+/[^/]+/([^/]+)$",
                r"^RTGS/[^/]+/([^/]+)/[^/]+",
                r"^RTGS/[^/]+/([^/]+)$",
                # 5. NEFT patterns
                r"^NEFT/RETURN/[^/]+/[^/]+/([^/]+)",
                r"^NEFT/[^/]+/([^/]+)/[^/]+//ATTN//INB",
                r"^NEFT/IC/[^/]+/([^/]+)",
                r"^NEFT/[^/]+/([^/]+)/[^/]+//URGENT/",
                # 6. IMPS patterns
                r"^IMPS/P2A/[^/]+/([^/]+)/[^/]+/",
                r"^IMPS/P2A/[^/]+//[^/]+/[^/]+/([^/]+)",
                r"^IMPS/P2A/[^/]+//([^/]+)",
                # 7. GENERAL INB PATTERN (NOW LAST)
                r"^INB/[^/]+/([^/]+)/",
                r"^INB/[^/]+//([^/]+)",
                # 8. Other patterns
                r"^DD ISSUED/[^/]+/([^,]+), PAYABLE AT",
                r"^ICONN REF/[^/]+/([^/]+)/",
                r"^BY CASH DEPOSIT[^/]+/[^/]+/[^/]+/[^/]+/([^/]+)$",
                r"^SAK/CASH WDL/[^/]+/[^/]+/[^/]+/WD BY(.+)$",
                r"^BRN-CLG-CHQ PAID TO ([^ /]+)",
            ],
            "federal": [
                r"^(?:RTG|NFT|FTIMPS|IFN\/CHRG|CHRG|dd\sissue|DD:|BBYT:|TFR:?)\/?\s*:?\s*(?:IFI\/\d+\/)?([^\/,:\n]+)",
                r"^(ALLOYS?|LLP|BANK|ICICI|SBI|HDFC|PAYMENT?|Pymt|SELF)$",
                r'^(?:TFR:|ID\s*:\s*\[[^\]]*\]\s*:|BillId\s*:\s*\[[^\]]*\]\s*:)\s*"?([^",:\n/]+?)"?$',
                r"^FT?\s*IMPS\/IFI\/\d+\/([^\/]+)\/SUPP",
            ],
            "indian": [
                # UPI generic
                r'^[^"/]+/([^/]+?)/XXXXX',
                # /Pay/<Name> extraction (TO/FROM variants)
                r'^TRANSFER (?:TO|FROM) \d+ [^/]*?/P[Aa]y/([^/\r\n"]+?)\s*(?:/|\r|\n|$)',
                # /Pay/<Name> after IMPS/P2A/... (more structured)
                r"^TRANSFER (?:TO|FROM) \d+ [^/]*?/IMPS/P2A/\d+/ /P[Aa]y/([^/]+?)\s*/BRANCH",
                # Fallback: extract mobile/account number after "TRANSFER TO"
                r"^TRANSFER TO (\d{8,15})",
                r"Paid to SELF /BRANCH\s*:\s*([^/]+)",
            ],
            "jammu_and_kashmir_bank": [
                r"^UPI/[A-Z]+/\d+/[CD]R/([^/]+)/P2M",  # UPI
                r"^NEFT-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])",  # NEFT
                r"^RTGS-[A-Z0-9]+-([A-Za-z][A-Za-z\s]*[A-Za-z])",  # RTGS
                r"^mTFR/\d+/([A-Za-z][A-Za-z\s]*[A-Za-z])",  # IMPS/mTFR
            ],
        }

    def extract_counterparty_name(self, description: str) -> str:
        """
        Extracts the party name from a bank transaction description using bank-specific patterns.
        Returns None if it can't confidently extract a party name.
        """
        if not isinstance(description, str) or not description.strip():
            return None

        # Get patterns for the selected bank preset
        patterns = self.bank_patterns.get(
            self.bank_preset, self.bank_patterns["generic"]
        )
        for pat in patterns:
            description = re.sub(r"\s+", " ", description).strip()
            m = re.match(pat, description, flags=re.IGNORECASE)
            if m:
                print(m)
                return m.group(1).strip()

        return None

    def find_similar_names(self, names, threshold):
        name_counts = Counter(names)
        unique_names = list(name_counts.keys())

        # Filter out very short names and common noise patterns
        filtered_names = []
        for name in unique_names:
            if self._is_valid_name_for_matching(name):
                filtered_names.append(name)

        unique_names = filtered_names

        # First pass: group by case-insensitive matching
        case_groups = {}
        for name in unique_names:
            key = name.lower().strip()
            if key not in case_groups:
                case_groups[key] = []
            case_groups[key].append(name)

        # Merge case variants and update counts
        merged_names = []
        merged_counts = Counter()

        for group in case_groups.values():
            # Use the most frequent variant, or first alphabetically if tied
            representative = max(
                group, key=lambda x: (name_counts[x], -ord(x[0]) if x else 0)
            )
            merged_names.append(representative)
            # Sum counts for all variants
            merged_counts[representative] = sum(name_counts[name] for name in group)

        # ULTRA-OPTIMIZED: Multi-stage filtering for maximum performance
        clusters = []
        cluster_scores = []
        clustered = set()

        # Sort by frequency to process most common names first (better clustering)
        merged_names.sort(key=lambda x: merged_counts[x], reverse=True)

        # OPTIMIZATION 0: For very large datasets, use aggressive pre-filtering
        if len(merged_names) > 5000:
            # Only process names that appear more than once (likely to have variations)
            high_frequency_names = [
                name for name in merged_names if merged_counts[name] > 1
            ]
            # Plus top 1000 most frequent names regardless of count
            top_names = merged_names[:1000]
            merged_names = list(set(high_frequency_names + top_names))
            merged_names.sort(key=lambda x: merged_counts[x], reverse=True)

        # OPTIMIZATION 1: Pre-filter by length similarity (much faster than fuzzy matching)
        def length_filter(name1, name2, max_length_diff=10):
            return abs(len(name1) - len(name2)) <= max_length_diff

        # OPTIMIZATION 2: Pre-filter by first character (instant elimination)
        def first_char_groups(names):
            groups = {}
            for name in names:
                first_char = name[0].upper() if name else ""
                if first_char not in groups:
                    groups[first_char] = []
                groups[first_char].append(name)
            return groups

        # Group names by first character for faster processing
        char_groups = first_char_groups(merged_names)

        # Progress reporting for large datasets
        total_to_process = len(merged_names)
        processed = 0

        for name in merged_names:
            if name in clustered:
                continue

            cluster = [name]
            scores = {name: 100}  # Perfect match with itself
            clustered.add(name)

            # OPTIMIZATION 3: Only compare with names starting with same or similar characters
            first_char = name[0].upper() if name else ""
            potential_candidates = []

            # Include same first character
            if first_char in char_groups:
                potential_candidates.extend(char_groups[first_char])

            # Include similar first characters (common variations)
            similar_chars = {
                "A": ["E"],
                "E": ["A"],
                "I": ["Y"],
                "Y": ["I"],
                "C": ["K"],
                "K": ["C"],
                "S": ["Z"],
                "Z": ["S"],
            }
            if first_char in similar_chars:
                for similar_char in similar_chars[first_char]:
                    if similar_char in char_groups:
                        potential_candidates.extend(char_groups[similar_char])

            # Filter out already clustered names and apply length filter
            candidates = [
                n
                for n in potential_candidates
                if n not in clustered and n != name and length_filter(name, n)
            ]

            if not candidates:
                continue

            # OPTIMIZATION 4: Use process.extract with limited candidates
            matches = process.extract(
                name,
                candidates,
                scorer=fuzz.token_set_ratio,  # Single best algorithm
                limit=min(20, len(candidates)),  # Further reduced limit for speed
            )

            # OPTIMIZATION 5: Early termination - stop after finding good matches
            good_matches = 0
            for match_name, score in matches:
                if score >= threshold and self._should_match_names(
                    name, match_name, score
                ):
                    cluster.append(match_name)
                    scores[match_name] = score
                    clustered.add(match_name)
                    good_matches += 1

                    # Early termination: stop after finding 10 good matches
                    if good_matches >= 10:
                        break

            # Only keep clusters with meaningful matches
            if len(cluster) > 1:
                clusters.append(cluster)
                cluster_scores.append(scores)

            # Update progress
            processed += 1
            if hasattr(self, "_progress_callback") and processed % 50 == 0:
                self._progress_callback(
                    processed, total_to_process, "Finding similar names"
                )

        return clusters, merged_counts, cluster_scores

    def _is_valid_name_for_matching(self, name):
        """Filter out names that shouldn't be included in fuzzy matching"""
        if not name or len(name.strip()) < 3:
            return False

        name_clean = name.strip().upper()

        # Skip common noise patterns
        noise_patterns = [
            r"^[0-9]+$",  # Pure numbers
            r"^[A-Z]{1,2}[0-9]+$",  # Account numbers like A123, AB456
            r"^ATM",  # ATM transactions
            r"^CASH",  # Cash transactions
            r"^CHQ",  # Cheque transactions
            r"^CHRG",  # Charges
            r"^FEE",  # Fees
            r"^INTEREST",  # Interest
        ]

        for pattern in noise_patterns:
            if re.match(pattern, name_clean):
                return False

        return True

    def _should_match_names(self, name1, name2, score):
        """Enhanced logic to allow partial and hierarchical name matching."""
        name1_clean = name1.strip().upper()
        name2_clean = name2.strip().upper()

        # Check if one name is a substring of the other
        if name1_clean in name2_clean or name2_clean in name1_clean:
            # Ensure non-trivial containment (not just "A" in "AXIS")
            longer = name1_clean if len(name1_clean) > len(name2_clean) else name2_clean
            shorter = (
                name2_clean if len(name1_clean) > len(name2_clean) else name1_clean
            )
            if (
                len(shorter) >= 5 and score >= 70
            ):  # Reasonable length and some similarity
                return True

        # Split names into tokens
        tokens1 = set(name1_clean.split())
        tokens2 = set(name2_clean.split())
        common_tokens = tokens1.intersection(tokens2)

        # If no common tokens, don't match regardless of fuzzy score
        if not common_tokens:
            return False

        # For single-token names, be more restrictive
        if len(tokens1) == 1 and len(tokens2) == 1:
            return score >= 92

        # Check edit distance for short names to avoid false positives
        if len(name1_clean) <= 8 or len(name2_clean) <= 8:
            # For short names, ensure they're genuinely similar, not just sharing a token
            from difflib import SequenceMatcher

            char_similarity = (
                SequenceMatcher(None, name1_clean, name2_clean).ratio() * 100
            )
            return char_similarity >= 80

        return True

    def build_entity_graph(self, df: pd.DataFrame) -> nx.Graph:
        """
        Build graph of entity-counterparty relationships using existing entity linking logic.
        Creates clean entity-counterparty mappings leveraging standardized entity names.

        Args:
            df: DataFrame with transaction data including entity_owner and counterparty columns

        Returns:
            NetworkX Graph with entities and counterparties as nodes, relationships as edges
        """
        if df.empty:
            return nx.Graph()

        # Create undirected graph for entity-counterparty relationships
        G = nx.Graph()

        # Use existing entity linking from global registry for clean mappings
        entity_mappings = self._get_standardized_entity_mappings(df)

        # Process each transaction to build relationships
        for _, row in df.iterrows():
            # Get standardized entity name using existing logic
            entity_owner = row.get("entity_owner")
            counterparty = row.get("counterparty")

            if pd.isna(entity_owner) or pd.isna(counterparty):
                continue

            # Apply standardized mappings
            std_entity = entity_mappings.get(str(entity_owner), str(entity_owner))
            std_counterparty = entity_mappings.get(str(counterparty), str(counterparty))

            # Skip self-transactions
            if std_entity == std_counterparty:
                continue

            # Add nodes with attributes
            if not G.has_node(std_entity):
                G.add_node(
                    std_entity,
                    node_type="entity",
                    original_name=str(entity_owner),
                    transaction_count=0,
                    total_volume=0.0,
                )

            if not G.has_node(std_counterparty):
                G.add_node(
                    std_counterparty,
                    node_type="counterparty",
                    original_name=str(counterparty),
                    transaction_count=0,
                    total_volume=0.0,
                )

            # Calculate transaction amount
            debit = row.get("DEBIT", 0) or 0
            credit = row.get("CREDIT", 0) or 0
            amount = float(debit) if debit else float(credit) if credit else 0.0

            # Add or update edge
            if G.has_edge(std_entity, std_counterparty):
                G[std_entity][std_counterparty]["weight"] += amount
                G[std_entity][std_counterparty]["transaction_count"] += 1
            else:
                G.add_edge(
                    std_entity, std_counterparty, weight=amount, transaction_count=1
                )

            # Update node attributes
            G.nodes[std_entity]["transaction_count"] += 1
            G.nodes[std_entity]["total_volume"] += amount
            G.nodes[std_counterparty]["transaction_count"] += 1
            G.nodes[std_counterparty]["total_volume"] += amount

        return G

    def _get_standardized_entity_mappings(self, df: pd.DataFrame) -> dict:
        """
        Helper method to get standardized entity mappings from global registry.

        Args:
            df: DataFrame with entity data

        Returns:
            Dictionary mapping original names to standardized names
        """
        mappings = {}

        # Use existing global registry for standardized mappings
        if hasattr(st.session_state, "global_entity_registry"):
            for (
                canonical_name,
                registry_entry,
            ) in st.session_state.global_entity_registry.items():
                for alias in registry_entry.get("aliases", set()):
                    mappings[alias] = canonical_name.replace("_", " ").title()

        return mappings


def update_global_registry_with_counterparties(df_processed):
    """
    Extract counterparties from the dataframe and update the global registry.
    This is a simplified version - in a full implementation, you'd want more sophisticated
    counterparty extraction and matching logic.
    """
    # Ensure global_entity_registry exists in session state
    if "global_entity_registry" not in st.session_state:
        st.session_state.global_entity_registry = {}

    if "counterparty" not in df_processed.columns:
        return

    # Extract unique counterparties
    counterparties = df_processed["counterparty"].dropna().unique()

    for counterparty in counterparties:
        if not counterparty or pd.isna(counterparty):
            continue

        counterparty_clean = str(counterparty).strip()
        if len(counterparty_clean) < 2:  # Skip very short names
            continue

        # Check if this counterparty already exists in registry
        found_match = False
        for (
            canonical_name,
            registry_entry,
        ) in st.session_state.global_entity_registry.items():
            if (
                counterparty_clean.upper() == canonical_name.upper()
                or counterparty_clean.upper()
                in {alias.upper() for alias in registry_entry["aliases"]}
            ):
                # Add as alias if not already present
                registry_entry["aliases"].add(counterparty_clean)
                found_match = True
                break

        if not found_match:
            # Create new entry in registry (without primary_entity_id since we don't have a statement for this entity)
            canonical_name = counterparty_clean.upper().replace(" ", "_")
            if canonical_name not in st.session_state.global_entity_registry:
                st.session_state.global_entity_registry[canonical_name] = {
                    "primary_entity_id": None,
                    "aliases": {counterparty_clean},
                }


def extract_counterparty_for_analysis(df):
    """
    Extract counterparty names from transaction descriptions for analysis.
    This is a helper function for when counterparty data is not available from merged data.
    """
    if df.empty:
        return df

    df_copy = df.copy()

    # Ensure DESCRIPTION column is string type
    if "DESCRIPTION" in df_copy.columns:
        df_copy["DESCRIPTION"] = df_copy["DESCRIPTION"].astype(str).fillna("")

    # Initialize counterparty columns if they don't exist
    if "counterparty" not in df_copy.columns:
        df_copy["counterparty"] = ""
    if "COUNTERPARTY_ORIGINAL" not in df_copy.columns:
        df_copy["COUNTERPARTY_ORIGINAL"] = ""

    # Get or create standardizer
    if "standardizer" not in st.session_state:
        st.session_state.standardizer = CounterpartyStandardizer(85)

    standardizer = st.session_state.standardizer

    # Extract counterparty names
    for idx, row in df_copy.iterrows():
        desc = row.get("DESCRIPTION", "")
        if desc and pd.notna(desc) and str(desc).strip():
            name = standardizer.extract_counterparty_name(str(desc))
            if name:
                df_copy.at[idx, "COUNTERPARTY_ORIGINAL"] = str(name)
                df_copy.at[idx, "counterparty"] = str(name)

    return df_copy


def ensure_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ensure the dataframe has required columns with correct dtypes:
    - DATE: datetime64
    - DESCRIPTION: str
    - DEBIT: float
    - CREDIT: float

    Returns a sanitized copy without mutating the input df.
    """
    if df is None or df.empty:
        return df if df is not None else pd.DataFrame()

    out = df.copy()

    # Ensure DESCRIPTION as string
    if "DESCRIPTION" in out.columns:
        out["DESCRIPTION"] = out["DESCRIPTION"].astype(str).fillna("")
    else:
        out["DESCRIPTION"] = ""

    # Ensure DEBIT/CREDIT numeric
    for col in ["DEBIT", "CREDIT"]:
        if col in out.columns:
            out[col] = out[col].astype(str).str.replace(",", "").replace("nan", pd.NA)
            out[col] = pd.to_numeric(out[col], errors="coerce")
        else:
            out[col] = 0.0

    # Ensure DATE as datetime using smart_date_parsing
    if "DATE" in out.columns:
        # Only coerce non-datetime columns
        if not pd.api.types.is_datetime64_any_dtype(out["DATE"]):
            out["DATE"] = smart_date_parsing(out["DATE"])
    else:
        out["DATE"] = pd.NaT

    return out
