"use client";

import { DiffEditor } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { Skeleton } from "@/components/ui/skeleton";

function DiffLoadingSkeleton() {
  return (
    <div className="flex h-full gap-4 p-4">
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

interface DiffViewerProps {
  original: string;
  modified: string;
  originalLanguage?: string;
  modifiedLanguage?: string;
}

export function DiffViewer({
  original,
  modified,
  originalLanguage = "bicep",
  modifiedLanguage = "hcl",
}: DiffViewerProps) {
  const { resolvedTheme } = useTheme();

  return (
    <DiffEditor
      height="100%"
      original={original}
      modified={modified}
      originalLanguage={originalLanguage}
      modifiedLanguage={modifiedLanguage}
      theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
      options={{
        readOnly: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        fontSize: 13,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 8 },
      }}
      loading={<DiffLoadingSkeleton />}
    />
  );
}
