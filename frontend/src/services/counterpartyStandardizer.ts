import Fuse, { type IFuseOptions } from "fuse.js";

export interface CounterpartyCluster {
  representative: string;
  aliases: string[];
  totalCount: number;
  confidence: number;
}

export interface StandardizationResult {
  clusters: CounterpartyCluster[];
  mappings: Record<string, string>;
  totalProcessed: number;
}

export class CounterpartyStandardizer {
  private similarityThreshold: number;
  private nameMappings: Record<string, string> = {};

  constructor(similarityThreshold: number = 85) {
    this.similarityThreshold = similarityThreshold;
  }

  /**
   * Get optimized Fuse.js options based on name characteristics
   */
  private getFuseOptions(names: string[]): IFuseOptions<string> {
    // Analyze the dataset to optimize Fuse settings
    const avgLength =
      names.reduce((sum, name) => sum + name.length, 0) / names.length;
    const hasLongNames = avgLength > 15;
    const hasShortNames = names.some((name) => name.length <= 8);

    return {
      includeScore: true,
      threshold: (100 - this.similarityThreshold) / 100,
      ignoreLocation: true,
      ignoreFieldNorm: true,
      minMatchCharLength: hasShortNames ? 2 : 3,
      // Use different algorithms based on data characteristics
      useExtendedSearch: hasLongNames,
      keys: [],
    };
  }

  /**
   * Find similar counterparty names and group them into clusters
   */
  findSimilarNames(names: string[]): StandardizationResult {
    if (!names || names.length === 0) {
      return {
        clusters: [],
        mappings: {},
        totalProcessed: 0,
      };
    }

    // Count occurrences of each name
    const nameCounts = this.countNames(names);
    const uniqueNames = Object.keys(nameCounts);

    // Filter out invalid names
    const filteredNames = uniqueNames.filter((name) =>
      this.isValidNameForMatching(name)
    );

    // Group by case-insensitive matching first
    const caseGroups = this.groupByCase(filteredNames, nameCounts);
    const mergedNames = Object.keys(caseGroups);
    const mergedCounts = this.mergeCounts(caseGroups, nameCounts);

    // Find similarity clusters
    const clusters = this.findClusters(mergedNames, mergedCounts);

    console.log(`Clusters`, clusters);

    // Build mappings
    const mappings = this.buildMappings(clusters);

    return {
      clusters,
      mappings,
      totalProcessed: names.length,
    };
  }

  private countNames(names: string[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const name of names) {
      if (name && typeof name === "string") {
        const cleanName = name.trim();
        if (cleanName) {
          counts[cleanName] = (counts[cleanName] || 0) + 1;
        }
      }
    }
    return counts;
  }

  private groupByCase(
    names: string[],
    nameCounts: Record<string, number>
  ): Record<string, string[]> {
    const caseGroups: Record<string, string[]> = {};

    for (const name of names) {
      const key = name.toLowerCase().trim();
      if (!caseGroups[key]) {
        caseGroups[key] = [];
      }
      caseGroups[key].push(name);
    }

    return caseGroups;
  }

  private mergeCounts(
    caseGroups: Record<string, string[]>,
    nameCounts: Record<string, number>
  ): Record<string, number> {
    const mergedCounts: Record<string, number> = {};

    for (const group of Object.values(caseGroups)) {
      // Use the most frequent variant, or first alphabetically if tied
      const representative = group.reduce((best, current) => {
        const bestCount = nameCounts[best] || 0;
        const currentCount = nameCounts[current] || 0;

        if (currentCount > bestCount) return current;
        if (currentCount < bestCount) return best;
        return current < best ? current : best;
      });

      // Sum counts for all variants
      mergedCounts[representative] = group.reduce(
        (sum, name) => sum + (nameCounts[name] || 0),
        0
      );
    }

    return mergedCounts;
  }

  private findClusters(
    names: string[],
    counts: Record<string, number>
  ): CounterpartyCluster[] {
    const clusters: CounterpartyCluster[] = [];
    const clustered = new Set<string>();

    // Sort by frequency to process most common names first
    const sortedNames = names.sort(
      (a, b) => (counts[b] || 0) - (counts[a] || 0)
    );

    // Configure Fuse.js for fuzzy matching with optimized settings
    const fuseOptions = this.getFuseOptions(sortedNames);

    for (const name of sortedNames) {
      if (clustered.has(name)) continue;

      const cluster: string[] = [name];
      clustered.add(name);

      // Get candidates that haven't been clustered yet
      const candidates = sortedNames.filter(
        (candidate) => !clustered.has(candidate) && candidate !== name
      );

      if (candidates.length === 0) continue;

      // Use Fuse.js for fuzzy matching
      const fuse = new Fuse(candidates, fuseOptions);
      const matches = fuse.search(name);

      // Process matches and apply additional filtering
      for (const match of matches) {
        const candidate = match.item;
        const fuseScore = (1 - (match.score || 0)) * 100; // Convert to percentage

        if (this.shouldMatchNames(name, candidate, fuseScore)) {
          cluster.push(candidate);
          clustered.add(candidate);
        }
      }

      // Only keep clusters with meaningful matches or high-frequency single names
      if (cluster.length > 1 || (counts[name] || 0) > 5) {
        const totalCount = cluster.reduce(
          (sum, n) => sum + (counts[n] || 0),
          0
        );
        const confidence =
          cluster.length > 1 ? Math.min(95, 60 + cluster.length * 5) : 100;

        clusters.push({
          representative: name,
          aliases: cluster.slice(1), // Exclude representative from aliases
          totalCount,
          confidence,
        });
      }
    }

    return clusters.sort((a, b) => b.totalCount - a.totalCount);
  }

