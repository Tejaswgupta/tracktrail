import Fuse from 'fuse.js';

// Simple string similarity function using character-level comparison
export function stringSimilarity(str1: string, str2: string): number {
  // Convert to lowercase for case-insensitive comparison
  str1 = str1.toLowerCase();
  str2 = str2.toLowerCase();
  
  // If strings are identical, return 1 (100% similarity)
  if (str1 === str2) return 1;
  
  // If one string is empty, return 0
  if (str1.length === 0 || str2.length === 0) return 0;
  
  // Use Fuse.js for fuzzy matching
  const fuse = new Fuse([str1], { includeScore: true });
  const result = fuse.search(str2);
  
  // If no match found, return 0
  if (result.length === 0) return 0;
  
  // Convert score to similarity (Fuse.js scores are between 0 and 1, where 0 is perfect match)
  return 1 - (result[0].score || 0);
}

// Check if the first few words match
export function firstWordsMatch(str1: string, str2: string, wordCount: number = 3): boolean {
  const words1 = str1.trim().split(/\s+/);
  const words2 = str2.trim().split(/\s+/);
  
  // Compare first 3 words (or all words if less than 3)
  const compareCount = Math.min(wordCount, words1.length, words2.length);
  
  for (let i = 0; i < compareCount; i++) {
    // If any of the first 3 words don't match, return false
    if (words1[i].toLowerCase() !== words2[i].toLowerCase()) {
      return false;
    }
  }
  
  return true;
}

// Optimization 1: Filter top k common descriptions
export function getTopKCommonDescriptions(
  counterparties: Array<{ name: string; count: number }>,
  k: number = 50
): Array<{ name: string; count: number }> {
  // Sort by count (descending) and take top k
  return [...counterparties]
    .sort((a, b) => b.count - a.count)
    .slice(0, k);
}

// Find similar counterparties using fuzzy matching with optimizations
export function findSimilarCounterparties(
  counterparties: Array<{ name: string; count: number }>,
  minSimilarity: number = 0.8,
  maxResults: number = 100
): Array<{
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
}> {
  // Optimization 1: Filter top k common descriptions to reduce computation
  const topCounterparties = getTopKCommonDescriptions(counterparties, 100);

  console.log(`common counterparties considered for matching: ${topCounterparties.length}`);
  
  // Group counterparties by first word for optimization
  const groups = new Map<string, Array<{ name: string; count: number }>>();
  
  topCounterparties.forEach(cp => {
    const firstWord = cp.name.trim().split(/\s+/)[0].toLowerCase();
    if (!groups.has(firstWord)) {
      groups.set(firstWord, []);
    }
    groups.get(firstWord)!.push(cp);
  });


  
  const results: Array<{
    representative: string;
    similar_names: string[];
    similarity_scores: number[];
    total_transactions: number;
    potential_savings: number;
  }> = [];

  console.log(`groups formed for matching: ${groups.size}`);
  
  // For each counterparty, find similar ones
  for (const cp of topCounterparties) {
    const similar: Array<{ name: string; score: number; count: number }> = [];
    
    // Optimization 1: Only check counterparties with matching first words
    const firstWord = cp.name.trim().split(/\s+/)[0].toLowerCase();
    const potentialMatches = groups.get(firstWord) || [];
    
    // Optimization 2: Only do fuzzy matching if first few words match
    for (const match of potentialMatches) {
      if (cp.name === match.name) continue; // Skip self
      
      // Check if first few words match
      if (firstWordsMatch(cp.name, match.name, 3)) {
        const similarity = stringSimilarity(cp.name, match.name);
        if (similarity >= minSimilarity) {
          similar.push({
            name: match.name,
            score: similarity,
            count: match.count
          });
        }
      }
    }
    
    // Sort by similarity score (highest first)
    similar.sort((a, b) => b.score - a.score);
    
    // Limit to top results
    const topSimilar = similar.slice(0, 10); // Limit to top 10 similar names
    
    if (topSimilar.length > 0) {
      results.push({
        representative: cp.name,
        similar_names: topSimilar.map(s => s.name),
        similarity_scores: topSimilar.map(s => s.score),
        total_transactions: cp.count + topSimilar.reduce((sum, s) => sum + s.count, 0),
        potential_savings: topSimilar.length // Each merge saves one entry
      });
    }
    
    // Limit total results
    if (results.length >= maxResults) {
      break;
    }
  }
  
  // Sort by potential savings (highest first)
  results.sort((a, b) => b.potential_savings - a.potential_savings);
  
  return results;
}