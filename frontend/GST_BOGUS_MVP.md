Awesome problem. You can get a solid MVP up and running with a graph-based approach that:

- Ingests GSTR-1, GSTR-2, and GSTR-3B
- Reconciles invoices to identify legitimate vs. unbacked ITC
- Quantifies “bogus ITC generation” at originators (underpayment or discretionary ITC)
- Propagates that “taint” across the supply chain to show chains and exposures
- Flags high-risk entities and chains, including legitimate pass-through nodes

Below is a complete, runnable Python MVP that works on CSV exports and scales to ~10–15 entities easily. It uses pandas and networkx, and includes a taint-propagation engine, origin detection, and chain extraction.

What you’ll get:

- Per-entity risk scores and reasons
- Originators with estimated bogus ITC generated per period
- Chains (paths) of tainted ITC with amounts per hop
- Edge-level tainted amounts (who passed how much to whom)

You can adapt column names or thresholds easily.

Notes and simplifying assumptions for MVP:

- We reconcile invoices by exact match (supplier_gstin, recipient_gstin, invoice_no). You can extend to fuzzy.
- We aggregate tax as IGST + CGST + SGST; Cess excluded by default (toggleable).
- “Discretionary ITC” = ITC utilized in 3B beyond matched GSTR-2 invoices.
- “Underpayment” = GSTR-1 output tax not adequately covered by 3B cash + matched ITC.
- Taint is propagated pro-rata across outgoing invoices. Downstream pass-through is limited by each entity’s credit utilization in 3B.
- Propagation happens by period (YYYY-MM). Cross-month carry-forward is an easy extension later.

Install

- Python 3.10+
- pip install pandas networkx numpy

File: bogus_itc_mvp.py
Copy the code below into bogus_itc_mvp.py.

