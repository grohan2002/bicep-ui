"use client";

import { useCallback, useRef } from "react";
import { useConversionStore } from "@/lib/store";
import { sendConversionStream } from "@/lib/stream-client";
import type { ConversionCallbacks } from "@/lib/stream-client";
import type { ConversionHistoryEntry } from "@/lib/types";
import { toast } from "@/components/ui/sonner";
import { v4 as uuidv4 } from "uuid";

export function useConversion() {
  const abortRef = useRef<AbortController | null>(null);

  const startConversion = useCallback(
    async (bicepContentArg?: string, bicepFilenameArg?: string, apiKey?: string) => {
      const store = useConversionStore.getState();
      const bicepContent = bicepContentArg ?? store.bicepContent;
      const bicepFilename = bicepFilenameArg ?? (store.bicepFilename || undefined);

      if (!bicepContent.trim()) return;

      // Cancel any in-flight conversion
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Reset and set converting state
      store.resetConversion();
      store.resetStreamingText();
      store.setBicepContent(bicepContent, bicepFilename);
      store.setStatus("converting");

      toast("Conversion started", {
        description: bicepFilename || "Untitled.bicep",
      });

      store.addMessage({
        role: "user",
        content: `Convert Bicep file${bicepFilename ? ` (${bicepFilename})` : ""} to Terraform.`,
        timestamp: new Date().toISOString(),
      });

      const callbacks: ConversionCallbacks = {
        onTextDelta: (text) => {
          useConversionStore.getState().appendStreamingText(text);
        },

        onToolStart: (toolName, toolInput) => {
          const s = useConversionStore.getState();
          s.setActiveToolName(toolName);
          s.addToolCall({ tool: toolName, input: toolInput });
        },

        onToolResult: () => {
          useConversionStore.getState().setActiveToolName(null);
        },

        onTerraformOutput: (files) => {
          useConversionStore.getState().setTerraformFiles(files);
        },

        onValidation: (passed, output) => {
          const s = useConversionStore.getState();
          s.setStatus("validating");
          s.setValidationResult({ passed, output });
        },

        onProgress: (step, total, label) => {
          useConversionStore.getState().setProgress({ step, total, label });
        },

        onDone: (fullReply, toolCalls) => {
          const s = useConversionStore.getState();
          s.setStatus("done");
          s.setActiveToolName(null);
          s.setProgress(null);

          s.addMessage({
            role: "assistant",
            content: fullReply,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            timestamp: new Date().toISOString(),
          });

          const entry: ConversionHistoryEntry = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            bicepFile: s.bicepFilename || "untitled.bicep",
            bicepContent: s.bicepContent,
            terraformFiles: s.terraformFiles,
            validationPassed: s.validationResult?.passed ?? false,
            agentConversation: s.messages,
            resourcesConverted: Object.keys(s.terraformFiles).length,
          };
          s.addHistoryEntry(entry);

          toast.success("Conversion complete", {
            description: `${Object.keys(s.terraformFiles).length} file(s) generated`,
          });
        },

        onError: (message) => {
          const s = useConversionStore.getState();
          s.setStatus("error");
          s.setActiveToolName(null);
          s.setProgress(null);

          s.addMessage({
            role: "assistant",
            content: `Error: ${message}`,
            timestamp: new Date().toISOString(),
          });

          toast.error("Conversion failed", { description: message });
        },
      };

      try {
        await sendConversionStream(bicepContent, callbacks, controller.signal, apiKey);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          useConversionStore.getState().setStatus("error");
          useConversionStore.getState().addMessage({
            role: "assistant",
            content: `Unexpected error: ${String(err)}`,
            timestamp: new Date().toISOString(),
          });
          toast.error("Unexpected error", { description: String(err) });
        }
      }
    },
    []
  );

  const cancelConversion = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const s = useConversionStore.getState();
    s.setStatus("idle");
    s.setActiveToolName(null);
    s.setProgress(null);
    toast("Conversion cancelled");
  }, []);

  return { startConversion, cancelConversion };
}
