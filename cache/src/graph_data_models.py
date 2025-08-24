"""
Data models for graph network analysis.

This module defines the core data structures used in graph-based round trip detection
and network analysis, including nodes, edges, cycles, and analysis results.
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import List, Dict, Any, Optional
import json


@dataclass
class NetworkNode:
    """Represents a node (entity) in the transaction network graph."""
    
    entity_id: str
    entity_name: str
    standardized_name: str
    transaction_count: int = 0
    total_volume: float = 0.0
    centrality_scores: Dict[str, float] = field(default_factory=dict)
    
    def __post_init__(self):
        """Validate node data after initialization."""
        if not self.entity_id:
            raise ValueError("entity_id cannot be empty")
        if not self.entity_name:
            raise ValueError("entity_name cannot be empty")
        if self.transaction_count < 0:
            raise ValueError("transaction_count cannot be negative")
        if self.total_volume < 0:
            raise ValueError("total_volume cannot be negative")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert node to dictionary for serialization."""
        return asdict(self)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'NetworkNode':
        """Create node from dictionary."""
        return cls(**data)
    
    def validate(self) -> bool:
        """Validate node data integrity."""
        try:
            self.__post_init__()
            return True
        except ValueError:
            return False


@dataclass
class NetworkEdge:
    """Represents an edge (transaction) in the transaction network graph."""
    
    source: str
    target: str
    amount: float
    date: datetime
    transaction_type: str
    transaction_id: str
    
    def __post_init__(self):
        """Validate edge data after initialization."""
        if not self.source:
            raise ValueError("source cannot be empty")
        if not self.target:
            raise ValueError("target cannot be empty")
        if self.amount < 0:
            raise ValueError("amount cannot be negative")
        if not self.transaction_type:
            raise ValueError("transaction_type cannot be empty")
        if not self.transaction_id:
            raise ValueError("transaction_id cannot be empty")
        if self.source == self.target:
            raise ValueError("source and target cannot be the same")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert edge to dictionary for serialization."""
        data = asdict(self)
        # Convert datetime to ISO string for JSON serialization
        data['date'] = self.date.isoformat()
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'NetworkEdge':
        """Create edge from dictionary."""
        # Convert ISO string back to datetime
        if isinstance(data['date'], str):
            data['date'] = datetime.fromisoformat(data['date'])
        return cls(**data)
    
    def validate(self) -> bool:
        """Validate edge data integrity."""
        try:
            self.__post_init__()
            return True
        except ValueError:
            return False


@dataclass
class DetectedCycle:
    """Represents a detected round trip cycle in the network."""
    
    path: List[str]
    transactions: List[NetworkEdge]
    total_amount: float
    net_flow: float
    duration_days: int
    confidence_score: float
    cycle_type: str = 'simple'  # 'simple', 'complex', 'hub-mediated'
    
    def __post_init__(self):
        """Validate cycle data after initialization."""
        if len(self.path) < 2:
            raise ValueError("path must contain at least 2 entities")
        if not self.transactions:
            raise ValueError("transactions cannot be empty")
        if len(self.transactions) != len(self.path) - 1:
            raise ValueError("number of transactions must equal path length - 1")
        if self.path[0] != self.path[-1]:
            raise ValueError("cycle path must start and end with the same entity")
        if self.duration_days < 0:
            raise ValueError("duration_days cannot be negative")
        if not 0 <= self.confidence_score <= 1:
            raise ValueError("confidence_score must be between 0 and 1")
        if self.cycle_type not in ['simple', 'complex', 'hub-mediated']:
            raise ValueError("cycle_type must be 'simple', 'complex', or 'hub-mediated'")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert cycle to dictionary for serialization."""
        data = asdict(self)
        # Convert transactions to dictionaries
        data['transactions'] = [tx.to_dict() for tx in self.transactions]
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'DetectedCycle':
        """Create cycle from dictionary."""
        # Convert transaction dictionaries back to NetworkEdge objects
        data['transactions'] = [NetworkEdge.from_dict(tx) for tx in data['transactions']]
        return cls(**data)
    
    def validate(self) -> bool:
        """Validate cycle data integrity."""
        try:
            self.__post_init__()
            # Validate all transactions
            return all(tx.validate() for tx in self.transactions)
        except ValueError:
            return False
    
    def get_cycle_length(self) -> int:
        """Get the length of the cycle (number of unique entities)."""
        return len(set(self.path)) - 1  # Subtract 1 because start/end are the same
    
    def is_round_trip(self) -> bool:
        """Check if this is a true round trip (returns to origin)."""
        return len(self.path) >= 3 and self.path[0] == self.path[-1]


