import Fuse from 'fuse.js';

// More efficient string similarity without creating new Fuse instances
export function stringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;
  
  // Simple character-based similarity (Dice coefficient)
  const bigrams1 = getBigrams(s1);
  const bigrams2 = getBigrams(s2);
  
  let matches = 0;
  bigrams1.forEach(bigram => {
    if (bigrams2.has(bigram)) matches++;
  });
  
  return (2 * matches) / (bigrams1.size + bigrams2.size);
}

function getBigrams(str: string): Set<string> {
  const bigrams = new Set<string>();
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.add(str.substring(i, i + 2));
  }
  return bigrams;
}

// Calculate percentile threshold
export function calculatePercentileThreshold(
  counterparties: Array<{ name: string; count: number }>,
  percentile: number = 90 // Top 10%
): number {
  if (counterparties.length === 0) return 0;
  
  const counts = counterparties.map(cp => cp.count).sort((a, b) => a - b);
  const index = Math.floor((percentile / 100) * counts.length);
  
  return counts[Math.min(index, counts.length - 1)];
}

// Get counterparties above percentile threshold
export function getTopPercentileCounterparties(
  counterparties: Array<{ name: string; count: number }>,
  percentile: number = 90 // Top 10%
): Array<{ name: string; count: number }> {
  const threshold = calculatePercentileThreshold(counterparties, percentile);
  
  console.log(`Transaction count threshold (${percentile}th percentile): ${threshold}`);
  
  return counterparties
    .filter(cp => cp.count >= threshold)
    .sort((a, b) => b.count - a.count);
}

// Normalize counterparty names for AML matching
export function normalizeForAML(name: string): string {
  return name
    .toUpperCase()
    .replace(/\b(PAYMENT|TRANSFER|TRF|WIRE|ACH|PMT)\b/g, '') // Remove transfer indicators
    .replace(/\b\d{6,}\b/g, '') // Remove long reference numbers
    .replace(/REF\s*:?\s*\S+/g, '') // Remove reference numbers
    .replace(/[^\w\s]/g, ' ') // Replace special chars
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract key entity name for grouping
export function extractKeyEntity(name: string): string {
  const normalized = normalizeForAML(name);
  const words = normalized.split(' ').filter(w => w.length > 2);
  
  // Return just the first significant word as the key entity
  return words.length > 0 ? words[0] : normalized.split(' ')[0] || '';
}

// Find similar counterparties with Union-Find to prevent duplicates
export function findSimilarCounterparties(
  counterparties: Array<{ name: string; count: number }>,
  minSimilarity: number = 0.8,
  maxResults: number = 100,
  percentile: number = 90 // Top 10% by default
): Array<{
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
  risk_score?: number;
  transaction_concentration?: number; // New metric for AML
}> {
  // Filter for AML-relevant counterparties (top percentile)
  const relevantCounterparties = getTopPercentileCounterparties(counterparties, percentile);
  
  console.log(`AML Analysis: ${relevantCounterparties.length} counterparties in top ${100-percentile}% (${counterparties.length} total)`);
  
  // Calculate total transactions for concentration analysis
  const totalTransactionsAll = counterparties.reduce((sum, cp) => sum + cp.count, 0);
  const totalTransactionsRelevant = relevantCounterparties.reduce((sum, cp) => sum + cp.count, 0);
  
  console.log(`Transaction concentration: ${((totalTransactionsRelevant / totalTransactionsAll) * 100).toFixed(1)}% of transactions in top ${100-percentile}% of counterparties`);
  
  // Union-Find to prevent duplicate groups
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  
  relevantCounterparties.forEach(cp => {
    parent.set(cp.name, cp.name);
    rank.set(cp.name, 0);
  });
  
  function find(x: string): string {
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  }
  
  function union(x: string, y: string): void {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX === rootY) return;
    
    if (rank.get(rootX)! < rank.get(rootY)!) {
      parent.set(rootX, rootY);
    } else if (rank.get(rootX)! > rank.get(rootY)!) {
      parent.set(rootY, rootX);
    } else {
      parent.set(rootY, rootX);
      rank.set(rootX, rank.get(rootX)! + 1);
    }
  }
  
  // Build index by key entity
  const entityIndex = new Map<string, string[]>();
  
  relevantCounterparties.forEach(cp => {
    const keyEntity = extractKeyEntity(cp.name);
    if (!entityIndex.has(keyEntity)) {
      entityIndex.set(keyEntity, []);
    }
    entityIndex.get(keyEntity)!.push(cp.name);
  });
  
  // Find similar counterparties within each entity group
  for (const [entity, names] of entityIndex) {
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        const similarity = stringSimilarity(names[i], names[j]);
        if (similarity >= minSimilarity) {
          union(names[i], names[j]);
        }
      }
    }
  }
  
  // Build final groups
  const groups = new Map<string, Array<{ name: string; count: number }>>();
  
  relevantCounterparties.forEach(cp => {
    const root = find(cp.name);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(cp);
  });
  
  // Create results with AML focus
  const results: Array<{
    representative: string;
    similar_names: string[];
    similarity_scores: number[];
    total_transactions: number;
    potential_savings: number;
    risk_score?: number;
    transaction_concentration?: number;
  }> = [];
  
  for (const [root, group] of groups) {
    if (group.length > 1) {
      // Choose most frequent as representative
      const representative = group.reduce((a, b) => a.count > b.count ? a : b);
      
      const similar_names: string[] = [];
      const similarity_scores: number[] = [];
      let total_transactions = 0;
      
      group.forEach(cp => {
        total_transactions += cp.count;
        if (cp.name !== representative.name) {
          similar_names.push(cp.name);
          similarity_scores.push(stringSimilarity(representative.name, cp.name));
        }
      });
      

      
      // Calculate transaction concentration for this group
      const transaction_concentration = (total_transactions / totalTransactionsAll) * 100;
      
      results.push({
        representative: representative.name,
        similar_names,
        similarity_scores,
        total_transactions,
        potential_savings: group.length - 1,
        transaction_concentration
      });
    }
  }
  
  // Sort by total transactions (important for AML)
  results.sort((a, b) => b.total_transactions - a.total_transactions);
  
  console.log(`Found ${results.length} potential counterparty groups for AML review`);
  
  return results.slice(0, maxResults);
}