  private buildMappings(
    clusters: CounterpartyCluster[]
  ): Record<string, string> {
    const mappings: Record<string, string> = {};

    for (const cluster of clusters) {
      // Map all aliases to the representative
      for (const alias of cluster.aliases) {
        mappings[alias] = cluster.representative;
      }
      // Representative maps to itself
      mappings[cluster.representative] = cluster.representative;
    }

    return mappings;
  }

  private isValidNameForMatching(name: string): boolean {
    if (!name || name.length < 3) {
      return false;
    }

    const nameClean = name.trim().toUpperCase();

    return true;
  }

  private shouldMatchNames(
    name1: string,
    name2: string,
    fuseScore?: number
  ): boolean {
    const name1Clean = name1.trim().toUpperCase();
    const name2Clean = name2.trim().toUpperCase();

    // Check if one name is a substring of the other
    if (name1Clean.includes(name2Clean) || name2Clean.includes(name1Clean)) {
      const longer =
        name1Clean.length > name2Clean.length ? name1Clean : name2Clean;
      const shorter =
        name1Clean.length > name2Clean.length ? name2Clean : name1Clean;

      // Ensure non-trivial containment
      if (shorter.length >= 5) {
        return true;
      }
    }

    // Split names into tokens
    const tokens1 = new Set(name1Clean.split(/\s+/));
    const tokens2 = new Set(name2Clean.split(/\s+/));
    const commonTokens = new Set([...tokens1].filter((x) => tokens2.has(x)));

    // If no common tokens, don't match
    if (commonTokens.size === 0) {
      return false;
    }

    // If we have a Fuse score, use it as primary indicator
    if (fuseScore !== undefined) {
      // For single-token names, be more restrictive
      if (tokens1.size === 1 && tokens2.size === 1) {
        return fuseScore >= 92;
      }

      // Check character similarity for short names
      if (name1Clean.length <= 8 || name2Clean.length <= 8) {
        return fuseScore >= 80;
      }

      return fuseScore >= this.similarityThreshold;
    }

    // Fallback to original logic if no Fuse score
    // For single-token names, be more restrictive
    if (tokens1.size === 1 && tokens2.size === 1) {
      return this.calculateSimilarity(name1Clean, name2Clean) >= 92;
    }

    // Check character similarity for short names
    if (name1Clean.length <= 8 || name2Clean.length <= 8) {
      return this.calculateCharacterSimilarity(name1Clean, name2Clean) >= 80;
    }

    return true;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Simple token-based similarity (approximating fuzz.token_set_ratio)
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/));

    const intersection = new Set([...tokens1].filter((x) => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);

    if (union.size === 0) return 0;

    const tokenSimilarity = (intersection.size / union.size) * 100;

    // Also consider character-level similarity
    const charSimilarity = this.calculateCharacterSimilarity(str1, str2);

    // Return weighted average
    return tokenSimilarity * 0.7 + charSimilarity * 0.3;
  }

  private calculateCharacterSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 100;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return ((longer.length - editDistance) / longer.length) * 100;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Apply standardization mappings to a list of counterparty names
   */
  standardizeNames(
    names: string[],
    mappings: Record<string, string>
  ): string[] {
    return names.map((name) => {
      if (!name || typeof name !== "string") return name;
      const cleanName = name.trim();
      return mappings[cleanName] || cleanName;
    });
  }

  /**
   * Get standardized name for a single counterparty
   */
  getStandardizedName(name: string, mappings: Record<string, string>): string {
    if (!name || typeof name !== "string") return name;
    const cleanName = name.trim();
    return mappings[cleanName] || cleanName;
  }

  /**
   * Perform fuzzy search to find similar counterparty names
   * Useful for interactive name matching and suggestions
   */
  findSimilarCounterparties(
    query: string,
    candidates: string[],
    limit: number = 10
  ): Array<{ name: string; score: number }> {
    if (!query || !candidates.length) return [];

    const fuseOptions: IFuseOptions<string> = {
      includeScore: true,
      threshold: 0.4, // More lenient for suggestions
      ignoreLocation: true,
      ignoreFieldNorm: true,
      minMatchCharLength: 2,
      keys: [],
    };

    const fuse = new Fuse(candidates, fuseOptions);
    const results = fuse.search(query, { limit });

    return results.map((result) => ({
      name: result.item,
      score: Math.round((1 - (result.score || 0)) * 100),
    }));
  }

  /**
   * Advanced clustering with multiple passes for better accuracy
   */
  findSimilarNamesAdvanced(names: string[]): StandardizationResult {
    if (!names || names.length === 0) {
      return {
        clusters: [],
        mappings: {},
        totalProcessed: 0,
      };
    }

    // First pass: exact and case-insensitive matching
    const basicResult = this.findSimilarNames(names);

    // Second pass: fuzzy matching on remaining unclustered names
    const clusteredNames = new Set<string>();
    basicResult.clusters.forEach((cluster) => {
      clusteredNames.add(cluster.representative);
      cluster.aliases.forEach((alias) => clusteredNames.add(alias));
    });

    const remainingNames = names.filter((name) => !clusteredNames.has(name));

    if (remainingNames.length > 1) {
      // Apply more aggressive fuzzy matching to remaining names
      const aggressiveStandardizer = new CounterpartyStandardizer(75); // Lower threshold
      const secondPassResult =
        aggressiveStandardizer.findSimilarNames(remainingNames);

      // Merge results
      basicResult.clusters.push(...secondPassResult.clusters);
      Object.assign(basicResult.mappings, secondPassResult.mappings);
    }

    return basicResult;
  }
}
