"use client";

import { useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  Panel,
  useReactFlow,
  ReactFlowProvider,
  ConnectionLineType,
} from "reactflow";
import "reactflow/dist/style.css";

// Custom node types
import RouteNode from "./flow-nodes/RouteNode";
import APINode from "./flow-nodes/APINode";

const nodeTypes = {
  route: RouteNode,
  api: APINode,
};

type RepositoryFlowchartProps = {
  data: {
    nodes: Node[];
    edges: Edge[];
  };
};

function Flow({ data }: RepositoryFlowchartProps) {
  const { fitView } = useReactFlow();

  const onInit = useCallback(() => {
    setTimeout(() => {
      fitView({ padding: 0.2 });
    }, 200);
  }, [fitView]);

  return (
    <ReactFlow
      nodes={data.nodes}
      edges={data.edges}
      nodeTypes={nodeTypes}
      onInit={onInit}
      minZoom={0.2}
      maxZoom={1.5}
      defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
      connectionLineType={ConnectionLineType.SmoothStep}
      attributionPosition="bottom-left"
      className="rounded-md border h-[600px]"
    >
      <Background />
      <Controls />
      <Panel position="top-right" className="bg-background/60 backdrop-blur p-2 rounded-md border shadow-sm">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
            <span>Route</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-green-500"></div>
            <span>API Endpoint</span>
          </div>
        </div>
      </Panel>
    </ReactFlow>
  );
}

export default function RepositoryFlowchart({ data }: RepositoryFlowchartProps) {
  return (
    <ReactFlowProvider>
      <Flow data={data} />
    </ReactFlowProvider>
  );
} 