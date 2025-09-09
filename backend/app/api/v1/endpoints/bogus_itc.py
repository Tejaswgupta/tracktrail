"""
Stand-alone Bogus-ITC endpoint.
Receives 3 forms per GSTN, runs BogusITCDetector, returns JSON + base64 GEXF.
Supports both single and multiple GSTIN analysis.
"""

import io
import base64
import logging
from typing import List

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import pandas as pd
import networkx as nx
from networkx.readwrite.gexf import generate_gexf

from app.services.bogus_itc_service import run_bogus_detector
from app.models.requests import BogusITCRequest

router = APIRouter(prefix="/bogus-itc", tags=["Bogus ITC"])
logger = logging.getLogger(__name__)


@router.post("/analyze", summary="Detect bogus ITC chains for single GSTIN")
async def analyze_bogus_itc_single(
    gstin: str = Form(..., description="GSTIN of the entity"),
    gstr1: UploadFile = File(...),
    gstr2: UploadFile = File(...),
    gstr3b: UploadFile = File(...),
    include_cess: bool = Form(False),
    min_origin: float = Form(1000.0),
    max_hops: int = Form(4),
    min_flow: float = Form(500.0),
):
    """
    Upload the 3 forms for ONE GSTIN and receive:
    - tainted_itc_flow  (txt-like chains)
    - origins_csv       (CSV rows)
    - tainted_edges_csv (CSV rows)
    - centrality        (dict)
    - gexf_graph        (base64 string)
    """
    try:
        result = run_bogus_detector(
            gstr1_file=gstr1.file,
            gstr2_file=gstr2.file,
            gstr3b_file=gstr3b.file,
            gstin=gstin,
            include_cess=include_cess,
            min_origin_amount=min_origin,
            max_hops=max_hops,
            min_flow=min_flow,
        )

        gexf_bytes = io.BytesIO()
        nx.write_gexf(result["graph"], gexf_bytes)
        gexf_b64 = base64.b64encode(gexf_bytes.getvalue()).decode()

        return {
            "success": True,
            "gstin": gstin,
            "tainted_itc_flow": result["tainted_itc_flow"],
            "origins_csv": result["origins_csv"],
            "tainted_edges_csv": result["tainted_edges_csv"],
            "centrality": result["centrality"],
            "gexf_graph": gexf_b64,
        }

    except Exception as exc:
        logger.exception(f"Single GSTIN Bogus-ITC analysis failed for {gstin}")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/analyze-multiple", summary="Detect bogus ITC chains for multiple GSTINs")
async def analyze_bogus_itc_multiple(
    gstins: List[str] = Form(..., description="List of GSTINs"),
    gstr1_files: List[UploadFile] = File(
        ..., description="GSTR1 files in same order as GSTINs"
    ),
    gstr2_files: List[UploadFile] = File(
        ..., description="GSTR2 files in same order as GSTINs"
    ),
    gstr3b_files: List[UploadFile] = File(
        ..., description="GSTR3B files in same order as GSTINs"
    ),
    include_cess: bool = Form(False),
    min_origin: float = Form(1000.0),
    max_hops: int = Form(4),
    min_flow: float = Form(500.0),
):
    """
    Upload forms for multiple GSTINs: [Entity1[GSTR1, GSTR2, GSTR3B], Entity2[GSTR1, GSTR2, GSTR3B]]
    Returns:
    - tainted_itc_flow  (txt-like chains for all entities)
    - origins_csv       (CSV rows for all entities)
    - tainted_edges_csv (CSV rows for all entities)
    - centrality        (dict with scores for each GSTIN)
    - gexf_graphs       (list of base64 strings, one per GSTIN)
    """
    try:

        if (
            len({len(gstins), len(gstr1_files), len(gstr2_files), len(gstr3b_files)})
            != 1
        ):
            raise HTTPException(
                status_code=400,
                detail="Same number of GSTINs and files required for each form type",
            )

        if len(gstins) == 0:
            raise HTTPException(
                status_code=400, detail="At least one GSTIN is required"
            )

        all_results = []
        all_tainted_flows = []
        all_origins = []
        all_edges = []
        all_centrality = {}
        all_graphs = []

        for i, (gstin, gstr1, gstr2, gstr3b) in enumerate(
            zip(gstins, gstr1_files, gstr2_files, gstr3b_files)
        ):
            try:
                logger.info(f"Processing GSTIN {i+1}/{len(gstins)}: {gstin}")

                result = run_bogus_detector(
                    gstr1_file=gstr1.file,
                    gstr2_file=gstr2.file,
                    gstr3b_file=gstr3b.file,
                    gstin=gstin,
                    include_cess=include_cess,
                    min_origin_amount=min_origin,
                    max_hops=max_hops,
                    min_flow=min_flow,
                )

                all_results.append(result)

                flow_with_header = (
                    f"=== GSTIN: {gstin} ===\n{result['tainted_itc_flow']}\n"
                )
                all_tainted_flows.append(flow_with_header)

                if result["origins_csv"].strip():
                    origins_df = pd.read_csv(io.StringIO(result["origins_csv"]))
                    origins_df["source_gstin"] = gstin
                    all_origins.append(origins_df)

                if result["tainted_edges_csv"].strip():
                    edges_df = pd.read_csv(io.StringIO(result["tainted_edges_csv"]))
                    edges_df["source_gstin"] = gstin
                    all_edges.append(edges_df)

                all_centrality[gstin] = result["centrality"]

                gexf_bytes = io.BytesIO()
                nx.write_gexf(result["graph"], gexf_bytes)
                gexf_b64 = base64.b64encode(gexf_bytes.getvalue()).decode()
                all_graphs.append(gexf_b64)

            except Exception as exc:
                logger.error(f"Failed to process GSTIN {gstin}: {str(exc)}")

                error_flow = f"=== GSTIN: {gstin} ===\nERROR: {str(exc)}\n"
                all_tainted_flows.append(error_flow)
                all_centrality[gstin] = {}
                all_graphs.append("")

        combined_tainted_flow = "\n".join(all_tainted_flows)

        combined_origins_csv = ""
        if all_origins:
            combined_origins_df = pd.concat(all_origins, ignore_index=True)
            combined_origins_csv = combined_origins_df.to_csv(index=False)

        combined_edges_csv = ""
        if all_edges:
            combined_edges_df = pd.concat(all_edges, ignore_index=True)
            combined_edges_csv = combined_edges_df.to_csv(index=False)

        return {
            "success": True,
            "gstins": gstins,
            "processed_count": len(gstins),
            "tainted_itc_flow": combined_tainted_flow,
            "origins_csv": combined_origins_csv,
            "tainted_edges_csv": combined_edges_csv,
            "centrality": all_centrality,
            "gexf_graphs": all_graphs,
        }

    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Multiple GSTIN Bogus-ITC analysis failed")
        raise HTTPException(status_code=500, detail=str(exc))
