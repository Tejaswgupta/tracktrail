import { transactionsService } from "@/services/database";
import { Transaction } from "@/types/database";
import { NextRequest } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: "https://model.thevotum.com/v1",
});

export interface AMLAnalysisResult {
  summary: string;
  flags: {
    type: string;
    description: string;
    transactions: string[];
    severity: "low" | "medium" | "high";
  }[];
  recommendations: string[];
}

/**
 * Analyze a chunk of transactions for AML flags
 * @param transactions - Array of transactions to analyze
 * @returns Analysis results
 */
export async function analyzeTransactionsChunk(
  transactions: Transaction[]
): Promise<AMLAnalysisResult> {
  // Create a prompt for the AI analysis
  const prompt = `
You are an Anti-Money Laundering (AML) expert. Analyze the following financial transactions for potential money laundering activities.
Your goal is to identify genuine red flags if present, but do NOT assume suspicious activity exists.

Decision rules:
- Be conservative. Prioritize precision over recall and avoid speculation.
- Only flag when there is clear, explainable evidence derived from the data.
- If evidence is weak/ambiguous or data is insufficient, do not flag.
- It is acceptable to find no suspicious activity. If none, return "flags": [] and summarize accordingly.

Potential patterns to watch for (examples; do not force-match each):
1. Structuring/Smurfing (breaking large amounts into smaller transactions)
2. Rapid movement of funds between accounts
3. Unusual patterns or behaviors
4. Round-tripping (money going out and coming back quickly)
5. Any other clearly evidenced suspicious activities

Transactions:
${JSON.stringify(transactions, null, 2)}

Provide ONLY the following JSON. If there are no flags, return "flags": [].
\`\`\`json
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
\`\`\`
`;

  try {
    const response = await openai.chat.completions.create({
      model: "mistral-small-latest", // Using a cost-effective model
      messages: [
        {
          role: "system",
          content:
            "You are an expert Anti-Money Laundering analyst. You provide detailed analysis of financial transactions to identify suspicious activities.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower temperature for more consistent analysis
    });

    let result = response.choices[0]?.message?.content;

    console.log(`Result: ${result}`);

    if (!result) {
      throw new Error("No response from OpenAI");
    }

    // Extract JSON via regex (supports fenced blocks or plain JSON)
    const fencedMatch = result.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const candidate =
      fencedMatch?.[1]?.trim() ??
      result.match(/{[\s\S]*?}/)?.[0].trim() ??
      result.trim();

    let parsedResult: AMLAnalysisResult;
    try {
      parsedResult = JSON.parse(candidate);
    } catch (e) {
      console.error(
        "Failed to parse JSON from model output. Candidate snippet:",
        candidate
      );
      throw new Error("Model returned invalid JSON");
    }

    return parsedResult;
  } catch (error) {
    console.error("Error analyzing transactions:", error);
    throw new Error(
      `Failed to analyze transactions: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

/**
 * Compile multiple analysis results into a single comprehensive report
 * @param results - Array of analysis results from different chunks
 * @returns Compiled analysis result
 */
export function compileAnalysisResults(
  results: AMLAnalysisResult[]
): AMLAnalysisResult {
  const compiled: AMLAnalysisResult = {
    summary: "Comprehensive AML Analysis Report",
    flags: [],
    recommendations: [],
  };

  // Combine all flags and remove duplicates
  const allFlags = results.flatMap((result) => result.flags);
  const uniqueFlags = Array.from(
    new Map(
      allFlags.map((flag) => [`${flag.type}-${flag.description}`, flag])
    ).values()
  );

  // Sort flags by severity (high to low)
  uniqueFlags.sort((a, b) => {
    const severityOrder = { high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  compiled.flags = uniqueFlags;

  // Combine all recommendations and remove duplicates
  const allRecommendations = results.flatMap(
    (result) => result.recommendations
  );
  compiled.recommendations = [...new Set(allRecommendations)];

  return compiled;
}

export async function estimateTokens(text: string): Promise<number> {
  // Rough estimation: 1 token ≈ 4 characters in English
  return Math.ceil(text.length / 4);
}

export async function chunkTransactions(
  transactions: Transaction[],
  maxTokens: number = 4000
): Promise<Transaction[][]> {
  const chunks: Transaction[][] = [];
  let currentChunk: Transaction[] = [];
  let currentTokens = 0;

  for (const tx of transactions) {
    // Estimate tokens for this transaction
    const txString = JSON.stringify(tx);
    const txTokens = await estimateTokens(txString);

    // If adding this transaction would exceed the limit, start a new chunk
    if (currentTokens + txTokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [tx];
      currentTokens = txTokens;
    } else {
      currentChunk.push(tx);
      currentTokens += txTokens;
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// API route handler
export async function POST(request: NextRequest) {
  try {
    const { caseId } = await request.json();

    if (!caseId) {
      return new Response(JSON.stringify({ error: "Case ID is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch transactions for the case
    const transactions =
      await transactionsService.getCaseTransactionsForAnalysis(caseId);

    console.log("Transactions length: ", transactions.length);

    if (transactions.length === 0) {
      return new Response(
        JSON.stringify({
          result: {
            summary: "No transactions found for analysis.",
            flags: [],
            recommendations: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Sort transactions by date
    const sortedTransactions = [...transactions].sort(
      (a, b) => new Date(a.tx_date).getTime() - new Date(b.tx_date).getTime()
    );

    // Chunk transactions to fit within 16k token limit
    const chunks = await chunkTransactions(sortedTransactions);

    console.log("Chunks length: ", chunks.length);

    // Process each chunk
    const chunkResults: AMLAnalysisResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
      try {
        const result = await analyzeTransactionsChunk(chunks[i]);
        console.log("Result: ", result);
        chunkResults.push(result);
      } catch (chunkError) {
        console.error(`Error analyzing chunk ${i + 1}:`, chunkError);
        // Continue with other chunks even if one fails
      }
    }

    // Compile results from all chunks
    console.log("Compiling results...");
    const compiledResult = compileAnalysisResults(chunkResults);
    console.log("Compiled result: ", compiledResult);

    return new Response(JSON.stringify({ result: compiledResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("AI analysis error:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to analyze transactions with AI",
        details: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
