// ---------------------------------------------------------------------------
// Agentic streaming loop for Bicep-to-Terraform conversion.
//
// Calls Claude with tools in a loop, streaming text deltas to the client
// and dispatching tool calls to local handlers until the model is done.
// ---------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ContentBlock,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";
import { bicepTools } from "./tools";
import { createToolHandlers, type ToolHandlerCallbacks } from "./tool-handlers";
import { SYSTEM_PROMPT } from "./system-prompt";
import type { StreamEvent, ToolCallInfo } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 8192;
const MAX_TOOL_ROUNDS = 30;

// ---------------------------------------------------------------------------
// Human-readable labels for tool names
// ---------------------------------------------------------------------------

function getToolLabel(toolName: string): string {
  const labels: Record<string, string> = {
    read_bicep_file: "Reading Bicep file",
    parse_bicep: "Parsing Bicep content",
    lookup_resource_mapping: "Looking up resource mapping",
    generate_terraform: "Generating Terraform HCL",
    write_terraform_files: "Writing Terraform files",
    validate_terraform: "Validating Terraform",
    list_bicep_files: "Listing Bicep files",
  };
  return labels[toolName] ?? toolName;
}

// ---------------------------------------------------------------------------
// Main streaming entrypoint
// ---------------------------------------------------------------------------

export async function chatStream(
  bicepContent: string,
  emit: (event: StreamEvent) => void,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<void> {
  const client = apiKey ? new Anthropic({ apiKey }) : new Anthropic();

  // Accumulate full text and tool call info across rounds
  let fullReply = "";
  const allToolCalls: ToolCallInfo[] = [];

  // Wire up callbacks so we can emit side-effects from tool handlers
  const handlerCallbacks: ToolHandlerCallbacks = {
    onTerraformOutput: (files) => {
      emit({ type: "terraform_output", files });
    },
    onValidation: (passed, output) => {
      emit({ type: "validation", passed, output });
    },
  };
  const handlers = createToolHandlers(handlerCallbacks);

  // Build initial messages array
  const messages: MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Convert the following Azure Bicep template to Terraform/OpenTofu HCL. " +
            "The Bicep content is provided inline below — skip read_bicep_file and start with parse_bicep. " +
            "Batch your tool calls aggressively (all lookups in one turn, all generates in one turn).\n\n" +
            "```bicep\n" +
            bicepContent +
            "\n```",
        },
      ],
    },
  ];

  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;

    // Check for cancellation
    if (signal?.aborted) {
      emit({ type: "error", message: "Conversion cancelled" });
      return;
    }

    emit({
      type: "progress",
      step: round,
      total: MAX_TOOL_ROUNDS,
      label: round === 1 ? "Starting conversion" : `Tool round ${round}`,
    });

    // Create the streaming request
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: bicepTools,
      messages,
    });

    // Forward text deltas as they arrive
    stream.on("text", (textDelta) => {
      fullReply += textDelta;
      emit({ type: "text_delta", text: textDelta });
    });

    // Wait for the complete message
    let finalMessage: Anthropic.Message;
    try {
      finalMessage = await stream.finalMessage();
    } catch (err: unknown) {
      if (signal?.aborted) {
        emit({ type: "error", message: "Conversion cancelled" });
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      emit({ type: "error", message: `API error: ${msg}` });
      return;
    }

    // If the model did not request tool use, we are done
    if (finalMessage.stop_reason !== "tool_use") {
      emit({
        type: "done",
        fullReply,
        toolCalls: allToolCalls,
      });
      return;
    }

    // Extract all ToolUseBlocks from the response
    const toolUseBlocks = finalMessage.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use",
    );

    // Process each tool call sequentially
    const toolResults: ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;
      const toolCall: ToolCallInfo = {
        tool: toolUse.name,
        input: toolInput,
      };
      allToolCalls.push(toolCall);

      emit({
        type: "tool_start",
        toolName: toolUse.name,
        toolInput,
      });

      emit({
        type: "progress",
        step: round,
        total: MAX_TOOL_ROUNDS,
        label: getToolLabel(toolUse.name),
      });

      // Dispatch to handler
      const handler = handlers[toolUse.name];
      let resultText: string;
      let isError = false;

      if (!handler) {
        resultText = `Error: Unknown tool '${toolUse.name}'`;
        isError = true;
      } else {
        try {
          resultText = await handler(toolInput);
          isError = resultText.startsWith("Error:");
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          resultText = `Error: Tool execution failed: ${msg}`;
          isError = true;
        }
      }

      emit({
        type: "tool_result",
        toolName: toolUse.name,
        isError,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: resultText,
        is_error: isError,
      });
    }

    // Append the assistant's response and all tool results to messages
    messages.push({
      role: "assistant",
      content: finalMessage.content as ContentBlock[],
    });
    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  // Exhausted max rounds
  emit({
    type: "done",
    fullReply:
      fullReply +
      "\n\n[Reached maximum tool rounds. Some steps may not have completed.]",
    toolCalls: allToolCalls,
  });
}
