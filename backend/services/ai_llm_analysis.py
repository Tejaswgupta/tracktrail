"""
AI-powered AML transaction analysis utilities.

This module is a Python equivalent of the provided TypeScript/JavaScript logic.
It provides:
- analyze_transactions_chunk(): Call an LLM to analyze a list of transactions and return structured AML results
- compile_analysis_results(): Combine multiple chunk results into one result with unique, severity-sorted flags
- estimate_tokens(): Accurate token estimator using tiktoken
- chunk_transactions(): Split transactions into token-bounded chunks
- analyze_transactions(): Convenience helper to chunk+analyze+compile

Notes:
- Requires environment variable OPENAI_API_KEY
- Optional environment variable OPENAI_BASE_URL (defaults to https://model.thevotum.com/v1)
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Literal, Optional, TypedDict

import pandas as pd
import tiktoken
from openai import OpenAI
from dotenv import load_dotenv

# Set up a standalone logger for this module
logger = logging.getLogger('ai_llm_analysis')
logger.setLevel(logging.DEBUG)

# Create console handler with a higher log level
ch = logging.StreamHandler()
ch.setLevel(logging.DEBUG)

# Create formatter and add it to the handler
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
ch.setFormatter(formatter)

# Add the handler to the logger if not already added
if not logger.handlers:
    logger.addHandler(ch)

load_dotenv()





# Initialize tokenizer. 'cl100k_base' is a good starting point for many models,
# including those compatible with the OpenAI API like Mistral.
# If issues arise, we might need to find a more specific encoding for the served model.
# Consider making this configurable if needed.
_tokenizer = tiktoken.get_encoding("cl100k_base")


class AMLFlag(TypedDict):
    type: str
    description: str
    transactions_ids: List[str]
    suspcious_participants: List[str]  # Note: kept as-is to mirror the original prompt key
    severity: Literal["low", "medium", "high"]


class AMLAnalysisResult(TypedDict, total=False):
    summary: str
    detailed_analysis: str
    flags: List[AMLFlag]
    recommendations: List[str]


# Lazily instantiate the OpenAI client
_client: Optional[OpenAI] = None


def _get_openai_client() -> OpenAI:
    global _client
    if _client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured")
        base_url = os.getenv("OPENAI_BASE_URL", "https://model.thevotum.com/v1")
        _client = OpenAI(api_key=api_key, base_url=base_url)
    return _client


def estimate_tokens(text: str) -> int:
    """Estimate the number of tokens in a text string using tiktoken."""
    # Encode the text and return the length of the token list
    return len(_tokenizer.encode(text))


def chunk_transactions(transactions: List[Dict[str, Any]]) -> List[List[Dict[str, Any]]]:
    """Split transactions into chunks constrained by max_tokens (using tiktoken for estimation)."""
    max_tokens = 32000
    chunks: List[List[Dict[str, Any]]] = []
    current_chunk: List[Dict[str, Any]] = []
    current_tokens = 0

    for tx in transactions:
        tx_str = json.dumps(tx, default=str)
        tx_tokens = estimate_tokens(tx_str)
        if current_tokens + tx_tokens > max_tokens and current_chunk:
            chunks.append(current_chunk)
            current_chunk = [tx]
            current_tokens = tx_tokens
        else:
            current_chunk.append(tx)
            current_tokens += tx_tokens

    if current_chunk:
        chunks.append(current_chunk)

    return chunks


def _build_prompt(transactions: List[Dict[str, Any]]) -> str:
    tx_json = json.dumps(transactions, indent=2, default=str)
    prompt = f"""
You are an Anti-Money Laundering (AML) expert. Analyze the following financial transactions for potential money laundering activities.
Your goal is to identify genuine red flags if present, but do NOT assume suspicious activity exists.


Decision rules:
- Be conservative. Prioritize precision over recall and avoid speculation.
- Only flag when there is clear, explainable evidence derived from the data.
- If evidence is weak/ambiguous or data is insufficient, do not flag.
- It is acceptable to find no suspicious activity. If none, return "flags": [] and summarize accordingly.


Potential patterns to watch for:
1. Structuring/Smurfing (breaking large amounts into smaller transactions)
2. Rapid movement of funds between accounts
3. Unusual patterns or behaviors
4. Round-tripping (money going out and coming back quickly)
5. Any other clearly evidenced suspicious activities


Transactions:
{tx_json}


