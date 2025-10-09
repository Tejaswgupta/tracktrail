"use client";

//TODO: Improve efficiency.

import { useAuth } from "@/contexts/AuthContext";
import { counterpartyService } from "@/services/database";
import { supabase } from "@/services/database";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, Filter, Users, CheckCircle, AlertCircle, ChevronDown, ChevronUp, Building2, User, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface CounterpartyMergeCandidate {
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
  entity_ids?: string[];
  // Enhanced data for display
  representativeTransactionCount: number;
  representativeEntities?: Array<{
    entity_id: string;
    entity_name: string;
    entity_type: string;
  }>;
  similarNameDetails: Array<{
    name: string;
    transactionCount: number;
    similarityScore: number;
    linkedEntities: Array<{
      entity_id: string;
      entity_name: string;
      entity_type: string;
    }>;
  }>;
}

interface ProcessingOptions {
  similarityThreshold: number;
  firstWordFilter: boolean;
  minTransactionCount: number;
  sortBy: "transaction_count" | "similarity_score" | "alphabetical";
  sortOrder: "desc" | "asc";
  batchSize: number;
}

interface CounterpartyStats {
  name: string;
  count: number;
  firstWord: string;
  firstChar: string;
  normalized: string;
}

const DEFAULT_OPTIONS: ProcessingOptions = {
  similarityThreshold: 0.8,
  firstWordFilter: true,
  minTransactionCount: 2,
  sortBy: "transaction_count",
  sortOrder: "desc",
  batchSize: 500,
};

