"use client";

export default function FlowchartLegend() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Legend</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Node Types */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Node Types</h4>
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-blue-500 border-2 border-blue-700 mr-2"></div>
              <span className="text-sm text-gray-600">Entity (Investigation Target)</span>
            </div>
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-gray-500 border-2 border-gray-700 mr-2"></div>
              <span className="text-sm text-gray-600">Counterparty (External Party)</span>
            </div>
          </div>
        </div>

        {/* Node Color (Net Flow) */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Node Color (Net Flow)</h4>
          <div className="space-y-2">
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-green-500 mr-2"></div>
              <span className="text-sm text-gray-600">Net Inflow (More credits than debits)</span>
            </div>
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-red-500 mr-2"></div>
              <span className="text-sm text-gray-600">Net Outflow (More debits than credits)</span>
            </div>
            <div className="flex items-center">
              <div className="w-6 h-6 rounded-full bg-blue-500 mr-2"></div>
              <span className="text-sm text-gray-600">Neutral (Balanced flow)</span>
            </div>
          </div>
        </div>

        {/* Edge Direction */}
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Edge Direction</h4>
          <div className="space-y-2">
            <div className="flex items-center">
              <svg width="40" height="20" className="mr-2">
                <defs>
                  <marker
                    id="arrowhead-inflow"
                    markerWidth="10"
                    markerHeight="7"
                    refX="10"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="0 0, 10 3.5, 0 7" fill="#10B981" />
                  </marker>
                </defs>
                <line
                  x1="0"
                  y1="10"
                  x2="30"
                  y2="10"
                  stroke="#10B981"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead-inflow)"
                />
              </svg>
              <span className="text-sm text-gray-600">Money Inflow (Credit)</span>
            </div>
            <div className="flex items-center">
              <svg width="40" height="20" className="mr-2">
                <defs>
                  <marker
                    id="arrowhead-outflow"
                    markerWidth="10"
                    markerHeight="7"
                    refX="0"
                    refY="3.5"
                    orient="auto"
                  >
                    <polygon points="10 0, 0 3.5, 10 7" fill="#EF4444" />
                  </marker>
                </defs>
                <line
                  x1="30"
                  y1="10"
                  x2="0"
                  y2="10"
                  stroke="#EF4444"
                  strokeWidth="2"
                  markerEnd="url(#arrowhead-outflow)"
                />
              </svg>
              <span className="text-sm text-gray-600">Money Outflow (Debit)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <div className="flex items-start">
          <svg
            className="h-5 w-5 text-blue-400 mt-0.5 mr-2 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-sm text-gray-600">
            <strong>Tip:</strong> Click and drag nodes to rearrange the graph. Use mouse wheel to zoom.
            Hover over nodes and edges to see detailed information.
            Node size represents the selected metric (total volume or transaction count).
          </p>
        </div>
      </div>
    </div>
  );
}
