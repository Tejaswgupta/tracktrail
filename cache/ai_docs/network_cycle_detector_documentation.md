# Network Cycle Detector Documentation

## Overview

The `NetworkCycleDetector` is a sophisticated Python class designed for detecting round trip patterns in financial transaction networks using graph algorithms. It's primarily used for anti-money laundering (AML) investigations to identify suspicious transaction patterns that may indicate layering, structuring, or other financial crimes.

## Core Classes

### DetectedCycle

A dataclass representing a detected cycle in the transaction network.

**Attributes:**
- `path`: List of entity names forming the cycle
- `transactions`: List of transaction dictionaries in the cycle
- `total_amount`: Total monetary value of transactions in the cycle
- `net_flow`: Net flow difference (should be close to zero for true round trips)
- `duration_days`: Time span of the cycle in days
- `confidence_score`: Algorithm confidence in the cycle (0.0-1.0)
- `cycle_type`: Classification ('simple', 'complex', 'hub-mediated')
- `cycle_length`: Number of nodes in the cycle
- `first_transaction_date`: Earliest transaction timestamp
- `last_transaction_date`: Latest transaction timestamp

**Real-world Usage:**
```python
# Example of a detected suspicious round trip
cycle = DetectedCycle(
    path=['Bank_A', 'Shell_Company_1', 'Individual_X', 'Bank_A'],
    total_amount=500000.0,
    net_flow=50.0,  # Small net flow indicates potential round trip
    duration_days=3,  # Quick turnaround is suspicious
    confidence_score=0.85,  # High confidence
    cycle_type='complex'
)
```

### NetworkAnalysisResults

Encapsulates complete network analysis results for comprehensive reporting.

**Attributes:**
- `graph`: NetworkX DiGraph of the transaction network
- `detected_cycles`: List of all detected cycles
- `centrality_metrics`: Network centrality measurements for each entity
- `hub_entities`: Entities identified as transaction hubs
- `network_statistics`: Overall network metrics
- `anomaly_scores`: Risk scores for each entity
- `analysis_timestamp`: When the analysis was performed
- `configuration_used`: Parameters used for the analysis

## Main Class: NetworkCycleDetector

### Constructor

```python
def __init__(self, logger: Optional[logging.Logger] = None)
```

**Purpose:** Initialize the detector with optional logging capability.

**Usage:**
```python
import logging
logger = logging.getLogger('aml_investigation')
detector = NetworkCycleDetector(logger=logger)
```

## Core Detection Methods

### detect_network_cycles()

```python
def detect_network_cycles(self, 
                        graph: nx.DiGraph, 
                        min_length: int = 2, 
                        max_length: int = 10,
                        min_amount: float = 0.0,
                        max_duration_days: int = 365,
                        net_flow_threshold: float = 0.1) -> List[DetectedCycle]
```

**Purpose:** Main cycle detection method using NetworkX's Johnson's algorithm to find all simple cycles.

**Parameters:**
- `graph`: NetworkX directed graph representing transaction flows
- `min_length`: Minimum number of entities in a cycle (default: 2)
- `max_length`: Maximum cycle length to prevent performance issues (default: 10)
- `min_amount`: Minimum transaction amount threshold (default: 0.0)
- `max_duration_days`: Maximum time span for valid cycles (default: 365)
- `net_flow_threshold`: Maximum net flow ratio for round trip classification (default: 0.1)

**Real-world Application:**
```python
# Detect suspicious round trips in banking data
cycles = detector.detect_network_cycles(
    graph=transaction_graph,
    min_length=3,  # At least 3 entities involved
    max_length=6,  # Limit complexity
    min_amount=10000.0,  # Focus on significant amounts
    max_duration_days=30,  # Quick turnarounds are more suspicious
    net_flow_threshold=0.05  # Very low net flow indicates layering
)

# Results might include:
# - Money flowing from Account A → Shell Company → Account A
# - Complex layering through multiple intermediaries
# - Rapid-fire transactions designed to obscure money trails
```

**Working Mechanism:**
1. Uses NetworkX's `simple_cycles()` to find all cycles
2. Filters cycles by length constraints
3. Analyzes each cycle for transaction details
4. Applies filtering based on amount, duration, and net flow
5. Calculates confidence scores based on multiple factors
6. Returns sorted list by confidence score

### _analyze_cycle()

```python
def _analyze_cycle(self, graph: nx.DiGraph, cycle_path: List[str]) -> Optional[Dict[str, Any]]
```

**Purpose:** Internal method that analyzes individual cycles to extract transaction details and calculate metrics.

**Working Process:**
1. Extracts transaction data for each edge in the cycle
2. Calculates total amounts and temporal metrics
3. Computes net flow (key indicator of round trips)
4. Determines confidence score based on multiple factors
5. Classifies cycle type (simple, complex, hub-mediated)

