"use client";

import { useConversionStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DestroyDialogProps {
  open: boolean;
  onDestroy: () => void;
  onKeep: () => void;
}

export function DestroyDialog({ open, onDestroy, onKeep }: DestroyDialogProps) {
  const resourceGroup = useConversionStore((s) => s.deployResourceGroup);
  const deploySummary = useConversionStore((s) => s.deploySummary);

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deployment Complete</DialogTitle>
          <DialogDescription>
            Your resources have been deployed and tested. What would you like to do with them?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {resourceGroup && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Resource group:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
                {resourceGroup}
              </code>
            </div>
          )}

          {deploySummary && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600">
                {deploySummary.testsPassed} test{deploySummary.testsPassed !== 1 ? "s" : ""} passed
              </span>
              {deploySummary.testsFailed > 0 && (
                <span className="text-red-600">
                  {deploySummary.testsFailed} test{deploySummary.testsFailed !== 1 ? "s" : ""} failed
                </span>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button variant="outline" onClick={onKeep}>
            Keep Resources
          </Button>
          <Button variant="destructive" onClick={onDestroy}>
            Destroy Resources
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
