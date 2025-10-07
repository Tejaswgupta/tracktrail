import pandas as pd
from openai import OpenAI
import os
import argparse
import json
import re
import random
from dotenv import load_dotenv
load_dotenv()

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url="https://model.thevotum.com/v1",
)

# --- Configuration ---
# Set your OpenAI API key as an environment variable named OPENAI_API_KEY
# You can do this in your terminal like this:
# export OPENAI_API_KEY='your_api_key'

PROMPT_TEMPLATE = """
Based on the following bank transaction description samples, generate a JSON array of Python regex strings.
Each regex should be designed to be used with Python's `re.match()` to extract the 'beneficiary name'.
The regex should be anchored to the start of the string, and the beneficiary name should be in a capture group.

Samples:
{}

The output should be a JSON array of regex strings. For example:
["regex1", "regex2"]
"""

def get_api_key():
    """Gets the OpenAI API key from environment variables."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OpenAI API key not found. Please set the OPENAI_API_KEY environment variable.")
    return api_key

def find_unique_transactions(df, description_col, max_samples_per_type=10, num_random_samples=10):
    """Finds a diverse set of unique transaction descriptions for different payment types and adds random samples."""
    unique_descriptions = df[description_col].dropna().unique()
    payment_types = ['NEFT', 'RTGS', 'IMPS', 'UPI']
    samples = {p_type: [] for p_type in payment_types}

    # 1. Targeted Sampling
    for desc in unique_descriptions:
        if not isinstance(desc, str):
            continue
        for p_type in payment_types:
            if p_type in desc and len(samples[p_type]) < max_samples_per_type:
                samples[p_type].append(desc)
                break
    
    # Flatten the dictionary of lists into a single list
    targeted_samples = []
    for p_type in payment_types:
        targeted_samples.extend(samples[p_type])
        
    # 2. Random Sampling
    remaining_descriptions = [d for d in unique_descriptions if d not in targeted_samples]
    
    random_samples = []
    if remaining_descriptions:
        # Ensure we don't try to sample more than what is available
        num_to_sample = min(num_random_samples, len(remaining_descriptions))
        random_samples = random.sample(remaining_descriptions, num_to_sample)

    # 3. Combine samples
    final_samples = targeted_samples + random_samples
    
    return final_samples

def generate_regex_with_openai(samples):
    """Generates regex patterns using OpenAI API."""
    prompt = PROMPT_TEMPLATE.format("\n".join(f"- {s}" for s in samples))

    try:
        response = client.chat.completions.create(
            model="gpt-mini",
            messages=[
                {"role": "system", "content": "You are a regex generation expert who provides only JSON responses."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            response_format={ "type": "json_object" }
        )
        generated_text = response.choices[0].message.content
        print(generated_text)
        data = json.loads(generated_text)
        
        # Try to find the array in the JSON object
        for key in data:
            if isinstance(data[key], list):
                return data[key]
        
        raise ValueError("No JSON array found in the OpenAI response.")

    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return None

REFINE_PROMPT_TEMPLATE = """
You are a regex generation expert. I have the following list of regex patterns:
{regex_patterns}

These patterns failed to match the following transaction descriptions:
{failed_samples}

Please refine the original regex patterns or add new ones to correctly parse these failed samples.
The goal is to extract the 'beneficiary name' from the description using Python's `re.match()`.
The beneficiary name should be in a capture group.

Return a complete, updated JSON array of Python regex strings, including the original patterns that still work.
"""

def refine_regex_with_openai(regex_patterns, failed_samples):
    """Sends failed samples to OpenAI to refine regex patterns."""
    prompt = REFINE_PROMPT_TEMPLATE.format(
        regex_patterns=json.dumps(regex_patterns, indent=2),
        failed_samples="\n".join(f"- {s}" for s in failed_samples)
    )

    print("\nAsking OpenAI to refine the regex patterns...")

    try:
        response = client.chat.completions.create(
            model="gpt-mini",
            messages=[
                {"role": "system", "content": "You are a regex generation expert who provides only JSON responses."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            response_format={ "type": "json_object" }
        )
        generated_text = response.choices[0].message.content
        data = json.loads(generated_text)
        for key in data:
            if isinstance(data[key], list):
                return data[key]
        raise ValueError("No JSON array found in the OpenAI refinement response.")

    except Exception as e:
        print(f"Error calling OpenAI API for refinement: {e}")
        return None

def test_and_refine_regex(df, desc_col, regex_patterns):
    """Tests regex patterns against the full dataset and triggers refinement."""
    print("\n--- Testing Patterns Against Full Dataset ---")
    all_descriptions = df[desc_col].dropna().unique()
    failed_descriptions = []

    for desc in all_descriptions:
        if not isinstance(desc, str):
            continue
        
        matched = False
        for pattern in regex_patterns:
            try:
                if re.match(pattern, desc):
                    matched = True
                    break
            except re.error:
                continue # Ignore invalid patterns, they will be reported elsewhere
        
        if not matched:
            failed_descriptions.append(desc)

    if not failed_descriptions:
        print("\nSuccess! All unique descriptions matched a regex pattern.")
        return regex_patterns

    total_unique = len(all_descriptions)
    failed_count = len(failed_descriptions)
    success_rate = ((total_unique - failed_count) / total_unique) * 100

    print(f"\nTest Results:")
    print(f"  - Total Unique Descriptions: {total_unique}")
    print(f"  - Matched: {total_unique - failed_count}")
    print(f"  - Failed: {failed_count}")
    print(f"  - Success Rate: {success_rate:.2f}%")

    # Limit failed samples to avoid overly long prompts
    samples_for_refinement = failed_descriptions[:20]
    
    refined_patterns = refine_regex_with_openai(regex_patterns, samples_for_refinement)
    
    return refined_patterns

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

        transaction_samples = find_unique_transactions(df, args.desc_col)

        if not transaction_samples:
            print("No representative transaction samples found for NEFT, RTGS, IMPS, or UPI.")
            return

        print("Found the following transaction samples:")
        for sample in transaction_samples:
            print(f"- {sample}")
        
        print("\nGenerating initial regex patterns with OpenAI...")
        regex_patterns = generate_regex_with_openai(transaction_samples)

        if regex_patterns:
            print("\nGenerated Initial Regex Patterns:")
            print(json.dumps(regex_patterns, indent=2))

            # Test and refine the patterns
            refined_patterns = test_and_refine_regex(df, args.desc_col, regex_patterns)

            if refined_patterns and refined_patterns != regex_patterns:
                print("\n--- Refined Regex Patterns ---")
                print(json.dumps(refined_patterns, indent=2))
                
                # Optionally, run a final test with the refined patterns
                print("\n--- Final Test with Refined Patterns ---")
                test_and_refine_regex(df, args.desc_col, refined_patterns)
            else:
                print("\nNo refinements were suggested by OpenAI.")


    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()