**Real-world Significance:**
This method is crucial for distinguishing between legitimate business transactions and suspicious round trips. For example:
- A cycle with near-zero net flow might indicate money laundering
- Rapid completion suggests urgency to move money quickly
- Consistent amounts across the cycle indicate structured transactions

## Centrality Analysis Methods

### calculate_centrality_metrics()

```python
def calculate_centrality_metrics(self, graph: nx.DiGraph) -> Dict[str, Dict[str, float]]
```

**Purpose:** Calculates various centrality measures to identify key entities in the transaction network.

**Centrality Measures Calculated:**
- **Betweenness Centrality**: Identifies entities that act as bridges between other entities
- **Closeness Centrality**: Measures how quickly an entity can reach all other entities
- **Degree Centrality**: Based on number of direct connections
- **PageRank**: Google's algorithm adapted for transaction networks
- **Eigenvector Centrality**: Identifies entities connected to other important entities

**Real-world Application:**
```python
centrality = detector.calculate_centrality_metrics(transaction_graph)

# Example results for a money laundering hub:
hub_metrics = centrality['Suspicious_Entity_123']
# {
#     'betweenness': 0.45,  # High - acts as bridge
#     'closeness': 0.78,    # High - can reach many entities quickly  
#     'pagerank': 0.12,     # High - important in network
#     'total_degree': 25    # Many connections
# }
```

**Investigative Value:**
- High betweenness centrality often indicates money laundering hubs
- Entities with high centrality scores warrant immediate investigation
- Can identify previously unknown key players in criminal networks

### identify_hub_entities()

```python
def identify_hub_entities(self, 
                        graph: nx.DiGraph, 
                        threshold: float = 0.1,
                        centrality_metrics: Optional[Dict[str, Dict[str, float]]] = None) -> List[str]
```

**Purpose:** Identifies entities that facilitate multiple transactions and may be central to money laundering operations.

**Parameters:**
- `threshold`: Minimum centrality score for hub classification
- `centrality_metrics`: Pre-calculated metrics (optional for performance)

**Real-world Usage:**
```python
# Identify potential money laundering hubs
hubs = detector.identify_hub_entities(
    graph=transaction_graph,
    threshold=0.15  # Higher threshold for more selective identification
)

# Results might include:
# - Shell companies used for layering
# - Corrupt bank officials facilitating transfers
# - Money service businesses used for structuring
# - Individuals coordinating multiple accounts
```

## Temporal Pattern Analysis

### detect_temporal_patterns()

```python
def detect_temporal_patterns(self, 
                           graph: nx.DiGraph, 
                           cycles: List[DetectedCycle],
                           time_window_hours: int = 24) -> Dict[str, Any]
```

**Purpose:** Detects synchronized or coordinated transaction timing patterns that may indicate organized money laundering.

**Key Features:**
- **Synchronized Cycles**: Multiple round trips occurring within the same time window
- **Temporal Clusters**: Groups of cycles with similar timing
- **Periodic Patterns**: Regular intervals that suggest systematic activity
- **Burst Patterns**: High activity periods that may indicate urgent money movement

**Real-world Application:**
```python
temporal_analysis = detector.detect_temporal_patterns(
    graph=transaction_graph,
    cycles=detected_cycles,
    time_window_hours=6  # Look for activity within 6-hour windows
)

# Results might reveal:
# - Multiple shell companies moving money simultaneously
# - Coordinated activity across different time zones
# - Regular weekly patterns suggesting systematic laundering
# - Burst activity following major criminal events
```

**Investigative Significance:**
- Synchronized patterns often indicate coordination between multiple parties
- Regular patterns may reveal systematic money laundering operations
- Burst patterns can correlate with specific criminal activities or law enforcement pressure

## Clustering and Pattern Recognition

### cluster_entities_by_patterns()

```python
def cluster_entities_by_patterns(self, 
                               graph: nx.DiGraph, 
                               cycles: List[DetectedCycle],
                               centrality_metrics: Dict[str, Dict[str, float]],
                               clustering_method: str = 'dbscan',
                               n_clusters: Optional[int] = None) -> Dict[str, Any]
```

**Purpose:** Groups related entities based on transaction patterns using machine learning clustering algorithms.

**Clustering Methods:**
- **DBSCAN**: Density-based clustering that automatically finds clusters and identifies outliers
- **K-means**: Partitions entities into k clusters based on feature similarity
- **Spectral**: Uses graph structure for clustering, good for complex network patterns

**Features Used for Clustering:**
- Centrality metrics
- Cycle participation rates
- Transaction volumes and patterns
- Temporal activity patterns
- Network position characteristics

