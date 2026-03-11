// ---------------------------------------------------------------------------
// POST /api/convert — SSE endpoint for Bicep-to-Terraform conversion.
//
// Accepts { bicepContent: string } in the JSON body.
// Streams back server-sent events with StreamEvent payloads.
// ---------------------------------------------------------------------------

import { NextRequest } from "next/server";
import { chatStream } from "@/lib/agent/stream";
import type { StreamEvent } from "@/lib/types";

/** Allow up to 5 minutes for long conversions with many tool rounds. */
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let bicepContent: string;

  let apiKey: string | undefined;

  try {
    const body = await request.json();
    bicepContent = body.bicepContent;
    apiKey = typeof body.apiKey === "string" ? body.apiKey : undefined;

    if (!bicepContent || typeof bicepContent !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'bicepContent' in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create a TransformStream to push SSE data to the response
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Helper to write a single SSE event
  function sendEvent(event: StreamEvent): void {
    const data = JSON.stringify(event);
    writer.write(encoder.encode(`data: ${data}\n\n`)).catch(() => {
      // Client disconnected — ignore write errors
    });
  }

  // Use the request signal for cancellation when the client disconnects
  const signal = request.signal;

  // Start the agent loop in the background — it writes to the stream as it goes
  chatStream(bicepContent, sendEvent, signal, apiKey)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      sendEvent({ type: "error", message });
    })
    .finally(() => {
      // Close the SSE stream
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