Provide ONLY the following JSON. If there are no flags, return "flags": [].
```json
{{
  "summary": "Brief summary of the analysis (state clearly if no suspicious activity is detected)",
  "detailed_analysis": "Detailed analysis of the transactions and rationale for any flags",
  "flags": [
    {{
      "type": "Type of suspicious activity",
      "description": "Detailed description of why this is suspicious and who is involved",
      "transactions_ids": ["List of transaction IDs related to this flag"],
      "suspcious_participants": ["List of names of participants related to this flag"],
      "severity": "low|medium|high"
    }}
  ],
  "recommendations": [
    "Specific recommendations for further investigation (or 'No further action required' if none)"
  ]
}}
```
"""
    return prompt


def _parse_model_json(text: str) -> AMLAnalysisResult:
    """Extract JSON from model text (supports fenced blocks) and parse it."""
    # Prefer fenced code blocks
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text, flags=re.IGNORECASE)
    candidate = None
    if fenced and fenced.group(1):
        candidate = fenced.group(1).strip()
    else:
        # Try first JSON object in the text
        m = re.search(r"\{[\s\S]*\}", text)
        if m:
            candidate = m.group(0).strip()
        else:
            candidate = text.strip()

    try:
        parsed = json.loads(candidate)
        # Basic shape sanitation
        if "flags" not in parsed or not isinstance(parsed["flags"], list):
            parsed["flags"] = []
        if "recommendations" not in parsed or not isinstance(parsed["recommendations"], list):
            parsed["recommendations"] = []
        return parsed  # type: ignore[return-value]
    except Exception:
        logger.error("Failed to parse JSON from model output. Candidate snippet: %s", candidate)
        raise ValueError("Model returned invalid JSON")


def analyze_transactions_chunk(transactions: List[Dict[str, Any]]) -> AMLAnalysisResult:
    """Analyze a chunk of transactions with the LLM and return structured AML results."""
    client = _get_openai_client()

    prompt = _build_prompt(transactions)

    try:
        resp = client.chat.completions.create(
            model="mistral-small-latest",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert Anti-Money Laundering analyst. You provide detailed analysis of financial "
                        "transactions to identify suspicious activities."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
        result_text = resp.choices[0].message.content if resp.choices else None
        logger.debug("Raw model result: %s", result_text)
        if not result_text:
            raise RuntimeError("No response from OpenAI")
        parsed: AMLAnalysisResult = _parse_model_json(result_text)
        return parsed
    except Exception as e:
        logger.exception("Error analyzing transactions chunk: %s", e)
        raise RuntimeError(f"Failed to analyze transactions: {e}")


def _build_compile_summary_prompt(
    results: List[AMLAnalysisResult], flags: List[AMLFlag]
) -> str:
    """Build a concise prompt for summarizing multiple chunk results.

    The model should only produce `summary` and `detailed_analysis` fields.
    """
    simplified_flags = [
        {
            "type": f.get("type", ""),
            "description": f.get("description", ""),
            "severity": f.get("severity", "low"),
        }
        for f in flags
    ]

    chunk_summaries = [r.get("summary", "") for r in results if r.get("summary")]
    chunk_details = [r.get("detailed_analysis", "") for r in results if r.get("detailed_analysis")]

    context_json = json.dumps(
        {
            "flags": simplified_flags,
            "chunk_summaries": chunk_summaries,
            "chunk_detailed_analyses": chunk_details,
        },
        indent=2,
        default=str,
    )

    prompt = f"""
You are an Anti-Money Laundering (AML) expert. Given multiple partial analyses from previous chunks and the set of unique flags, produce a cohesive, non-redundant overarching view.

Decision rules:
- Do not invent new flags or evidence; only synthesize what's already present.
- Be conservative and precise. Avoid speculation.
- Prefer clarity and brevity while covering the key risks and rationale.

Context (JSON):
{context_json}

