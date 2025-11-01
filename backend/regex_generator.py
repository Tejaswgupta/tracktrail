import argparse
import json
import os
import re

import pandas as pd
from dotenv import load_dotenv
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI

load_dotenv()

# Global variable to store descriptions for the tool
_ALL_DESCRIPTIONS = []

@tool
def test_regex_patterns_tool(patterns_json: str) -> str:
    """
    Tests regex patterns against all transaction descriptions and returns accuracy with failed examples.
    
    Args:
        patterns_json: JSON string containing array of regex patterns, e.g. '["pattern1", "pattern2"]'
    
    Returns:
        JSON string with accuracy, matched_count, failed_count, and up to 20 failed description samples
    """
    try:
        patterns = json.loads(patterns_json)
        if not isinstance(patterns, list):
            return json.dumps({"error": "patterns_json must be a JSON array of strings"})
        
        matched_count = 0
        failed_descriptions = []
        
        for desc in _ALL_DESCRIPTIONS:
            if not isinstance(desc, str):
                continue
            
            matched = False
            for pattern in patterns:
                try:
                    if re.match(pattern, desc, re.IGNORECASE):
                        matched = True
                        break
                except re.error as e:
                    continue
            
            if matched:
                matched_count += 1
            else:
                failed_descriptions.append(desc)
        
        total_count = len(_ALL_DESCRIPTIONS)
        failed_count = len(failed_descriptions)
        accuracy = (matched_count / total_count * 100) if total_count > 0 else 0
        
        result = {
            "total_descriptions": total_count,
            "matched": matched_count,
            "failed": failed_count,
            "accuracy": round(accuracy, 2),
            "failed_samples": failed_descriptions[:20]  # Return max 20 failed samples
        }
        
        return json.dumps(result, indent=2)
    except json.JSONDecodeError:
        return json.dumps({"error": "Invalid JSON format for patterns"})
    except Exception as e:
        return json.dumps({"error": f"Error testing patterns: {str(e)}"})

AGENT_PROMPT_TEMPLATE = """
You are a regex generation expert. Your task is to create GENERIC regex patterns that extract beneficiary names from bank transaction descriptions and ITERATIVELY refine them until achieving 90% accuracy.

You have access to a tool called 'test_regex_patterns_tool' that will test your patterns against {total_descriptions} unique transaction descriptions.

CRITICAL RULES - READ CAREFULLY:
1. Create GENERIC patterns based on STRUCTURE, not specific names/values
2. DO NOT hardcode specific beneficiary names (e.g., "JOHN SMITH", "ACME CORP")
3. DO NOT hardcode specific account numbers or reference IDs
4. Focus on the FORMAT and DELIMITERS used by the bank (NEFT/RTGS/IMPS/UPI/etc.)
5. Patterns must work for ANY beneficiary name with the same transaction format
6. Patterns will be tested with re.IGNORECASE flag (beneficiary names can be uppercase, lowercase, or mixed case)
7. Use [A-Za-z] or \\w for letters to match both cases in patterns

Example - WRONG (too specific):
- "^NEFT.*?-JOHN SMITH-.*"  ❌ (hardcoded name)
- "^RTGS.*?ACC12345.*"       ❌ (hardcoded account)

Example - CORRECT (generic):
- "^NEFT.*?-([A-Za-z\\s]+)-.*"        ✅ (matches any name with same format, any case)
- "^RTGS.*?/([A-Za-z0-9\\s]+)/.*"     ✅ (matches any name/account with same delimiters)
- "^IMPS-P2A-\\d+-([A-Za-z\\s]+)-.*"  ✅ (generic pattern for IMPS P2A format)

YOUR ITERATIVE APPROACH:
1. Start with initial patterns based on common bank transaction formats (RTGS, NEFT, IMPS, UPI, etc.)
2. Use test_regex_patterns_tool to test your patterns - pass them as JSON array string
3. Tool will return: accuracy, matched count, failed count, and up to 20 failed description samples
4. Print iteration number and current accuracy
5. If accuracy < 90%:
   - Analyze the failed description samples
   - Identify missing transaction formats or pattern issues
   - Add new patterns or refine existing ones for uncovered formats
   - GOTO step 2
6. If accuracy >= 90%, return final patterns

IMPORTANT: 
- Iterate until 90% accuracy or 15 iterations maximum
- Use test_regex_patterns_tool for ALL testing (don't write your own test code)
- Focus on failed_samples to identify what's missing

When you have final patterns, return ONLY a JSON object:
{{"patterns": ["regex1", "regex2", ...]}}
"""

