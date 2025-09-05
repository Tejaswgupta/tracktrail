"use client";

import React, { useEffect, useRef, useMemo, useState } from 'react';
import * as d3 from 'd3';
import { CircularTradingNode, CircularTradingEdge, CircularTradingCycle } from '@/hooks/useCircularTradingAnalysis';

interface CircularTradingGraphProps {
  nodes: CircularTradingNode[];
  edges: CircularTradingEdge[];
  cycles: CircularTradingCycle[];
  selectedCycle?: string | null;
  highlightedEntities?: string[];
  onNodeSelect?: (nodeId: string) => void;
  onCycleHighlight?: (cycleId: string) => void;
}

export function CircularTradingGraph({
  nodes,
  edges,
  cycles,
  selectedCycle,
  highlightedEntities = [],
  onNodeSelect,
  onCycleHighlight,
}: CircularTradingGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showAmountLabels, setShowAmountLabels] = useState(true);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);

  // Memoize processed data
  const processedData = useMemo(() => {
    if (!nodes.length) return null;

    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const edgeMap = new Map<string, CircularTradingEdge>();
    
    edges.forEach(edge => {
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
        const key = `${edge.source}-${edge.target}`;
        if (edgeMap.has(key)) {
          const existing = edgeMap.get(key)!;
          existing.amount += edge.amount;
          existing.transactionCount += edge.transactionCount;
          existing.transactions.push(...edge.transactions);
        } else {
          edgeMap.set(key, { ...edge });
        }
      }
    });
    
    const validEdges = Array.from(edgeMap.values());
    const maxVolume = Math.max(...nodes.map(n => n.totalCredit + n.totalDebit), 1);
    
    return {
      nodes: nodes.map(n => ({
        ...n,
        radius: Math.max(25, 25 + ((n.totalCredit + n.totalDebit) / maxVolume) * 35),
      })),
      edges: validEdges,
      nodeMap,
    };
  }, [nodes, edges]);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !processedData) return;

    const container = containerRef.current;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = container.clientWidth;
    const height = 600;
    const { nodes: processedNodes, edges: processedEdges } = processedData;

    if (processedNodes.length === 0) return;

    // Create main group
    const g = svg.append("g");

    // Enhanced arrow markers with better styling
    const defs = svg.append("defs");

    // Add gradient definitions for nodes
    const nodeGradient = defs.append("linearGradient")
      .attr("id", "nodeGradient")
      .attr("x1", "0%").attr("y1", "0%")
      .attr("x2", "0%").attr("y2", "100%");
    
    nodeGradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "#ffffff")
      .attr("stop-opacity", 0.3);
    
    nodeGradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#000000")
      .attr("stop-opacity", 0.1);

    // Drop shadow filter
    const dropShadow = defs.append("filter")
      .attr("id", "dropshadow")
      .attr("x", "-50%").attr("y", "-50%")
      .attr("width", "200%").attr("height", "200%");
    
    dropShadow.append("feDropShadow")
      .attr("dx", "2").attr("dy", "2")
      .attr("stdDeviation", "3")
      .attr("flood-color", "rgba(0,0,0,0.3)");

    // Refined arrow markers
    defs.append("marker")
      .attr("id", "arrow-credit")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9)
      .attr("refY", 3)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 10 3 L 0 6 Z")
      .attr("fill", "#059669")
      .attr("opacity", 0.8);

    defs.append("marker")
      .attr("id", "arrow-debit")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 9)
      .attr("refY", 3)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M 0 0 L 10 3 L 0 6 Z")
      .attr("fill", "#dc2626")
      .attr("opacity", 0.8);

    // Create zoom behavior with limits
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom as any);

    // Create simulation with better forces
    const simulation = d3.forceSimulation(processedNodes as any)
      .force("link", d3.forceLink(processedEdges)
        .id((d: any) => d.id)
        .distance((d: any) => {
          const sourceRadius = (d.source as any).radius || 25;
          const targetRadius = (d.target as any).radius || 25;
          return Math.max(100, sourceRadius + targetRadius + 50);
        })
      )
      .force("charge", d3.forceManyBody().strength(-800))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => (d.radius || 25) + 20))
      .alpha(1);

    // Create curved path generator for edges
    const linkArc = (d: any) => {
      const dx = d.target.x - d.source.x;
      const dy = d.target.y - d.source.y;
      const dr = Math.sqrt(dx * dx + dy * dy) * 0.3; // Curve factor
      
      // Calculate end point accounting for node radius
      const targetRadius = d.target.radius || 25;
      const length = Math.sqrt(dx * dx + dy * dy);
      const endX = d.target.x - (dx / length) * (targetRadius + 8);
      const endY = d.target.y - (dy / length) * (targetRadius + 8);
      
      return `M ${d.source.x},${d.source.y} A ${dr},${dr} 0 0,1 ${endX},${endY}`;
    };

    // Create curved edges
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("path")
      .data(processedEdges)
      .enter()
      .append("path")
      .attr("stroke", (d: any) => d.transactionType === 'credit' ? '#059669' : '#dc2626')
      .attr("stroke-width", (d: any) => Math.max(2, Math.min(6, Math.log(d.amount / 10000))))
      .attr("stroke-opacity", 0.7)
      .attr("fill", "none")
      .attr("marker-end", (d: any) => 
        d.transactionType === 'credit' ? "url(#arrow-credit)" : "url(#arrow-debit)"
      )
      .style("cursor", "pointer")
      .on("mouseover", function(event, d: any) {
        d3.select(this)
          .attr("stroke-width", (d: any) => Math.max(4, Math.min(8, Math.log(d.amount / 10000))))
          .attr("stroke-opacity", 1);
        setSelectedEdge(`${d.source.id}-${d.target.id}`);
      })
      .on("mouseout", function(event, d: any) {
        d3.select(this)
          .attr("stroke-width", (d: any) => Math.max(2, Math.min(6, Math.log(d.amount / 10000))))
          .attr("stroke-opacity", 0.7);
        setSelectedEdge(null);
      });

    // Enhanced nodes with gradients and shadows
    const node = g.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(processedNodes)
      .enter()
      .append("circle")
      .attr("r", (d: any) => d.radius)
      .attr("fill", (d: any) => {
        if (highlightedEntities.includes(d.id)) {
          return 'url(#nodeGradient)';
        }
        // Softer color palette
        if (d.riskScore > 0.7) return '#dc2626'; // Red
        if (d.riskScore > 0.4) return '#f59e0b'; // Amber
        return '#059669'; // Emerald
      })
      .attr("stroke", "#ffffff")
      .attr("stroke-width", 3)
      .attr("filter", "url(#dropshadow)")
      .style("cursor", "pointer")
      .on("click", (event, d: any) => {
        event.stopPropagation();
        onNodeSelect?.(d.id);
      })
      .on("mouseover", function(event, d: any) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", (d: any) => d.radius * 1.1)
          .attr("stroke", "#3b82f6")
          .attr("stroke-width", 4);
      })
      .on("mouseout", function(event, d: any) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr("r", (d: any) => d.radius)
          .attr("stroke", "#ffffff")
          .attr("stroke-width", 3);
      });

    // Enhanced node labels with background
    const labelGroup = g.append("g").attr("class", "labels");
    
    // Label backgrounds
    labelGroup.selectAll("rect")
      .data(processedNodes)
      .enter()
      .append("rect")
      .attr("rx", 4)
      .attr("ry", 4)
      .attr("fill", "rgba(255, 255, 255, 0.95)")
      .attr("stroke", "rgba(0, 0, 0, 0.1)")
      .attr("stroke-width", 1)
      .attr("filter", "url(#dropshadow)")
      .attr("width", (d: any) => {
        const text = d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name;
        return text.length * 7 + 12;
      })
      .attr("height", 20)
      .attr("x", (d: any) => {
        const text = d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name;
        return -(text.length * 7 + 12) / 2;
      })
      .attr("y", -10);

    // Label text
    labelGroup.selectAll("text")
      .data(processedNodes)
      .enter()
      .append("text")
      .text((d: any) => d.name.length > 12 ? d.name.substring(0, 12) + '...' : d.name)
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("text-anchor", "middle")
      .attr("dy", "3px")
      .attr("fill", "#374151")
      .style("pointer-events", "none");

    // Conditional amount labels (only show when toggled or on hover)
    const amountLabels = g.append("g")
      .attr("class", "amount-labels")
      .style("opacity", showAmountLabels ? 1 : 0);

    const amountLabelGroup = amountLabels.selectAll("g")
      .data(processedEdges)
      .enter()
      .append("g")
      .style("opacity", (d: any) => 
        !showAmountLabels && selectedEdge !== `${d.source.id}-${d.target.id}` ? 0 : 1
      );

    // Amount label backgrounds
    amountLabelGroup.append("rect")
      .attr("rx", 3)
      .attr("ry", 3)
      .attr("fill", "rgba(255, 255, 255, 0.95)")
      .attr("stroke", "rgba(0, 0, 0, 0.1)")
      .attr("stroke-width", 1)
      .attr("width", (d: any) => `₹${d.amount.toLocaleString()}`.length * 6 + 8)
      .attr("height", 16)
      .attr("x", (d: any) => -(`₹${d.amount.toLocaleString()}`.length * 6 + 8) / 2)
      .attr("y", -8);

    // Amount label text
    amountLabelGroup.append("text")
      .attr("font-size", "10px")
      .attr("font-weight", "600")
      .attr("text-anchor", "middle")
      .attr("dy", "2px")
      .attr("fill", "#374151")
      .style("pointer-events", "none")
      .text((d: any) => `₹${d.amount.toLocaleString()}`);

    // Enhanced tooltip
    const tooltip = d3.select(container)
      .append("div")
      .style("position", "absolute")
      .style("background", "linear-gradient(135deg, rgba(0, 0, 0, 0.9), rgba(30, 30, 30, 0.95))")
      .style("color", "white")
      .style("padding", "16px")
      .style("border-radius", "12px")
      .style("font-size", "12px")
      .style("pointer-events", "none")
      .style("opacity", 0)
      .style("z-index", "1000")
      .style("box-shadow", "0 10px 25px rgba(0, 0, 0, 0.3)")
      .style("border", "1px solid rgba(255, 255, 255, 0.1)");

    // Enhanced node hover events
    node
      .on("mouseover.tooltip", (event, d: any) => {
        tooltip.transition().duration(300).style("opacity", 1);
        tooltip.html(`
          <div style="font-weight: 700; font-size: 14px; margin-bottom: 8px; color: #f3f4f6;">${d.mergedName || d.name || d.id}</div>
          <div style="margin-bottom: 4px;">
            <span style="color: #9ca3af;">Risk Score:</span> 
            <span style="color: #fbbf24; font-weight: 600;">${(d.riskScore * 100).toFixed(1)}%</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #9ca3af;">Credit:</span> 
            <span style="color: #10b981; font-weight: 600;">₹${d.totalCredit.toLocaleString()}</span>
          </div>
          <div style="margin-bottom: 4px;">
            <span style="color: #9ca3af;">Debit:</span> 
            <span style="color: #ef4444; font-weight: 600;">₹${d.totalDebit.toLocaleString()}</span>
          </div>
          <div>
            <span style="color: #9ca3af;">Transactions:</span> 
            <span style="color: #e5e7eb; font-weight: 600;">${d.transactionCount}</span>
          </div>
        `)
          .style("left", (event.pageX + 15) + "px")
          .style("top", (event.pageY - 10) + "px");
      })
      .on("mouseout.tooltip", () => {
        tooltip.transition().duration(300).style("opacity", 0);
      });

    // Smooth simulation updates
    simulation.on("tick", () => {
      link.attr("d", linkArc);

      amountLabels.selectAll("g")
        .attr("transform", (d: any) => {
          const midX = (d.source.x + d.target.x) / 2;
          const midY = (d.source.y + d.target.y) / 2;
          return `translate(${midX}, ${midY - 15})`;
        })
        .style("opacity", (d: any) => 
          showAmountLabels || selectedEdge === `${d.source.id}-${d.target.id}` ? 1 : 0
        );

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      labelGroup.selectAll("rect, text")
        .attr("transform", (d: any) => `translate(${d.x}, ${d.y + (d.radius || 25) + 20})`);
    });

    // Enhanced drag behavior
    const drag = d3.drag()
      .on("start", (event, d: any) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event, d: any) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d: any) => {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    node.call(drag as any);

    // Cleanup
    return () => {
      tooltip.remove();
      simulation.stop();
    };

  }, [processedData, highlightedEntities, selectedCycle, showAmountLabels, selectedEdge]);

  return (
    <div ref={containerRef} className="w-full border border-gray-200 rounded-lg bg-white shadow-sm">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center mb-3">
          <h4 className="font-semibold text-gray-900">Transaction Flow Network</h4>
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setShowAmountLabels(!showAmountLabels)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                showAmountLabels 
                ? 'bg-blue-100 text-blue-800 border border-blue-200' 
                : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {showAmountLabels ? 'Hide' : 'Show'} Amounts
            </button>
            <div className="text-sm text-gray-500">
              Zoom • Pan • Hover for details
            </div>
          </div>
        </div>
        
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-600">
            {nodes.length} entities • {edges.length} connections • {cycles.length} cycles detected
          </p>
          
          <div className="flex items-center space-x-6 text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-emerald-600 rounded-full shadow-sm"></div>
                <span>Low Risk</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-amber-500 rounded-full shadow-sm"></div>
                <span>Medium Risk</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-red-600 rounded-full shadow-sm"></div>
                <span>High Risk</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1">
                <div className="w-6 h-1 bg-emerald-600 rounded-full"></div>
                <span>Credit Flow</span>
              </div>
              <div className="flex items-center space-x-1">
                <div className="w-6 h-1 bg-red-600 rounded-full"></div>
                <span>Debit Flow</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height="600"
          className="bg-gradient-to-br from-gray-50 to-gray-100"
        />
        
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-4 bg-gradient-to-br from-gray-200 to-gray-300 rounded-full flex items-center justify-center shadow-lg">
                <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 01.553-.894L9 2l6 3 5.447-2.724A1 1 0 0121 3.382v10.764a1 1 0 01-.553.894L15 18l-6-3z" />
                </svg>
              </div>
              <p className="text-gray-600 font-medium">No network data available</p>
              <p className="text-gray-400 text-sm mt-1">Run the analysis to visualize circular trading patterns</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