```python
#!/usr/bin/env python3
import argparse
import pandas as pd
import numpy as np
import networkx as nx
from collections import defaultdict
from typing import Dict, List, Tuple, Optional

# -----------------------------
# Helpers and parsing
# -----------------------------
NUM_EPS = 1e-9

def _upper_str(x):
    return str(x).strip().upper() if pd.notna(x) else x

def _period_from_date(series: pd.Series) -> pd.Series:
    # Expecting dd-mm-yyyy or yyyy-mm-dd; pandas will parse smartly
    dt = pd.to_datetime(series, errors="coerce", dayfirst=True)
    return dt.dt.strftime("%Y-%m")

def _as_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").fillna(0.0)

# -----------------------------
# Loaders
# -----------------------------
def load_gstr1(path: str, include_cess=False) -> pd.DataFrame:
    """
    Expected columns (min):
      supplier_gstin, recipient_gstin, invoice_no, invoice_date,
      igst_amount, cgst_amount, sgst_amount
    Optional: cess_amount
    """
    df = pd.read_csv(path)
    req = ['supplier_gstin', 'recipient_gstin', 'invoice_no', 'invoice_date']
    for col in req:
        if col not in df.columns:
            raise ValueError(f"GSTR1 missing required column: {col}")

    # Standardize
    df['supplier_gstin'] = df['supplier_gstin'].map(_upper_str)
    df['recipient_gstin'] = df['recipient_gstin'].map(_upper_str)
    df['invoice_no'] = df['invoice_no'].astype(str).str.strip().str.upper()
    df['period'] = _period_from_date(df['invoice_date'])

    for c in ['igst_amount', 'cgst_amount', 'sgst_amount', 'cess_amount']:
        if c not in df.columns:
            df[c] = 0.0
        else:
            df[c] = _as_num(df[c])

    if include_cess:
        df['tax_total'] = df['igst_amount'] + df['cgst_amount'] + df['sgst_amount'] + df['cess_amount']
    else:
        df['tax_total'] = df['igst_amount'] + df['cgst_amount'] + df['sgst_amount']

    # Keep only positive or zero tax rows
    df = df[df['tax_total'] >= 0].copy()
    return df

def load_gstr2(path: str, include_cess=False) -> pd.DataFrame:
    """
    Expected columns (min):
      recipient_gstin, supplier_gstin, invoice_no, invoice_date,
      claimed_itc_igst, claimed_itc_cgst, claimed_itc_sgst
    Optional: claimed_itc_cess
    """
    df = pd.read_csv(path)
    req = ['recipient_gstin', 'supplier_gstin', 'invoice_no', 'invoice_date']
    for col in req:
        if col not in df.columns:
            raise ValueError(f"GSTR2 missing required column: {col}")

    df['recipient_gstin'] = df['recipient_gstin'].map(_upper_str)
    df['supplier_gstin']  = df['supplier_gstin'].map(_upper_str)
    df['invoice_no']      = df['invoice_no'].astype(str).str.strip().str.upper()
    df['period']          = _period_from_date(df['invoice_date'])

    for c in ['claimed_itc_igst', 'claimed_itc_cgst', 'claimed_itc_sgst', 'claimed_itc_cess']:
        if c not in df.columns:
            df[c] = 0.0
        else:
            df[c] = _as_num(df[c])

    if include_cess:
        df['itc_claimed_total'] = df['claimed_itc_igst'] + df['claimed_itc_cgst'] + df['claimed_itc_sgst'] + df['claimed_itc_cess']
    else:
        df['itc_claimed_total'] = df['claimed_itc_igst'] + df['claimed_itc_cgst'] + df['claimed_itc_sgst']

    df = df[df['itc_claimed_total'] >= 0].copy()
    return df

def load_gstr3b(path: str) -> pd.DataFrame:
    """
    Expected columns (min):
      gstin, period, output_tax, itc_availed, credit_utilized, cash_paid
    If credit_utilized not provided, will estimate = min(output_tax, itc_availed - itc_reversed)
    If cash_paid not provided, will estimate = max(output_tax - credit_utilized, 0)
    """
    df = pd.read_csv(path)
    if 'gstin' not in df.columns:
        raise ValueError("GSTR3B missing column: gstin")
    if 'period' not in df.columns:
        raise ValueError("GSTR3B missing column: period (YYYY-MM)")

    df['gstin'] = df['gstin'].map(_upper_str)
    # normalize period to YYYY-MM
    df['period'] = df['period'].astype(str).str[:7]

    # Numeric fields
    for c in ['output_tax', 'itc_availed', 'credit_utilized', 'cash_paid', 'itc_reversed']:
        if c not in df.columns:
            df[c] = 0.0
        df[c] = _as_num(df[c])

    # credit_utilized fallback
    mask_missing_cu = (df['credit_utilized'] <= 0)
    if mask_missing_cu.any():
        # Conservative: max usable credit = itc_availed - itc_reversed
        max_credit = (df['itc_availed'] - df['itc_reversed']).clip(lower=0)
        est_cu = np.minimum(df['output_tax'], max_credit)
        df.loc[mask_missing_cu, 'credit_utilized'] = est_cu[mask_missing_cu]

    # cash_paid fallback
    mask_missing_cash = (df['cash_paid'] <= 0)
    if mask_missing_cash.any():
        est_cash = (df['output_tax'] - df['credit_utilized']).clip(lower=0)
        df.loc[mask_missing_cash, 'cash_paid'] = est_cash[mask_missing_cash]

    return df

# -----------------------------
# Core detection
# -----------------------------
class BogusITCDetector:
    def __init__(self, gstr1: pd.DataFrame, gstr2: pd.DataFrame, gstr3b: pd.DataFrame):
        self.g1 = gstr1.copy()
        self.g2 = gstr2.copy()
        self.g3 = gstr3b.copy()

        # Reconciliation result columns we add on g1/g2
        self.g1['matched_in_g2'] = False
        self.g2['matched_in_g1'] = False

        # Derived tables
        self.edges = None           # per-invoice edges from GSTR1
        self.entity_period = None   # per-entity per-period aggregation

    def reconcile_invoices(self):
        # Exact key match (supplier, recipient, invoice_no)
        left = self.g1[['supplier_gstin', 'recipient_gstin', 'invoice_no', 'period', 'tax_total']].copy()
        right = self.g2[['supplier_gstin', 'recipient_gstin', 'invoice_no', 'period', 'itc_claimed_total']].copy()

        # Try match on keys ignoring period first; fallback to include period if needed
        m = pd.merge(
            left,
            right,
            on=['supplier_gstin', 'recipient_gstin', 'invoice_no'],
            how='left',
            suffixes=('_g1', '_g2')
        )

        # Mark matches where counterpart exists (regardless of small rounding differences)
        m['is_match'] = m['itc_claimed_total'].notna()

        # Update flags back to g1
        key_cols = ['supplier_gstin', 'recipient_gstin', 'invoice_no']
        matched_keys = set(map(tuple, m.loc[m['is_match'], key_cols].values))
        self.g1['matched_in_g2'] = self.g1.apply(lambda r: (r['supplier_gstin'], r['recipient_gstin'], r['invoice_no']) in matched_keys, axis=1)

        # Update flags back to g2
        # Inverse merge to find which g2 rows have matching g1 rows
        m2 = pd.merge(
            self.g2[['supplier_gstin', 'recipient_gstin', 'invoice_no']],
            self.g1[['supplier_gstin', 'recipient_gstin', 'invoice_no']],
            on=['supplier_gstin', 'recipient_gstin', 'invoice_no'],
            how='left',
            indicator=True
        )
        has_g1 = set(map(tuple, m2.loc[m2['_merge'] == 'both', ['supplier_gstin', 'recipient_gstin', 'invoice_no']].values))
        self.g2['matched_in_g1'] = self.g2.apply(lambda r: (r['supplier_gstin'], r['recipient_gstin'], r['invoice_no']) in has_g1, axis=1)

    def build_edges(self):
        # Each GSTR1 invoice is an edge
        df = self.g1.copy()
        df['edge_id'] = np.arange(len(df))
        df['verified_tax'] = np.where(df['matched_in_g2'], df['tax_total'], 0.0)
        df['unverified_tax'] = np.where(~df['matched_in_g2'], df['tax_total'], 0.0)
        self.edges = df[['edge_id', 'supplier_gstin', 'recipient_gstin', 'period', 'tax_total', 'verified_tax', 'unverified_tax']].copy()

    def aggregate_entity_period(self):
        # Outbound (from GSTR1)
        out = self.edges.groupby(['supplier_gstin', 'period'], as_index=False).agg(
            g1_out_tax=('tax_total', 'sum'),
            g1_out_verified_tax=('verified_tax', 'sum'),
            g1_out_unverified_tax=('unverified_tax', 'sum'),
            g1_out_invoices=('tax_total', 'count')
        ).rename(columns={'supplier_gstin': 'gstin'})

        # Inbound claimed (from GSTR2)
        inbound = self.g2.groupby(['recipient_gstin', 'period'], as_index=False).agg(
            g2_in_claimed_total=('itc_claimed_total', 'sum'),
            g2_in_matched_total=('itc_claimed_total', lambda s: s[self.g2.loc[s.index, 'matched_in_g1']].sum() if len(s) else 0.0),
            g2_in_unmatched_total=('itc_claimed_total', lambda s: s[~self.g2.loc[s.index, 'matched_in_g1']].sum() if len(s) else 0.0),
            g2_in_invoices=('itc_claimed_total', 'count')
        ).rename(columns={'recipient_gstin': 'gstin'})

        # 3B
        g3b = self.g3.groupby(['gstin', 'period'], as_index=False).agg(
            output_tax=('output_tax', 'sum'),
            itc_availed=('itc_availed', 'sum'),
            credit_utilized=('credit_utilized', 'sum'),
            cash_paid=('cash_paid', 'sum'),
            itc_reversed=('itc_reversed', 'sum')
        )

        # Merge all
        ep = pd.merge(out, inbound, on=['gstin', 'period'], how='outer')
        ep = pd.merge(ep, g3b, on=['gstin', 'period'], how='outer').fillna(0.0)

        # Derived metrics
        # Conservative "legitimate inbound ITC" is the matched inbound (supported by supplier GSTR1)
        ep['legit_in_itc'] = ep['g2_in_matched_total']

        # If credit_utilized missing, already estimated during load
        # suspicious_generated is ITC used or liability not backed by legit_in_itc + cash
        ep['underpayment_gap'] = (ep['g1_out_tax'] - (ep['cash_paid'] + ep['legit_in_itc'])).clip(lower=0)
        ep['extra_itc_utilized'] = (ep['credit_utilized'] - ep['legit_in_itc']).clip(lower=0)

        # Use the max of the two mechanisms; cap by actual outbound tax to avoid overcount
        ep['origin_suspicious_itc'] = np.minimum(ep['g1_out_tax'], np.maximum(ep['underpayment_gap'], ep['extra_itc_utilized']))

        # Pass-through factor: fraction of inbound ITC used to pay output (0..1)
        denom = ep['g2_in_claimed_total'].replace(0, np.nan)
        ep['pass_through_factor'] = (ep['credit_utilized'] / denom).clip(lower=0, upper=1)
        ep['pass_through_factor'] = ep['pass_through_factor'].fillna(np.where(ep['credit_utilized'] > 0, 1.0, 0.0))

        # Risk scoring (0-100)
        # Components:
        #  - underpayment ratio
        #  - unmatched inbound ratio
        #  - g1 vs 3B mismatch ratio (proxy)
        with np.errstate(divide='ignore', invalid='ignore'):
            underpay_ratio = np.where(ep['g1_out_tax'] > 0, ep['underpayment_gap'] / ep['g1_out_tax'], 0.0)
            unmatched_in_ratio = np.where(ep['g2_in_claimed_total'] > 0, ep['g2_in_unmatched_total'] / ep['g2_in_claimed_total'], 0.0)
            g1_3b_gap = (ep['g1_out_tax'] - ep['output_tax']).clip(lower=0)
            g1_3b_ratio = np.where(ep['g1_out_tax'] > 0, g1_3b_gap / ep['g1_out_tax'], 0.0)

        score = (0.5 * underpay_ratio + 0.3 * unmatched_in_ratio + 0.2 * g1_3b_ratio) * 100
        ep['risk_score'] = score.clip(0, 100)

        self.entity_period = ep

    # -----------------------------
    # Origins and propagation
    # -----------------------------
    def find_origins(self, period: Optional[str] = None, min_amount: float = 1_000.0) -> pd.DataFrame:
        df = self.entity_period.copy()
        if period:
            df = df[df['period'] == period]
        df = df[df['origin_suspicious_itc'] >= min_amount].copy()
        df = df.sort_values(['period', 'origin_suspicious_itc'], ascending=[True, False])
        return df[['gstin', 'period', 'origin_suspicious_itc', 'g1_out_tax', 'cash_paid', 'legit_in_itc', 'credit_utilized', 'pass_through_factor', 'risk_score']]

    def _edges_for_period(self, period: str) -> pd.DataFrame:
        e = self.edges[self.edges['period'] == period].copy()
        return e

    def _entity_state_for_period(self, period: str) -> pd.DataFrame:
        ep = self.entity_period[self.entity_period['period'] == period].copy()
        return ep

    def _build_out_maps(self, e: pd.DataFrame) -> Dict[str, List[int]]:
        # Map from supplier gstin to list of edge_ids
        maps: Dict[str, List[int]] = defaultdict(list)
        for row in e.itertuples(index=False):
            maps[row.supplier_gstin].append(row.edge_id)
        return maps

    def _build_in_maps(self, e: pd.DataFrame) -> Dict[str, List[int]]:
        maps: Dict[str, List[int]] = defaultdict(list)
        for row in e.itertuples(index=False):
            maps[row.recipient_gstin].append(row.edge_id)
        return maps

    def propagate_from_origin(self, period: str, origin_gstin: str, origin_amount: float, max_hops: int = 4, min_flow: float = 1.0) -> Dict:
        """
        Propagate 'origin_amount' from origin node along period-specific edges.
        Pro-rata by edge tax. Apply pass-through factor at downstream nodes.
        Returns:
          {
            'origin': origin_gstin,
            'period': period,
            'edge_flows': {edge_id: flow_amount},
            'node_inflows': {gstin: amount from this origin},
            'paths': [ {'nodes':[...], 'edges':[...], 'amount':min_edge_flow}, ... ]  (top K paths)
          }
        """
        e = self._edges_for_period(period)
        if e.empty:
            return {'origin': origin_gstin, 'period': period, 'edge_flows': {}, 'node_inflows': {}, 'paths': []}

        ep = self._entity_state_for_period(period)
        ptf = {row.gstin: row.pass_through_factor for row in ep.itertuples(index=False)}
        out_sum = e.groupby('supplier_gstin')['tax_total'].sum().to_dict()

        out_map = self._build_out_maps(e)
        in_map  = self._build_in_maps(e)
        tax_by_edge = {row.edge_id: row.tax_total for row in e.itertuples(index=False)}
        edge_sup    = {row.edge_id: row.supplier_gstin for row in e.itertuples(index=False)}
        edge_rec    = {row.edge_id: row.recipient_gstin for row in e.itertuples(index=False)}

        edge_flow_total: Dict[int, float] = defaultdict(float)
        node_inflow: Dict[str, float] = defaultdict(float)

        # Initialize inflow at origin
        frontier: Dict[str, float] = {origin_gstin: origin_amount}

        for hop in range(max_hops):
            next_frontier: Dict[str, float] = defaultdict(float)

            # Distribute from each node in frontier
            for node, amt in list(frontier.items()):
                edges_out = out_map.get(node, [])
                total_out_tax = out_sum.get(node, 0.0)

                if total_out_tax <= 0 or len(edges_out) == 0 or amt < min_flow:
                    continue

                # Pass-through: origin hop (hop == 0) distributes 100% of origin amount (already 'used' to pay its out tax)
                # Later hops are limited by node's pass-through factor
                factor = 1.0 if hop == 0 else ptf.get(node, 0.0)
                distributable = amt * factor
                if distributable < min_flow:
                    continue

                # Pro-rata to outgoing edges
                for edge_id in edges_out:
                    w = tax_by_edge[edge_id] / (total_out_tax + NUM_EPS)
                    flow = distributable * w
                    if flow < min_flow:
                        continue
                    edge_flow_total[edge_id] += flow
                    rec = edge_rec[edge_id]
                    node_inflow[rec] += flow
                    next_frontier[rec] += flow

            frontier = next_frontier
            # If no more flow, break
            if sum(frontier.values()) < min_flow:
                break

        # Build top paths for debugging / report
        paths = self._top_k_paths_from_origin(period, origin_gstin, edge_flow_total, k_paths=5, max_depth=4, min_flow=min_flow)

        return {
            'origin': origin_gstin,
            'period': period,
            'edge_flows': dict(edge_flow_total),
            'node_inflows': dict(node_inflow),
            'paths': paths
        }

    def _top_k_paths_from_origin(self, period: str, origin: str, edge_flow: Dict[int, float], k_paths=5, max_depth=4, min_flow=1.0) -> List[Dict]:
        """
        Build greedy top-k chains by following highest-flow edges at each step.
        """
        e = self._edges_for_period(period)
        if e.empty:
            return []
        e = e.copy()
        e['flow'] = e['edge_id'].map(edge_flow).fillna(0.0)
        # Build adjacency: supplier -> list of (edge_id, recipient, flow)
        adj: Dict[str, List[Tuple[int, str, float]]] = defaultdict(list)
        for row in e.itertuples(index=False):
            if row.flow >= min_flow:
                adj[row.supplier_gstin].append((row.edge_id, row.recipient_gstin, row.flow))
        for k in adj.keys():
            adj[k].sort(key=lambda x: x[2], reverse=True)

        paths = []

        def dfs(node: str, path_nodes: List[str], path_edges: List[int], depth: int):
            if depth >= max_depth or node not in adj:
                # Path amount is the min flow along edges in the path
                if path_edges:
                    flows = [edge_flow[eid] for eid in path_edges]
                    amt = float(np.min(flows)) if flows else 0.0
                    if amt >= min_flow:
                        paths.append({'nodes': path_nodes[:], 'edges': path_edges[:], 'amount': amt})
                return
            # Branching factor to 3 per node
            for edge_id, rec, flow in adj[node][:3]:
                if flow < min_flow:
                    continue
                dfs(rec, path_nodes + [rec], path_edges + [edge_id], depth + 1)
            # If no outgoing kept due to min_flow
            if node not in adj or len(adj[node]) == 0:
                if path_edges:
                    flows = [edge_flow[eid] for eid in path_edges]
                    amt = float(np.min(flows)) if flows else 0.0
                    if amt >= min_flow:
                        paths.append({'nodes': path_nodes[:], 'edges': path_edges[:], 'amount': amt})

        dfs(origin, [origin], [], 0)
        # Keep top k by amount
        paths.sort(key=lambda p: p['amount'], reverse=True)
        return paths[:k_paths]

    def run_period(self, period: str, min_origin_amount: float = 1_000.0, max_hops: int = 4, min_flow: float = 500.0) -> Dict:
        """
        Run detection for a single period:
          - find origins
          - propagate taint per origin
          - aggregate exposures and produce edge-level taint
        """
        origins_df = self.find_origins(period=period, min_amount=min_origin_amount)
        origins = list(origins_df[['gstin', 'origin_suspicious_itc']].itertuples(index=False, name=None))

        # Aggregate results
        per_origin_results = []
        edge_total_taint = defaultdict(float)
        node_total_inflow = defaultdict(float)

        for gstin, amt in origins:
            res = self.propagate_from_origin(period, gstin, amt, max_hops=max_hops, min_flow=min_flow)
            per_origin_results.append(res)
            for eid, f in res['edge_flows'].items():
                edge_total_taint[eid] += f
            for n, f in res['node_inflows'].items():
                node_total_inflow[n] += f

        # Build human-readable summaries
        e_period = self._edges_for_period(period).copy()
        e_period['tainted_amount'] = e_period['edge_id'].map(edge_total_taint).fillna(0.0)
        tainted_edges = e_period[e_period['tainted_amount'] >= min_flow].sort_values('tainted_amount', ascending=False)

        inflow_df = pd.DataFrame([{'gstin': k, 'tainted_inflow': v} for k, v in node_total_inflow.items()])
        inflow_df = inflow_df.sort_values('tainted_inflow', ascending=False)

        return {
            'period': period,
            'origins': origins_df,
            'per_origin_results': per_origin_results,
            'tainted_edges': tainted_edges,
            'tainted_inflows': inflow_df
        }

    def run_all(self, min_origin_amount: float = 1_000.0, max_hops: int = 4, min_flow: float = 500.0) -> Dict[str, Dict]:
        results = {}
        periods = sorted(self.edges['period'].dropna().unique().tolist())
        for p in periods:
            results[p] = self.run_period(p, min_origin_amount=min_origin_amount, max_hops=max_hops, min_flow=min_flow)
        return results


# -----------------------------
# CLI
# -----------------------------
def main():
    parser = argparse.ArgumentParser(description="Bogus ITC Chain Detection MVP")
    parser.add_argument("--gstr1", required=True, help="Path to GSTR-1 CSV")
    parser.add_argument("--gstr2", required=True, help="Path to GSTR-2 CSV")
    parser.add_argument("--gstr3b", required=True, help="Path to GSTR-3B CSV")
    parser.add_argument("--period", default=None, help="Optional single period YYYY-MM to analyze")
    parser.add_argument("--min_origin", type=float, default=1000.0, help="Min origin suspicious ITC to consider")
    parser.add_argument("--max_hops", type=int, default=4, help="Max hops when propagating taint")
    parser.add_argument("--min_flow", type=float, default=500.0, help="Min flow per hop/edge to keep")
    parser.add_argument("--include_cess", action="store_true", help="Include Cess in tax/ITC calculations")
    parser.add_argument("--out_prefix", default="out", help="Prefix for output files")
    args = parser.parse_args()

    g1 = load_gstr1(args.gstr1, include_cess=args.include_cess)
    g2 = load_gstr2(args.gstr2, include_cess=args.include_cess)
    g3 = load_gstr3b(args.gstr3b)

    det = BogusITCDetector(g1, g2, g3)
    det.reconcile_invoices()
    det.build_edges()
    det.aggregate_entity_period()

    if args.period:
        res = det.run_period(args.period, min_origin_amount=args.min_origin, max_hops=args.max_hops, min_flow=args.min_flow)
        # Write outputs
        res['origins'].to_csv(f"{args.out_prefix}_origins_{args.period}.csv", index=False)
        res['tainted_edges'].to_csv(f"{args.out_prefix}_tainted_edges_{args.period}.csv", index=False)
        res['tainted_inflows'].to_csv(f"{args.out_prefix}_tainted_inflows_{args.period}.csv", index=False)

        # Per-origin paths to JSONL-like txt
        with open(f"{args.out_prefix}_chains_{args.period}.txt", "w") as f:
            for r in res['per_origin_results']:
                f.write(f"Origin {r['origin']} @ {r['period']}\n")
                for p in r['paths']:
                    f.write(f"  amt={p['amount']:.2f} path={' -> '.join(p['nodes'])}\n")
                f.write("\n")
        print(f"Wrote: {args.out_prefix}_origins_{args.period}.csv, {args.out_prefix}_tainted_edges_{args.period}.csv, {args.out_prefix}_tainted_inflows_{args.period}.csv, {args.out_prefix}_chains_{args.period}.txt")
    else:
        all_res = det.run_all(min_origin_amount=args.min_origin, max_hops=args.max_hops, min_flow=args.min_flow)
        for p, res in all_res.items():
            res['origins'].to_csv(f"{args.out_prefix}_origins_{p}.csv", index=False)
            res['tainted_edges'].to_csv(f"{args.out_prefix}_tainted_edges_{p}.csv", index=False)
            res['tainted_inflows'].to_csv(f"{args.out_prefix}_tainted_inflows_{p}.csv", index=False)
            with open(f"{args.out_prefix}_chains_{p}.txt", "w") as f:
                for r in res['per_origin_results']:
                    f.write(f"Origin {r['origin']} @ {r['period']}\n")
                    for path in r['paths']:
                        f.write(f"  amt={path['amount']:.2f} path={' -> '.join(path['nodes'])}\n")
                    f.write("\n")
        print(f"Wrote outputs for periods: {', '.join(all_res.keys())}")

if __name__ == "__main__":
    main()
```

