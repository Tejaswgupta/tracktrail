# Bogus ITC Chain Detection MVP

This script is designed to identify potentially fraudulent Input Tax Credit (ITC) claims in the Indian GST system by analyzing the flow of invoices and ITC across periods. It detects origins of suspicious ITC and propagates this \"taint\" through supplier-recipient chains to highlight potentially risky transactions.

## Functionality

The script processes three primary data sources:
- **GSTR-1**: Outward supplies (invoices issued by a taxpayer).
- **GSTR-2**: Inward supplies (ITC claimed by a taxpayer on invoices received).
- **GSTR-3B**: Summary tax filings (output tax liability, ITC availed, credit utilized, cash paid).

### Core Detection Workflow

1. **Data Loading and Standardization**:
   - Loads GSTR-1, GSTR-2, and GSTR-3B data from CSV files.
   - Standardizes GSTINs, invoice numbers, and dates.
   - Calculates total tax/ITC amounts, handling missing or malformed data gracefully.

2. **Invoice Reconciliation**:
   - Matches invoices between GSTR-1 (supplier's record) and GSTR-2 (recipient's claim) based on exact `supplier_gstin`, `recipient_gstin`, and `invoice_no`.
   - Flags invoices in GSTR-1 as \"verified\" (if matched in GSTR-2) or \"unverified\".
   - Flags ITC claims in GSTR-2 as \"matched\" (if the corresponding invoice exists in GSTR-1) or \"unmatched\".

3. **Entity-Period Aggregation**:
   - Aggregates data for each taxpayer (`gstin`) for each month (`period`).
   - Calculates key metrics:
     - Outward tax declared (total, verified, unverified).
     - Inward ITC claimed (total, matched, unmatched).
     - Output tax, ITC availed, credit utilized, and cash paid from GSTR-3B.
   - Derives risk indicators:
     - `legit_in_itc`: The portion of ITC backed by matched invoices.
     - `underpayment_gap`: The amount of tax declared in GSTR-1 but seemingly not fully paid (cash + legit ITC).
     - `extra_itc_utilized`: ITC utilized in excess of the matched ITC.
     - `origin_suspicious_itc`: A core metric estimating the amount of potentially bogus ITC at the origin, based on underpayments or over-claims.
     - `pass_through_factor`: How much of the utilized credit a taxpayer passes on, capped between 0 and 1.
     - `risk_score`: A composite score (0-100) based on underpayment, unmatched ITC, and GSTR-1 vs GSTR-3B discrepancies.

4. **Origin Detection**:
   - Identifies taxpayers in a given period who have a `origin_suspicious_itc` above a threshold (default 1000).

5. **Taint Propagation**:
   - For each detected origin, propagates the `origin_suspicious_itc` amount forward through the supply chain (supplier -> recipient invoices) for a specified number of hops (default 4).
   - Flow is distributed pro-rata based on the positive tax amount of outgoing invoices.
   - At each downstream node (recipient), the flow is limited by the node's `pass_through_factor`.
   - Tracks the flow of \"tainted\" amounts on edges (invoices) and into nodes (taxpayers).

6. **Result Summarization**:
   - For a period, aggregates the total taint on each invoice (edge) and the total taint flowing into each taxpayer (node).
   - Generates ranked lists of origins, tainted edges, and tainted inflows.

7. **Graph Export (Optional)**:
   - Builds a NetworkX directed graph where nodes are GSTINs and edges are invoices.
   - Attaches node attributes (like `risk_score`, `origin_suspicious_itc`) and edge attributes (like `tax_total`, `tainted_amount`).
   - Exports the graph in GEXF, GraphML, Edge List, or JSON format for visualization and further analysis.

## Working

1. The script is invoked via command line, specifying paths to the GSTR-1, GSTR-2, and GSTR-3B CSV files.
2. It loads and processes the data, performing reconciliation and aggregation.
3. It either analyzes all periods present in the data or a single specified period.
4. For each period:
   a. It finds origins of suspicious ITC.
   b. It propagates taint from these origins.
   c. It summarizes the results into CSV files for origins, tainted edges, and tainted inflows.
   d. It writes the top propagation paths for each origin to a text file.
   e. Optionally, it exports a graph representation of the network with taint information.

## Use Cases

1. **Tax Authority Audits**:
   - Identify businesses that might be issuing bogus invoices to inflate ITC.
   - Trace the flow of potentially fraudulent credit to find accomplices or downstream beneficiaries.
   - Prioritize high-risk taxpayers for detailed scrutiny based on `risk_score` and `origin_suspicious_itc`.

2. **Business Compliance**:
   - Businesses can analyze their own supply chains to ensure they are not inadvertently involved with entities issuing or claiming bogus ITC.
   - Verify the legitimacy of their own ITC claims by checking for unmatched invoices.

3. **Data Analysis & Visualization**:
   - Generate network graphs to visualize the flow of goods and money, highlighting suspicious clusters or patterns.
   - Perform deeper analysis on the generated CSV and text files to understand trends and anomalies.

## CLI Usage

```bash
python bogus_itc_mvp_fixed.py \
  --gstr1 path/to/gstr1.csv \
  --gstr2 path/to/gstr2.csv \
  --gstr3b path/to/gstr3b.csv \
  [--period YYYY-MM] \
  [--min_origin VALUE] \
  [--max_hops VALUE] \
  [--min_flow VALUE] \
  [--include_cess] \
  [--out_prefix PREFIX] \
  [--export_graph] \
  [--graph_format {gexf,graphml,edgelist,json}]
```

### Arguments

- `--gstr1`: Path to the GSTR-1 CSV file (required).
- `--gstr2`: Path to the GSTR-2 CSV file (required).
- `--gstr3b`: Path to the GSTR-3B CSV file (required).
- `--period`: Analyze only a specific period (e.g., `2023-01`). If omitted, all periods in the data are analyzed.
- `--min_origin`: Minimum `origin_suspicious_itc` amount to consider a taxpayer as an origin (default 1000.0).
- `--max_hops`: Maximum number of steps to propagate taint forward in the chain (default 4).
- `--min_flow`: Minimum amount of taint flow to track on an edge or into a node (default 500.0).
- `--include_cess`: Include Cess amounts in total tax/ITC calculations.
- `--out_prefix`: Prefix for output files (default \"out\").
- `--export_graph`: Export the network graph with node and edge attributes.
- `--graph_format`: Format for the exported graph (choices: `gexf`, `graphml`, `edgelist`, `json`; default `gexf`).

### Outputs

For each analyzed period `P`, the script generates:
- `{prefix}_origins_P.csv`: List of origin taxpayers with their risk metrics.
- `{prefix}_tainted_edges_P.csv`: List of invoices (edges) identified as carrying potentially bogus ITC, sorted by taint amount.
- `{prefix}_tainted_inflows_P.csv`: List of taxpayers (nodes) receiving potentially bogus ITC, sorted by inflow amount.
- `{prefix}_chains_P.txt`: Top propagation paths of taint from each origin.
- `{prefix}_graph_P.{ext}`: (Optional) Exported network graph file.