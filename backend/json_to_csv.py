


import csv
import json

from bs4 import BeautifulSoup

INPUT_JSON = "samples/SV-1139.pdf_by_PaddleOCR-VL.json"
output_name = INPUT_JSON.rsplit(".", 1)[0]
combined_tables = f"{output_name}_combined_tables"
OUTPUT_CSV = f"{combined_tables}.csv"


def extract_tables_from_json(json_path):
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    rows = []

    for page in data:
        pruned = page.get("prunedResult", {})
        parsing_list = pruned.get("parsing_res_list", [])

        for block in parsing_list:
            if block.get("block_label") == "table":
                html = block.get("block_content", "").strip()
                if not html:
                    continue

                soup = BeautifulSoup(html, "html.parser")
                table = soup.find("table")
                if not table:
                    continue

                for tr in table.find_all("tr"):
                    cols = [td.get_text(strip=True) for td in tr.find_all("td")]
                    if len(cols) == 0 or all(c == "" for c in cols):
                        continue
                    rows.append(cols)

    return rows


def write_single_csv(rows, output_path):
    if not rows:
        print("⚠ No table rows found in JSON. CSV not created.")
        return

    max_cols = max(len(r) for r in rows)

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        for r in rows:
            r = r + [""] * (max_cols - len(r))
            writer.writerow(r)

    print(f"✅ Saved CSV → {output_path}")


if __name__ == "__main__":
    rows = extract_tables_from_json(INPUT_JSON)
    write_single_csv(rows, OUTPUT_CSV)
