"use client";

import { flowchartChainService } from "@/services/flowchartChainService";
import type {
  BranchNodeSummary as BackendBranchNodeSummary,
  EventBranchMeta as BackendEventBranchMeta,
  FlowChain as BackendFlowChain,
  FlowEvent as BackendFlowEvent,
  HubCandidate as BackendHubCandidate,
} from "@/types/flowchartChain";
import { useEffect, useMemo, useState } from "react";
import {
  FLOWCHAIN_TIME_WINDOW_OPTIONS,
  TIMELINE_EVENT_LIMIT_OPTIONS,
} from "./FlowchartConstants";
import type { FlowchartData } from "./FlowchartTypes";

interface FlowEvent {
  id: string;
  txDate: string;
  timestamp: number | null;
  sourceId: string;
  targetId: string;
  sourceLabel: string;
  targetLabel: string;
  amount: number;
  direction: "DR" | "CR";
}

interface FlowChain {
  id: string;
  events: FlowEvent[];
  startDate: string;
  endDate: string;
  totalAmount: number;
  signature: string;
}

interface EventBranchMeta {
  splitCount: number;
  splitTargetCount: number;
  mergeCount: number;
  mergeSourceCount: number;
}

interface BranchNodeSummary {
  nodeId: string;
  label: string;
  splitPaths: number;
  splitEvents: number;
  mergePaths: number;
  mergeEvents: number;
}

interface HubCandidate {
  nodeId: string;
  label: string;
  chainCount: number;
  passThroughCount: number;
  inboundConnections: number;
  outboundConnections: number;
  totalInflow: number;
  totalOutflow: number;
}

interface EventBadge {
  key: string;
  label: string;
  className: string;
}

interface ChronologicalArtifacts {
  events: FlowEvent[];
  chains: FlowChain[];
  chainComputationCapped: boolean;
  branchMeta: Record<string, EventBranchMeta>;
  branchNodeSummaries: BranchNodeSummary[];
  hubCandidates: HubCandidate[];
  highlightedHubNodeIds: string[];
}

interface FlowchartChronologicalViewProps {
  caseId: string;
  data: FlowchartData;
  selectedEntities: string[];
  dateRange: { from: string | null; to: string | null };
  showInflow: boolean;
  showOutflow: boolean;
  timelineEventLimit: number;
  onTimelineEventLimitChange: (value: number) => void;
  minAmountThreshold: number;
  chainTimeWindowMs: number;
}

const MAX_SEQUENTIAL_RUNS_TO_DISPLAY = 12;

// Converter functions from backend format to frontend format
function convertBackendEvent(event: BackendFlowEvent): FlowEvent {
  return {
    id: event.id,
    txDate: event.txDate,
    timestamp: event.timestamp,
    sourceId: event.sourceId,
    targetId: event.targetId,
    sourceLabel: event.sourceLabel,
    targetLabel: event.targetLabel,
    amount: event.amount,
    direction: event.direction,
  };
}

function convertBackendChain(chain: BackendFlowChain): FlowChain {
  return {
    id: chain.id,
    events: chain.events.map(convertBackendEvent),
    startDate: chain.startDate,
    endDate: chain.endDate,
    totalAmount: chain.totalAmount,
    signature: chain.signature,
  };
}

function convertBackendHub(hub: BackendHubCandidate): HubCandidate {
  return {
    nodeId: hub.nodeId,
    label: hub.label,
    chainCount: hub.chainCount,
    passThroughCount: hub.passThroughCount,
    inboundConnections: hub.inboundConnections,
    outboundConnections: hub.outboundConnections,
    totalInflow: hub.totalInflow,
    totalOutflow: hub.totalOutflow,
  };
}

function convertBackendBranchNode(
  node: BackendBranchNodeSummary
): BranchNodeSummary {
  return {
    nodeId: node.nodeId,
    label: node.label,
    splitPaths: node.splitPaths,
    splitEvents: node.splitEvents,
    mergePaths: node.mergePaths,
    mergeEvents: node.mergeEvents,
  };
}

function convertBackendBranchMeta(
  meta: BackendEventBranchMeta
): EventBranchMeta {
  return {
    splitCount: meta.splitCount,
    splitTargetCount: meta.splitTargetCount,
    mergeCount: meta.mergeCount,
    mergeSourceCount: meta.mergeSourceCount,
  };
}

