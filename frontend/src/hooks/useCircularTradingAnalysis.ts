import { amlBackendClient } from "@/services/amlBackendClient";
import { useCallback, useState } from "react";
import axios from "axios";

export interface CircularTradingNode {
  id: string;
  name: string;
  mergedName?: string;
  totalCredit: number;
  totalDebit: number;
  transactionCount: number;
  riskScore: number;
  centrality: {
    betweenness: number;
    pagerank: number;
    degree: number;
  };
}

export interface CircularTradingEdge {
  source: string;
  target: string;
  amount: number;
  transactionType: 'credit' | 'debit';
  transactionCount: number;
  cycleId?: string;
  transactions: Array<{
    transaction_id: string;
    amount: number;
    date: string;
    description: string;
  }>;
}

export interface CircularTradingCycle {
  path: string[];
  cycleId: string;
  totalAmount: number;
  netFlow: number;
  durationDays: number;
  confidenceScore: number;
  cycleType: 'simple' | 'complex' | 'hub-mediated';
  cycleLength: number;
  transactions: any[];
}

export interface CircularTradingResult {
  nodes: CircularTradingNode[];
  edges: CircularTradingEdge[];
  cycles: CircularTradingCycle[];
  summary: {
    totalCycles: number;
    totalEntities: number;
    totalAmount: number;
    highRiskCycles: number;
    hubEntities: string[];
  };
  networkStatistics: {
    density: number;
    clustering: number;
    reciprocity: number;
  };
}

// Helper functions for safe data handling
function getNumeric(value: any, defaultValue: number = 0): number {
  const num = parseFloat(value);
  return isNaN(num) ? defaultValue : num;
}

function safeArray<T>(arr: any): T[] {
  return Array.isArray(arr) ? arr : [];
}

function safeStringArray(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(item => String(item || ''));
}

