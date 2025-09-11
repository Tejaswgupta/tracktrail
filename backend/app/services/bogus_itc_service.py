"""
FastAPI service layer - converts uploaded files to JSON.
"""

import io
import tempfile
import os
from typing import Dict, BinaryIO
from collections import defaultdict
import networkx as nx
import pandas as pd
from app.services.bogus_itc_core import (
    load_gstr1,
    load_gstr2,
    load_gstr3b,
    BogusITCDetector,
)


def run_bogus_detector(
    gstr1_file: BinaryIO,
    gstr2_file: BinaryIO,
    gstr3b_file: BinaryIO,
    gstin: str,
    include_cess: bool = False,
    min_origin_amount: float = 1000.0,
    max_hops: int = 4,
    min_flow: float = 500.0,
) -> Dict:
    """
    Process uploaded GST files and run bogus ITC detection.
    Returns dict with analysis results including graph data.
    """
    temp_files = []

    try:
        try:
            for file_obj in (gstr1_file, gstr2_file, gstr3b_file):
                file_obj.seek(0)

            g1 = load_gstr1(gstr1_file, include_cess=include_cess)
            g2 = load_gstr2(gstr2_file, include_cess=include_cess)
            g3 = load_gstr3b(gstr3b_file)

        except Exception:
            for file_obj, suffix in zip(
                [gstr1_file, gstr2_file, gstr3b_file],
                ["_gstr1.csv", "_gstr2.csv", "_gstr3b.csv"],
            ):
                temp_file = tempfile.NamedTemporaryFile(
                    mode="wb", suffix=suffix, delete=False
                )
                file_obj.seek(0)
                temp_file.write(file_obj.read())
                temp_file.close()
                temp_files.append(temp_file.name)

            g1 = load_gstr1(temp_files[0], include_cess=include_cess)
            g2 = load_gstr2(temp_files[1], include_cess=include_cess)
            g3 = load_gstr3b(temp_files[2])

        print(f"GSTR1 loaded: {len(g1)} rows")
        if "tax_total" in g1.columns:
            print(f"GSTR1 tax_total sample: {g1['tax_total'].head().tolist()}")

        det = BogusITCDetector(g1, g2, g3)
        det.reconcile_invoices()
        det.build_edges()

        print(f"Edges built: {len(det.edges)} rows")
        if "tax_total" in det.edges.columns:
            print(f"Edges tax_total sample: {det.edges['tax_total'].head().tolist()}")

        det.aggregate_entity_period()
        results = det.run_all(min_origin_amount, max_hops, min_flow)

        chains_io = io.StringIO()
        chains_io.write(f"Bogus ITC Flow Analysis for {gstin}\n")
        chains_io.write("=" * 50 + "\n\n")

        for period, res in results.items():
            chains_io.write(f"Period: {period}\n")
            for r in res["per_origin_results"]:
                chains_io.write(f"Origin {r['origin']} @ {r['period']}\n")
                for p in r["paths"]:
                    chains_io.write(
                        f"  amt={p['amount']:.2f} path={' -> '.join(p['nodes'])}\n"
                    )
                chains_io.write("\n")

        all_origins = []
        all_edges = []
        combined_taint_map = defaultdict(float)

        for period_result in results.values():
            if "origins" in period_result and not period_result["origins"].empty:
                all_origins.append(period_result["origins"])
            if (
                "tainted_edges" in period_result
                and not period_result["tainted_edges"].empty
            ):
                all_edges.append(period_result["tainted_edges"])

            for r in period_result["per_origin_results"]:
                for eid, amt in r["edge_flows"].items():
                    combined_taint_map[eid] += amt

        origins_csv = (
            pd.concat(all_origins, ignore_index=True).to_csv(index=False)
            if all_origins
            else "gstin,period,origin_suspicious_itc\n"
        )

        edges_csv = (
            pd.concat(all_edges, ignore_index=True).to_csv(index=False)
            if all_edges
            else "edge_id,supplier_gstin,recipient_gstin,period,tainted_amount\n"
        )

        full_graph = det.build_nx_graph(taint_map=combined_taint_map)

        print(
            f"Graph built: {full_graph.number_of_nodes()} nodes, {full_graph.number_of_edges()} edges"
        )
        if full_graph.number_of_edges() > 0:
            edge_sample = list(full_graph.edges(data=True))[0]
            print(f"Sample edge attributes: {list(edge_sample[2].keys())}")
            print(f"Sample tax_total: {edge_sample[2].get('tax_total', 'MISSING')}")

        centrality = {}
        if full_graph.number_of_nodes() > 0:
            try:
                centrality = nx.betweenness_centrality(full_graph, weight="tax_total")
            except Exception:
                centrality = {node: 0.5 for node in full_graph.nodes()}
        else:
            centrality = {gstin: 0.0}

        return {
            "tainted_itc_flow": chains_io.getvalue(),
            "origins_csv": origins_csv,
            "tainted_edges_csv": edges_csv,
            "centrality": centrality,
            "graph": full_graph,
        }

    except Exception as e:
        print(f"Error in run_bogus_detector: {str(e)}")
        raise RuntimeError(f"Bogus ITC detection failed: {e}") from e

    finally:
        for temp_file in temp_files:
            try:
                os.unlink(temp_file)
            except Exception:
                pass
