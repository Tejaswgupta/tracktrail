import React, { useEffect, useRef } from 'react';
import { FileDown, Network, Database, AlertTriangle } from 'lucide-react';
import GraphViewer from "./GraphViewer";

interface GraphData {
  nodes: Array<{id: string, label: string, amount?: number, x?: number, y?: number}>;
  links: Array<{source: string, target: string, amount: number, label: string}>;
}

interface BogusITCResult {
  success: boolean;
  gstin: string;
  tainted_itc_flow: string;
  origins_csv: string;
  tainted_edges_csv: string;
  centrality: Record<string, number>;
  gexf_graph: string;
}

function NetworkGraph({ data }: { data: GraphData }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.nodes.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const containerWidth = canvasRef.current.parentElement?.clientWidth || 800;
    const width = Math.min(800, containerWidth);
    const height = 600;

    canvas.width = width;
    canvas.height = height;

    const nodes = data.nodes.map(node => ({
      ...node,
      x: node.x ?? Math.random() * width,
      y: node.y ?? Math.random() * height,
      vx: 0,
      vy: 0
    }));

    const links = data.links.map(link => {
      const sourceNode = nodes.find(n => n.id === link.source);
      const targetNode = nodes.find(n => n.id === link.target);
      return {
        ...link,
        source: sourceNode,
        target: targetNode,
        tainted: link.amount
      };
    }).filter(link => link.source && link.target);

    const simulate = () => {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        const centerX = width / 2;
        const centerY = height / 2;
        node.vx += (centerX - node.x!) * 0.001;
        node.vy += (centerY - node.y!) * 0.001;

        for (let j = i + 1; j < nodes.length; j++) {
          const other = nodes[j];
          const dx = node.x! - other.x!;
          const dy = node.y! - other.y!;
          const distance = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = 1000 / (distance * distance);

          node.vx += (dx / distance) * force;
          node.vy += (dy / distance) * force;
          other.vx -= (dx / distance) * force;
          other.vy -= (dy / distance) * force;
        }
      }

      links.forEach(link => {
        if (!link.source || !link.target) return;
        const dx = link.target.x! - link.source.x!;
        const dy = link.target.y! - link.source.y!;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;
        const targetDistance = 150;
        const force = (distance - targetDistance) * 0.01;

        link.source.vx += (dx / distance) * force;
        link.source.vy += (dy / distance) * force;
        link.target.vx -= (dx / distance) * force;
        link.target.vy -= (dy / distance) * force;
      });

      nodes.forEach(node => {
        node.vx *= 0.9; 
        node.vy *= 0.9;
        node.x! += node.vx;
        node.y! += node.vy;

        node.x! = Math.max(30, Math.min(width - 30, node.x!));
        node.y! = Math.max(30, Math.min(height - 30, node.y!));
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      links.forEach(e => {
        if (!e.source || !e.target) return;

        const from = { x: e.source.x!, y: e.source.y! };
        const to = { x: e.target.x!, y: e.target.y! };

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = e.tainted > 0 ? "#22c55e" : "#ef4444";
        ctx.lineWidth = 2 + Math.min(Math.abs(e.tainted) / 1000, 4);
        ctx.stroke();

        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        const arrowLength = 12;

        const arrowTipX = to.x - 25 * Math.cos(angle);
        const arrowTipY = to.y - 25 * Math.sin(angle);

        ctx.beginPath();
        ctx.moveTo(arrowTipX, arrowTipY);
        ctx.lineTo(
          arrowTipX - arrowLength * Math.cos(angle - Math.PI / 6),
          arrowTipY - arrowLength * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          arrowTipX - arrowLength * Math.cos(angle + Math.PI / 6),
          arrowTipY - arrowLength * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const amountText = `₹${Math.abs(e.tainted).toLocaleString()}`;

        if (e.tainted > 0) {
          ctx.font = "bold 12px sans-serif";
          const textMetrics = ctx.measureText(amountText);
          const textWidth = textMetrics.width + 6;
          const textHeight = 16;

          ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
          ctx.fillRect(midX - textWidth/2, midY - textHeight/2, textWidth, textHeight);

          ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
          ctx.lineWidth = 1;
          ctx.strokeRect(midX - textWidth/2, midY - textHeight/2, textWidth, textHeight);

          ctx.fillStyle = "#111827";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(amountText, midX, midY);
        }
      });

      nodes.forEach(node => {
        ctx.beginPath();
        ctx.arc(node.x! + 2, node.y! + 2, 25, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(node.x!, node.y!, 25, 0, Math.PI * 2);
        ctx.fillStyle = "#3b82f6";
        ctx.fill();
        ctx.strokeStyle = "#1e40af";
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";

        let label = node.label;
        if (label.length > 8) {
          label = label.substring(0, 8) + "...";
        }

        ctx.fillText(label, node.x!, node.y! + 4);
      });
    };

    let animationId: number;
    const animate = () => {
      simulate();
      draw();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    let dragNode: any = null;
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      dragNode = nodes.find(node => {
        const dx = node.x! - mouseX;
        const dy = node.y! - mouseY;
        return Math.sqrt(dx * dx + dy * dy) < 25;
      });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragNode) return;

      const rect = canvas.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;

      dragNode.x = mouseX;
      dragNode.y = mouseY;
      dragNode.vx = 0;
      dragNode.vy = 0;
    };

    const handleMouseUp = () => {
      dragNode = null;
    };

    if (canvas) {
      canvas.addEventListener('mousedown', handleMouseDown);
      canvas.addEventListener('mousemove', handleMouseMove);
      canvas.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
      if (canvas) {
        canvas.removeEventListener('mousedown', handleMouseDown);
        canvas.removeEventListener('mousemove', handleMouseMove);
        canvas.removeEventListener('mouseup', handleMouseUp);
      }
    };
  }, [data]);

  return (
    <div className="w-full flex justify-center">
      <canvas 
        ref={canvasRef} 
        className="border border-gray-300 rounded-lg bg-white cursor-grab active:cursor-grabbing max-w-full h-auto"
        aria-label="Interactive network graph showing ITC flow relationships"
      />
    </div>
  );
}

