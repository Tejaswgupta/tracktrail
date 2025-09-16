import pandas as pd
from rapidfuzz import process, fuzz

# Load your counterparty stats
# Columns: 'counterparty_name', 'transaction_count'
counterparties = pd.read_csv("counterparty_stats.csv")

min_similarity = 75  # similarity threshold as percentage
limit = 100

# Step 1: Blocking by first word
counterparties['block'] = counterparties['counterparty_name'].str.split().str[0].str.upper()

results = []

# Step 2: Compare within each block
for block, group in counterparties.groupby('block'):
    names = group['counterparty_name'].tolist()
    counts = dict(zip(names, group['transaction_count']))
    
    for i, name1 in enumerate(names):
        matches = process.extract(
            name1, names[i+1:], scorer=fuzz.ratio, score_cutoff=min_similarity
        )
        for name2, score, _ in matches:
            combined_tx = counts[name1] + counts[name2]
            # Decide representative
            if counts[name1] >= counts[name2]:
                rep, sim = name1, name2
            else:
                rep, sim = name2, name1
            results.append({
                "representative": rep,
                "similar_name": sim,
                "similarity_score": score / 100.0,
                "combined_transaction_count": combined_tx
            })

# Step 3: Aggregate per representative
df = pd.DataFrame(results)
agg = df.groupby('representative').agg(
    similar_names=('similar_name', lambda x: list(x)),
    similarity_scores=('similarity_score', lambda x: list(x)),
    max_combined_transaction_count=('combined_transaction_count', 'max'),
    similar_count=('similar_name', 'count')
).reset_index()

# Step 4: Order and limit
agg = agg.sort_values(
    ['max_combined_transaction_count', 'similar_count'], ascending=False
).head(limit)

print(agg)
