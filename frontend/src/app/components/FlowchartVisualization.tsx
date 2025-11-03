"use client";

import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";

interface FlowchartNode extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type: "entity" | "counterparty";
  totalInflow: number;
  totalOutflow: number;
  netFlow: number;
  transactionCount: number;
  riskScore?: number;
  entityId?: string;
}

interface FlowchartEdge {
  source: string | FlowchartNode;
  target: string | FlowchartNode;
  amount: number;
  transactionCount: number;
  direction: "inflow" | "outflow";
}

interface FlowchartData {
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  summary: {
    totalEntities: number;
    totalCounterparties: number;
    totalVolume: number;
    totalTransactions: number;
  };
}

interface FlowchartVisualizationProps {
  data: FlowchartData;
  nodeSizing: "count" | "volume";
}

export default function FlowchartVisualization({
  data,
  nodeSizing,
}: FlowchartVisualizationProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 600 });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current?.parentElement) {
        const { width } = svgRef.current.parentElement.getBoundingClientRect();
        setDimensions({ width, height: 600 });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    if (!svgRef.current || !data || data.nodes.length === 0) return;

    // Clear previous graph
    d3.select(svgRef.current).selectAll("*").remove();

    const { width, height } = dimensions;

    const resolveEndpointId = (endpoint: FlowchartEdge["source"]): string =>
      typeof endpoint === "string" ? endpoint : endpoint?.id ?? "";

    // Clone inbound data so D3 mutations stay isolated to this render cycle.
    const nodesData = data.nodes.map((node) => ({ ...node }));
    const edgesData = data.edges
      .map((edge) => ({
        ...edge,
        source: resolveEndpointId(edge.source),
        target: resolveEndpointId(edge.target),
      }))
      .filter((edge) => edge.source && edge.target);

    const nodeById = new Map(nodesData.map((node) => [node.id, node]));

    // Create SVG
    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", [0, 0, width, height])
      .attr("style", "max-width: 100%; height: auto;");

    // Create zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom as any);

    // Create container for zoomable content
    const container = svg.append("g");

    // Create simulation
    const simulation = d3
      .forceSimulation<FlowchartNode>(nodesData)
      .force(
        "link",
        d3
          .forceLink<FlowchartNode, FlowchartEdge>(edgesData as FlowchartEdge[])
          .id((d) => d.id)
          .distance(150)
          .strength(0.5)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50));

    // Calculate node radius based on sizing metric
    const getNodeRadius = (node: FlowchartNode) => {
      const metricValue =
        nodeSizing === "volume"
          ? node.totalInflow + node.totalOutflow
          : node.transactionCount;

      // Scale radius between 20 and 60
      const maxValue = Math.max(
        ...nodesData.map((n) =>
          nodeSizing === "volume"
            ? n.totalInflow + n.totalOutflow
            : n.transactionCount
        ),
        0
      );
      if (maxValue === 0) {
        return 20;
      }
      return 20 + (metricValue / maxValue) * 40;
    };

    // Calculate node color based on net flow
    const getNodeColor = (node: FlowchartNode) => {
      if (node.netFlow > 0) return "#10B981"; // Green for net inflow
      if (node.netFlow < 0) return "#EF4444"; // Red for net outflow
      return "#3B82F6"; // Blue for neutral
    };

    // Calculate edge color based on direction
    const getEdgeColor = (edge: FlowchartEdge) => {
      return edge.direction === "inflow" ? "#10B981" : "#EF4444";
    };

    // Calculate edge width based on amount
    const getEdgeWidth = (edge: FlowchartEdge) => {
      const maxAmount = Math.max(...edgesData.map((e) => e.amount), 0);
      if (maxAmount === 0) {
        return 1;
      }
      return 1 + (edge.amount / maxAmount) * 8;
    };

    // Create arrow markers
    const defs = svg.append("defs");

    defs
      .append("marker")
      .attr("id", "arrow-inflow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#10B981");

    defs
      .append("marker")
      .attr("id", "arrow-outflow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", -15)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M10,-5L0,0L10,5")
      .attr("fill", "#EF4444");

    // Create links
    const link = container
      .append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(edgesData)
      .join("line")
      .attr("stroke", (d) => getEdgeColor(d))
      .attr("stroke-width", (d) => getEdgeWidth(d))
      .attr("stroke-opacity", 0.6)
      .attr(
        "marker-end",
        (d) => `url(#arrow-${d.direction === "inflow" ? "inflow" : "outflow"})`
      );

    // Create link labels
    const linkLabel = container
      .append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(edgesData)
      .join("text")
      .attr("font-size", 10)
      .attr("fill", "#666")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .text((d) => {
        const formatCurrency = (amount: number) => {
          return new Intl.NumberFormat("en-IN", {
            style: "currency",
            currency: "INR",
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(amount);
        };
        return formatCurrency(d.amount);
      });

    // Create nodes
    const node = container
      .append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodesData)
      .join("g")
      .call(
        d3
          .drag<SVGGElement, FlowchartNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended) as any
      );

    // Add circles for nodes
    node
      .append("circle")
      .attr("r", (d) => getNodeRadius(d))
      .attr("fill", (d) => getNodeColor(d))
      .attr("stroke", (d) => (d.type === "entity" ? "#1f2937" : "#4b5563"))
      .attr("stroke-width", 2)
      .style("cursor", "pointer");

    // Add labels for nodes
    node
      .append("text")
      .text((d) => d.label)
      .attr("x", 0)
      .attr("y", (d) => getNodeRadius(d) + 15)
      .attr("text-anchor", "middle")
      .attr("font-size", 12)
      .attr("font-weight", 500)
      .attr("fill", "#1f2937")
      .attr("pointer-events", "none")
      .style("user-select", "none");

    // Add type indicator
    node
      .append("text")
      .text((d) => (d.type === "entity" ? "E" : "C"))
      .attr("x", 0)
      .attr("y", 5)
      .attr("text-anchor", "middle")
      .attr("font-size", 14)
      .attr("font-weight", "bold")
      .attr("fill", "#fff")
      .attr("pointer-events", "none")
      .style("user-select", "none");

    // Add tooltip
    const tooltip = d3
      .select("body")
      .append("div")
      .attr("class", "flowchart-tooltip")
      .style("position", "absolute")
      .style("visibility", "hidden")
      .style("background-color", "white")
      .style("border", "1px solid #ddd")
      .style("border-radius", "4px")
      .style("padding", "12px")
      .style("font-size", "12px")
      .style("box-shadow", "0 2px 8px rgba(0,0,0,0.15)")
      .style("pointer-events", "none")
      .style("z-index", "1000");

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(amount);
    };

    // Add tooltips to nodes
    node
      .on("mouseover", function (_event, d) {
        d3.select(this).select("circle").attr("stroke-width", 3);

        tooltip.style("visibility", "visible").html(
          `
            <div>
              <strong>${d.label}</strong><br/>
              <hr style="margin: 6px 0;" />
              <strong>Type:</strong> ${
                d.type === "entity" ? "Entity" : "Counterparty"
              }<br/>
              <strong>Total Inflow:</strong> ${formatCurrency(
                d.totalInflow
              )}<br/>
              <strong>Total Outflow:</strong> ${formatCurrency(
                d.totalOutflow
              )}<br/>
              <strong>Net Flow:</strong> ${formatCurrency(d.netFlow)}<br/>
              <strong>Transactions:</strong> ${d.transactionCount.toLocaleString()}<br/>
              ${
                d.riskScore !== undefined
                  ? `<strong>Risk Score:</strong> ${d.riskScore}/10`
                  : ""
              }
            </div>
          `
        );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseout", function () {
        d3.select(this).select("circle").attr("stroke-width", 2);
        tooltip.style("visibility", "hidden");
      });

    // Add tooltips to edges
    link
      .on("mouseover", function (_event, d) {
        const edge = d as FlowchartEdge;
        d3.select(this)
          .attr("stroke-opacity", 1)
          .attr("stroke-width", getEdgeWidth(edge) + 2);

        tooltip.style("visibility", "visible").html(
          `
            <div>
              <strong>Flow Details</strong><br/>
              <hr style="margin: 6px 0;" />
              <strong>From:</strong> ${
                nodeById.get(
                  resolveEndpointId(edge.source as FlowchartEdge["source"])
                )?.label
              }<br/>
              <strong>To:</strong> ${
                nodeById.get(
                  resolveEndpointId(edge.target as FlowchartEdge["target"])
                )?.label
              }<br/>
              <strong>Direction:</strong> ${edge.direction}<br/>
              <strong>Amount:</strong> ${formatCurrency(edge.amount)}<br/>
              <strong>Transactions:</strong> ${edge.transactionCount.toLocaleString()}
            </div>
          `
        );
      })
      .on("mousemove", function (event) {
        tooltip
          .style("top", event.pageY - 10 + "px")
          .style("left", event.pageX + 10 + "px");
      })
      .on("mouseout", function (_event, d) {
        const edge = d as FlowchartEdge;
        d3.select(this)
          .attr("stroke-opacity", 0.6)
          .attr("stroke-width", getEdgeWidth(edge));
        tooltip.style("visibility", "hidden");
      });

    // Update positions on simulation tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => (d.source as any).x)
        .attr("y1", (d: any) => (d.source as any).y)
        .attr("x2", (d: any) => (d.target as any).x)
        .attr("y2", (d: any) => (d.target as any).y);

      linkLabel
        .attr("x", (d: any) => ((d.source as any).x + (d.target as any).x) / 2)
        .attr("y", (d: any) => ((d.source as any).y + (d.target as any).y) / 2);

      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
    });

    // Drag functions
    function dragstarted(event: any, d: FlowchartNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: FlowchartNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: FlowchartNode) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    // Cleanup function
    return () => {
      simulation.stop();
      tooltip.remove();
    };
  }, [data, nodeSizing, dimensions]);

  if (!data || data.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
        <div className="text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-2 text-sm text-gray-600">
            No data to display. Try adjusting your filters.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200">
      <svg ref={svgRef} className="w-full bg-gray-50"></svg>
    </div>
  );
}
