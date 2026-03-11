// ---------------------------------------------------------------------------
// POST /api/deploy — SSE endpoint for deployment testing.
//
// Accepts { terraformFiles, workingDir, resourceGroupName, bicepContent, apiKey? }.
// Streams back server-sent events with DeployStreamEvent payloads.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { deployStream } from "@/lib/deploy-agent/stream";
import type { DeployStreamEvent } from "@/lib/types";

/** Allow up to 10 minutes for deployment + testing. */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  let terraformFiles: Record<string, string>;
  let workingDir: string;
  let resourceGroupName: string;
  let bicepContent: string;
  let apiKey: string | undefined;

  try {
    const body = await request.json();
    terraformFiles = body.terraformFiles;
    workingDir = body.workingDir;
    resourceGroupName = body.resourceGroupName;
    bicepContent = body.bicepContent ?? "";
    apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;

    if (!terraformFiles || typeof terraformFiles !== "object") {
      return Response.json(
        { error: "Missing or invalid 'terraformFiles'" },
        { status: 400 },
      );
    }
    if (!workingDir || typeof workingDir !== "string") {
      return Response.json(
        { error: "Missing or invalid 'workingDir'" },
        { status: 400 },
      );
    }
    if (!resourceGroupName || typeof resourceGroupName !== "string") {
      return Response.json(
        { error: "Missing or invalid 'resourceGroupName'" },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Create a TransformStream to push SSE data to the response
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Helper to write a single SSE event
  function sendEvent(event: DeployStreamEvent): void {
    const data = JSON.stringify(event);
    writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {
      // Client disconnected — ignore write errors
    });
  }

  // Use the request signal for cancellation
  const signal = request.signal;

  // Start the deployment agent loop in the background
  deployStream(
    terraformFiles,
    workingDir,
    resourceGroupName,
    bicepContent,
    sendEvent,
    signal,
    apiKey,
  )
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent({ type: "error", message });
    })
    .finally(() => {
      writer.close().catch(() => {
        // Already closed — ignore
      });
    });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