export default function EfficientCounterpartyMerge({
  caseId,
}: {
  caseId: string;
}) {
  const { user } = useAuth();
  const [counterparties, setCounterparties] = useState<CounterpartyStats[]>([]);
  const [mergeCandidates, setMergeCandidates] = useState<CounterpartyMergeCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [processingStage, setProcessingStage] = useState("");
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [options, setOptions] = useState<ProcessingOptions>(DEFAULT_OPTIONS);
  const [mergeProgress, setMergeProgress] = useState(0);
  const [merging, setMerging] = useState(false);
  const [mergeMode, setMergeMode] = useState<"individual" | "group">("individual");
  const [showGroupMergeDialog, setShowGroupMergeDialog] = useState(false);
  const [groupMergeTarget, setGroupMergeTarget] = useState<string>("");

  // Levenshtein distance algorithm for string similarity
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

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
  };

  // Calculate similarity between two strings (0-1 scale) with improved algorithm
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // If strings are the same when case-insensitive, they're 100% similar (automatic merge)
    if (s1 === s2) return 1.0;

    // Substring match - very high similarity for containing relationships
    if (s1.includes(s2) || s2.includes(s1)) {
      // Calculate similarity based on length ratio for substring matches
      const shorter = s1.length < s2.length ? s1 : s2;
      const longer = s1.length < s2.length ? s2 : s1;
      const lengthRatio = shorter.length / longer.length;
      // Base similarity of 85% + up to 10% bonus based on length ratio
      return 0.85 + (lengthRatio * 0.10);
    }

    // Prefix matching bonus
    const commonPrefixLength = getCommonPrefixLength(s1, s2);
    const minLen = Math.min(s1.length, s2.length);
    if (commonPrefixLength > 0 && minLen > 0) {
      const prefixRatio = commonPrefixLength / minLen;
      // If they share a significant prefix, give bonus points
      if (prefixRatio >= 0.5) {
        // Continue with normal calculation but we'll add this as a bonus later
      }
    }

    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;

    const distance = levenshteinDistance(s1, s2);
    let baseSimilarity = 1 - distance / maxLength;

    // Add prefix bonus if applicable
    if (commonPrefixLength > 0 && minLen > 0) {
      const prefixRatio = commonPrefixLength / minLen;
      if (prefixRatio >= 0.5) {
        // Add up to 15% bonus for shared prefixes
        const prefixBonus = prefixRatio * 0.15;
        baseSimilarity = Math.min(1.0, baseSimilarity + prefixBonus);
      }
    }

    return baseSimilarity;
  };

  // Helper function to get common prefix length
  const getCommonPrefixLength = (str1: string, str2: string): number => {
    const minLen = Math.min(str1.length, str2.length);
    let i = 0;
    while (i < minLen && str1[i] === str2[i]) {
      i++;
    }
    return i;
  };

  // Get first word from counterparty name (less aggressive normalization)
  const getFirstWord = (name: string): string => {
    // Clean up but preserve word boundaries better
    const cleaned = name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ') // Replace non-alphanumeric with spaces instead of removing
      .replace(/\s+/g, ' ')
      .trim();

    const words = cleaned.split(' ').filter(word => word.length > 0);
    return words[0] || cleaned;
  };

  // Normalize counterparty name for comparison
  const normalizeName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '') // Remove non-alphanumeric characters
      .replace(/\s+/g, ' ')
      .trim();
  };

  interface BasicMergeCandidate {
    representative: string;
    similar_names: string[];
    similarity_scores: number[];
    total_transactions: number;
    potential_savings: number;
  }

  // Batch processing function to find similar counterparties
  const findSimilarCounterparties = useCallback(async (
    partyStats: CounterpartyStats[],
    opts: ProcessingOptions
  ): Promise<BasicMergeCandidate[]> => {
    const candidates: BasicMergeCandidate[] = [];
    const processed = new Set<string>();

    // Pre-process to find exact case-insensitive matches and group them
    const exactMatches = new Map<string, CounterpartyStats[]>();
    const processedNormalized = new Set<string>();

    for (const party of partyStats) {
      const normalized = party.normalized;
      if (!processedNormalized.has(normalized)) {
        const matchingParties = partyStats.filter(p => p.normalized === normalized);
        if (matchingParties.length > 1) {
          exactMatches.set(normalized, matchingParties);
        }
        processedNormalized.add(normalized);
      }
    }

    // Create candidates for exact case-insensitive matches
    for (const [, matchingParties] of exactMatches) {
      // Sort by transaction count to pick the one with most transactions as representative
      const sorted = [...matchingParties].sort((a, b) => b.count - a.count);
      const representative = sorted[0];
      const similarParties = sorted.slice(1);

      if (representative.count >= opts.minTransactionCount && similarParties.length > 0) {
        const similarNames = similarParties.map(p => p.name);
        const similarityScores = similarNames.map(() => 1.0); // 100% similarity for exact matches
        const totalTransactions = sorted.reduce((sum, p) => sum + p.count, 0);

        candidates.push({
          representative: representative.name,
          similar_names: similarNames,
          similarity_scores: similarityScores,
          total_transactions: totalTransactions,
          potential_savings: similarNames.length,
        });

        // Mark all as processed
        sorted.forEach(p => processed.add(p.name));
      }
    }

    // Group by first word if enabled (more accurate than first character)
    const groups = opts.firstWordFilter
      ? partyStats.reduce((acc, party) => {
          const key = party.firstWord.toUpperCase();
          if (!acc[key]) acc[key] = [];
          acc[key].push(party);
          return acc;
        }, {} as Record<string, CounterpartyStats[]>)
      : { 'ALL': partyStats };

    let totalGroups = Object.keys(groups).length;
    let processedGroups = 0;

    for (const [groupKey, groupParties] of Object.entries(groups)) {
      setProcessingStage(`Processing group "${groupKey}"...`);
      setProcessingProgress((processedGroups / totalGroups) * 100);

      // Sort group by transaction count for efficiency
      const sortedGroup = [...groupParties].sort((a, b) => b.count - a.count);

      for (let i = 0; i < sortedGroup.length; i++) {
        const party1 = sortedGroup[i];

        if (processed.has(party1.name) || party1.count < opts.minTransactionCount) {
          continue;
        }

        const similarNames: string[] = [];
        const similarityScores: number[] = [];
        let totalTransactions = party1.count;

        for (let j = i + 1; j < sortedGroup.length; j++) {
          const party2 = sortedGroup[j];

          if (processed.has(party2.name) || party2.count < opts.minTransactionCount) {
            continue;
          }

          const similarity = calculateSimilarity(party1.normalized, party2.normalized);

          if (similarity >= opts.similarityThreshold) {
            similarNames.push(party2.name);
            similarityScores.push(similarity);
            totalTransactions += party2.count;
            processed.add(party2.name);
          }
        }

        if (similarNames.length > 0) {
          candidates.push({
            representative: party1.name,
            similar_names: similarNames,
            similarity_scores: similarityScores,
            total_transactions: totalTransactions,
            potential_savings: similarNames.length,
          });
        }

        processed.add(party1.name);
      }

      processedGroups++;

      // Small delay to prevent UI freezing
      if (processedGroups % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Sort candidates based on options
    candidates.sort((a, b) => {
      let compareValue = 0;

      switch (opts.sortBy) {
        case "transaction_count":
          compareValue = b.total_transactions - a.total_transactions;
          break;
        case "similarity_score":
          const avgSimA = a.similarity_scores.reduce((sum, score) => sum + score, 0) / a.similarity_scores.length;
          const avgSimB = b.similarity_scores.reduce((sum, score) => sum + score, 0) / b.similarity_scores.length;
          compareValue = avgSimB - avgSimA;
          break;
        case "alphabetical":
          compareValue = a.representative.localeCompare(b.representative);
          break;
      }

      return opts.sortOrder === "asc" ? -compareValue : compareValue;
    });

    return candidates;
  }, []);

  // Fetch entity information for a counterparty name
  const fetchEntitiesForCounterparty = useCallback(async (counterpartyName: string) => {
    try {

      // First, get all entities in the case
      const { data: caseEntities, error: entityError } = await supabase
        .from("case_entities")
        .select(`
          entity_id,
          entities!inner (
            entity_id,
            entity_name,
            entity_type
          )
        `)
        .eq("case_id", caseId);

      if (entityError) throw entityError;

      const entities = caseEntities?.map((ce: any) => ce.entities) || [];

      if (entities.length === 0) {
        return [];
      }

      const entityIds = entities.map(e => e.entity_id);

      // Get accounts for these entities
      const { data: accounts, error: accountError } = await supabase
        .from("accounts")
        .select("account_id, entity_id")
        .in("entity_id", entityIds);

      if (accountError) throw accountError;

      const accountIds = accounts?.map(a => a.account_id) || [];

      if (accountIds.length === 0) {
        return [];
      }

      // Check if any transactions match this counterparty name for these accounts
      const { data: transactions, error: transactionError } = await supabase
        .from("transactions")
        .select("entity_id")
        .in("account_id", accountIds)
        .eq("counterparty_merged", counterpartyName)
        .limit(1);

      if (transactionError) throw transactionError;

      if (!transactions || transactions.length === 0) {
        return [];
      }

      // Return unique entities that have transactions with this counterparty
      const uniqueEntityIds = [...new Set(transactions.map(t => t.entity_id))];
      const matchingEntities = entities.filter(e => uniqueEntityIds.includes(e.entity_id));

      return matchingEntities.map(entity => ({
        entity_id: entity.entity_id,
        entity_name: entity.entity_name,
        entity_type: entity.entity_type,
      }));

    } catch (error) {
      console.error(`Error fetching entities for ${counterpartyName}:`, error);
      return [];
    }
  }, [caseId]);

  // Enhanced batch processing to fetch entity information
  const enhanceCandidatesWithEntityData = useCallback(async (
    candidates: BasicMergeCandidate[],
    partyStats: CounterpartyStats[]
  ): Promise<CounterpartyMergeCandidate[]> => {
    const enhancedCandidates: CounterpartyMergeCandidate[] = [];

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      setProcessingStage(`Fetching entity details for ${candidate.representative}...`);
      setProcessingProgress((i / candidates.length) * 100);

      // Get transaction count for representative
      const representativeStats = partyStats.find(p => p.name === candidate.representative);
      const representativeTransactionCount = representativeStats?.count || 0;

      // Get entities for representative
      const representativeEntities = await fetchEntitiesForCounterparty(candidate.representative);

      // Get details for similar names
      const similarNameDetails: Array<{
        name: string;
        transactionCount: number;
        similarityScore: number;
        linkedEntities: Array<{
          entity_id: string;
          entity_name: string;
          entity_type: string;
        }>;
      }> = [];
      for (let j = 0; j < candidate.similar_names.length; j++) {
        const similarName = candidate.similar_names[j];
        const similarStats = partyStats.find(p => p.name === similarName);
        const transactionCount = similarStats?.count || 0;
        const linkedEntities = await fetchEntitiesForCounterparty(similarName);

        similarNameDetails.push({
          name: similarName,
          transactionCount,
          similarityScore: candidate.similarity_scores[j],
          linkedEntities,
        });
      }

      enhancedCandidates.push({
        ...candidate,
        representativeTransactionCount,
        similarNameDetails,
        // Store representative entities in a way that can be accessed in the UI
        representativeEntities,
      });

      // Small delay to prevent UI freezing
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    return enhancedCandidates;
  }, [fetchEntitiesForCounterparty]);

  // Get entity icon component
  const getEntityIconComponent = (entityType: string) => {
    switch (entityType.toLowerCase()) {
      case "company":
        return <Building2 className="w-3 h-3 inline mr-1" />;
      case "individual":
        return <User className="w-3 h-3 inline mr-1" />;
      case "trust":
        return <Shield className="w-3 h-3 inline mr-1" />;
      default:
        return <Building2 className="w-3 h-3 inline mr-1" />;
    }
  };

  // Load counterparties for the case
  const loadCounterparties = useCallback(async () => {
    if (!caseId) return;

    setLoading(true);
    setProcessingStage("Loading counterparty data...");
    setProcessingProgress(0);

    try {
      const stats = await counterpartyService.getCaseCounterpartyStats(caseId);

      const partyStats: CounterpartyStats[] = stats.map(stat => ({
        name: stat.counterparty_name,
        count: stat.transaction_count,
        firstWord: getFirstWord(stat.counterparty_name),
        firstChar: stat.counterparty_name.charAt(0),
        normalized: normalizeName(stat.counterparty_name),
      }));

      setCounterparties(partyStats);
      setProcessingStage("Finding similar counterparties...");

      // Process in batches to find similar counterparties
      const basicCandidates = await findSimilarCounterparties(partyStats, options);

      setProcessingStage("Fetching entity information...");
      setProcessingProgress(50);

      // Enhance candidates with entity data
      const candidates = await enhanceCandidatesWithEntityData(basicCandidates, partyStats);
      setMergeCandidates(candidates);
      setProcessingProgress(100);

      toast.success(`Found ${candidates.length} merge candidates`);
    } catch (error) {
      console.error("Error loading counterparties:", error);
      toast.error("Failed to load counterparties");
    } finally {
      setLoading(false);
      setProcessingStage("");
    }
  }, [caseId, findSimilarCounterparties, options, enhanceCandidatesWithEntityData]);

  // Toggle candidate selection
  const toggleCandidateSelection = (representative: string) => {
    setSelectedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(representative)) {
        newSet.delete(representative);
      } else {
        newSet.add(representative);
      }
      return newSet;
    });
  };

  // Toggle candidate expansion
  const toggleCandidateExpansion = (representative: string) => {
    setExpandedCandidates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(representative)) {
        newSet.delete(representative);
      } else {
        newSet.add(representative);
      }
      return newSet;
    });
  };

  // Apply selected merges (individual mode)
  const applyIndividualMerges = async () => {
    if (selectedCandidates.size === 0 || !user) {
      toast.error("No candidates selected");
      return;
    }

    setMerging(true);
    setMergeProgress(0);

    const selectedMergeData = mergeCandidates.filter(candidate =>
      selectedCandidates.has(candidate.representative)
    );

    let completedMerges = 0;
    const totalMerges = selectedMergeData.length;

    try {
      for (const candidate of selectedMergeData) {
        const merges = candidate.similar_names.map(name => ({
          from: name,
          to: candidate.representative,
        }));

        const result = await counterpartyService.batchMergeCounterparties(merges, user.id);

        if (result.errors.length > 0) {
          console.error("Merge errors:", result.errors);
          toast.error(`Some merges failed: ${result.errors.join(", ")}`);
        }

        completedMerges++;
        setMergeProgress((completedMerges / totalMerges) * 100);
      }

      toast.success(`Successfully merged ${completedMerges} counterparty groups`);
      setSelectedCandidates(new Set());
      await loadCounterparties(); // Reload data
    } catch (error) {
      console.error("Error applying merges:", error);
      toast.error("Failed to apply some merges");
    } finally {
      setMerging(false);
      setMergeProgress(0);
    }
  };

  // Apply group merge
  const applyGroupMerge = async () => {
    if (selectedCandidates.size < 2 || !user || !groupMergeTarget) {
      toast.error("Please select at least 2 groups and choose a target name");
      return;
    }

    setMerging(true);
    setMergeProgress(0);

    const selectedGroups = mergeCandidates.filter(candidate =>
      selectedCandidates.has(candidate.representative)
    );

    // Collect all names that need to be merged
    const allNamesToMerge: string[] = [];
    selectedGroups.forEach(group => {
      if (group.representative !== groupMergeTarget) {
        allNamesToMerge.push(group.representative);
      }
      group.similar_names.forEach(name => {
        if (name !== groupMergeTarget) {
          allNamesToMerge.push(name);
        }
      });
    });

    const merges = allNamesToMerge.map(name => ({
      from: name,
      to: groupMergeTarget,
    }));

    try {
      const result = await counterpartyService.batchMergeCounterparties(merges, user.id);

      if (result.errors.length > 0) {
        console.error("Merge errors:", result.errors);
        toast.error(`Some merges failed: ${result.errors.join(", ")}`);
      }

      toast.success(`Successfully merged ${selectedGroups.length} groups into "${groupMergeTarget}"`);
      setSelectedCandidates(new Set());
      setShowGroupMergeDialog(false);
      setGroupMergeTarget("");
      await loadCounterparties(); // Reload data
    } catch (error) {
      console.error("Error applying group merge:", error);
      toast.error("Failed to apply group merge");
    } finally {
      setMerging(false);
      setMergeProgress(0);
    }
  };

  // Apply merges based on current mode
  const applyMerges = async () => {
    if (mergeMode === "group") {
      if (selectedCandidates.size >= 2) {
        setShowGroupMergeDialog(true);
      } else {
        toast.error("Please select at least 2 groups to merge together");
      }
    } else {
      await applyIndividualMerges();
    }
  };

  // Filter candidates based on search term
  const filteredCandidates = useMemo(() => {
    if (!searchTerm) return mergeCandidates;

    const term = searchTerm.toLowerCase();
    return mergeCandidates.filter(candidate =>
      candidate.representative.toLowerCase().includes(term) ||
      candidate.similar_names.some(name => name.toLowerCase().includes(term))
    );
  }, [mergeCandidates, searchTerm]);

  // Initial load
  useEffect(() => {
    loadCounterparties();
  }, [loadCounterparties]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Counterparty Merge Analysis</h2>
          <p className="text-muted-foreground">
            Identify and merge similar counterparty names to reduce duplication
          </p>
        </div>
        <Button onClick={loadCounterparties} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
          Refresh Analysis
        </Button>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Analysis Configuration
          </CardTitle>
          <CardDescription>
            Configure the similarity detection parameters and processing options
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="similarityThreshold">Similarity Threshold</Label>
              <Select
                value={options.similarityThreshold.toString()}
                onValueChange={(value) => setOptions(prev => ({ ...prev, similarityThreshold: parseFloat(value) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.9">Very High (90%)</SelectItem>
                  <SelectItem value="0.8">High (80%)</SelectItem>
                  <SelectItem value="0.7">Medium (70%)</SelectItem>
                  <SelectItem value="0.6">Low (60%)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="minTransactionCount">Min Transaction Count</Label>
              <Input
                type="number"
                min="1"
                value={options.minTransactionCount}
                onChange={(e) => setOptions(prev => ({ ...prev, minTransactionCount: parseInt(e.target.value) || 1 }))}
              />
            </div>

            <div>
              <Label htmlFor="sortBy">Sort By</Label>
              <Select
                value={options.sortBy}
                onValueChange={(value: any) => setOptions(prev => ({ ...prev, sortBy: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transaction_count">Transaction Count</SelectItem>
                  <SelectItem value="similarity_score">Similarity Score</SelectItem>
                  <SelectItem value="alphabetical">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="firstWordFilter"
                checked={options.firstWordFilter}
                onChange={(e) => setOptions(prev => ({ ...prev, firstWordFilter: e.target.checked }))}
                className="rounded"
              />
              <Label htmlFor="firstWordFilter">
                Group by first word (recommended for large datasets)
              </Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              {options.firstWordFilter
                ? "Only names with the same first word will be compared (e.g., 'TOPON' vs 'TOPON MEDI')"
                : "All names will be compared against each other (more thorough but slower)"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Processing Progress */}
      {loading && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{processingStage}</span>
                <span className="text-sm text-muted-foreground">{Math.round(processingProgress)}%</span>
              </div>
              <Progress value={processingProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-sm font-medium">Total Counterparties</p>
                <p className="text-2xl font-bold">{counterparties.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Search className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Merge Candidates</p>
                <p className="text-2xl font-bold">{mergeCandidates.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm font-medium">
                  {mergeMode === "group" ? "Selected Groups" : "Selected for Merge"}
                </p>
                <p className="text-2xl font-bold">{selectedCandidates.size}</p>
                {mergeMode === "group" && selectedCandidates.size > 1 && (
                  <p className="text-xs text-green-600 mt-1">
                    Ready to merge together
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-sm font-medium">Potential Reduction</p>
                <p className="text-2xl font-bold">
                  {mergeCandidates.reduce((sum, c) => sum + c.potential_savings, 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Merge Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Merge Mode</CardTitle>
          <CardDescription>
            Choose how you want to merge the selected counterparty groups
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-4">
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="individualMode"
                name="mergeMode"
                checked={mergeMode === "individual"}
                onChange={() => setMergeMode("individual")}
                className="rounded"
              />
              <Label htmlFor="individualMode">
                Individual Merge
                <span className="text-xs text-muted-foreground block ml-1">
                  Merge each selected group separately (similar names → representative)
                </span>
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="radio"
                id="groupMode"
                name="mergeMode"
                checked={mergeMode === "group"}
                onChange={() => setMergeMode("group")}
                className="rounded"
              />
              <Label htmlFor="groupMode">
                Group Merge
                <span className="text-xs text-muted-foreground block ml-1">
                  Merge multiple groups together into a single group
                </span>
              </Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mode-specific hints */}
      {mergeMode === "group" && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-2">
              <div className="text-blue-600 mt-1">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-medium text-blue-900">Group Merge Mode</h4>
                <p className="text-sm text-blue-800 mt-1">
                  Select multiple counterparty groups and merge them all into a single target name.
                  This is useful when you have groups that should be combined together.
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  💡 Select at least 2 groups, then click "Merge Groups Together" to choose a target name.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Group mode selection feedback */}
      {mergeMode === "group" && selectedCandidates.size === 1 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-2">
              <div className="text-amber-600 mt-1">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h4 className="font-medium text-amber-900">Need More Groups</h4>
                <p className="text-sm text-amber-800 mt-1">
                  Please select at least 2 groups to merge them together.
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  Current selection: {selectedCandidates.size} group selected
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="flex space-x-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search counterparty names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button
          onClick={applyMerges}
          disabled={
            merging ||
            selectedCandidates.size === 0 ||
            (mergeMode === "group" && selectedCandidates.size < 2)
          }
          variant="default"
        >
          {merging ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          {mergeMode === "group"
            ? `Merge Groups Together (${selectedCandidates.size})`
            : `Merge Selected (${selectedCandidates.size})`
          }
        </Button>
      </div>

      {/* Merge Progress */}
      {merging && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Applying merges...</span>
                <span className="text-sm text-muted-foreground">{Math.round(mergeProgress)}%</span>
              </div>
              <Progress value={mergeProgress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      <div className="space-y-4">
        {filteredCandidates.map((candidate) => {
          const isSelected = selectedCandidates.has(candidate.representative);
          const isExpanded = expandedCandidates.has(candidate.representative);
          const avgSimilarity = candidate.similarity_scores.reduce((sum, score) => sum + score, 0) / candidate.similarity_scores.length;

          return (
            <Card key={candidate.representative} className={cn(
              "transition-all hover:shadow-md",
              isSelected && "ring-2 ring-blue-500"
            )}>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidateSelection(candidate.representative)}
                        className="rounded"
                      />
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg">{candidate.representative}</h3>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span>{candidate.representativeTransactionCount} transactions</span>
                          <span>•</span>
                          <span>{candidate.similar_names.length + 1} similar names</span>
                          <span>•</span>
                          <span>Avg similarity: {(avgSimilarity * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleCandidateExpansion(candidate.representative)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Similar Names */}
                  {isExpanded && (
                    <div className="space-y-3">
                      <div className="text-sm font-medium">Similar names to be merged:</div>

                      {/* Representative Name Details */}
                      <div className="border-l-2 border-blue-500 pl-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-blue-700">{candidate.representative}</span>
                          <div className="flex items-center space-x-2">
                            <Badge variant="default" className="bg-blue-100 text-blue-800">
                              {candidate.representativeTransactionCount} transactions
                            </Badge>
                            <Badge variant="secondary">
                              Representative
                            </Badge>
                          </div>
                        </div>
                        {candidate.representativeEntities && candidate.representativeEntities.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {candidate.representativeEntities.map((entity, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {getEntityIconComponent(entity.entity_type)}
                                {entity.entity_name}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {(!candidate.representativeEntities || candidate.representativeEntities.length === 0) && (
                          <div className="text-xs text-gray-400 italic">
                            No linked entities found
                          </div>
                        )}
                      </div>

                      {/* Similar Names with Details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {candidate.similarNameDetails.map((detail) => (
                          <div
                            key={detail.name}
                            className="border border-gray-200 rounded-lg p-3 bg-white hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-sm">{detail.name}</span>
                              <div className="flex items-center space-x-2">
                                <Badge variant="outline">
                                  {detail.transactionCount} transactions
                                </Badge>
                                <Badge variant="secondary">
                                  {(detail.similarityScore * 100).toFixed(1)}%
                                </Badge>
                              </div>
                            </div>

                            {/* Linked Entities */}
                            {detail.linkedEntities.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs text-gray-500 font-medium">Linked entities:</div>
                                <div className="flex flex-wrap gap-1">
                                  {detail.linkedEntities.map((entity, idx) => (
                                    <Badge key={idx} variant="outline" className="text-xs">
                                      {getEntityIconComponent(entity.entity_type)}
                                      {entity.entity_name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {detail.linkedEntities.length === 0 && (
                              <div className="text-xs text-gray-400 italic">
                                No linked entities found
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}

        {filteredCandidates.length === 0 && !loading && (
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground">
                {searchTerm ? "No merge candidates found matching your search." : "No merge candidates found with current settings."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Group Merge Dialog */}
      {showGroupMergeDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-xl">Merge Groups Together</CardTitle>
              <CardDescription>
                Select a target name for the merged group
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Selected Groups Summary */}
              <div>
                <h3 className="font-semibold mb-3">Selected Groups ({selectedCandidates.size})</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {mergeCandidates
                    .filter(candidate => selectedCandidates.has(candidate.representative))
                    .map(candidate => (
                      <div key={candidate.representative} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div>
                          <span className="font-medium">{candidate.representative}</span>
                          <span className="text-sm text-muted-foreground ml-2">
                            ({candidate.representativeTransactionCount} transactions, {candidate.similar_names.length + 1} names)
                          </span>
                        </div>
                        <Badge variant="outline">
                          {candidate.similar_names.length + 1} names
                        </Badge>
                      </div>
                    ))}
                </div>
              </div>

              {/* Target Name Selection */}
              <div>
                <Label htmlFor="targetName" className="font-semibold">
                  Target Name (all selected groups will be merged into this name)
                </Label>
                <Select
                  value={groupMergeTarget}
                  onValueChange={setGroupMergeTarget}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select a target name..." />
                  </SelectTrigger>
                  <SelectContent>
                    {mergeCandidates
                      .filter(candidate => selectedCandidates.has(candidate.representative))
                      .map(candidate => (
                        <SelectItem key={candidate.representative} value={candidate.representative}>
                          {candidate.representative}
                          <span className="text-muted-foreground ml-2">
                            ({candidate.representativeTransactionCount} transactions)
                          </span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  Choose which name will be the final representative name for the merged group.
                  All other names will be merged into this one.
                </p>
              </div>

              {/* Preview */}
              {groupMergeTarget && (
                <div className="border rounded-lg p-4 bg-blue-50">
                  <h4 className="font-medium text-blue-900 mb-2">Merge Preview</h4>
                  <p className="text-sm text-blue-800">
                    All names from the selected {selectedCandidates.size} groups will be merged into:
                  </p>
                  <p className="font-semibold text-blue-900 mt-1">"{groupMergeTarget}"</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowGroupMergeDialog(false);
                    setGroupMergeTarget("");
                  }}
                  disabled={merging}
                >
                  Cancel
                </Button>
                <Button
                  onClick={applyGroupMerge}
                  disabled={!groupMergeTarget || merging}
                >
                  {merging ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  Confirm Merge
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