**Real-world Application:**
```python
clustering_results = detector.cluster_entities_by_patterns(
    graph=transaction_graph,
    cycles=detected_cycles,
    centrality_metrics=centrality_metrics,
    clustering_method='dbscan'  # Good for finding criminal networks
)

# Results might identify:
# - Criminal organization clusters
# - Shell company networks under common control
# - Geographic clustering of related entities
# - Behavioral clusters with similar transaction patterns
```

**Investigative Value:**
- Reveals hidden relationships between entities
- Identifies criminal networks and organizational structures
- Helps prioritize investigations by focusing on high-risk clusters
- Can uncover previously unknown connections

## Anomaly Detection

### calculate_anomaly_scores()

```python
def calculate_anomaly_scores(self, 
                           graph: nx.DiGraph, 
                           cycles: List[DetectedCycle],
                           centrality_metrics: Dict[str, Dict[str, float]]) -> Dict[str, float]
```

**Purpose:** Calculates risk scores for entities based on their network behavior and patterns.

**Scoring Factors:**
- Network centrality (high centrality = higher risk)
- Cycle participation frequency
- Transaction volume relative to network
- Unusual network positions

**Real-world Usage:**
```python
anomaly_scores = detector.calculate_anomaly_scores(
    graph=transaction_graph,
    cycles=detected_cycles,
    centrality_metrics=centrality_metrics
)

# Example results:
# {
#     'Shell_Company_A': 0.89,  # Very high risk
#     'Bank_Official_X': 0.76,  # High risk
#     'Legitimate_Business': 0.12  # Low risk
# }
```

**Risk Assessment Applications:**
- Prioritize investigations based on risk scores
- Allocate compliance resources efficiently
- Generate automated alerts for high-risk entities
- Support regulatory reporting requirements

## Comprehensive Analysis Methods

### calculate_network_statistics()

```python
def calculate_network_statistics(self, 
                               graph: nx.DiGraph, 
                               cycles: List[DetectedCycle],
                               centrality_metrics: Dict[str, Dict[str, float]]) -> Dict[str, Any]
```

**Purpose:** Generates comprehensive network statistics for regulatory reporting and investigation documentation.

**Statistics Categories:**
- **Basic Metrics**: Node/edge counts, density, connectivity
- **Cycle Metrics**: Distribution by type, confidence, volume
- **Centrality Summary**: Statistical summaries of centrality measures
- **Temporal Metrics**: Time span analysis, activity rates
- **Volume Metrics**: Transaction amount distributions

**Regulatory Reporting Usage:**
```python
network_stats = detector.calculate_network_statistics(
    graph=transaction_graph,
    cycles=detected_cycles,
    centrality_metrics=centrality_metrics
)

# Generate compliance report
report = {
    'investigation_id': 'AML_2024_001',
    'network_analysis': network_stats,
    'suspicious_activity_count': len(detected_cycles),
    'high_risk_entities': len([e for e, s in anomaly_scores.items() if s > 0.7])
}
```

### generate_pattern_summary()

```python
def generate_pattern_summary(self, 
                           graph: nx.DiGraph,
                           cycles: List[DetectedCycle],
                           centrality_metrics: Dict[str, Dict[str, float]],
                           clustering_results: Optional[Dict[str, Any]] = None,
                           temporal_patterns: Optional[Dict[str, Any]] = None,
                           anomaly_scores: Optional[Dict[str, float]] = None) -> Dict[str, Any]
```

**Purpose:** Creates executive-level summary for investigation reports and regulatory submissions.

**Report Sections:**
- **Executive Summary**: High-level findings and risk assessment
- **Key Findings**: Most significant patterns and anomalies
- **Suspicious Patterns**: Detailed analysis of concerning activities
- **Entity Analysis**: Profiles of high-risk entities
- **Risk Assessment**: Overall risk scoring and factors
- **Recommendations**: Actionable next steps for investigators

**Executive Reporting Usage:**
```python
summary = detector.generate_pattern_summary(
    graph=transaction_graph,
    cycles=detected_cycles,
    centrality_metrics=centrality_metrics,
    clustering_results=clustering_results,
    temporal_patterns=temporal_patterns,
    anomaly_scores=anomaly_scores
)

# Executive summary might include:
# - "Detected 47 suspicious round trip patterns involving $2.3M"
# - "Identified 8 high-risk entities requiring immediate investigation"
# - "Found evidence of coordinated activity across 3 shell companies"
```

### generate_investigation_report()

```python
def generate_investigation_report(self, 
                                analysis_results: NetworkAnalysisResults,
                                include_detailed_cycles: bool = True,
                                include_entity_details: bool = True,
                                max_cycles_to_include: int = 50) -> Dict[str, Any]
```

**Purpose:** Generates comprehensive investigation reports suitable for law enforcement, regulators, and internal compliance teams.

