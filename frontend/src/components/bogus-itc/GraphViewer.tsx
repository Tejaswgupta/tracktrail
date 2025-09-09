"use client";
import { useEffect, useRef } from "react";

export default function GraphViewer({ gexfB64 }: { gexfB64: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!gexfB64 || !containerRef.current) return;

    try {
      if (!gexfB64.trim()) {
        throw new Error("Empty GEXF data");
      }

      const xml = atob(gexfB64);
      console.log("GEXF XML:", xml.substring(0, 500));

      if (!xml.includes('<gexf') || !xml.includes('</gexf>')) {
        throw new Error('Invalid GEXF format');
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, "application/xml");

      const parseError = doc.querySelector("parsererror");
      if (parseError) {
        throw new Error("XML parsing failed");
      }

      const nodes: { id: string; label: string }[] = [];
      const edges: {
        id: string;
        source: string;
        target: string;
        tainted: number;
      }[] = [];

      doc.querySelectorAll("node").forEach((n) => {
        nodes.push({ 
          id: n.id || '', 
          label: n.getAttribute("label") || n.id || ''
        });
      });

      doc.querySelectorAll("edge").forEach((e) => {
        let taintedAmount = 0;

        const attributesToTry = [
          "tax_total",         
          "igst_amount",       
          "cgst_amount",       
          "sgst_amount",       
          "tainted_amount",    
          "amount",
          "weight", 
          "value"
        ];

        for (const attr of attributesToTry) {
          const value = e.getAttribute(attr);
          if (value && !isNaN(Number(value)) && Number(value) > 0) {
            taintedAmount = Number(value);
            console.log(`Found amount in ${attr}:`, taintedAmount);
            break;
          }
        }

        if (taintedAmount === 0) {
          const igst = Number(e.getAttribute("igst_amount") || "0");
          const cgst = Number(e.getAttribute("cgst_amount") || "0");
          const sgst = Number(e.getAttribute("sgst_amount") || "0");

          if (igst > 0 || cgst > 0 || sgst > 0) {
            taintedAmount = igst + cgst + sgst;
            console.log("Calculated from components:", taintedAmount);
          }
        }

        edges.push({
          id: e.id || `${e.getAttribute("source")}-${e.getAttribute("target")}`,
          source: e.getAttribute("source") || "",
          target: e.getAttribute("target") || "",
          tainted: taintedAmount,
        });

        console.log("Edge processed:", {
          source: e.getAttribute("source"),
          target: e.getAttribute("target"),
          amount: taintedAmount
        });
      });

      console.log("Final processed data:", { nodes, edges });

      if (nodes.length === 0) {
        throw new Error("No nodes found in GEXF data");
      }

      if (nodes.length > 1000) {
        throw new Error(`Too many nodes: ${nodes.length}. Please filter your data.`);
      }

      containerRef.current.innerHTML = "";
      const canvas = document.createElement("canvas");

      const containerWidth = containerRef.current.clientWidth;
      const width = Math.max(800, containerWidth);
      const height = 400;

      canvas.width = width;
      canvas.height = height;
      canvas.style.width = "100%";
      canvas.style.height = "400px";

      containerRef.current.appendChild(canvas);

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      ctx.clearRect(0, 0, width, height);

      const positions: Record<string, { x: number; y: number }> = {};
      const radius = Math.min(width, height) * 0.3;
      const centerX = width / 2;
      const centerY = height / 2;

      nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        positions[node.id] = {
          x: centerX + radius * Math.cos(angle),
          y: centerY + radius * Math.sin(angle),
        };
      });

      edges.forEach((edge) => {
        const from = positions[edge.source];
        const to = positions[edge.target];

        if (!from || !to) return;

        const isPositive = edge.tainted > 0;
        const strokeColor = isPositive ? "#22c55e" : "#ef4444"; 
        const lineWidth = Math.max(2, Math.min(8, 2 + Math.abs(edge.tainted) / 1000));

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 15;

        const arrowTipX = to.x - 20 * Math.cos(angle);
        const arrowTipY = to.y - 20 * Math.sin(angle);

        const arrowBase1X = arrowTipX - arrowLength * Math.cos(angle - Math.PI / 6);
        const arrowBase1Y = arrowTipY - arrowLength * Math.sin(angle - Math.PI / 6);

        const arrowBase2X = arrowTipX - arrowLength * Math.cos(angle + Math.PI / 6);
        const arrowBase2Y = arrowTipY - arrowLength * Math.sin(angle + Math.PI / 6);

        ctx.beginPath();
        ctx.moveTo(arrowTipX, arrowTipY);
        ctx.lineTo(arrowBase1X, arrowBase1Y);
        ctx.lineTo(arrowBase2X, arrowBase2Y);
        ctx.closePath();
        ctx.fillStyle = strokeColor;
        ctx.fill();

        if (edge.tainted > 0) {
          const midX = (from.x + to.x) / 2;
          const midY = (from.y + to.y) / 2;
          const amountText = `₹${Math.abs(edge.tainted).toLocaleString()}`;

          ctx.font = "bold 12px sans-serif";
          const textMetrics = ctx.measureText(amountText);
          const textWidth = textMetrics.width + 8;
          const textHeight = 18;

          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillRect(
            midX - textWidth / 2, 
            midY - textHeight / 2 - 2, 
            textWidth, 
            textHeight
          );

          ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
          ctx.lineWidth = 1;
          ctx.strokeRect(
            midX - textWidth / 2, 
            midY - textHeight / 2 - 2, 
            textWidth, 
            textHeight
          );

          ctx.fillStyle = "#374151";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(amountText, midX, midY);
        }
      });

      nodes.forEach((node) => {
        const pos = positions[node.id];
        if (!pos) return;

        ctx.beginPath();
        ctx.arc(pos.x + 2, pos.y + 2, 22, 0, 2 * Math.PI);
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 20, 0, 2 * Math.PI);
        ctx.fillStyle = "#3b82f6";
        ctx.fill();

        ctx.strokeStyle = "#1e40af";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        let label = node.label;
        if (label.length > 8) {
          label = label.substring(0, 8) + "...";
        }

        ctx.fillText(label, pos.x, pos.y);
      });

    } catch (error) {
      console.error("Error rendering graph:", error);

      if (containerRef.current) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        containerRef.current.innerHTML = `
          <div class="flex items-center justify-center h-96 text-gray-500">
            <div class="text-center">
              <p class="text-lg font-medium text-red-600">Error rendering graph</p>
              <p class="text-sm text-gray-600">${errorMessage}</p>
              <p class="text-xs text-gray-500 mt-2">Please check the console for more details</p>
            </div>
          </div>
        `;
      }
    }
  }, [gexfB64]);

  return (
    <div className="w-full">
      <div 
        ref={containerRef} 
        className="border rounded-lg bg-white min-h-96 flex items-center justify-center"
        aria-label="GEXF graph visualization showing network relationships"
      />
    </div>
  );
}
