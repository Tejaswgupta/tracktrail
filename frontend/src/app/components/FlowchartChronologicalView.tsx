"use client";

import { useMemo } from "react";
import {
  FLOWCHAIN_ANALYSIS_CAP,
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

interface FlowchartChronologicalViewProps {
  data: FlowchartData;
  timelineEventLimit: number;
  onTimelineEventLimitChange: (value: number) => void;
  minAmountThreshold: number;
}

const MAX_PATHS_PER_NODE = 8;
const MAX_DISPLAY_CHAINS = 10;
const CHAIN_COMPUTATION_CAP = FLOWCHAIN_ANALYSIS_CAP;
const MAX_SEQUENTIAL_RUNS_TO_DISPLAY = 12;

export default function FlowchartChronologicalView({
  data,
  timelineEventLimit,
  onTimelineEventLimitChange,
  minAmountThreshold,
}: FlowchartChronologicalViewProps) {
  const { events, chains, chainComputationCapped } = useMemo(
    () => buildChronologicalArtifacts(data, minAmountThreshold),
    [data, minAmountThreshold]
  );

  const safeTimelineLimit = Number.isFinite(timelineEventLimit)
    ? Math.max(1, timelineEventLimit)
    : 500;
  const visibleEvents = useMemo(
    () => events.slice(0, safeTimelineLimit),
    [events, safeTimelineLimit]
  );
  const sequentialRuns = useMemo(
    () => deriveSequentialRuns(visibleEvents),
    [visibleEvents]
  );
  const displayedRuns = sequentialRuns.slice(0, MAX_SEQUENTIAL_RUNS_TO_DISPLAY);
  const runsCapped = sequentialRuns.length > displayedRuns.length;
  const showingAllEvents = visibleEvents.length === events.length;
  const nextHigherLimit = TIMELINE_EVENT_LIMIT_OPTIONS.find(
    (option) => option > safeTimelineLimit
  );

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
            steps.
          </p>
          {chainComputationCapped ? (
            <p className="mt-1 text-xs text-amber-600">
              For performance we only analysed the most recent{" "}
              {CHAIN_COMPUTATION_CAP.toLocaleString()} transactions. Narrow the
              filters to inspect older sequences.
            </p>
          ) : null}
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

              return (
                <div
                  key={chain.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-medium text-gray-800">
                      {nodeSequence.join(" -> ")}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatCurrency(chain.totalAmount)}
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
                    {isCycle ? (
                      <span className="rounded bg-indigo-100 px-2 py-1 font-medium text-indigo-600">
                        Cycle detected
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 space-y-2">
                    {chain.events.map((event, index) => (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2"
                      >
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
                    ))}
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
            Sequential flow runs
          </h5>
          <p className="text-xs text-gray-500">
            We stitch together consecutive transactions where the recipient
            immediately becomes the next sender. This surfaces direct money hops
            like A {" -> "} B {" -> "} C.
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
                    {run.events.map((event, stepIndex) => (
                      <div
                        key={event.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-3 py-2"
                      >
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
                    ))}
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
            order. Hover to inspect amounts and participants quickly.
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
            {visibleEvents.map((event) => (
              <div key={event.id} className="relative pl-6">
                <span
                  className="absolute left-0 top-1.5 block h-2 w-2 rounded-full bg-blue-500"
                  aria-hidden="true"
                ></span>
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-white px-4 py-2 shadow-sm">
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
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function buildChronologicalArtifacts(
  data: FlowchartData,
  minAmountThreshold: number
) {
  const nodeLookup = new Map(data.nodes.map((node) => [node.id, node]));

  const resolveEndpointId = (
    endpoint: FlowchartData["edges"][number]["source"]
  ): string => {
    if (!endpoint) {
      return "";
    }

    if (typeof endpoint === "string") {
      return endpoint;
    }

    return endpoint.id;
  };

  const parseTimestamp = (value?: string): number | null => {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return null;
    }

    return date.getTime();
  };

  const events: FlowEvent[] = [];

  data.edges.forEach((edge) => {
    const sourceId = resolveEndpointId(edge.source);
    const targetId = resolveEndpointId(edge.target);
    const sourceNode = nodeLookup.get(sourceId);
    const targetNode = nodeLookup.get(targetId);

    if (!sourceId || !targetId || !sourceNode || !targetNode) {
      return;
    }

    (edge.transactions ?? []).forEach((transaction) => {
      if (!transaction.txDate) {
        return;
      }

      events.push({
        id: transaction.transactionId,
        txDate: transaction.txDate,
        timestamp: parseTimestamp(transaction.txDate),
        sourceId,
        targetId,
        sourceLabel: sourceNode.label,
        targetLabel: targetNode.label,
        amount: transaction.amount,
        direction: transaction.direction,
      });
    });
  });

  events.sort((a, b) => {
    if (a.timestamp !== null && b.timestamp !== null) {
      return a.timestamp - b.timestamp;
    }

    if (a.timestamp !== null) {
      return -1;
    }

    if (b.timestamp !== null) {
      return 1;
    }

    return a.txDate.localeCompare(b.txDate);
  });

  const chainComputationCapped = events.length > CHAIN_COMPUTATION_CAP;
  const chainSource = chainComputationCapped
    ? events.slice(-CHAIN_COMPUTATION_CAP)
    : events;
  const chains = deriveFlowChains(chainSource).filter((chain) => {
    if (minAmountThreshold <= 0) {
      return true;
    }

    return chain.totalAmount >= minAmountThreshold;
  });

  return { events, chains, chainComputationCapped };
}

function deriveFlowChains(events: FlowEvent[]): FlowChain[] {
  if (events.length === 0) {
    return [];
  }

  const pathsByEndNode = new Map<string, FlowChain[]>();
  const bestBySignature = new Map<string, FlowChain>();

  events.forEach((event) => {
    const baseChain = createChain([event]);
    const newChains: FlowChain[] = [baseChain];

    const continuations = pathsByEndNode.get(event.sourceId) ?? [];
    continuations.forEach((chain) => {
      const lastEvent = chain.events[chain.events.length - 1];

      if (
        lastEvent.timestamp !== null &&
        event.timestamp !== null &&
        lastEvent.timestamp > event.timestamp
      ) {
        return;
      }

      newChains.push(createChain([...chain.events, event]));
    });

    newChains.forEach((chain) => {
      const endNodeId = chain.events[chain.events.length - 1].targetId;
      const candidateList = pathsByEndNode.get(endNodeId) ?? [];
      candidateList.push(chain);

      const dedup = new Map<string, FlowChain>();
      candidateList.forEach((candidate) => {
        const existing = dedup.get(candidate.signature);
        if (!existing) {
          dedup.set(candidate.signature, candidate);
          return;
        }

        if (prefers(candidate, existing)) {
          dedup.set(candidate.signature, candidate);
        }
      });

      const ranked = Array.from(dedup.values()).sort((a, b) => {
        if (a.totalAmount !== b.totalAmount) {
          return b.totalAmount - a.totalAmount;
        }

        if (a.events.length !== b.events.length) {
          return b.events.length - a.events.length;
        }

        if (a.startDate !== b.startDate) {
          return a.startDate.localeCompare(b.startDate);
        }

        return a.id.localeCompare(b.id);
      });

      pathsByEndNode.set(endNodeId, ranked.slice(0, MAX_PATHS_PER_NODE));
    });

    newChains.forEach((chain) => {
      if (chain.events.length < 2) {
        return;
      }

      const existing = bestBySignature.get(chain.signature);
      if (!existing || prefers(chain, existing)) {
        bestBySignature.set(chain.signature, chain);
      }
    });
  });

  const chains = Array.from(bestBySignature.values());
  chains.sort((a, b) => {
    if (a.totalAmount !== b.totalAmount) {
      return b.totalAmount - a.totalAmount;
    }

    if (a.events.length !== b.events.length) {
      return b.events.length - a.events.length;
    }

    if (a.startDate !== b.startDate) {
      return a.startDate.localeCompare(b.startDate);
    }

    return a.id.localeCompare(b.id);
  });

  return chains.slice(0, MAX_DISPLAY_CHAINS);
}

function deriveSequentialRuns(events: FlowEvent[]): FlowChain[] {
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
    const nonDecreasingTimestamp =
      last.timestamp === null ||
      event.timestamp === null ||
      last.timestamp <= event.timestamp;
    const continuesChain =
      last.targetId === event.sourceId && nonDecreasingTimestamp;

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

function prefers(candidate: FlowChain, incumbent: FlowChain): boolean {
  if (candidate.totalAmount !== incumbent.totalAmount) {
    return candidate.totalAmount > incumbent.totalAmount;
  }

  if (candidate.events.length !== incumbent.events.length) {
    return candidate.events.length > incumbent.events.length;
  }

  if (candidate.startDate !== incumbent.startDate) {
    return candidate.startDate < incumbent.startDate;
  }

  return candidate.id < incumbent.id;
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