export default function BogusITCResults({ result }: { result: BogusITCResult }) {

  const parseGraphData = (): GraphData => {
    if (!result?.tainted_edges_csv) {
      console.warn("No tainted_edges_csv data available");
      return { nodes: [], links: [] };
    }

    const lines = result.tainted_edges_csv.trim().split('\n');
    if (lines.length < 2) {
      console.warn("Invalid CSV: Less than 2 lines");
      return { nodes: [], links: [] };
    }

    const headers = lines[0].split(',').map(h => h.trim());
    console.log("CSV Headers:", headers);

    const edges = lines.slice(1)
      .filter(line => line.trim()) 
      .map(line => {
        const values = line.split(',').map(v => v.trim());

        if (values.length < 4) {
          console.warn("Malformed CSV row:", line);
          return null;
        }

        console.log("CSV Row:", values);

        let totalAmount = 0;

        const taxTotalIndex = headers.indexOf('tax_total');
        const igstIndex = headers.indexOf('igst_amount');
        const cgstIndex = headers.indexOf('cgst_amount');
        const sgstIndex = headers.indexOf('sgst_amount');
        const taintedIndex = headers.indexOf('tainted_amount');

        if (taxTotalIndex !== -1) {
          totalAmount = parseFloat(values[taxTotalIndex]) || 0;
        } else if (igstIndex !== -1 && cgstIndex !== -1 && sgstIndex !== -1) {
          const igst = parseFloat(values[igstIndex]) || 0;
          const cgst = parseFloat(values[cgstIndex]) || 0;
          const sgst = parseFloat(values[sgstIndex]) || 0;
          totalAmount = igst + cgst + sgst;
        } else if (taintedIndex !== -1) {
          totalAmount = parseFloat(values[taintedIndex]) || 0;
        } else {
          totalAmount = parseFloat(values[values.length - 1]) || 0;
        }

        console.log("Calculated amount:", totalAmount);

        return {
          edge_id: values[0] || '',
          supplier_gstin: values[1] || '',
          recipient_gstin: values[2] || '',
          period: values[3] || '',
          tainted_amount: totalAmount
        };
      })
      .filter(Boolean); 

    const nodeSet = new Set<string>();
    edges.forEach(edge => {
      if (edge) {
        nodeSet.add(edge.supplier_gstin);
        nodeSet.add(edge.recipient_gstin);
      }
    });

    const nodes = Array.from(nodeSet).map(id => ({
      id,
      label: id
    }));

    const links = edges.map(edge => ({
      source: edge!.supplier_gstin,
      target: edge!.recipient_gstin,
      amount: edge!.tainted_amount,
      label: `₹${edge!.tainted_amount.toLocaleString()}`
    }));

    console.log("Final graph data:", { nodes, links });

    if (nodes.length > 1000) {
      console.warn("Dataset too large:", nodes.length, "nodes");
    }

    return { nodes, links };
  };

  const graphData = parseGraphData();

  return (
    <div className="mt-12 space-y-8">
      <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-8 py-6">
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <AlertTriangle className="w-8 h-8" />
            Analysis Results
          </h2>
        </div>

        <div className="p-10 space-y-10">
          {graphData.nodes.length > 0 && graphData.nodes.length < 1000 ? (
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <Network className="w-6 h-6 text-purple-600" />
                Interactive Network Graph
              </h3>
              <div className="bg-gray-50 rounded-xl border-2 shadow-inner p-6">
                <NetworkGraph data={graphData} />
                <p className="text-sm text-gray-600 mt-4 text-center">
                  Drag nodes to rearrange • Green edges = ITC flow • Edge thickness shows amount • Amounts displayed on edges
                </p>
              </div>
            </div>
          ) : graphData.nodes.length >= 1000 ? (
            <div className="text-center py-8">
              <p className="text-red-600 font-semibold">Dataset too large ({graphData.nodes.length} nodes)</p>
              <p className="text-gray-600">Please filter your data to less than 1000 entities</p>
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">No network data to display</p>
            </div>
          )}

          {result.gexf_graph && (
            <div className="mt-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
                <Network className="w-6 h-6 text-indigo-600" />
                Transaction Network
              </h3>
              <div className="bg-gray-50 rounded-xl border-2 shadow-inner p-6">
                <GraphViewer gexfB64={result.gexf_graph} />
                <p className="text-sm text-gray-600 mt-4 text-center">
                  Advanced network visualization from GEXF data
                </p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Network className="w-6 h-6 text-blue-600" />
              Tainted ITC Flow
            </h3>
            <div className="bg-gray-50 rounded-xl border-2 shadow-inner">
              <pre 
                className="p-6 text-sm font-mono overflow-auto max-h-80 text-gray-800 leading-relaxed"
                tabIndex={0}
                role="textbox"
                aria-readonly="true"
                aria-label="Tainted ITC Flow Content"
              >
                {result.tainted_itc_flow}
              </pre>
            </div>
          </div>

          <div>
            <label htmlFor="origins-csv" className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Database className="w-6 h-6 text-green-600" />
              Origins CSV Data
            </label>
            <div className="bg-gray-50 rounded-xl border-2 shadow-inner">
              <textarea
                id="origins-csv"
                className="w-full h-48 p-6 font-mono text-sm bg-transparent border-0 resize-none focus:outline-none text-gray-800 leading-relaxed"
                value={result.origins_csv || ''}
                readOnly
                aria-label="Origins CSV data from bogus ITC analysis"
              />
            </div>
          </div>

          <div>
            <label htmlFor="tainted-edges-csv" className="text-xl font-bold text-gray-900 mb-6 flex items-center gap-3">
              <Database className="w-6 h-6 text-orange-600" />
              Tainted Edges CSV Data
            </label>
            <div className="bg-gray-50 rounded-xl border-2 shadow-inner">
              <textarea
                id="tainted-edges-csv"
                className="w-full h-48 p-6 font-mono text-sm bg-transparent border-0 resize-none focus:outline-none text-gray-800 leading-relaxed"
                value={result.tainted_edges_csv || ''}
                readOnly
                aria-label="Tainted edges CSV data from bogus ITC analysis"
              />
            </div>
          </div>

          <div className="pt-8 border-t border-gray-200">
            <h3 className="text-xl font-bold text-gray-900 mb-6">
              Export Results
            </h3>
            <a
              href={`data:text/xml+gzip;base64,${result.gexf_graph}`}
              download="bogus-itc.gexf"
              className="inline-flex items-center gap-3 px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
              aria-label="Download GEXF Graph file"
            >
              <FileDown className="w-6 h-6" />
              Download GEXF Graph
            </a>
            <p className="text-gray-600 mt-4 text-lg">
              Download the graph data for visualization in network analysis tools
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