How to run

- Prepare CSVs (sample schema below).
- Run:
  - python bogus_itc_mvp.py --gstr1 GSTR1.csv --gstr2 GSTR2.csv --gstr3b GSTR3B.csv --period 2024-04 --min_origin 10000 --max_hops 4 --min_flow 2000 --out_prefix mvp

CSV column expectations

- GSTR-1 (per invoice)
  - supplier_gstin
  - recipient_gstin
  - invoice_no
  - invoice_date
  - igst_amount
  - cgst_amount
  - sgst_amount
  - cess_amount (optional)
- GSTR-2 (per invoice)
  - recipient_gstin
  - supplier_gstin
  - invoice_no
  - invoice_date
  - claimed_itc_igst
  - claimed_itc_cgst
  - claimed_itc_sgst
  - claimed_itc_cess (optional)
- GSTR-3B (per period)
  - gstin
  - period (YYYY-MM)
  - output_tax
  - itc_availed
  - credit_utilized (optional; auto-estimated if missing)
  - cash_paid (optional; auto-estimated if missing)
  - itc_reversed (optional; used to estimate credit_utilized if needed)

What the outputs mean

- out_origins_YYYY-MM.csv: Entities likely originating bogus ITC (amount and reasoning metrics)
- out_tainted_edges_YYYY-MM.csv: Supplier->Recipient edges carrying tainted ITC with estimated tainted_amount per edge
- out_tainted_inflows_YYYY-MM.csv: Entities receiving tainted ITC (regardless of whether they’re complicit)
- out_chains_YYYY-MM.txt: Top paths from each origin showing chains and amounts per path

Tuning and next steps

- Thresholds:
  - --min_origin: Only treat entities with at least this much suspicious ITC as origins
  - --min_flow: Hide tiny flows
  - --max_hops: Depth of chain propagation
- Make matching stronger:
  - Allow tolerance on amounts and date window
  - Use fuzzy matching for invoice numbers
- Time-aware flow:
  - Propagate across months by carrying forward unused taint and limiting outgoing edges to invoices dated after inbound
- Scale-up (if you move beyond 10–15 entities):
  - Store normalized data in a warehouse (Postgres/BigQuery)
  - Use a graph DB (Neo4j) or Spark GraphFrames if you need billions of edges
  - Add e-Way bill, e-Invoice, registration metadata, and bank/payment traces to improve precision
- UI:
  - Drop a quick Streamlit app to explore origins, edges, and chains interactively

If you can share a small anonymized sample (10–15 entities, 2–3 months), I’ll adapt the reconciliation logic and propagation parameters to your data and add custom risk heuristics specific to your domain.