function normalizeDate(dateStr: any): string {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return new Date().toISOString().split('T')[0];
    return date.toISOString().split('T')[0];
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

async function fetchEntityMappings(entityIds: string[]): Promise<Record<string, string>> {
  try {
    const { data } = await axios.get('/api/v1/entity-merging', { params: { entity_ids: entityIds } });
    return data.mappings ?? {};
  } catch {
    return {}; // fallback if endpoint doesn't exist yet
  }
}

export function useCircularTradingAnalysis() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CircularTradingResult | null>(null);

  const analyzeCircularTrading = useCallback(async (
    entityIds: string[],
    parameters?: {
      minLength?: number;
      maxLength?: number;
      minAmount?: number;
      maxDurationDays?: number;
      netFlowThreshold?: number;
    }
  ) => {
    try {
      setLoading(true);
      setError(null);

      // Validate input
      if (!entityIds || entityIds.length === 0) {
        throw new Error('At least one entity ID is required');
      }

      const payload = {
        entity_ids: entityIds,
        max_cycle_length: Math.min(parameters?.maxLength ?? 10, 10),
        min_amount_threshold: Math.max(parameters?.minAmount ?? 1000, 0),
        // fixed to 168 hours
        time_window_hours: 168,
        net_flow_threshold: parameters?.netFlowThreshold ?? 0.1,
        entity_mappings: await fetchEntityMappings(entityIds),
      };

      console.log('Payload', JSON.stringify(payload, null, 2)); // ← keep this line for now
      const response = await amlBackendClient.analyzeCycles(payload);
      console.log('Backend response:', response);

      // Validate response structure
      if (!response || typeof response !== 'object') {
        throw new Error('Invalid response from backend');
      }

      // Check for success
      if (response.success === false) {
        throw new Error(response.message || 'Analysis failed');
      }

      // Transform and set result
      const transformedResult = transformBackendResponse(response.data, entityIds);
      setResult(transformedResult);

    } catch (err: any) {
      console.error('Circular trading analysis error:', err);
      
      let errorMessage = 'Failed to analyze circular trading';
      
      if (err.code) {
        errorMessage = err.message;
      } else if (err.response?.data?.message) {
        errorMessage = err.response.data.message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    result,
    analyzeCircularTrading,
    clearResult: () => setResult(null),
    clearError: () => setError(null),
  };
}

function transformBackendResponse(backendData: any, entityIds: string[]): CircularTradingResult {
  console.log('Transforming backend response data:', backendData);

  // Handle null or undefined response
  if (!backendData?.results) {
    console.warn('Backend data missing results structure');
    return createEmptyResult(entityIds);
  }

  const roundTrips = safeArray(backendData.results.round_trips);
  const networkCycles = safeArray(backendData.results.detected_cycles);
  const isMultiEntity = entityIds.length > 1;

  console.log(`Processing ${roundTrips.length} round trips and ${networkCycles.length} network cycles`);

  let cycles: CircularTradingCycle[] = [];

  try {
    if (isMultiEntity && networkCycles.length > 0) {
      // Multi-entity network cycle detection
      cycles = networkCycles.map((cycle: any, index: number) => {
        const path = safeStringArray(cycle.path);
        return {
          path,
          cycleId: `network_cycle_${index + 1}`,
          totalAmount: getNumeric(cycle.total_amount),
          netFlow: getNumeric(cycle.net_flow),
          durationDays: getNumeric(cycle.duration_days),
          confidenceScore: getNumeric(cycle.confidence_score),
          cycleType: determineCycleType(cycle),
          cycleLength: getNumeric(cycle.cycle_length, path.length),
          transactions: safeArray(cycle.transactions),
        };
      });
    } else if (roundTrips.length > 0) {
      // Single entity round trip detection
      cycles = roundTrips.map((trip: any, index: number) => {
        const outgoingAmount = getNumeric(trip.outgoing_amount);
        const incomingAmount = getNumeric(trip.incoming_amount);
        const daysGap = getNumeric(trip.days_gap);
        const amountDiffPercent = getNumeric(trip.amount_difference_percent);
        
        const counterparty = String(trip.counterparty || `Unknown_${index}`);
        const outgoingDate = normalizeDate(trip.outgoing_date);
        const incomingDate = normalizeDate(trip.incoming_date);
        
        return {
          path: [entityIds[0], counterparty, entityIds[0]],
          cycleId: `round_trip_${index + 1}`,
          totalAmount: Math.max(outgoingAmount, incomingAmount),
          netFlow: incomingAmount - outgoingAmount,
          durationDays: daysGap,
          confidenceScore: amountDiffPercent === 0 ? 1.0 : Math.max(0, 1 - (amountDiffPercent / 100)),
          cycleType: 'simple' as const,
          cycleLength: 2,
          transactions: [
            {
              transaction_id: `out_${index}`,
              amount: -outgoingAmount,
              date: outgoingDate,
              description: `Payment to ${counterparty}`,
            },
            {
              transaction_id: `in_${index}`,
              amount: incomingAmount,
              date: incomingDate,
              description: `Receipt from ${counterparty}`,
            }
          ],
        };
      });
    }

    console.log(`Successfully transformed ${cycles.length} cycles`);
  } catch (transformError) {
    console.error('Error transforming cycles:', transformError);
    cycles = [];
  }

  // Build nodes
  const nodeMap = new Map<string, CircularTradingNode>();

  // Add primary entities
  entityIds.forEach((entityId, index) => {
    const entityCredits = roundTrips.reduce((sum: number, trip: any) => 
      sum + getNumeric(trip.incoming_amount), 0);
    const entityDebits = roundTrips.reduce((sum: number, trip: any) => 
      sum + getNumeric(trip.outgoing_amount), 0);
    const uniqueCounterparties = new Set(
      roundTrips.map((t: any) => t.counterparty).filter(Boolean)
    ).size;

    nodeMap.set(entityId, {
      id: entityId,
      name: `Entity ${index + 1}`,
      mergedName: entityId,
      totalCredit: entityCredits,
      totalDebit: entityDebits,
      transactionCount: roundTrips.length * 2,
      riskScore: roundTrips.length > 0 ? 0.8 : 0.1,
      centrality: {
        betweenness: 0.5,
        pagerank: 0.6,
        degree: uniqueCounterparties,
      },
    });
  });

  // Add counterparty nodes
  const counterparties = new Set<string>();
  roundTrips.forEach((trip: any) => {
    const counterparty = String(trip.counterparty || '').trim();
    if (counterparty && counterparty !== 'undefined' && counterparty !== 'null' && counterparty !== '') {
      counterparties.add(counterparty);
    }
  });

  counterparties.forEach((counterparty) => {
    if (!nodeMap.has(counterparty)) {
      const relatedTrips = roundTrips.filter((t: any) => 
        String(t.counterparty || '').trim() === counterparty);
      
      const counterpartyCredits = relatedTrips.reduce((sum: number, trip: any) => 
        sum + getNumeric(trip.outgoing_amount), 0);
      const counterpartyDebits = relatedTrips.reduce((sum: number, trip: any) => 
        sum + getNumeric(trip.incoming_amount), 0);
      
      nodeMap.set(counterparty, {
        id: counterparty,
        name: counterparty,
        mergedName: counterparty,
        totalCredit: counterpartyCredits,
        totalDebit: counterpartyDebits,
        transactionCount: relatedTrips.length * 2,
        riskScore: 0.7,
        centrality: {
          betweenness: 0.3,
          pagerank: 0.4,
          degree: relatedTrips.length,
        },
      });
    }
  });

  // Build edges
  const edges: CircularTradingEdge[] = [];
  
  try {
    cycles.forEach((cycle) => {
      const path = cycle.path;
      if (!Array.isArray(path) || path.length < 2) return;

      for (let i = 0; i < path.length - 1; i++) {
        const source = String(path[i] || '');
        const target = String(path[i + 1] || '');
        
        if (!source || !target) continue;

        const isCredit = i % 2 === 1;
        const amount = cycle.totalAmount > 0 && path.length > 1 ? 
                      cycle.totalAmount / (path.length - 1) : 100;
        
        edges.push({
          source,
          target,
          amount: Math.abs(amount),
          transactionType: isCredit ? 'credit' : 'debit',
          transactionCount: 1,
          cycleId: cycle.cycleId,
          transactions: [{
            transaction_id: `${cycle.cycleId}_${i}`,
            amount: isCredit ? amount : -amount,
            date: normalizeDate(null),
            description: `${isCredit ? 'Receipt from' : 'Payment to'} ${target}`,
          }],
        });
      }
    });

    console.log(`Successfully built ${edges.length} edges`);
  } catch (edgeError) {
    console.error('Error building edges:', edgeError);
  }

  const totalAmount = cycles.reduce((sum, c) => sum + getNumeric(c.totalAmount), 0);
  const highRiskCycles = cycles.filter(c => getNumeric(c.confidenceScore) > 0.7).length;

  const result: CircularTradingResult = {
    nodes: Array.from(nodeMap.values()),
    edges,
    cycles,
    summary: {
      totalCycles: cycles.length,
      totalEntities: entityIds.length,
      totalAmount,
      highRiskCycles,
      hubEntities: Array.from(counterparties).slice(0, 10),
    },
    networkStatistics: {
      density: nodeMap.size > 1 ? (edges.length / (nodeMap.size * (nodeMap.size - 1))) : 0,
      clustering: getNumeric(backendData.results?.network_statistics?.clustering),
      reciprocity: getNumeric(backendData.results?.network_statistics?.reciprocity, cycles.length > 0 ? 1.0 : 0),
    },
  };

  console.log('Transformation complete:', {
    nodes: result.nodes.length,
    edges: result.edges.length,
    cycles: result.cycles.length
  });

  return result;
}

function createEmptyResult(entityIds: string[]): CircularTradingResult {
  return {
    nodes: [],
    edges: [],
    cycles: [],
    summary: {
      totalCycles: 0,
      totalEntities: entityIds.length,
      totalAmount: 0,
      highRiskCycles: 0,
      hubEntities: [],
    },
    networkStatistics: {
      density: 0,
      clustering: 0,
      reciprocity: 0,
    },
  };
}

function determineCycleType(cycle: any): 'simple' | 'complex' | 'hub-mediated' {
  if (!cycle) return 'simple';
  
  if (cycle.cycle_type === 'hub_mediated') return 'hub-mediated';
  
  const pathLength = Array.isArray(cycle.path) ? cycle.path.length : 0;
  if (pathLength > 3) return 'complex';
  
  return 'simple';
}