@dataclass
class NetworkAnalysisResults:
    """Encapsulates complete network analysis results."""
    
    detected_cycles: List[DetectedCycle]
    centrality_metrics: Dict[str, Dict[str, float]]
    hub_entities: List[str]
    network_statistics: Dict[str, Any]
    anomaly_scores: Dict[str, float]
    analysis_timestamp: datetime
    configuration_used: Dict[str, Any]  # GraphAnalysisConfig as dict
    graph_nodes: List[NetworkNode] = field(default_factory=list)
    graph_edges: List[NetworkEdge] = field(default_factory=list)
    
    def __post_init__(self):
        """Validate analysis results after initialization."""
        if not isinstance(self.detected_cycles, list):
            raise ValueError("detected_cycles must be a list")
        if not isinstance(self.centrality_metrics, dict):
            raise ValueError("centrality_metrics must be a dictionary")
        if not isinstance(self.hub_entities, list):
            raise ValueError("hub_entities must be a list")
        if not isinstance(self.network_statistics, dict):
            raise ValueError("network_statistics must be a dictionary")
        if not isinstance(self.anomaly_scores, dict):
            raise ValueError("anomaly_scores must be a dictionary")
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert results to dictionary for serialization."""
        data = asdict(self)
        # Convert datetime to ISO string
        data['analysis_timestamp'] = self.analysis_timestamp.isoformat()
        # Convert cycles to dictionaries
        data['detected_cycles'] = [cycle.to_dict() for cycle in self.detected_cycles]
        # Convert nodes and edges to dictionaries
        data['graph_nodes'] = [node.to_dict() for node in self.graph_nodes]
        data['graph_edges'] = [edge.to_dict() for edge in self.graph_edges]
        return data
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'NetworkAnalysisResults':
        """Create results from dictionary."""
        # Convert ISO string back to datetime
        if isinstance(data['analysis_timestamp'], str):
            data['analysis_timestamp'] = datetime.fromisoformat(data['analysis_timestamp'])
        
        # Convert cycle dictionaries back to DetectedCycle objects
        data['detected_cycles'] = [DetectedCycle.from_dict(cycle) for cycle in data['detected_cycles']]
        
        # Convert node and edge dictionaries back to objects
        data['graph_nodes'] = [NetworkNode.from_dict(node) for node in data.get('graph_nodes', [])]
        data['graph_edges'] = [NetworkEdge.from_dict(edge) for edge in data.get('graph_edges', [])]
        
        return cls(**data)
    
    def validate(self) -> bool:
        """Validate analysis results data integrity."""
        try:
            self.__post_init__()
            # Validate all cycles
            cycles_valid = all(cycle.validate() for cycle in self.detected_cycles)
            # Validate all nodes and edges
            nodes_valid = all(node.validate() for node in self.graph_nodes)
            edges_valid = all(edge.validate() for edge in self.graph_edges)
            return cycles_valid and nodes_valid and edges_valid
        except ValueError:
            return False
    
    def save_to_file(self, filepath: str) -> bool:
        """Save analysis results to JSON file."""
        try:
            data = self.to_dict()
            with open(filepath, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            return True
        except Exception as e:
            print(f"Error saving results to file: {e}")
            return False
    
    @classmethod
    def load_from_file(cls, filepath: str) -> Optional['NetworkAnalysisResults']:
        """Load analysis results from JSON file."""
        try:
            with open(filepath, 'r') as f:
                data = json.load(f)
            return cls.from_dict(data)
        except Exception as e:
            print(f"Error loading results from file: {e}")
            return None
    
    def get_summary_statistics(self) -> Dict[str, Any]:
        """Get summary statistics of the analysis results."""
        return {
            'total_cycles_detected': len(self.detected_cycles),
            'cycle_types': {
                cycle_type: len([c for c in self.detected_cycles if c.cycle_type == cycle_type])
                for cycle_type in ['simple', 'complex', 'hub-mediated']
            },
            'total_nodes': len(self.graph_nodes),
            'total_edges': len(self.graph_edges),
            'hub_entities_count': len(self.hub_entities),
            'analysis_timestamp': self.analysis_timestamp.isoformat(),
            'average_confidence_score': (
                sum(cycle.confidence_score for cycle in self.detected_cycles) / len(self.detected_cycles)
                if self.detected_cycles else 0.0
            )
        }
    
    def filter_cycles_by_confidence(self, min_confidence: float) -> List[DetectedCycle]:
        """Filter cycles by minimum confidence score."""
        return [cycle for cycle in self.detected_cycles if cycle.confidence_score >= min_confidence]
    
    def filter_cycles_by_type(self, cycle_type: str) -> List[DetectedCycle]:
        """Filter cycles by type."""
        return [cycle for cycle in self.detected_cycles if cycle.cycle_type == cycle_type]
    
    def get_cycles_involving_entity(self, entity_id: str) -> List[DetectedCycle]:
        """Get all cycles that involve a specific entity."""
        return [cycle for cycle in self.detected_cycles if entity_id in cycle.path]


# Utility functions for data model operations

def create_network_node_from_entity(entity_id: str, entity_name: str, 
                                   standardized_name: str) -> NetworkNode:
    """Create a NetworkNode from basic entity information."""
    return NetworkNode(
        entity_id=entity_id,
        entity_name=entity_name,
        standardized_name=standardized_name
    )


def create_network_edge_from_transaction(source: str, target: str, amount: float,
                                       date: datetime, transaction_type: str,
                                       transaction_id: str) -> NetworkEdge:
    """Create a NetworkEdge from transaction information."""
    return NetworkEdge(
        source=source,
        target=target,
        amount=amount,
        date=date,
        transaction_type=transaction_type,
        transaction_id=transaction_id
    )


def validate_cycle_path_consistency(cycle: DetectedCycle) -> bool:
    """Validate that cycle path is consistent with transactions."""
    if len(cycle.transactions) != len(cycle.path) - 1:
        return False
    
    for i, transaction in enumerate(cycle.transactions):
        if transaction.source != cycle.path[i] or transaction.target != cycle.path[i + 1]:
            return False
    
    return True


def calculate_cycle_net_flow(cycle: DetectedCycle) -> float:
    """Calculate the net flow of a cycle (difference between forward and return flows)."""
    if not cycle.transactions:
        return 0.0
    
    # For a simple round trip, compare outgoing vs incoming amounts
    outgoing_amount = sum(tx.amount for tx in cycle.transactions[::2])  # Even indices
    incoming_amount = sum(tx.amount for tx in cycle.transactions[1::2])  # Odd indices
    
    return abs(outgoing_amount - incoming_amount)