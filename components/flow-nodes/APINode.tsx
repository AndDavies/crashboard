"use client";

import { Handle, Position, NodeProps } from "reactflow";

type APINodeData = {
  label: string;
  type: string;
};

export default function APINode({ data, isConnectable }: NodeProps<APINodeData>) {
  return (
    <div className="px-4 py-2 rounded-md border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 shadow-sm">
      <Handle
        type="target"
        position={Position.Top}
        isConnectable={isConnectable}
        className="w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-900"
      />
      <div className="flex flex-col">
        <div className="font-medium text-sm">{data.label}</div>
        <div className="text-xs text-muted-foreground mt-1">{data.type}</div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        isConnectable={isConnectable}
        className="w-2 h-2 bg-green-500 border-2 border-white dark:border-gray-900"
      />
    </div>
  );
} 