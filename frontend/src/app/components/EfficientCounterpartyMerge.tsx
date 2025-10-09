"use client";

import { useAuth } from "@/contexts/AuthContext";
import { counterpartyService } from "@/services/database";
import { useCallback, useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Search, Filter, Users, CheckCircle, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface CounterpartyMergeCandidate {
  representative: string;
  similar_names: string[];
  similarity_scores: number[];
  total_transactions: number;
  potential_savings: number;
  entity_ids?: string[];
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

  // Calculate similarity between two strings (0-1 scale)
  const calculateSimilarity = (str1: string, str2: string): number => {
    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // If strings are the same when case-insensitive, they're 100% similar (automatic merge)
    if (s1 === s2) return 1.0;

    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;

    const distance = levenshteinDistance(s1, s2);
    return 1 - distance / maxLength;
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

  // Batch processing function to find similar counterparties
  const findSimilarCounterparties = useCallback(async (
    partyStats: CounterpartyStats[],
    opts: ProcessingOptions
  ): Promise<CounterpartyMergeCandidate[]> => {
    const candidates: CounterpartyMergeCandidate[] = [];
    const processed = new Set<string>();

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
      const candidates = await findSimilarCounterparties(partyStats, options);
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
  }, [caseId, findSimilarCounterparties, options]);

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

  // Apply selected merges
  const applyMerges = async () => {
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
                <p className="text-sm font-medium">Selected for Merge</p>
                <p className="text-2xl font-bold">{selectedCandidates.size}</p>
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
          disabled={selectedCandidates.size === 0 || merging}
          variant="default"
        >
          {merging ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle className="mr-2 h-4 w-4" />
          )}
          Merge Selected ({selectedCandidates.size})
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
                      <div>
                        <h3 className="font-semibold text-lg">{candidate.representative}</h3>
                        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                          <span>{candidate.total_transactions} transactions</span>
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
                    <div className="space-y-2">
                      <div className="text-sm font-medium">Similar names to be merged:</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {candidate.similar_names.map((name, index) => (
                          <div
                            key={name}
                            className="flex items-center justify-between p-2 bg-muted rounded"
                          >
                            <span className="text-sm">{name}</span>
                            <Badge variant="secondary">
                              {(candidate.similarity_scores[index] * 100).toFixed(1)}%
                            </Badge>
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
    </div>
  );
}
