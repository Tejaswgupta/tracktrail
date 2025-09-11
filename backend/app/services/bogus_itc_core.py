import argparse
import json
from collections import defaultdict
from typing import Dict, List, Optional, Tuple

import networkx as nx
import numpy as np
import pandas as pd
from networkx.readwrite import json_graph

NUM_EPS = 1e-9


def _normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Maps the most common CSV headers -> canonical names without touching the file."""
    aliases = {
        "invoice_date": [
            "invoice_date",
            "invoicedate",
            "date",
            "inv_date",
            "Invoice Date",
            "InvoiceDate",
            "invoice_dt",
        ],
        "supplier_gstin": [
            "supplier_gstin",
            "supplier gstin",
            "seller_gstin",
            "SupplierGstin",
        ],
        "recipient_gstin": [
            "recipient_gstin",
            "recipient gstin",
            "buyer_gstin",
            "RecipientGstin",
        ],
        "igst_amount": ["igst_amount", "igst", "IGST", "IgstAmount"],
        "cgst_amount": ["cgst_amount", "cgst", "CGST", "CgstAmount"],
        "sgst_amount": ["sgst_amount", "sgst", "SGST", "SgstAmount"],
        "claimed_itc_igst": ["claimed_itc_igst", "itc_igst", "ClaimedItcIgst"],
        "claimed_itc_cgst": ["claimed_itc_cgst", "itc_cgst", "ClaimedItcCgst"],
        "claimed_itc_sgst": ["claimed_itc_sgst", "itc_sgst", "ClaimedItcSgst"],
        "gstin": ["gstin", "GSTIN", "Gstin"],
        "period": ["period", "tax_period", "Period", "TaxPeriod"],
    }
    df.columns = df.columns.str.strip().str.lower()
    reverse = {v: k for k, vv in aliases.items() for v in vv}
    df.rename(columns=reverse, inplace=True)
    return df


def _upper_str(x):
    return str(x).strip().upper() if pd.notna(x) else x


def _period_from_date(series: pd.Series) -> pd.Series:
    s = series.astype(str).str.strip()
    dt = pd.to_datetime(s, errors="coerce", format="%Y-%m-%d")
    mask = dt.isna()
    if mask.any():
        dt2 = pd.to_datetime(s[mask], errors="coerce", dayfirst=True)
        dt.loc[mask] = dt2
    return dt.dt.strftime("%Y-%m")


def _as_num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce")


def load_gstr1(path: str, include_cess=False) -> pd.DataFrame:
    """
    Expected columns (min):
      supplier_gstin, recipient_gstin, invoice_date,
      igst_amount, cgst_amount, sgst_amount
    Optional: invoice_no, cess_amount
    """
    df = pd.read_csv(path)
    df = _normalise_columns(df)

    req = ["supplier_gstin", "recipient_gstin", "invoice_date"]
    for col in req:
        if col not in df.columns:
            raise ValueError(f"GSTR1 missing required column: {col}")

    df["supplier_gstin"] = df["supplier_gstin"].map(_upper_str)
    df["recipient_gstin"] = df["recipient_gstin"].map(_upper_str)
    df["invoice_date"] = df["invoice_date"].astype(str).str.strip()
    df["period"] = _period_from_date(df["invoice_date"])

    if "invoice_no" not in df.columns:
        df["invoice_no"] = "INV" + df.index.astype(str).str.zfill(6)
    else:
        df["invoice_no"] = df["invoice_no"].astype(str).str.strip().str.upper()

    for c in ["igst_amount", "cgst_amount", "sgst_amount", "cess_amount"]:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = _as_num(df[c]).fillna(0.0)

    if include_cess:
        df["tax_total"] = (
            df["igst_amount"]
            + df["cgst_amount"]
            + df["sgst_amount"]
            + df["cess_amount"]
        )
    else:
        df["tax_total"] = df["igst_amount"] + df["cgst_amount"] + df["sgst_amount"]

    print(f"🔍 load_gstr1 calculated tax_total: {df['tax_total'].head().tolist()}")
    print(f"🔍 load_gstr1 sample data:")
    for i in range(min(3, len(df))):
        row = df.iloc[i]
        print(
            f"   {row['supplier_gstin']} → {row['recipient_gstin']}: ₹{row['tax_total']}"
        )

    return df


def load_gstr2(path: str, include_cess=False) -> pd.DataFrame:
    """
    Expected columns (min):
      recipient_gstin, supplier_gstin, invoice_date,
      claimed_itc_igst, claimed_itc_cgst, claimed_itc_sgst
    Optional: invoice_no, claimed_itc_cess
    """
    df = pd.read_csv(path)
    df = _normalise_columns(df)

    req = ["recipient_gstin", "supplier_gstin", "invoice_date"]
    for col in req:
        if col not in df.columns:
            raise ValueError(f"GSTR2 missing required column: {col}")

    df["recipient_gstin"] = df["recipient_gstin"].map(_upper_str)
    df["supplier_gstin"] = df["supplier_gstin"].map(_upper_str)
    df["invoice_date"] = df["invoice_date"].astype(str).str.strip()
    df["period"] = _period_from_date(df["invoice_date"])

    if "invoice_no" not in df.columns:
        df["invoice_no"] = "INV" + df.index.astype(str).str.zfill(6)
    else:
        df["invoice_no"] = df["invoice_no"].astype(str).str.strip().str.upper()

    for c in [
        "claimed_itc_igst",
        "claimed_itc_cgst",
        "claimed_itc_sgst",
        "claimed_itc_cess",
    ]:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = _as_num(df[c]).fillna(0.0)

    if include_cess:
        df["itc_claimed_total"] = (
            df["claimed_itc_igst"]
            + df["claimed_itc_cgst"]
            + df["claimed_itc_sgst"]
            + df["claimed_itc_cess"]
        )
    else:
        df["itc_claimed_total"] = (
            df["claimed_itc_igst"] + df["claimed_itc_cgst"] + df["claimed_itc_sgst"]
        )

    return df


def load_gstr3b(path: str) -> pd.DataFrame:
    """
    Expected columns (min):
      gstin, period
    Optional: output_tax, itc_availed, credit_utilized, cash_paid, itc_reversed
    """
    df = pd.read_csv(path)
    df = _normalise_columns(df)

    if "gstin" not in df.columns:
        raise ValueError("GSTR3B missing column: gstin")
    if "period" not in df.columns:
        raise ValueError("GSTR3B missing column: period")

    df["gstin"] = df["gstin"].map(_upper_str)
    df["period"] = df["period"].astype(str).str.strip().str[:7]

    for c in [
        "output_tax",
        "itc_availed",
        "credit_utilized",
        "cash_paid",
        "itc_reversed",
    ]:
        if c not in df.columns:
            df[c] = 0.0
        else:
            df[c] = _as_num(df[c]).fillna(0.0)

    return df


class BogusITCDetector:
    def __init__(self, gstr1: pd.DataFrame, gstr2: pd.DataFrame, gstr3b: pd.DataFrame):
        self.g1 = gstr1.copy()
        self.g2 = gstr2.copy()
        self.g3 = gstr3b.copy()

        self.g1["matched_in_g2"] = False
        self.g2["matched_in_g1"] = False

        self.edges = None
        self.entity_period = None

    def reconcile_invoices(self):
        left = self.g1[
            ["supplier_gstin", "recipient_gstin", "invoice_no", "tax_total"]
        ].copy()
        right = self.g2[
            [
                "supplier_gstin",
                "recipient_gstin",
                "invoice_no",
                "itc_claimed_total",
            ]
        ].copy()

        m = pd.merge(
            left,
            right,
            on=["supplier_gstin", "recipient_gstin", "invoice_no"],
            how="left",
            suffixes=("_g1", "_g2"),
        )

        m["is_match"] = m["itc_claimed_total"].notna()

        key_cols = ["supplier_gstin", "recipient_gstin", "invoice_no"]
        matched_keys = set(map(tuple, m.loc[m["is_match"], key_cols].values))
        self.g1["matched_in_g2"] = self.g1.apply(
            lambda r: (r["supplier_gstin"], r["recipient_gstin"], r["invoice_no"])
            in matched_keys,
            axis=1,
        )

        m2 = pd.merge(
            self.g2[["supplier_gstin", "recipient_gstin", "invoice_no"]],
            self.g1[["supplier_gstin", "recipient_gstin", "invoice_no"]],
            on=["supplier_gstin", "recipient_gstin", "invoice_no"],
            how="left",
            indicator=True,
        )
        has_g1 = set(
            map(
                tuple,
                m2.loc[
                    m2["_merge"] == "both",
                    ["supplier_gstin", "recipient_gstin", "invoice_no"],
                ].values,
            )
        )
        self.g2["matched_in_g1"] = self.g2.apply(
            lambda r: (r["supplier_gstin"], r["recipient_gstin"], r["invoice_no"])
            in has_g1,
            axis=1,
        )

    def build_edges(self):
        """Build edges with proper tax calculations and preserve ALL amount columns"""
        df = self.g1.copy()
        df["edge_id"] = np.arange(len(df))
        df["verified_tax"] = np.where(df["matched_in_g2"], df["tax_total"], 0.0)
        df["unverified_tax"] = np.where(~df["matched_in_g2"], df["tax_total"], 0.0)

        self.edges = df[
            [
                "edge_id",
                "supplier_gstin",
                "recipient_gstin",
                "period",
                "tax_total",
                "verified_tax",
                "unverified_tax",
                "igst_amount",
                "cgst_amount",
                "sgst_amount",
            ]
        ].copy()

        print(
            f"🔍 Edges built: {len(self.edges)} rows, columns: {list(self.edges.columns)}"
        )
        print(f"🔍 Edges tax_total sample: {self.edges['tax_total'].head().tolist()}")
        if len(self.edges) > 0:
            for i in range(min(3, len(self.edges))):
                row = self.edges.iloc[i]
                print(
                    f"   Edge {row['supplier_gstin']} → {row['recipient_gstin']}: ₹{row['tax_total']}"
                )

    def aggregate_entity_period(self):
        out = (
            self.edges.groupby(["supplier_gstin", "period"], as_index=False)
            .agg(
                g1_out_tax=("tax_total", "sum"),
                g1_out_verified_tax=("verified_tax", "sum"),
                g1_out_unverified_tax=("unverified_tax", "sum"),
                g1_out_invoices=("tax_total", "count"),
            )
            .rename(columns={"supplier_gstin": "gstin"})
        )

        def _sum_if_masked(series: pd.Series, mask: pd.Series) -> float:
            if len(series) == 0:
                return 0.0
            aligned_mask = mask.reindex(series.index, fill_value=False)
            return float(series[aligned_mask].sum())

        g2 = self.g2
        inbound = (
            g2.groupby(["recipient_gstin", "period"], as_index=False)
            .agg(
                g2_in_claimed_total=("itc_claimed_total", "sum"),
                g2_in_matched_total=(
                    "itc_claimed_total",
                    lambda s: _sum_if_masked(s, g2.loc[s.index, "matched_in_g1"]),
                ),
                g2_in_unmatched_total=(
                    "itc_claimed_total",
                    lambda s: _sum_if_masked(s, g2.loc[s.index, "matched_in_g1"]),
                ),
                g2_in_invoices=("itc_claimed_total", "count"),
            )
            .rename(columns={"recipient_gstin": "gstin"})
        )

        g3b = self.g3.groupby(["gstin", "period"], as_index=False).agg(
            output_tax=("output_tax", "sum"),
            itc_availed=("itc_availed", "sum"),
            credit_utilized=("credit_utilized", "sum"),
            cash_paid=("cash_paid", "sum"),
            itc_reversed=("itc_reversed", "sum"),
        )

        ep = pd.merge(out, inbound, on=["gstin", "period"], how="outer")
        ep = pd.merge(ep, g3b, on=["gstin", "period"], how="outer").fillna(0.0)

        ep["legit_in_itc"] = ep["g2_in_matched_total"]

        ep["underpayment_gap"] = (
            ep["g1_out_tax"] - (ep["cash_paid"] + ep["legit_in_itc"])
        ).clip(lower=0)
        ep["extra_itc_utilized"] = (ep["credit_utilized"] - ep["legit_in_itc"]).clip(
            lower=0
        )

        ep["origin_suspicious_itc"] = np.minimum(
            ep["g1_out_tax"],
            np.maximum(ep["underpayment_gap"], ep["extra_itc_utilized"]),
        )

        denom = ep["legit_in_itc"].replace(0, np.nan)
        ep["pass_through_factor"] = (ep["credit_utilized"] / denom).clip(
            lower=0, upper=1
        )
        ep["pass_through_factor"] = ep["pass_through_factor"].fillna(0.0)

        with np.errstate(divide="ignore", invalid="ignore"):
            underpay_ratio = np.where(
                ep["g1_out_tax"] > 0, ep["underpayment_gap"] / ep["g1_out_tax"], 0.0
            )
            unmatched_in_ratio = np.where(
                ep["g2_in_claimed_total"] > 0,
                ep["g2_in_unmatched_total"] / ep["g2_in_claimed_total"],
                0.0,
            )
            g1_3b_gap = (ep["g1_out_tax"] - ep["output_tax"]).clip(lower=0)
            g1_3b_ratio = np.where(
                ep["g1_out_tax"] > 0, g1_3b_gap / ep["g1_out_tax"], 0.0
            )

        score = (
            0.5 * underpay_ratio + 0.3 * unmatched_in_ratio + 0.2 * g1_3b_ratio
        ) * 100
        ep["risk_score"] = score.clip(0, 100)

        self.entity_period = ep

    def find_origins(
        self, period: Optional[str] = None, min_amount: float = 1_000.0
    ) -> pd.DataFrame:
        df = self.entity_period.copy()
        if period:
            df = df[df["period"] == period]
        df = df[df["origin_suspicious_itc"] >= min_amount].copy()
        df = df.sort_values(
            ["period", "origin_suspicious_itc"], ascending=[True, False]
        )
        return df[
            [
                "gstin",
                "period",
                "origin_suspicious_itc",
                "g1_out_tax",
                "cash_paid",
                "legit_in_itc",
                "credit_utilized",
                "pass_through_factor",
                "risk_score",
            ]
        ]

    def _edges_for_period(self, period: str) -> pd.DataFrame:
        e = self.edges[self.edges["period"] == period].copy()
        return e

    def _entity_state_for_period(self, period: str) -> pd.DataFrame:
        ep = self.entity_period[self.entity_period["period"] == period].copy()
        return ep

    def _build_out_maps(self, e: pd.DataFrame) -> Dict[str, List[int]]:
        maps: Dict[str, List[int]] = defaultdict(list)
        for row in e.itertuples(index=False):
            maps[row.supplier_gstin].append(row.edge_id)
        return maps

    def _build_in_maps(self, e: pd.DataFrame) -> Dict[str, List[int]]:
        maps: Dict[str, List[int]] = defaultdict(list)
        for row in e.itertuples(index=False):
            maps[row.recipient_gstin].append(row.edge_id)
        return maps

    def propagate_from_origin(
        self,
        period: str,
        origin_gstin: str,
        origin_amount: float,
        max_hops: int = 4,
        min_flow: float = 1.0,
    ) -> Dict:
        """
        Propagate 'origin_amount' from origin node along period-specific edges.
        Pro-rata by edge tax (positives only). Apply pass-through factor at downstream nodes.
        Returns a dict with edge flows, node inflows, and top paths.
        """
        e = self._edges_for_period(period)
        if e.empty:
            return {
                "origin": origin_gstin,
                "period": period,
                "edge_flows": {},
                "node_inflows": {},
                "paths": [],
            }

        e = e.copy()
        e["pos_tax_total"] = e["tax_total"].clip(lower=0.0)

        ep = self._entity_state_for_period(period)
        ptf = {row.gstin: row.pass_through_factor for row in ep.itertuples(index=False)}
        out_sum = e.groupby("supplier_gstin")["pos_tax_total"].sum().to_dict()

        out_map = self._build_out_maps(e)
        tax_by_edge_pos = {
            row.edge_id: row.pos_tax_total for row in e.itertuples(index=False)
        }
        edge_rec = {
            row.edge_id: row.recipient_gstin for row in e.itertuples(index=False)
        }

        edge_flow_total: Dict[int, float] = defaultdict(float)
        node_inflow: Dict[str, float] = defaultdict(float)

        frontier: Dict[str, float] = {origin_gstin: origin_amount}

        for hop in range(max_hops):
            next_frontier: Dict[str, float] = defaultdict(float)

            for node, amt in list(frontier.items()):
                edges_out = out_map.get(node, [])
                total_out_tax = out_sum.get(node, 0.0)

                if total_out_tax <= 0 or len(edges_out) == 0 or amt < min_flow:
                    continue

                factor = 1.0 if hop == 0 else ptf.get(node, 0.0)
                distributable = amt * factor
                if distributable < min_flow:
                    continue

                for edge_id in edges_out:
                    w_denom = total_out_tax + NUM_EPS
                    w_num = tax_by_edge_pos[edge_id]
                    if w_num <= 0:
                        continue
                    w = w_num / w_denom
                    flow = distributable * w
                    if flow < min_flow:
                        continue
                    edge_flow_total[edge_id] += flow
                    rec = edge_rec[edge_id]
                    node_inflow[rec] += flow
                    next_frontier[rec] += flow

            frontier = dict(next_frontier)
            if sum(frontier.values()) < min_flow:
                break

        paths = self._top_k_paths_from_origin(
            period,
            origin_gstin,
            edge_flow_total,
            k_paths=5,
            max_depth=4,
            min_flow=min_flow,
        )

        return {
            "origin": origin_gstin,
            "period": period,
            "edge_flows": dict(edge_flow_total),
            "node_inflows": dict(node_inflow),
            "paths": paths,
        }

    def _top_k_paths_from_origin(
        self,
        period: str,
        origin: str,
        edge_flow: Dict[int, float],
        k_paths=5,
        max_depth=4,
        min_flow=1.0,
    ) -> List[Dict]:
        e = self._edges_for_period(period)
        if e.empty:
            return []
        e = e.copy()
        e["flow"] = e["edge_id"].map(edge_flow).fillna(0.0)

        adj: Dict[str, List[Tuple[int, str, float]]] = defaultdict(list)
        for row in e.itertuples(index=False):
            if row.flow >= min_flow:
                adj[row.supplier_gstin].append(
                    (row.edge_id, row.recipient_gstin, row.flow)
                )
        for k in adj.keys():
            adj[k].sort(key=lambda x: x[2], reverse=True)

        paths: List[Dict] = []

        def dfs(node: str, path_nodes: List[str], path_edges: List[int], depth: int):
            if depth >= max_depth or node not in adj:
                if path_edges:
                    flows = [edge_flow[eid] for eid in path_edges]
                    amt = float(np.min(flows)) if flows else 0.0
                    if amt >= min_flow:
                        paths.append(
                            {
                                "nodes": path_nodes[:],
                                "edges": path_edges[:],
                                "amount": amt,
                            }
                        )
                return

            for edge_id, rec, flow in adj[node][:3]:
                if flow < min_flow:
                    continue
                dfs(rec, path_nodes + [rec], path_edges + [edge_id], depth + 1)
            if node not in adj or len(adj[node]) == 0:
                if path_edges:
                    flows = [edge_flow[eid] for eid in path_edges]
                    amt = float(np.min(flows)) if flows else 0.0
                    if amt >= min_flow:
                        paths.append(
                            {
                                "nodes": path_nodes[:],
                                "edges": path_edges[:],
                                "amount": amt,
                            }
                        )

        dfs(origin, [origin], [], 0)
        paths.sort(key=lambda p: p["amount"], reverse=True)
        return paths[:k_paths]

    def run_period(
        self,
        period: str,
        min_origin_amount: float = 1_000.0,
        max_hops: int = 4,
        min_flow: float = 500.0,
    ) -> Dict:
        origins_df = self.find_origins(period=period, min_amount=min_origin_amount)
        origins = list(
            origins_df[["gstin", "origin_suspicious_itc"]].itertuples(
                index=False, name=None
            )
        )

        per_origin_results = []
        edge_total_taint = defaultdict(float)
        node_total_inflow = defaultdict(float)

        for gstin, amt in origins:
            res = self.propagate_from_origin(
                period, gstin, amt, max_hops=max_hops, min_flow=min_flow
            )
            per_origin_results.append(res)
            for eid, f in res["edge_flows"].items():
                edge_total_taint[eid] += f
            for n, f in res["node_inflows"].items():
                node_total_inflow[n] += f

        e_period = self._edges_for_period(period).copy()
        e_period["tainted_amount_raw"] = (
            e_period["edge_id"].map(edge_total_taint).fillna(0.0)
        )
        e_period["tax_cap"] = e_period["tax_total"].clip(lower=0.0)
        e_period["tainted_amount"] = np.minimum(
            e_period["tainted_amount_raw"], e_period["tax_cap"]
        )
        tainted_edges = e_period[e_period["tainted_amount"] >= min_flow].sort_values(
            "tainted_amount", ascending=False
        )

        inflow_df = pd.DataFrame(
            [{"gstin": k, "tainted_inflow": v} for k, v in node_total_inflow.items()]
        )
        if not inflow_df.empty:
            inflow_df = inflow_df.sort_values("tainted_inflow", ascending=False)

        return {
            "period": period,
            "origins": origins_df,
            "per_origin_results": per_origin_results,
            "tainted_edges": tainted_edges,
            "tainted_inflows": inflow_df,
        }

    def build_nx_graph(
        self, period: Optional[str] = None, taint_map: Optional[Dict[int, float]] = None
    ) -> nx.DiGraph:
        """
        Build a directed NetworkX graph with ALL amount attributes for frontend consumption.
         CRITICAL FIX: Multiple amount attributes ensure frontend can find values.
        """
        if period is not None:
            e = self._edges_for_period(period)
            ep = self._entity_state_for_period(period)
        else:
            e = self.edges.copy()
            ep = self.entity_period.copy()

        G = nx.DiGraph()

        suppliers = e["supplier_gstin"].dropna().unique().tolist()
        recipients = e["recipient_gstin"].dropna().unique().tolist()
        nodes = set(suppliers) | set(recipients)
        for n in nodes:
            G.add_node(n, label=n)

        if not ep.empty:
            ep_idx = ep.set_index("gstin").to_dict(orient="index")
            for n in nodes:
                attrs = ep_idx.get(n, {})
                G.nodes[n].update(
                    {
                        "period": str(attrs.get("period", period or "")),
                        "g1_out_tax": float(attrs.get("g1_out_tax", 0.0)),
                        "legit_in_itc": float(attrs.get("legit_in_itc", 0.0)),
                        "credit_utilized": float(attrs.get("credit_utilized", 0.0)),
                        "pass_through_factor": float(
                            attrs.get("pass_through_factor", 0.0)
                        ),
                        "risk_score": float(attrs.get("risk_score", 0.0)),
                        "origin_suspicious_itc": float(
                            attrs.get("origin_suspicious_itc", 0.0)
                        ),
                    }
                )

        tm = taint_map or {}
        for row in e.itertuples(index=False):

            tax_total = float(getattr(row, "tax_total", 0))

            igst = float(getattr(row, "igst_amount", 0))
            cgst = float(getattr(row, "cgst_amount", 0))
            sgst = float(getattr(row, "sgst_amount", 0))

            if tax_total == 0:
                tax_total = igst + cgst + sgst
                print(
                    f" Recalculated tax_total for edge {row.supplier_gstin}→{row.recipient_gstin}: {tax_total}"
                )

            raw_taint = float(tm.get(getattr(row, "edge_id", 0), 0.0))
            taint_capped = min(raw_taint, max(tax_total, 0.0))

            G.add_edge(
                row.supplier_gstin,
                row.recipient_gstin,
                edge_id=int(getattr(row, "edge_id", 0)),
                period=str(getattr(row, "period", "")),
                tax_total=tax_total,
                amount=tax_total,
                weight=tax_total,
                value=tax_total,
                igst_amount=igst,
                cgst_amount=cgst,
                sgst_amount=sgst,
                verified_tax=float(getattr(row, "verified_tax", 0)),
                unverified_tax=float(getattr(row, "unverified_tax", 0)),
                tainted_amount_raw=raw_taint,
                tainted_amount=taint_capped,
            )

        print(
            f"🔍 Graph built: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges"
        )
        if G.number_of_edges() > 0:
            edge_sample = list(G.edges(data=True))[0]
            print(f"🔍 Sample edge attributes: {list(edge_sample[2].keys())}")
            print(f"🔍 Sample tax_total: {edge_sample[2].get('tax_total', 'MISSING')}")
            print(
                f"🔍 Sample amounts: tax_total={edge_sample[2].get('tax_total')}, amount={edge_sample[2].get('amount')}, weight={edge_sample[2].get('weight')}"
            )

        return G

    def export_graph(self, G: nx.DiGraph, path: str, fmt: str = "gexf") -> None:
        """Export the graph to disk in the chosen format (gexf, graphml, edgelist, json)."""
        fmt = (fmt or "gexf").lower()
        if fmt == "gexf":
            nx.write_gexf(G, path)
        elif fmt == "graphml":
            nx.write_graphml(G, path)
        elif fmt == "edgelist":
            nx.write_edgelist(G, path, data=True)
        elif fmt == "json":
            data = json_graph.node_link_data(G)
            with open(path, "w") as f:
                json.dump(data, f)
        else:
            raise ValueError(f"Unsupported graph format: {fmt}")

    def run_all(
        self,
        min_origin_amount: float = 1_000.0,
        max_hops: int = 4,
        min_flow: float = 500.0,
    ) -> Dict[str, Dict]:
        results = {}
        periods = sorted(self.edges["period"].dropna().unique().tolist())
        for p in periods:
            results[p] = self.run_period(
                p,
                min_origin_amount=min_origin_amount,
                max_hops=max_hops,
                min_flow=min_flow,
            )
        return results


def main():
    parser = argparse.ArgumentParser(
        description="Bogus ITC Chain Detection MVP (improved)"
    )
    parser.add_argument("--gstr1", required=True, help="Path to GSTR-1 CSV")
    parser.add_argument("--gstr2", required=True, help="Path to GSTR-2 CSV")
    parser.add_argument("--gstr3b", required=True, help="Path to GSTR-3B CSV")
    parser.add_argument(
        "--period", default=None, help="Optional single period YYYY-MM to analyze"
    )
    parser.add_argument(
        "--min_origin",
        type=float,
        default=1000.0,
        help="Min origin suspicious ITC to consider",
    )
    parser.add_argument(
        "--max_hops", type=int, default=4, help="Max hops when propagating taint"
    )
    parser.add_argument(
        "--min_flow", type=float, default=500.0, help="Min flow per hop/edge to keep"
    )
    parser.add_argument(
        "--include_cess",
        action="store_true",
        help="Include Cess in tax/ITC calculations",
    )
    parser.add_argument("--out_prefix", default="out", help="Prefix for output files")
    parser.add_argument(
        "--export_graph", action="store_true", help="Export graph(s) with metrics/taint"
    )
    parser.add_argument(
        "--graph_format",
        choices=["gexf", "graphml", "edgelist", "json"],
        default="gexf",
        help="Graph export format",
    )
    args = parser.parse_args()

    g1 = load_gstr1(args.gstr1, include_cess=args.include_cess)
    g2 = load_gstr2(args.gstr2, include_cess=args.include_cess)
    g3 = load_gstr3b(args.gstr3b)

    det = BogusITCDetector(g1, g2, g3)
    det.reconcile_invoices()
    det.build_edges()
    det.aggregate_entity_period()

    if args.period:
        res = det.run_period(
            args.period,
            min_origin_amount=args.min_origin,
            max_hops=args.max_hops,
            min_flow=args.min_flow,
        )
        res["origins"].to_csv(
            f"{args.out_prefix}_origins_{args.period}.csv", index=False
        )
        res["tainted_edges"].to_csv(
            f"{args.out_prefix}_tainted_edges_{args.period}.csv", index=False
        )
        if not res["tainted_inflows"].empty:
            res["tainted_inflows"].to_csv(
                f"{args.out_prefix}_tainted_inflows_{args.period}.csv", index=False
            )
        else:
            pd.DataFrame(columns=["gstin", "tainted_inflow"]).to_csv(
                f"{args.out_prefix}_tainted_inflows_{args.period}.csv", index=False
            )

        with open(f"{args.out_prefix}_chains_{args.period}.txt", "w") as f:
            for r in res["per_origin_results"]:
                f.write(f"Origin {r['origin']} @ {r['period']}\n")
                for p in r["paths"]:
                    f.write(f"  amt={p['amount']:.2f} path={' -> '.join(p['nodes'])}\n")
                f.write("\n")
        print(
            f"Wrote: {args.out_prefix}_origins_{args.period}.csv, "
            f"{args.out_prefix}_tainted_edges_{args.period}.csv, "
            f"{args.out_prefix}_tainted_inflows_{args.period}.csv, "
            f"{args.out_prefix}_chains_{args.period}.txt"
        )
        if args.export_graph:
            taint_map = defaultdict(float)
            for r in res["per_origin_results"]:
                for eid, amt in r["edge_flows"].items():
                    taint_map[eid] += amt
            G = det.build_nx_graph(period=args.period, taint_map=taint_map)
            ext = {
                "gexf": "gexf",
                "graphml": "graphml",
                "edgelist": "edgelist.txt",
                "json": "json",
            }[args.graph_format]
            out_path = f"{args.out_prefix}_graph_{args.period}.{ext}"
            det.export_graph(G, out_path, args.graph_format)
            print(f"Wrote graph: {out_path}")
    else:
        all_res = det.run_all(
            min_origin_amount=args.min_origin,
            max_hops=args.max_hops,
            min_flow=args.min_flow,
        )
        for p, res in all_res.items():
            res["origins"].to_csv(f"{args.out_prefix}_origins_{p}.csv", index=False)
            res["tainted_edges"].to_csv(
                f"{args.out_prefix}_tainted_edges_{p}.csv", index=False
            )
            if not res["tainted_inflows"].empty:
                res["tainted_inflows"].to_csv(
                    f"{args.out_prefix}_tainted_inflows_{p}.csv", index=False
                )
            else:
                pd.DataFrame(columns=["gstin", "tainted_inflow"]).to_csv(
                    f"{args.out_prefix}_tainted_inflows_{p}.csv", index=False
                )
            with open(f"{args.out_prefix}_chains_{p}.txt", "w") as f:
                for r in res["per_origin_results"]:
                    f.write(f"Origin {r['origin']} @ {r['period']}\n")
                    for path in r["paths"]:
                        f.write(
                            f"  amt={path['amount']:.2f} path={' -> '.join(path['nodes'])}\n"
                        )
                    f.write("\n")
            if args.export_graph:
                taint_map = defaultdict(float)
                for r in res["per_origin_results"]:
                    for eid, amt in r["edge_flows"].items():
                        taint_map[eid] += amt
                G = det.build_nx_graph(period=p, taint_map=taint_map)
                ext = {
                    "gexf": "gexf",
                    "graphml": "graphml",
                    "edgelist": "edgelist.txt",
                    "json": "json",
                }[args.graph_format]
                out_path = f"{args.out_prefix}_graph_{p}.{ext}"
                det.export_graph(G, out_path, args.graph_format)
                print(f"Wrote graph: {out_path}")
        print(f"Wrote outputs for periods: {', '.join(all_res.keys())}")


if __name__ == "__main__":
    main()
