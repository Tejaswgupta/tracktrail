import { NextRequest } from "next/server";
import path from "path";
import fs from "fs/promises";
import { transactionExtractorService as svc } from "@/services/transactionExtractor";
import type { ColumnMapping } from "@/utils/csvValidator";

// Ensure Node.js runtime because this route uses fs
export const runtime = "nodejs";

function runExtractionFromText(
  csvText: string,
  mapping?: Partial<ColumnMapping>
) {
  const lines = csvText.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return {
      error: "Empty CSV",
      result: svc.buildExtractionResult([], ["Empty CSV"]),
    };
  }
  const headers = svc.parseCSVColumns(lines[0]);

  const columnIndices: Record<string, number> = {
    DATE: -1,
    DESCRIPTION: -1,
    DEBIT: -1,
    CREDIT: -1,
    AMOUNT: -1,
    DIRECTION: -1,
  };

  const map: ColumnMapping = {
    DATE: mapping?.DATE ?? headers[0] ?? "DATE",
    DESCRIPTION: mapping?.DESCRIPTION ?? headers[1] ?? "DESCRIPTION",
    DEBIT: mapping?.DEBIT ?? "",
    CREDIT: mapping?.CREDIT ?? "",
    AMOUNT: mapping?.AMOUNT,
    DIRECTION: mapping?.DIRECTION,
  } as ColumnMapping;

  columnIndices.DATE = headers.findIndex((h) => h.trim() === map.DATE.trim());
  columnIndices.DESCRIPTION = headers.findIndex(
    (h) => h.trim() === map.DESCRIPTION.trim()
  );
  columnIndices.DEBIT = map.DEBIT
    ? headers.findIndex((h) => h.trim() === map.DEBIT!.trim())
    : -1;
  columnIndices.CREDIT = map.CREDIT
    ? headers.findIndex((h) => h.trim() === map.CREDIT!.trim())
    : -1;
  columnIndices.AMOUNT = map.AMOUNT
    ? headers.findIndex((h) => h.trim() === map.AMOUNT!.trim())
    : -1;
  columnIndices.DIRECTION = map.DIRECTION
    ? headers.findIndex((h) => h.trim() === map.DIRECTION!.trim())
    : -1;

  const txs: ReturnType<typeof svc.parseCSVLineWithMapping>[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    try {
      const tx = svc.parseCSVLineWithMapping(lines[i], i + 1, columnIndices, i);
      if (tx) txs.push(tx);
    } catch (e) {
      errors.push(`Line ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const result = svc.buildExtractionResult(txs.filter(Boolean) as any, errors);
  return { result };
}

export async function GET(_req: NextRequest) {
  try {
    const cwd = process.cwd();

    // 1) sample.csv in project root
    let sample: any = { skipped: true };
    try {
      const samplePath = path.join(cwd, "sample.csv");
      const csv = await fs.readFile(samplePath, "utf8");
      sample = runExtractionFromText(csv, {
        DATE: "DATE",
        DESCRIPTION: "DESCRIPTION",
        DEBIT: "DEBIT",
        CREDIT: "CREDIT",
      });
    } catch {
      sample = { error: "sample.csv not found" };
    }

    // 2) test_statement.csv in project root
    let testStmt: any = { skipped: true };
    try {
      const testPath = path.join(cwd, "test_statement.csv");
      const csv = await fs.readFile(testPath, "utf8");
      testStmt = runExtractionFromText(csv, {
        DATE: "Date",
        DESCRIPTION: "Description",
        DEBIT: "Debit",
        CREDIT: "Credit",
      });
    } catch {
      testStmt = { error: "test_statement.csv not found" };
    }

    // 3) Unified Amount + Direction synthetic CSV
    const unified = [
      "Date,Description,Amount,DR/CR",
      "2024-01-01,Test Credit,1000,CR",
      "2024-01-02,Test Debit,200,DR",
      "01/03/24,UPI Payment,-150,",
      "01/04/24,Refund,250,",
    ].join("\n");
    const synthetic = runExtractionFromText(unified, {
      DATE: "Date",
      DESCRIPTION: "Description",
      AMOUNT: "Amount",
      DIRECTION: "DR/CR",
    });

    const payload = {
      sample: sample.result
        ? {
          summary: sample.result.summary,
          first5: sample.result.transactions.slice(0, 5),
          errors: sample.result.errors.slice(0, 5),
        }
        : sample,
      test_statement: testStmt.result
        ? {
          summary: testStmt.result.summary,
          first5: testStmt.result.transactions.slice(0, 5),
          errors: testStmt.result.errors.slice(0, 5),
        }
        : testStmt,
      synthetic: {
        summary: synthetic.result.summary,
        first5: synthetic.result.transactions.slice(0, 5),
        errors: synthetic.result.errors.slice(0, 5),
      },
    };

    return Response.json(payload, { status: 200 });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
