import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// OpenAI client configuration - lazy initialization to avoid build-time errors
function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: "https://model.thevotum.com/v1",
  });
}

interface OptimizationRequest {
  prompt: string;
  bankPreset?: string;
  model?: string;
  maxTokens?: number;
}

interface OptimizationResponse {
  improvedPattern: string;
  explanation: string;
  expectedImprovement: number;
  confidence: number;
}

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    if (!process.env.OPENAI_API_KEY) {
      console.error("OpenAI API key not configured");
      return NextResponse.json(
        { error: "AI optimization service not available" },
        { status: 503 }
      );
    }

    const body: OptimizationRequest = await request.json();
    const { prompt } = body;

    if (!prompt) {
      return NextResponse.json(
        { error: "Prompt is required" },
        { status: 400 }
      );
    }

    const model = "gpt-mini";
    const maxTokens = 2048;

    console.log("Sending regex optimization request to AI:", {
      promptLength: prompt.length,
      prompt: prompt,
      model,
      maxTokens,
    });

    // Call OpenAI API using SDK
    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are a regex expert specializing in banking transaction patterns",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      // max_tokens: maxTokens,
      temperature: 0.2, // Lower temperature for more consistent regex patterns
    });

    console.log("AI response received:", {
      id: completion.id,
      created: completion.created,
      model: completion.model,
      usage: completion.usage,
    });

    // Extract the content from the AI response
    const content = completion.choices?.[0]?.message?.content;
    console.log("AI response content:", content);
    if (!content) {
      console.error("No content in AI response");
      return NextResponse.json(
        { error: "No response from AI service" },
        { status: 500 }
      );
    }

    // Parse the JSON response
    let optimizationResult: string[];
    try {
      optimizationResult = JSON.parse(content);
    } catch (parseError) {
      console.error(
        "Failed to parse AI response as JSON:",
        content,
        parseError
      );
      return NextResponse.json(
        { error: "Invalid response format from AI service" },
        { status: 500 }
      );
    }

    // Validate and clean the improved patterns
    const cleanedPatterns: string[] = [];
    for (const pattern of optimizationResult) {
      try {
        // Remove inline flags like (?i) that conflict with the flag parameter
        const cleanedPattern = pattern.replace(/\(\?[imsux]+\)/g, '');
        new RegExp(cleanedPattern, "i");
        console.log("Valid regex pattern from AI:", cleanedPattern);
        cleanedPatterns.push(cleanedPattern);
      } catch (regexError) {
        console.error("Invalid regex pattern from AI:", pattern, regexError);
        // Skip invalid patterns
      }
    }

    return NextResponse.json(cleanedPatterns);
  } catch (error) {
    console.error("Unexpected error in AI optimization:", error);

    return NextResponse.json(
      { error: "Internal server error in AI optimization service" },
      { status: 500 }
    );
  }
}

// Health check endpoint
export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "AI Regex Optimization (OpenAI SDK)",
    available: !!process.env.OPENAI_API_KEY,
    timestamp: new Date().toISOString(),
    sdkVersion: "5.x",
  });
}