def get_api_key():
    """Gets the OpenAI API key from environment variables."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.")
    return api_key

def generate_regex_with_iterative_agent(df, description_col):
    """Generates regex patterns using a single iterative LangChain agent."""
    global _ALL_DESCRIPTIONS
    all_descriptions = df[description_col].dropna().unique().tolist()
    _ALL_DESCRIPTIONS = all_descriptions  # Store for the tool to access
    
    try:
        print("\n" + "="*80)
        print("Initializing Iterative LangChain Agent with Pattern Testing Tool")
        print("="*80)
        print(f"Agent will generate patterns and test against {len(all_descriptions)} unique descriptions")
        print("Target: 90% accuracy through iterative refinement\n")
        
        # Initialize LLM
        llm = ChatOpenAI(
            model="gpt-large",
            temperature=0.2,
            api_key=os.getenv("OPENAI_API_KEY"),
            base_url="https://model.thevotum.com/v1"
        )
        
        # Create custom testing tool
        tools = [test_regex_patterns_tool]
        
        # Create prompt
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are an expert regex engineer. Create GENERIC patterns based on FORMAT and DELIMITERS, never hardcode specific names, IDs, or account numbers. Use the test_regex_patterns_tool to test your patterns iteratively until 90% accuracy is achieved."),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ])
        
        # Create agent with higher iteration limit for iterative refinement
        agent = create_tool_calling_agent(llm, tools, prompt)
        agent_executor = AgentExecutor(
            agent=agent,
            tools=tools,
            verbose=True,
            max_iterations=40,  # More iterations for iterative testing with tool calls
            handle_parsing_errors=True
        )
        
        # Run agent
        print("Agent is generating and iteratively refining patterns using testing tool...\n")
        result = agent_executor.invoke({"input": AGENT_PROMPT_TEMPLATE.format(total_descriptions=len(all_descriptions))})
        
        print("\n" + "="*80)
        print("Agent Execution Complete")
        print("="*80)
        
        # Extract output
        output_text = result.get("output", "")
        print(f"\nAgent Output:\n{output_text}\n")
        
        # Parse JSON from output
        json_match = re.search(r'\{[^{}]*"patterns"[^{}]*\[.*?\][^{}]*\}', output_text, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
        else:
            data = json.loads(output_text)
        
        if "patterns" in data and isinstance(data["patterns"], list):
            return data["patterns"]
        
        for key in data:
            if isinstance(data[key], list):
                return data[key]
        
        raise ValueError("No patterns array found in agent output.")
        
    except json.JSONDecodeError as e:
        print(f"JSON parsing error: {e}")
        print(f"Raw output: {output_text}")
        return None
    except Exception as e:
        print(f"Error generating regex with agent: {e}")
        return None

def test_regex_patterns(df, description_col, regex_patterns):
    """Tests regex patterns on all unique descriptions and returns results."""
    all_descriptions = df[description_col].dropna().unique()
    failed_descriptions = []

    for desc in all_descriptions:
        if not isinstance(desc, str):
            continue
        
        matched = False
        for pattern in regex_patterns:
            try:
                if re.match(pattern, desc, re.IGNORECASE):
                    matched = True
                    break
            except re.error:
                continue
        
        if not matched:
            failed_descriptions.append(desc)

    total_unique = len(all_descriptions)
    failed_count = len(failed_descriptions)
    success_rate = ((total_unique - failed_count) / total_unique) * 100

    print(f"\n" + "="*80)
    print("Final Test Results")
    print("="*80)
    print(f"  - Total Unique Descriptions: {total_unique}")
    print(f"  - Matched: {total_unique - failed_count}")
    print(f"  - Failed: {failed_count}")
    print(f"  - Success Rate: {success_rate:.2f}%")

    if failed_descriptions:
        print(f"\nSample Failed Descriptions (showing first 10):")
        for desc in failed_descriptions[:10]:
            print(f"  - {desc}")
    else:
        print("\n✅ Success! All unique descriptions matched a regex pattern.")
    
    return regex_patterns

def main():
    """Main function to generate regex for bank statements."""
    parser = argparse.ArgumentParser(description="Generate regex for bank statements using OpenAI.")
    parser.add_argument("csv_file", help="Path to the bank statement CSV file.")
    parser.add_argument("--desc_col", default="description", help="Name of the transaction description column.")
    
    args = parser.parse_args()

    try:
        df = pd.read_csv(args.csv_file)
        
        if args.desc_col not in df.columns:
            raise ValueError(f"Column '{args.desc_col}' not found in the CSV file.")

        # Use single iterative agent that generates, tests, and refines until 90% accuracy
        regex_patterns = generate_regex_with_iterative_agent(df, args.desc_col)

        if regex_patterns:
            print("\n" + "="*80)
            print("Generated Regex Patterns")
            print("="*80)
            print(json.dumps(regex_patterns, indent=2))

            # Verify final results
            test_regex_patterns(df, args.desc_col, regex_patterns)
        else:
            print("\nFailed to generate regex patterns.")

    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
