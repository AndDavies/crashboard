"use client";

import { Handle, Position, NodeProps } from "reactflow";

type RouteNodeData = {
  label: string;
  type: string;
};

export default function RouteNode({ data, isConnectable }: NodeProps<RouteNodeData>) {
  return (
    <div className="px-4 py-2 rounded-md border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2 bg-blue-500 border-2 border-white dark:border-gray-900"
      />
      <div className="flex flex-col">
        <div className="font-medium text-sm">{data.label}</div>
        <div className="text-xs text-muted-foreground mt-1">{data.type}</div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 bg-blue-500 border-2 border-white dark:border-gray-900"
      />
    </div>
  );
} 