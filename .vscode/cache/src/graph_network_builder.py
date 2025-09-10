"""
Graph Network Builder Component for Round Trip Analysis

This module implements the GraphNetworkBuilder class that creates directed graphs
from transaction data for advanced round trip pattern detection using graph algorithms.
"""

from datetime import datetime
from typing import Dict, Any
import pandas as pd
import networkx as nx
from dataclasses import dataclass


@dataclass
class NetworkNode:
    """Represents a node in the transaction network"""
    entity_id: str
    entity_name: str
    standardized_name: str
    transaction_count: int
    total_volume: float
    centrality_scores: Dict[str, float]


@dataclass
class NetworkEdge:
    """Represents an edge (transaction) in the network"""
    source: str
    target: str
    amount: float
    date: datetime
    transaction_type: str
    transaction_id: str


class GraphNetworkBuilder:
    """
    Builds directed transaction networks from transaction data for graph-based analysis.
    
    This class creates directed graphs where nodes represent entities and edges represent
    transactions, enabling sophisticated round trip detection through graph algorithms.
    """
    
    def __init__(self):
        """Initialize the GraphNetworkBuilder"""
        self.transaction_counter = 0
    
    def build_transaction_network(self, transactions: pd.DataFrame) -> nx.DiGraph:
        """
        Creates directed graph with entities as nodes and transactions as edges.
        
        Args:
            transactions: DataFrame with columns DATE, DESCRIPTION, DEBIT, CREDIT,
                         entity_owner, counterparty
        
        Returns:
            NetworkX DiGraph with entities as nodes and transactions as edges.
            Edge attributes include: amount, date, transaction_type, net_flow
        """
        if transactions.empty:
            return nx.DiGraph()
        
        # Create directed graph
        G = nx.DiGraph()
        
        # Process each transaction
        for idx, row in transactions.iterrows():
            # Extract transaction details
            entity_owner = row.get('entity_owner')
            counterparty = row.get('counterparty')
            date = row.get('DATE')
            description = row.get('DESCRIPTION', '')
            debit = row.get('DEBIT', 0) or 0
            credit = row.get('CREDIT', 0) or 0
            
            # Skip invalid transactions
            if pd.isna(entity_owner) or pd.isna(counterparty):
                continue
            if entity_owner == counterparty:  # Skip self-transactions
                continue
            
            # Determine transaction direction and amount
            if debit > 0:
                # Money going out from entity_owner to counterparty
                source = str(entity_owner)
                target = str(counterparty)
                amount = float(debit)
                transaction_type = 'debit'
            elif credit > 0:
                # Money coming in from counterparty to entity_owner
                source = str(counterparty)
                target = str(entity_owner)
                amount = float(credit)
                transaction_type = 'credit'
            else:
                continue  # Skip zero-amount transactions
            
            # Add nodes if they don't exist
            if not G.has_node(source):
                G.add_node(source, 
                          entity_name=source,
                          transaction_count=0,
                          total_outgoing=0.0,
                          total_incoming=0.0)
            
            if not G.has_node(target):
                G.add_node(target,
                          entity_name=target, 
                          transaction_count=0,
                          total_outgoing=0.0,
                          total_incoming=0.0)
            
            # Generate unique transaction ID
            self.transaction_counter += 1
            transaction_id = f"txn_{self.transaction_counter}_{idx}"
            
            # Add edge with transaction metadata
            if G.has_edge(source, target):
                # Update existing edge - aggregate multiple transactions
                edge_data = G[source][target]
                edge_data['total_amount'] += amount
                edge_data['transaction_count'] += 1
                edge_data['transactions'].append({
                    'amount': amount,
                    'date': date,
                    'description': description,
                    'transaction_type': transaction_type,
                    'transaction_id': transaction_id
                })
                # Update net flow
                edge_data['net_flow'] = edge_data['total_amount']
            else:
                # Create new edge
                G.add_edge(source, target,
                          total_amount=amount,
                          transaction_count=1,
                          net_flow=amount,
                          transactions=[{
                              'amount': amount,
                              'date': date,
                              'description': description,
                              'transaction_type': transaction_type,
                              'transaction_id': transaction_id
                          }])
            
            # Update node statistics
            G.nodes[source]['transaction_count'] += 1
            G.nodes[source]['total_outgoing'] += amount
            G.nodes[target]['transaction_count'] += 1
            G.nodes[target]['total_incoming'] += amount
        
        return G
    
    def build_entity_graph(self, entity_links: Dict) -> nx.Graph:
        """
        Creates undirected graph showing entity relationships.
        Leverages existing entity linking for clean mappings.
        
        Args:
            entity_links: Dictionary mapping entity names to standardized forms
            
        Returns:
            NetworkX Graph with entity relationships
        """
        # Create undirected graph for entity relationships
        G = nx.Graph()
        
        # Add nodes for each unique entity
        entities_added = set()
        for original_name, standardized_name in entity_links.items():
            if standardized_name not in entities_added:
                G.add_node(standardized_name,
                          original_names={original_name},
                          entity_type='standardized')
                entities_added.add(standardized_name)
            else:
                # Add to existing node's original names
                G.nodes[standardized_name]['original_names'].add(original_name)
        
        # Add edges between entities that share similar names or patterns
        # This is a simplified approach - in practice, you'd use more sophisticated
        # entity resolution algorithms
        entity_list = list(entities_added)
        for i, entity1 in enumerate(entity_list):
            for entity2 in entity_list[i+1:]:
                # Simple similarity check based on shared words
                words1 = set(entity1.lower().split())
                words2 = set(entity2.lower().split())
                shared_words = words1.intersection(words2)
                
                if len(shared_words) > 0 and len(shared_words) >= min(len(words1), len(words2)) * 0.5:
                    G.add_edge(entity1, entity2,
                              similarity_score=len(shared_words) / max(len(words1), len(words2)),
                              shared_words=list(shared_words))
        
        return G
    
    def add_transaction_metadata(self, graph: nx.DiGraph, transactions: pd.DataFrame) -> None:
        """
        Enriches graph edges with transaction metadata for analysis.
        
        Args:
            graph: NetworkX DiGraph to enrich
            transactions: DataFrame with transaction data
        """
        if transactions.empty:
            return
        
        # Add temporal metadata to edges
        for source, target, edge_data in graph.edges(data=True):
            edge_transactions = edge_data.get('transactions', [])
            if not edge_transactions:
                continue
            
            # Calculate temporal statistics
            dates = [tx['date'] for tx in edge_transactions if pd.notna(tx['date'])]
            if dates:
                dates = pd.to_datetime(dates)
                edge_data['first_transaction'] = dates.min()
                edge_data['last_transaction'] = dates.max()
                edge_data['duration_days'] = (dates.max() - dates.min()).days
                edge_data['transaction_frequency'] = len(dates) / max(1, edge_data['duration_days'])
            
            # Calculate amount statistics
            amounts = [tx['amount'] for tx in edge_transactions]
            if amounts:
                edge_data['min_amount'] = min(amounts)
                edge_data['max_amount'] = max(amounts)
                edge_data['avg_amount'] = sum(amounts) / len(amounts)
                edge_data['amount_variance'] = pd.Series(amounts).var()
            
            # Add transaction type distribution
            tx_types = [tx['transaction_type'] for tx in edge_transactions]
            edge_data['transaction_types'] = dict(pd.Series(tx_types).value_counts())
        
        # Add node-level metadata
        for node in graph.nodes():
            node_data = graph.nodes[node]
            
            # Calculate centrality measures (basic ones for now)
            node_data['in_degree'] = graph.in_degree(node)
            node_data['out_degree'] = graph.out_degree(node)
            node_data['total_degree'] = graph.in_degree(node) + graph.out_degree(node)
            
            # Calculate transaction volume ratios
            total_out = node_data.get('total_outgoing', 0)
            total_in = node_data.get('total_incoming', 0)
            total_volume = total_out + total_in
            
            if total_volume > 0:
                node_data['outgoing_ratio'] = total_out / total_volume
                node_data['incoming_ratio'] = total_in / total_volume
                node_data['net_flow'] = total_in - total_out
            else:
                node_data['outgoing_ratio'] = 0.0
                node_data['incoming_ratio'] = 0.0
                node_data['net_flow'] = 0.0
    
    def get_graph_statistics(self, graph: nx.DiGraph) -> Dict[str, Any]:
        """
        Calculate basic statistics for the transaction graph.
        
        Args:
            graph: NetworkX DiGraph to analyze
            
        Returns:
            Dictionary with graph statistics
        """
        if graph.number_of_nodes() == 0:
            return {
                'node_count': 0,
                'edge_count': 0,
                'total_transaction_volume': 0.0,
                'average_degree': 0.0,
                'density': 0.0,
                'is_connected': False,
                'number_of_components': 0
            }
        
        # Basic graph metrics
        stats = {
            'node_count': graph.number_of_nodes(),
            'edge_count': graph.number_of_edges(),
            'density': nx.density(graph),
            'is_connected': nx.is_weakly_connected(graph),
            'number_of_components': nx.number_weakly_connected_components(graph)
        }
        
        # Calculate total transaction volume
        total_volume = sum(data.get('total_amount', 0) for _, _, data in graph.edges(data=True))
        stats['total_transaction_volume'] = total_volume
        
        # Calculate degree statistics
        degrees = [d for n, d in graph.degree()]
        if degrees:
            stats['average_degree'] = sum(degrees) / len(degrees)
            stats['max_degree'] = max(degrees)
            stats['min_degree'] = min(degrees)
        else:
            stats['average_degree'] = 0.0
            stats['max_degree'] = 0
            stats['min_degree'] = 0
        
        return stats