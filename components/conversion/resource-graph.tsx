"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useConversionStore } from "@/lib/store";

function parseResourcesFromTerraform(files: Record<string, string>): {
  nodes: Node[];
  edges: Edge[];
} {
  const resources: Array<{ type: string; name: string; fullName: string }> = [];
  const references: Array<{ from: string; to: string }> = [];

  const allContent = Object.values(files).join("\n");

  // Extract resource blocks
  const resourceRegex = /resource\s+"(\w+)"\s+"(\w+)"/g;
  let match;
  while ((match = resourceRegex.exec(allContent)) !== null) {
    resources.push({
      type: match[1],
      name: match[2],
      fullName: `${match[1]}.${match[2]}`,
    });
  }

  // Extract cross-resource references
  for (const res of resources) {
    const refRegex = new RegExp(`(\\w+)\\.(\\w+)\\.(\\w+)`, "g");
    let refMatch;
    // Look in the block content for this resource
    const blockStart = allContent.indexOf(`resource "${res.type}" "${res.name}"`);
    if (blockStart === -1) continue;

    const blockContent = allContent.slice(blockStart, blockStart + 2000);
    while ((refMatch = refRegex.exec(blockContent)) !== null) {
      const refTarget = `${refMatch[1]}.${refMatch[2]}`;
      if (
        refTarget !== res.fullName &&
        resources.some((r) => r.fullName === refTarget)
      ) {
        references.push({ from: res.fullName, to: refTarget });
      }
    }
  }

  // Create nodes in a grid layout
  const cols = Math.max(3, Math.ceil(Math.sqrt(resources.length)));
  const nodes: Node[] = resources.map((res, i) => ({
    id: res.fullName,
    position: {
      x: (i % cols) * 250 + 50,
      y: Math.floor(i / cols) * 120 + 50,
    },
    data: {
      label: `${res.type}\n${res.name}`,
    },
    style: {
      padding: "8px 12px",
      borderRadius: "8px",
      fontSize: "11px",
      fontFamily: "monospace",
      whiteSpace: "pre" as const,
      border: "1px solid var(--border)",
      background: "var(--card)",
      color: "var(--card-foreground)",
    },
  }));

  const edges: Edge[] = references.map((ref, i) => ({
    id: `e-${i}`,
    source: ref.from,
    target: ref.to,
    animated: true,
    style: { stroke: "var(--primary)" },
  }));

  return { nodes, edges };
}

export function ResourceGraph() {
  const terraformFiles = useConversionStore((s) => s.terraformFiles);

  const { nodes, edges } = useMemo(
    () => parseResourcesFromTerraform(terraformFiles),
    [terraformFiles]
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        {Object.keys(terraformFiles).length === 0
          ? "Run a conversion to see the dependency graph"
          : "No resource dependencies detected"}
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        attributionPosition="bottom-left"
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