**Report Components:**
- **Report Metadata**: Analysis parameters and timestamps
- **Executive Summary**: High-level findings for management
- **Network Overview**: Statistical summary of the network
- **Cycle Analysis**: Detailed round trip pattern analysis
- **Entity Analysis**: Profiles of suspicious entities
- **Risk Assessment**: Overall risk evaluation
- **Detailed Findings**: Supporting evidence and data
- **Recommendations**: Specific actions for investigators

## Real-World Use Cases

### 1. Banking Compliance
```python
# Daily AML monitoring for a bank
detector = NetworkCycleDetector()
daily_graph = build_transaction_graph(today_transactions)
cycles = detector.detect_network_cycles(
    graph=daily_graph,
    min_amount=5000.0,  # Regulatory threshold
    max_duration_days=7,  # Quick round trips
    net_flow_threshold=0.02  # Very tight for detection
)

# Generate SAR (Suspicious Activity Report) if cycles found
if cycles:
    generate_sar_report(cycles)
```

### 2. Law Enforcement Investigation
```python
# Investigating a suspected money laundering network
investigation_graph = build_graph_from_subpoenas(bank_records)
centrality = detector.calculate_centrality_metrics(investigation_graph)
hubs = detector.identify_hub_entities(investigation_graph, threshold=0.2)

# Focus investigation on hub entities
for hub in hubs:
    issue_search_warrant(hub)
    freeze_accounts(hub)
```

### 3. Regulatory Examination
```python
# Bank examination by financial regulators
exam_period_graph = build_graph_for_period(start_date, end_date)
analysis_results = detector.detect_network_cycles(exam_period_graph)
anomaly_scores = detector.calculate_anomaly_scores(
    exam_period_graph, analysis_results, centrality_metrics
)

# Generate regulatory report
regulatory_report = detector.generate_investigation_report(
    NetworkAnalysisResults(
        graph=exam_period_graph,
        detected_cycles=analysis_results,
        centrality_metrics=centrality_metrics,
        anomaly_scores=anomaly_scores,
        # ... other fields
    )
)
```

### 4. Financial Intelligence Unit (FIU) Analysis
```python
# Cross-border money laundering investigation
international_graph = combine_multiple_jurisdictions(country_data)
temporal_patterns = detector.detect_temporal_patterns(
    international_graph, detected_cycles, time_window_hours=12
)

# Look for coordinated international activity
if temporal_patterns['synchronization_score'] > 0.3:
    alert_international_partners()
    initiate_joint_investigation()
```

## Performance Considerations

### Large Network Optimization
- **Cycle Detection**: Johnson's algorithm can be memory-intensive for large graphs
- **Centrality Calculation**: Some measures are computationally expensive
- **Clustering**: Feature extraction scales with network size

### Recommended Limits
- **Nodes**: < 10,000 for real-time analysis
- **Edges**: < 50,000 for reasonable performance
- **Max Cycle Length**: 6-8 for large networks to prevent exponential explosion

### Optimization Strategies
```python
# For large networks, use sampling or filtering
if graph.number_of_nodes() > 5000:
    # Focus on high-value transactions
    filtered_graph = filter_by_amount(graph, min_amount=50000)
    cycles = detector.detect_network_cycles(
        filtered_graph, 
        max_length=6  # Reduce complexity
    )
```

## Integration with AML Systems

### Typical Workflow
1. **Data Ingestion**: Import transaction data from core banking systems
2. **Graph Construction**: Build NetworkX graph from transaction records
3. **Cycle Detection**: Run detection algorithms with appropriate parameters
4. **Risk Scoring**: Calculate anomaly scores and centrality metrics
5. **Pattern Analysis**: Identify temporal and clustering patterns
6. **Report Generation**: Create investigation reports and regulatory filings
7. **Case Management**: Feed results into case management systems

### API Integration Example
```python
class AMLAnalysisService:
    def __init__(self):
        self.detector = NetworkCycleDetector()
    
    def analyze_customer_network(self, customer_id: str, days_back: int = 90):
        # Build graph for customer and related entities
        graph = self.build_customer_graph(customer_id, days_back)
        
        # Run comprehensive analysis
        cycles = self.detector.detect_network_cycles(graph)
        centrality = self.detector.calculate_centrality_metrics(graph)
        anomaly_scores = self.detector.calculate_anomaly_scores(
            graph, cycles, centrality
        )
        
        # Generate risk assessment
        risk_level = self.assess_risk_level(anomaly_scores, cycles)
        
        return {
            'customer_id': customer_id,
            'risk_level': risk_level,
            'cycles_detected': len(cycles),
            'anomaly_score': anomaly_scores.get(customer_id, 0.0),
            'requires_investigation': risk_level in ['high', 'critical']
        }
```

This comprehensive documentation covers all major functions and their real-world applications in anti-money laundering and financial crime investigation contexts.