export default function FlowchartChronologicalView({
  caseId,
  data,
  selectedEntities,
  dateRange,
  showInflow,
  showOutflow,
  timelineEventLimit,
  onTimelineEventLimitChange,
  minAmountThreshold,
  chainTimeWindowMs,
}: FlowchartChronologicalViewProps) {
  const [artifacts, setArtifacts] = useState<ChronologicalArtifacts | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedChains, setExpandedChains] = useState<Set<string>>(new Set());

  // Fetch chain analysis from backend
  useEffect(() => {
    const fetchChainAnalysis = async () => {
      setLoading(true);
      setError(null);

      try {
        const result = await flowchartChainService.analyzeFlowchartChains({
          case_id: caseId,
          entity_ids:
            selectedEntities.length > 0 ? selectedEntities : undefined,
          date_from: dateRange.from || undefined,
          date_to: dateRange.to || undefined,
          min_amount_threshold: minAmountThreshold,
          chain_time_window_ms: chainTimeWindowMs,
          include_inflow: showInflow,
          include_outflow: showOutflow,
        });

        // Convert backend format to frontend format
        const convertedArtifacts: ChronologicalArtifacts = {
          events: result.events.map(convertBackendEvent),
          chains: result.chains.map(convertBackendChain),
          chainComputationCapped: false, // No caps in backend
          branchMeta: Object.fromEntries(
            Object.entries(result.branch_meta).map(([id, meta]) => [
              id,
              convertBackendBranchMeta(meta as BackendEventBranchMeta),
            ])
          ),
          branchNodeSummaries: result.branch_nodes.map(
            convertBackendBranchNode
          ),
          hubCandidates: result.hub_candidates.map(convertBackendHub),
          highlightedHubNodeIds: result.highlighted_hub_node_ids,
        };

        setArtifacts(convertedArtifacts);
      } catch (err) {
        console.error("Failed to fetch chain analysis:", err);
        setError(
          err instanceof Error ? err.message : "Failed to analyze chains"
        );
      } finally {
        setLoading(false);
      }
    };

    fetchChainAnalysis();
  }, [
    caseId,
    selectedEntities,
    dateRange.from,
    dateRange.to,
    minAmountThreshold,
    chainTimeWindowMs,
    showInflow,
    showOutflow,
  ]);

  const events = artifacts?.events ?? [];
  const chains = artifacts?.chains ?? [];
  const chainComputationCapped = artifacts?.chainComputationCapped ?? false;
  const branchMeta = artifacts?.branchMeta ?? {};
  const branchNodeSummaries = artifacts?.branchNodeSummaries ?? [];
  const hubCandidates = artifacts?.hubCandidates ?? [];
  const highlightedHubNodeIds = artifacts?.highlightedHubNodeIds ?? [];

  const hubHighlightSet = useMemo(
    () => new Set(highlightedHubNodeIds),
    [highlightedHubNodeIds]
  );

  const timeWindowLabel = useMemo(() => {
    const preset = FLOWCHAIN_TIME_WINDOW_OPTIONS.find(
      (option) => option.value === chainTimeWindowMs
    );
    if (preset) {
      return preset.label;
    }
    return formatTimeWindowLabel(chainTimeWindowMs);
  }, [chainTimeWindowMs]);

  const safeTimelineLimit = Number.isFinite(timelineEventLimit)
    ? Math.max(1, timelineEventLimit)
    : 500;
  const visibleEvents = useMemo(
    () => events.slice(0, safeTimelineLimit),
    [events, safeTimelineLimit]
  );
  const sequentialRuns = useMemo(
    () => deriveSequentialRuns(visibleEvents, chainTimeWindowMs),
    [visibleEvents, chainTimeWindowMs]
  );
  const displayedRuns = sequentialRuns.slice(0, MAX_SEQUENTIAL_RUNS_TO_DISPLAY);
  const runsCapped = sequentialRuns.length > displayedRuns.length;
  const showingAllEvents = visibleEvents.length === events.length;
  const nextHigherLimit = TIMELINE_EVENT_LIMIT_OPTIONS.find(
    (option) => option > safeTimelineLimit
  );
  const displayedHubCandidates = hubCandidates.slice(0, 6);
  const displayedBranchNodes = branchNodeSummaries.slice(0, 8);

  const toggleChainExpansion = (chainId: string) => {
    setExpandedChains((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(chainId)) {
        newSet.delete(chainId);
      } else {
        newSet.add(chainId);
      }
      return newSet;
    });
  };

  
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm font-medium text-gray-600">
            Analyzing transaction chains...
          </p>
          <p className="mt-1 text-xs text-gray-500">
            This may take a moment for large datasets
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-red-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Failed to analyze chains
            </h3>
            <p className="mt-1 text-sm text-red-700">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50">
        <div className="text-center">
          <p className="text-sm font-medium text-gray-600">
            No chronological data available
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Upload more transactions or relax the filters to see sequences.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">
            Longest chronological chains
          </h5>
          <p className="text-xs text-gray-500">
            Chains show how funds hop between counterparties over time. We
            surface the top sequences ordered by total value moved and number of
            steps, enforcing a maximum gap of {timeWindowLabel} between linked
            transactions. Analysis is performed server-side for optimal
            performance.
          </p>
        </div>
        {chains.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
            Not enough sequential transactions to construct multi-step chains
            yet.
          </div>
        ) : (
          <div className="space-y-4">
            {chains.map((chain) => {
              const nodeSequence = buildNodeSequence(chain);
              const isCycle =
                chain.events[0]?.sourceId ===
                chain.events[chain.events.length - 1]?.targetId;
              const isExpanded = expandedChains.has(chain.id);

              return (
                <div
                  key={chain.id}
                  className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden"
                >
                  <button
                    onClick={() => toggleChainExpansion(chain.id)}
                    className="w-full p-4 text-left hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <svg
                          className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                            isExpanded ? "rotate-90" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                        <div className="text-sm font-medium text-gray-800 truncate">
                          {nodeSequence.join(" -> ")}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        {isCycle ? (
                          <span className="rounded bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-600">
                            Cycle detected
                          </span>
                        ) : null}
                        <div className="text-sm font-semibold text-gray-900">
                          {formatCurrency(chain.totalAmount)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>Steps: {chain.events.length}</span>
                      <span>|</span>
                      <span>
                        Span: {formatDate(chain.startDate)}
                        {" -> "}
                        {formatDate(chain.endDate)}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50/50 p-4">
                      <div className="space-y-2">
                        {chain.events.map((event, index) => {
                          const eventBadges = buildEventBadges(
                            event,
                            branchMeta,
                            hubHighlightSet
                          );

                          return (
                            <div
                              key={event.id}
                              className="rounded border border-gray-100 bg-white px-3 py-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-col">
                                  <span className="text-xs text-gray-500">
                                    {formatDateTime(event.txDate)}
                                  </span>
                                  <span className="text-sm font-medium text-gray-800">
                                    {index + 1}. {event.sourceLabel}
                                    {" -> "}
                                    {event.targetLabel}
                                  </span>
                                </div>
                                <div className="text-sm font-semibold text-gray-900">
                                  {formatCurrency(event.amount)}
                                </div>
                              </div>
                              {eventBadges.length > 0 ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                                  {eventBadges.map((badge) => (
                                    <span
                                      key={badge.key}
                                      className={`inline-flex items-center rounded px-2 py-0.5 ${badge.className}`}
                                    >
                                      {badge.label}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">
            Potential hub intermediaries
          </h5>
          <p className="text-xs text-gray-500">
            Nodes that repeatedly pass funds onwards within the{" "}
            {timeWindowLabel} window. Use these to spot conduits worth deeper
            diligence.
          </p>
        </div>
        {displayedHubCandidates.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No recurring intermediaries detected in the current chain selection.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {displayedHubCandidates.map((candidate) => (
              <div
                key={candidate.nodeId}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {candidate.label}
                  </span>
                  {hubHighlightSet.has(candidate.nodeId) ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Flagged hub
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-gray-600">
                  <span>Chains: {candidate.chainCount}</span>
                  <span>Pass-through hits: {candidate.passThroughCount}</span>
                  <span>Inbound sources: {candidate.inboundConnections}</span>
                  <span>Outbound targets: {candidate.outboundConnections}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">
            Branching hotspots
          </h5>
          <p className="text-xs text-gray-500">
            Where funds split to multiple recipients or converge from several
            senders within the same {timeWindowLabel} gap.
          </p>
        </div>
        {displayedBranchNodes.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No significant branching detected across the analysed sequences.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {displayedBranchNodes.map((node) => (
              <div
                key={node.nodeId}
                className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {node.label}
                  </span>
                  {hubHighlightSet.has(node.nodeId) ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                      Hub overlap
                    </span>
                  ) : null}
                </div>
                <div className="mt-3 space-y-1 text-xs text-gray-600">
                  {node.splitPaths > 0 ? (
                    <p>
                      Splits to {node.splitPaths} counterparties across{" "}
                      {node.splitEvents} hand-offs.
                    </p>
                  ) : null}
                  {node.mergePaths > 0 ? (
                    <p>
                      Converges from {node.mergePaths} sources across{" "}
                      {node.mergeEvents} receipts.
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">
            Sequential flow runs
          </h5>
          <p className="text-xs text-gray-500">
            We stitch together consecutive transactions where the recipient
            immediately becomes the next sender within the {timeWindowLabel}
            tolerance. This surfaces direct money hops like A {" -> "} B{" "}
            {" -> "}
            C.
          </p>
          {runsCapped ? (
            <p className="mt-1 text-xs text-amber-600">
              Showing the first {MAX_SEQUENTIAL_RUNS_TO_DISPLAY} runs from the
              loaded timeline slice.
            </p>
          ) : null}
        </div>
        {displayedRuns.length === 0 ? (
          <div className="rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-600">
            No back-to-back flows detected in this slice. Increase the event
            limit or relax filters to expose longer runs.
          </div>
        ) : (
          <div className="space-y-4">
            {displayedRuns.map((run, index) => {
              const nodeSequence = buildNodeSequence(run);

              return (
                <div
                  key={`${run.signature}-${index}`}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-800">
                      {nodeSequence.join(" -> ")}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(run.totalAmount)}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span>Steps: {run.events.length}</span>
                    <span>|</span>
                    <span>
                      Window: {formatDateTime(run.startDate)}
                      {" -> "}
                      {formatDateTime(run.endDate)}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {run.events.map((event, stepIndex) => {
                      const eventBadges = buildEventBadges(
                        event,
                        branchMeta,
                        hubHighlightSet
                      );

                      return (
                        <div
                          key={event.id}
                          className="rounded border border-gray-100 bg-gray-50 px-3 py-2"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-500">
                                {formatDateTime(event.txDate)}
                              </span>
                              <span className="text-sm font-medium text-gray-800">
                                {stepIndex + 1}. {event.sourceLabel}
                                {" -> "}
                                {event.targetLabel}
                              </span>
                            </div>
                            <div className="text-sm font-semibold text-gray-900">
                              {formatCurrency(event.amount)}
                            </div>
                          </div>
                          {eventBadges.length > 0 ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                              {eventBadges.map((badge) => (
                                <span
                                  key={badge.key}
                                  className={`inline-flex items-center rounded px-2 py-0.5 ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h5 className="text-sm font-semibold text-gray-900">
            Transaction timeline
          </h5>
          <p className="text-xs text-gray-500">
            Every transaction that passed the filters is listed in chronological
            order. Hover to inspect amounts and participants quickly—badges flag
            hubs and branching behaviour.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            <span className="text-gray-600">
              Showing {visibleEvents.length.toLocaleString()} of{" "}
              {events.length.toLocaleString()} transactions
            </span>
            {!showingAllEvents && nextHigherLimit ? (
              <button
                type="button"
                className="rounded border border-blue-200 px-2 py-1 font-medium text-blue-600 hover:border-blue-300 hover:text-blue-700"
                onClick={() => onTimelineEventLimitChange(nextHigherLimit)}
              >
                Load up to {nextHigherLimit.toLocaleString()}
              </button>
            ) : null}
            {!showingAllEvents && !nextHigherLimit ? (
              <button
                type="button"
                className="rounded border border-blue-200 px-2 py-1 font-medium text-blue-600 hover:border-blue-300 hover:text-blue-700"
                onClick={() => onTimelineEventLimitChange(events.length)}
              >
                Show all
              </button>
            ) : null}
            {showingAllEvents &&
            events.length > TIMELINE_EVENT_LIMIT_OPTIONS[0] ? (
              <span className="rounded bg-emerald-100 px-2 py-1 font-medium text-emerald-700">
                All events loaded
              </span>
            ) : null}
          </div>
        </div>
        <div className="relative pl-4">
          <div
            className="absolute left-1 top-2 bottom-4 w-px bg-gray-200"
            aria-hidden="true"
          ></div>
          <div className="space-y-4">
            {visibleEvents.map((event) => {
              const badges = buildEventBadges(
                event,
                branchMeta,
                hubHighlightSet
              );

              return (
                <div key={event.id} className="relative pl-6">
                  <span
                    className="absolute left-0 top-1.5 block h-2 w-2 rounded-full bg-blue-500"
                    aria-hidden="true"
                  ></span>
                  <div className="rounded-lg border border-gray-100 bg-white px-4 py-2 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-gray-500">
                          {formatDateTime(event.txDate)}
                        </p>
                        <p className="text-sm font-medium text-gray-800">
                          {event.sourceLabel}
                          {" -> "}
                          {event.targetLabel}
                        </p>
                      </div>
                      <div className="text-sm font-semibold text-gray-900">
                        {formatCurrency(event.amount)}
                      </div>
                    </div>
                    {badges.length > 0 ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-medium">
                        {badges.map((badge) => (
                          <span
                            key={badge.key}
                            className={`inline-flex items-center rounded px-2 py-0.5 ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

// Helper functions

function formatTimeWindowLabel(value: number): string {
  if (!Number.isFinite(value)) {
    return "No limit";
  }

  if (value <= 0) {
    return "Immediate";
  }

  const minutes = Math.round(value / (60 * 1000));
  const minutesPerDay = 24 * 60;

  if (minutes % minutesPerDay === 0) {
    const days = Math.round(minutes / minutesPerDay);
    return `${days} day${days === 1 ? "" : "s"}`;
  }

  if (minutes % 60 === 0) {
    const hours = Math.round(minutes / 60);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }

  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function buildEventBadges(
  event: FlowEvent,
  branchMeta: Record<string, EventBranchMeta>,
  hubHighlightSet: Set<string>
): EventBadge[] {
  const badges: EventBadge[] = [];
  const seen = new Set<string>();
  const pushBadge = (badge: EventBadge) => {
    if (seen.has(badge.label)) {
      return;
    }
    seen.add(badge.label);
    badges.push(badge);
  };

  const meta = branchMeta[event.id];

  if (hubHighlightSet.has(event.targetId)) {
    pushBadge({
      key: `${event.id}-hub-target`,
      label: `Hub candidate: ${event.targetLabel}`,
      className: "bg-amber-100 text-amber-700",
    });
  }

  if (
    hubHighlightSet.has(event.sourceId) &&
    event.sourceId !== event.targetId
  ) {
    pushBadge({
      key: `${event.id}-hub-source`,
      label: `Hub candidate: ${event.sourceLabel}`,
      className: "bg-amber-100 text-amber-700",
    });
  }

  if (meta?.splitTargetCount && meta.splitTargetCount > 1) {
    pushBadge({
      key: `${event.id}-split`,
      label: `Splits at ${event.targetLabel} (${meta.splitTargetCount})`,
      className: "bg-indigo-100 text-indigo-700",
    });
  }

  if (meta?.mergeSourceCount && meta.mergeSourceCount > 1) {
    pushBadge({
      key: `${event.id}-merge`,
      label: `Converges at ${event.sourceLabel} (${meta.mergeSourceCount})`,
      className: "bg-sky-100 text-sky-700",
    });
  }

  return badges;
}

function buildNodeSequence(chain: FlowChain): string[] {
  if (chain.events.length === 0) {
    return [];
  }

  const labels = [chain.events[0].sourceLabel];
  chain.events.forEach((event) => {
    labels.push(event.targetLabel);
  });
  return labels;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsed);
}

function formatDateTime(value: string) {
  const parsed = parseDate(value);
  if (!parsed) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

function parseDate(value?: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function deriveSequentialRuns(
  events: FlowEvent[],
  maxGapMs: number
): FlowChain[] {
  if (events.length === 0) {
    return [];
  }

  const runs: FlowChain[] = [];
  let buffer: FlowEvent[] = [];

  const flushBuffer = () => {
    if (buffer.length >= 2) {
      runs.push(createChain(buffer));
    }
    buffer = [];
  };

  events.forEach((event) => {
    if (buffer.length === 0) {
      buffer.push(event);
      return;
    }

    const last = buffer[buffer.length - 1];
    const continuesChain = canChainEvents(last, event, maxGapMs);

    if (continuesChain) {
      buffer.push(event);
      return;
    }

    flushBuffer();
    buffer.push(event);
  });

  flushBuffer();

  return runs;
}

function canChainEvents(
  previous: FlowEvent,
  next_event: FlowEvent,
  maxGapMs: number
): boolean {
  if (previous.targetId !== next_event.sourceId) {
    return false;
  }

  if (previous.timestamp !== null && next_event.timestamp !== null) {
    if (next_event.timestamp < previous.timestamp) {
      return false;
    }

    if (
      Number.isFinite(maxGapMs) &&
      maxGapMs >= 0 &&
      next_event.timestamp - previous.timestamp > maxGapMs
    ) {
      return false;
    }
  }

  return true;
}

function createChain(events: FlowEvent[]): FlowChain {
  const start = events[0];
  const end = events[events.length - 1];
  const totalAmount = events.reduce((sum, event) => sum + event.amount, 0);
  const signature = buildSignature(events);

  return {
    id: signature,
    events,
    startDate: start.txDate,
    endDate: end.txDate,
    totalAmount,
    signature,
  };
}

function buildSignature(events: FlowEvent[]): string {
  const first = events[0];
  const last = events[events.length - 1];
  const nodeSequence = [
    first.sourceId,
    ...events.map((event) => event.targetId),
  ].join("->");

  return `${nodeSequence}|${first.txDate}|${last.txDate}`;
}
