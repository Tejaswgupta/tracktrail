"""
Flowchart Chain Analyzer - Backend service for computing transaction flow chains.

This module provides server-side computation of chronological transaction chains,
hub detection, and branching analysis without browser memory limitations.
Uses Polars for efficient data processing.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

import polars as pl

logger = logging.getLogger(__name__)


@dataclass
class FlowEvent:
    """Represents a single transaction event in the flow."""
    id: str
    tx_date: str
    timestamp: int
    source_id: str
    target_id: str
    source_label: str
    target_label: str
    amount: float
    direction: str


@dataclass
class FlowChain:
    """Represents a chain of connected transactions."""
    id: str
    events: List[FlowEvent]
    start_date: str
    end_date: str
    total_amount: float
    signature: str
    is_cycle: bool = False


@dataclass
class HubCandidate:
    """Represents a potential hub/intermediary node."""
    node_id: str
    label: str
    chain_count: int
    pass_through_count: int
    inbound_connections: int
    outbound_connections: int
    total_inflow: float
    total_outflow: float


@dataclass
class BranchNodeSummary:
    """Represents branching behavior at a node."""
    node_id: str
    label: str
    split_paths: int
    split_events: int
    merge_paths: int
    merge_events: int


@dataclass
class EventBranchMeta:
    """Metadata about branching for an event."""
    split_count: int
    split_target_count: int
    merge_count: int
    merge_source_count: int


class FlowchartChainAnalyzer:
    """Analyzes transaction flows to identify chains, hubs, and patterns."""
    
    def __init__(
        self,
        max_paths_per_node: int = 8,
        max_display_chains: int = 10,
        max_sequential_runs: int = 12,
    ):
        self.max_paths_per_node = max_paths_per_node
        self.max_display_chains = max_display_chains
        self.max_sequential_runs = max_sequential_runs
    
    def analyze_flows(
        self,
        transactions_df: pl.DataFrame,
        entities_df: pl.DataFrame,
        min_amount_threshold: float = 0,
        chain_time_window_ms: int = 7 * 24 * 60 * 60 * 1000,  # 7 days default
    ) -> Dict:
        """
        Perform complete flow chain analysis on transactions.
        
        Args:
            transactions_df: Polars DataFrame with columns:
                - transaction_id, tx_date, amount, direction, entity_id, counterparty_merged
            entities_df: Polars DataFrame with columns:
                - entity_id, entity_name
            min_amount_threshold: Minimum transaction amount to include
            chain_time_window_ms: Maximum time gap between linked transactions (milliseconds)
        
        Returns:
            Dictionary with chains, hubs, branches, and metadata
        """
        logger.info(f"Starting flow chain analysis on {len(transactions_df)} transactions")
        
        # Build events from transactions
        events = self._build_events(transactions_df, entities_df)
        
        if len(events) == 0:
            return self._empty_result()
        
        # Filter by amount threshold
        if min_amount_threshold > 0:
            events = [e for e in events if e.amount >= min_amount_threshold]
        
        # Sort events chronologically
        events.sort(key=lambda e: (e.timestamp, e.tx_date, e.id))
        
        # Build adjacency maps
        successors, predecessors = self._build_event_adjacency(events, chain_time_window_ms)
        
        # Derive flow chains
        all_chains = self._derive_flow_chains(events, chain_time_window_ms)
        
        # Filter chains by amount threshold
        if min_amount_threshold > 0:
            all_chains = [c for c in all_chains if c.total_amount >= min_amount_threshold]
        
        # Get top chains
        chains = all_chains[:self.max_display_chains]
        
        # Derive sequential runs
        sequential_runs = self._derive_sequential_runs(events, chain_time_window_ms)
        sequential_runs = sequential_runs[:self.max_sequential_runs]
        
        # Build branch metadata
        event_lookup = {e.id: e for e in events}
        branch_meta = self._build_branch_meta(successors, predecessors)
        branch_nodes = self._summarize_branch_nodes(
            successors, predecessors, event_lookup, entities_df
        )
        
        # Identify hub candidates
        hub_candidates = self._identify_hub_candidates(all_chains, entities_df)
        highlighted_hubs = self._determine_highlighted_hubs(hub_candidates)
        
        return {
            "events": [self._event_to_dict(e) for e in events],
            "chains": [self._chain_to_dict(c) for c in chains],
            "sequential_runs": [self._chain_to_dict(r) for r in sequential_runs],
            "branch_meta": {eid: self._branch_meta_to_dict(m) for eid, m in branch_meta.items()},
            "branch_nodes": [self._branch_node_to_dict(b) for b in branch_nodes],
            "hub_candidates": [self._hub_to_dict(h) for h in hub_candidates],
            "highlighted_hub_node_ids": list(highlighted_hubs),
            "metadata": {
                "total_events": len(events),
                "total_chains": len(all_chains),
                "displayed_chains": len(chains),
                "sequential_runs": len(sequential_runs),
                "hub_candidates": len(hub_candidates),
                "chain_time_window_ms": chain_time_window_ms,
                "min_amount_threshold": min_amount_threshold,
            }
        }
    
    def _build_events(
        self,
        transactions_df: pl.DataFrame,
        entities_df: pl.DataFrame,
    ) -> List[FlowEvent]:
        """Build FlowEvent objects from transaction data."""
        events = []
        
        # Create entity lookup
        entity_lookup = {}
        if "entity_id" in entities_df.columns and "entity_name" in entities_df.columns:
            for row in entities_df.iter_rows(named=True):
                entity_lookup[row["entity_id"]] = row["entity_name"]
        
        # Normalize counterparty names for entity matching
        normalized_entities = {}
        for eid, name in entity_lookup.items():
            if name:  # Check if name is not None/empty
                normalized = name.strip().replace("  ", " ").lower()
                if normalized:
                    normalized_entities[normalized] = eid
        
        for row in transactions_df.iter_rows(named=True):
            tx_date = row.get("tx_date")
            if not tx_date:
                continue
            
            # Parse timestamp and convert tx_date to ISO string
            if isinstance(tx_date, str):
                try:
                    dt = datetime.fromisoformat(tx_date.replace("Z", "+00:00"))
                    timestamp = int(dt.timestamp() * 1000)
                    tx_date_str = tx_date
                except Exception:
                    timestamp = 0
                    tx_date_str = str(tx_date)
            else:
                # Handle datetime objects from database/Polars
                if hasattr(tx_date, "timestamp"):
                    timestamp = int(tx_date.timestamp() * 1000)
                    tx_date_str = tx_date.isoformat() if hasattr(tx_date, "isoformat") else str(tx_date)
                else:
                    timestamp = 0
                    tx_date_str = str(tx_date)
            
            entity_id = row.get("entity_id", "")
            counterparty_raw = row.get("counterparty_merged")
            print(row)
            counterparty = (counterparty_raw.strip() if counterparty_raw is not None else row.get('description')) 
            direction = row.get("direction", "")
            amount = float(row.get("amount", 0))
            
            entity_label = entity_lookup.get(entity_id, f"Entity {entity_id}")
            
            # Check if counterparty matches an entity
            normalized_cp = (counterparty.strip().replace("  ", " ").lower())
            counterparty_entity_id = normalized_entities.get(normalized_cp) if normalized_cp else None
            
            if direction == "DR":
                # Debit: entity -> counterparty
                source_id = f"entity-{entity_id}"
                source_label = entity_label
                
                if counterparty_entity_id:
                    target_id = f"entity-{counterparty_entity_id}"
                    target_label = entity_lookup[counterparty_entity_id]
                else:
                    target_id = f"counterparty-{counterparty}"
                    target_label = counterparty
            else:
                # Credit: counterparty -> entity
                if counterparty_entity_id:
                    source_id = f"entity-{counterparty_entity_id}"
                    source_label = entity_lookup[counterparty_entity_id]
                else:
                    source_id = f"counterparty-{counterparty}"
                    source_label = counterparty
                
                target_id = f"entity-{entity_id}"
                target_label = entity_label
            
            events.append(FlowEvent(
                id=row.get("transaction_id", ""),
                tx_date=tx_date_str,
                timestamp=timestamp,
                source_id=source_id,
                target_id=target_id,
                source_label=source_label,
                target_label=target_label,
                amount=amount,
                direction=direction,
            ))
        
        return events
    
    def _build_event_adjacency(
        self,
        events: List[FlowEvent],
        max_gap_ms: int,
    ) -> Tuple[Dict[str, List[FlowEvent]], Dict[str, List[FlowEvent]]]:
        """Build successor and predecessor maps for events."""
        successors: Dict[str, List[FlowEvent]] = {}
        predecessors: Dict[str, List[FlowEvent]] = {}
        events_by_source: Dict[str, List[FlowEvent]] = {}
        
        # Group events by source
        for event in events:
            if event.source_id not in events_by_source:
                events_by_source[event.source_id] = []
            events_by_source[event.source_id].append(event)
        
        # Build adjacency
        for event in events:
            candidates = events_by_source.get(event.target_id, [])
            
            for candidate in candidates:
                if event.id == candidate.id:
                    continue
                
                if not self._can_chain_events(event, candidate, max_gap_ms):
                    # Early exit optimization
                    if (max_gap_ms > 0 and 
                        candidate.timestamp > event.timestamp and
                        candidate.timestamp - event.timestamp > max_gap_ms):
                        break
                    continue
                
                # Add to successors
                if event.id not in successors:
                    successors[event.id] = []
                successors[event.id].append(candidate)
                
                # Add to predecessors
                if candidate.id not in predecessors:
                    predecessors[candidate.id] = []
                predecessors[candidate.id].append(event)
        
        return successors, predecessors
    
    def _can_chain_events(
        self,
        previous: FlowEvent,
        next_event: FlowEvent,
        max_gap_ms: int,
    ) -> bool:
        """Check if two events can be chained together."""
        if previous.target_id != next_event.source_id:
            return False
        
        if next_event.timestamp < previous.timestamp:
            return False
        
        if max_gap_ms > 0 and next_event.timestamp - previous.timestamp > max_gap_ms:
            return False
        
        return True
    
    def _derive_flow_chains(
        self,
        events: List[FlowEvent],
        max_gap_ms: int,
    ) -> List[FlowChain]:
        """Derive flow chains using dynamic programming."""
        if len(events) == 0:
            return []
        
        paths_by_end_node: Dict[str, List[FlowChain]] = {}
        best_by_signature: Dict[str, FlowChain] = {}
        
        for event in events:
            base_chain = self._create_chain([event])
            new_chains = [base_chain]
            
            # Try to extend existing chains
            continuations = paths_by_end_node.get(event.source_id, [])
            for chain in continuations:
                last_event = chain.events[-1]
                
                if not self._can_chain_events(last_event, event, max_gap_ms):
                    continue
                
                new_chains.append(self._create_chain(chain.events + [event]))
            
            # Update paths by end node
            for chain in new_chains:
                end_node_id = chain.events[-1].target_id
                
                if end_node_id not in paths_by_end_node:
                    paths_by_end_node[end_node_id] = []
                paths_by_end_node[end_node_id].append(chain)
                
                # Deduplicate and rank
                dedup: Dict[str, FlowChain] = {}
                for candidate in paths_by_end_node[end_node_id]:
                    existing = dedup.get(candidate.signature)
                    if not existing or self._prefers(candidate, existing):
                        dedup[candidate.signature] = candidate
                
                ranked = sorted(
                    dedup.values(),
                    key=lambda c: (-c.total_amount, -len(c.events), c.start_date, c.id)
                )
                paths_by_end_node[end_node_id] = ranked[:self.max_paths_per_node]
            
            # Track best chains (2+ events)
            for chain in new_chains:
                if len(chain.events) < 2:
                    continue
                
                existing = best_by_signature.get(chain.signature)
                if not existing or self._prefers(chain, existing):
                    best_by_signature[chain.signature] = chain
        
        chains = sorted(
            best_by_signature.values(),
            key=lambda c: (-c.total_amount, -len(c.events), c.start_date, c.id)
        )
        
        return chains
    
    def _derive_sequential_runs(
        self,
        events: List[FlowEvent],
        max_gap_ms: int,
    ) -> List[FlowChain]:
        """Derive sequential runs (back-to-back transactions)."""
        if len(events) == 0:
            return []
        
        runs = []
        buffer = []
        
        def flush_buffer():
            if len(buffer) >= 2:
                runs.append(self._create_chain(buffer))
            buffer.clear()
        
        for event in events:
            if len(buffer) == 0:
                buffer.append(event)
                continue
            
            last = buffer[-1]
            continues_chain = self._can_chain_events(last, event, max_gap_ms)
            
            if continues_chain:
                buffer.append(event)
            else:
                flush_buffer()
                buffer.append(event)
        
        flush_buffer()
        
        return runs
    
    def _build_branch_meta(
        self,
        successors: Dict[str, List[FlowEvent]],
        predecessors: Dict[str, List[FlowEvent]],
    ) -> Dict[str, EventBranchMeta]:
        """Build branching metadata for events."""
        meta: Dict[str, EventBranchMeta] = {}
        
        for event_id, successor_list in successors.items():
            if len(successor_list) <= 1:
                continue
            
            unique_targets = len(set(e.target_id for e in successor_list))
            if unique_targets <= 1:
                continue
            
            meta[event_id] = EventBranchMeta(
                split_count=len(successor_list),
                split_target_count=unique_targets,
                merge_count=0,
                merge_source_count=0,
            )
        
        for event_id, predecessor_list in predecessors.items():
            if len(predecessor_list) <= 1:
                continue
            
            unique_sources = len(set(e.source_id for e in predecessor_list))
            if unique_sources <= 1:
                continue
            
            if event_id in meta:
                meta[event_id].merge_count = len(predecessor_list)
                meta[event_id].merge_source_count = unique_sources
            else:
                meta[event_id] = EventBranchMeta(
                    split_count=0,
                    split_target_count=0,
                    merge_count=len(predecessor_list),
                    merge_source_count=unique_sources,
                )
        
        return meta
    
    def _summarize_branch_nodes(
        self,
        successors: Dict[str, List[FlowEvent]],
        predecessors: Dict[str, List[FlowEvent]],
        event_lookup: Dict[str, FlowEvent],
        entities_df: pl.DataFrame,
    ) -> List[BranchNodeSummary]:
        """Summarize branching behavior by node."""
        summary: Dict[str, BranchNodeSummary] = {}
        
        # Build entity lookup
        entity_lookup = {}
        if "entity_id" in entities_df.columns and "entity_name" in entities_df.columns:
            for row in entities_df.iter_rows(named=True):
                entity_lookup[f"entity-{row['entity_id']}"] = row["entity_name"]
        
        # Process splits
        for event_id, successor_list in successors.items():
            if len(successor_list) <= 1:
                continue
            
            source_event = event_lookup.get(event_id)
            if not source_event:
                continue
            
            unique_targets = set(e.target_id for e in successor_list)
            if len(unique_targets) <= 1:
                continue
            
            node_id = source_event.target_id
            label = entity_lookup.get(node_id, source_event.target_label)
            
            if node_id not in summary:
                summary[node_id] = BranchNodeSummary(
                    node_id=node_id,
                    label=label,
                    split_paths=0,
                    split_events=0,
                    merge_paths=0,
                    merge_events=0,
                )
            
            summary[node_id].split_events += 1
            summary[node_id].split_paths += len(unique_targets)
        
        # Process merges
        for event_id, predecessor_list in predecessors.items():
            if len(predecessor_list) <= 1:
                continue
            
            target_event = event_lookup.get(event_id)
            if not target_event:
                continue
            
            unique_sources = set(e.source_id for e in predecessor_list)
            if len(unique_sources) <= 1:
                continue
            
            node_id = target_event.source_id
            label = entity_lookup.get(node_id, target_event.source_label)
            
            if node_id not in summary:
                summary[node_id] = BranchNodeSummary(
                    node_id=node_id,
                    label=label,
                    split_paths=0,
                    split_events=0,
                    merge_paths=0,
                    merge_events=0,
                )
            
            summary[node_id].merge_events += 1
            summary[node_id].merge_paths += len(unique_sources)
        
        summaries = sorted(
            summary.values(),
            key=lambda s: (
                -(s.split_paths + s.merge_paths),
                -(s.split_events + s.merge_events),
                s.label
            )
        )
        
        return summaries
    
    def _identify_hub_candidates(
        self,
        chains: List[FlowChain],
        entities_df: pl.DataFrame,
    ) -> List[HubCandidate]:
        """Identify potential hub/intermediary nodes."""
        metrics: Dict[str, Dict] = {}
        
        # Build entity lookup
        entity_lookup = {}
        if "entity_id" in entities_df.columns and "entity_name" in entities_df.columns:
            for row in entities_df.iter_rows(named=True):
                entity_lookup[f"entity-{row['entity_id']}"] = row["entity_name"]
        
        for chain in chains:
            if len(chain.events) < 2:
                continue
            
            for i, event in enumerate(chain.events[:-1]):
                next_event = chain.events[i + 1]
                node_id = event.target_id
                label = entity_lookup.get(node_id, event.target_label)
                
                if node_id not in metrics:
                    metrics[node_id] = {
                        "label": label,
                        "chain_ids": set(),
                        "pass_through_count": 0,
                        "total_inflow": 0.0,
                        "total_outflow": 0.0,
                        "unique_prev": set(),
                        "unique_next": set(),
                    }
                
                m = metrics[node_id]
                m["chain_ids"].add(chain.id)
                m["pass_through_count"] += 1
                m["total_inflow"] += event.amount
                m["total_outflow"] += next_event.amount
                m["unique_prev"].add(event.source_id)
                m["unique_next"].add(next_event.target_id)
        
        results = [
            HubCandidate(
                node_id=node_id,
                label=m["label"],
                chain_count=len(m["chain_ids"]),
                pass_through_count=m["pass_through_count"],
                inbound_connections=len(m["unique_prev"]),
                outbound_connections=len(m["unique_next"]),
                total_inflow=m["total_inflow"],
                total_outflow=m["total_outflow"],
            )
            for node_id, m in metrics.items()
        ]
        
        results.sort(
            key=lambda h: (
                -h.chain_count,
                -h.pass_through_count,
                -(h.total_inflow + h.total_outflow),
                h.label
            )
        )
        
        return results
    
    def _determine_highlighted_hubs(self, hub_candidates: List[HubCandidate]) -> Set[str]:
        """Determine which hubs should be highlighted."""
        highlights = set()
        
        for candidate in hub_candidates:
            if (candidate.chain_count >= 2 or
                candidate.pass_through_count >= 3 or
                candidate.inbound_connections >= 3 or
                candidate.outbound_connections >= 3):
                highlights.add(candidate.node_id)
        
        # If no highlights, take top 3
        if len(highlights) == 0:
            for candidate in hub_candidates[:3]:
                highlights.add(candidate.node_id)
        
        return highlights
    
    def _create_chain(self, events: List[FlowEvent]) -> FlowChain:
        """Create a FlowChain from events."""
        total_amount = sum(e.amount for e in events)
        signature = self._build_signature(events)
        
        is_cycle = False
        if len(events) >= 2:
            is_cycle = events[0].source_id == events[-1].target_id
        
        return FlowChain(
            id=signature,
            events=events,
            start_date=events[0].tx_date,
            end_date=events[-1].tx_date,
            total_amount=total_amount,
            signature=signature,
            is_cycle=is_cycle,
        )
    
    def _build_signature(self, events: List[FlowEvent]) -> str:
        """Build unique signature for a chain."""
        node_sequence = "->".join(
            [events[0].source_id] + [e.target_id for e in events]
        )
        return f"{node_sequence}|{events[0].tx_date}|{events[-1].tx_date}"
    
    def _prefers(self, candidate: FlowChain, incumbent: FlowChain) -> bool:
        """Determine if candidate chain is preferred over incumbent."""
        if candidate.total_amount != incumbent.total_amount:
            return candidate.total_amount > incumbent.total_amount
        
        if len(candidate.events) != len(incumbent.events):
            return len(candidate.events) > len(incumbent.events)
        
        if candidate.start_date != incumbent.start_date:
            return candidate.start_date < incumbent.start_date
        
        return candidate.id < incumbent.id
    
    def _empty_result(self) -> Dict:
        """Return empty result structure."""
        return {
            "events": [],
            "chains": [],
            "sequential_runs": [],
            "branch_meta": {},
            "branch_nodes": [],
            "hub_candidates": [],
            "highlighted_hub_node_ids": [],
            "metadata": {
                "total_events": 0,
                "total_chains": 0,
                "displayed_chains": 0,
                "sequential_runs": 0,
                "hub_candidates": 0,
            }
        }
    
    # Conversion methods
    def _event_to_dict(self, event: FlowEvent) -> Dict:
        return {
            "id": event.id,
            "txDate": event.tx_date,
            "timestamp": event.timestamp,
            "sourceId": event.source_id,
            "targetId": event.target_id,
            "sourceLabel": event.source_label,
            "targetLabel": event.target_label,
            "amount": event.amount,
            "direction": event.direction,
        }
    
    def _chain_to_dict(self, chain: FlowChain) -> Dict:
        return {
            "id": chain.id,
            "events": [self._event_to_dict(e) for e in chain.events],
            "startDate": chain.start_date,
            "endDate": chain.end_date,
            "totalAmount": chain.total_amount,
            "signature": chain.signature,
            "isCycle": chain.is_cycle,
        }
    
    def _hub_to_dict(self, hub: HubCandidate) -> Dict:
        return {
            "nodeId": hub.node_id,
            "label": hub.label,
            "chainCount": hub.chain_count,
            "passThroughCount": hub.pass_through_count,
            "inboundConnections": hub.inbound_connections,
            "outboundConnections": hub.outbound_connections,
            "totalInflow": hub.total_inflow,
            "totalOutflow": hub.total_outflow,
        }
    
    def _branch_node_to_dict(self, branch: BranchNodeSummary) -> Dict:
        return {
            "nodeId": branch.node_id,
            "label": branch.label,
            "splitPaths": branch.split_paths,
            "splitEvents": branch.split_events,
            "mergePaths": branch.merge_paths,
            "mergeEvents": branch.merge_events,
        }
    
    def _branch_meta_to_dict(self, meta: EventBranchMeta) -> Dict:
        return {
            "splitCount": meta.split_count,
            "splitTargetCount": meta.split_target_count,
            "mergeCount": meta.merge_count,
            "mergeSourceCount": meta.merge_source_count,
        }