Provide ONLY the following JSON with these two fields:
```json
{{
  "summary": "Executive-level summary across all chunks and flags",
  "detailed_analysis": "Consolidated detailed analysis explaining the key flags, their rationale, and cross-chunk relationships without duplication"
}}
```
"""
    return prompt


def _summarize_compilation(results: List[AMLAnalysisResult], flags: List[AMLFlag]) -> Dict[str, str]:
    """Call the LLM to summarize previous chunk responses into a global summary and detailed analysis."""
    client = _get_openai_client()
    prompt = _build_compile_summary_prompt(results, flags)

    resp = client.chat.completions.create(
        model="mistral-small-latest",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert AML analyst that synthesizes and summarizes multi-part analyses without adding new speculation."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
    )
    result_text = resp.choices[0].message.content if resp.choices else None
    logger.debug("Raw model summary result: %s", result_text)
    if not result_text:
        raise RuntimeError("No response from OpenAI for compilation summary")

    parsed = _parse_model_json(result_text)
    # Only return the text fields we care about; ignore flags/recommendations from this call
    return {
        "summary": parsed.get("summary", ""),
        "detailed_analysis": parsed.get("detailed_analysis", ""),
    }


def compile_analysis_results(results: List[AMLAnalysisResult]) -> AMLAnalysisResult:
    """Combine multiple chunk results into a single comprehensive report."""
    compiled: AMLAnalysisResult = {
        "summary": "Comprehensive AML Analysis Report",
        "flags": [],
        "recommendations": [],
    }

    # Consider only results that actually contain flags (filter out 'no suspicious activity' chunks)
    flagged_results: List[AMLAnalysisResult] = [
        r for r in results if r and isinstance(r.get("flags", []), list) and len(r.get("flags", [])) > 0  # type: ignore[call-arg]
    ]

    # If nothing is flagged across all chunks, return a concise non-suspicious summary
    if len(flagged_results) == 0:
        compiled["summary"] = "No suspicious activity detected across analyzed transactions."
        compiled["detailed_analysis"] = ""
        compiled["flags"] = []
        compiled["recommendations"] = []
        return compiled

    # Flatten and dedupe flags by (type + description) from only flagged results
    all_flags: List[AMLFlag] = []
    for r in flagged_results:
        if r and isinstance(r.get("flags", []), list):  # type: ignore[call-arg]
            all_flags.extend(r.get("flags", []))  # type: ignore[arg-type]

    seen: Dict[str, AMLFlag] = {}
    for flag in all_flags:
        key = f"{flag.get('type','')}-{flag.get('description','')}"
        if key not in seen:
            seen[key] = flag

    def severity_rank(s: str) -> int:
        order = {"high": 3, "medium": 2, "low": 1}
        return order.get(str(s).lower(), 0)

    unique_flags = sorted(seen.values(), key=lambda f: severity_rank(str(f.get("severity", "low"))), reverse=True)
    compiled["flags"] = list(unique_flags)

    # Merge and dedupe recommendations
    recs: List[str] = []
    for r in flagged_results:
        recs.extend(r.get("recommendations", []))  # type: ignore[arg-type]
    compiled["recommendations"] = sorted(set(recs))

    # Optionally combine summaries/detailed_analysis
    summaries = [r.get("summary", "") for r in flagged_results if r.get("summary")]
    if summaries:
        compiled["summary"] = "\n\n".join(summaries)
    
    compiled["detailed_analysis"] = "\n\n".join([r.get("detailed_analysis", "") for r in flagged_results if r.get("detailed_analysis")])

    # If there are multiple flags, perform an additional LLM pass to synthesize a final cohesive summary
    try:
        if len(unique_flags) > 1:
            logger.info("Multiple flags detected (%d). Summarizing compiled results with LLM...", len(unique_flags))
            synthesized = _summarize_compilation(flagged_results, list(unique_flags))
            if synthesized.get("summary"):
                compiled["summary"] = synthesized["summary"]
            if synthesized.get("detailed_analysis"):
                compiled["detailed_analysis"] = synthesized["detailed_analysis"]
    except Exception as e:
        # Non-fatal: keep the concatenated summary if synthesis fails
        logger.error("Failed to synthesize compilation summary: %s", e)

    return compiled


def analyze_transactions(
    transactions: pd.DataFrame,
) -> AMLAnalysisResult:
    """
    Convenience helper (expects a pandas DataFrame):
    - Optionally sort transactions by a detected date column
    - Convert to list[dict]
    - Chunk the transactions
    - Analyze each chunk with the LLM
    - Compile results
    """
    # Normalize input to list[dict]
    records: List[Dict[str, Any]]

    print('type of transactions', type(transactions))


    if transactions is None:
        return {
            "summary": "No transactions found for analysis.",
            "flags": [],
            "recommendations": [],
        }

    records = transactions.to_dict(orient="records")

    chunks = chunk_transactions(records)
    logger.debug("Chunk sizes: %s", [len(l) for l in chunks])
    chunk_results: List[AMLAnalysisResult] = []

    for idx, chunk in enumerate(chunks, start=1):
        try:
            result = analyze_transactions_chunk(chunk)
            logger.info("Analyzed chunk %d/%d", idx, len(chunks))
            # Corrected line: removed erroneous logger call
            chunk_results.append(result)
        except Exception as e:
            logger.error("Error analyzing chunk %d: %s", idx, e)
            # Continue with other chunks even if one fails
            continue

    compiled = compile_analysis_results(chunk_results)
    return compiled


__all__ = [
    "AMLFlag",
    "AMLAnalysisResult",
    "analyze_transactions_chunk",
    "compile_analysis_results",
    "estimate_tokens",
    "chunk_transactions",
    "analyze_transactions",
]


if __name__ == '__main__':
    df = pd.read_csv('db.csv')
    logger.debug(len(df))
    result = analyze_transactions(df)
    logger.debug(result)