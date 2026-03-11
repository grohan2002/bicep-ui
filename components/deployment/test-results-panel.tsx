"use client";

import { useMemo } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConversionStore } from "@/lib/store";
import type { TestResult } from "@/lib/types";

const CATEGORY_LABELS: Record<TestResult["category"], string> = {
  existence: "Resource Existence",
  connectivity: "Connectivity",
  config_validation: "Config Validation",
};

const CATEGORY_ORDER: TestResult["category"][] = [
  "existence",
  "connectivity",
  "config_validation",
];

export function TestResultsPanel() {
  const testResults = useConversionStore((s) => s.testResults);
  const deploymentStatus = useConversionStore((s) => s.deploymentStatus);

  // Group results by category using useMemo (safe for zustand v5 + React 19)
  const grouped = useMemo(() => {
    const groups: Record<TestResult["category"], TestResult[]> = {
      existence: [],
      connectivity: [],
      config_validation: [],
    };
    for (const result of testResults) {
      groups[result.category].push(result);
    }
    return groups;
  }, [testResults]);

  const totalPassed = useMemo(
    () => testResults.filter((r) => r.passed).length,
    [testResults]
  );
  const totalFailed = useMemo(
    () => testResults.filter((r) => !r.passed).length,
    [testResults]
  );

  if (testResults.length === 0 && deploymentStatus === "idle") {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Deploy to see test results
      </div>
    );
  }

  if (testResults.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Waiting for test results…
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      {/* Summary bar */}
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {testResults.length} test{testResults.length !== 1 ? "s" : ""}
        </span>
        {totalPassed > 0 && (
          <Badge variant="secondary" className="bg-green-500/10 text-green-600 border-green-500/20">
            {totalPassed} passed
          </Badge>
        )}
        {totalFailed > 0 && (
          <Badge variant="secondary" className="bg-red-500/10 text-red-600 border-red-500/20">
            {totalFailed} failed
          </Badge>
        )}
      </div>

      {/* Grouped results */}
      {CATEGORY_ORDER.map((category) => {
        const results = grouped[category];
        if (results.length === 0) return null;

        return (
          <div key={category} className="border-b last:border-b-0">
            <div className="px-4 py-2 bg-muted/30">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {CATEGORY_LABELS[category]}
              </span>
            </div>
            {results.map((result, i) => (
              <div
                key={i}
                className="flex items-start gap-2 px-4 py-2 hover:bg-muted/20 transition-colors"
              >
                {result.passed ? (
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium break-all">
                    {result.testName}
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {result.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </ScrollArea>
  );
}
