"use client";

import { useCallback } from "react";
import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/sonner";
import type { ConversationMessage } from "@/lib/types";

interface ChatMessageProps {
  message: ConversationMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      toast.success("Copied to clipboard");
    });
  }, [message.content]);

  return (
    <div
      className={cn(
        "group flex gap-3 px-4 py-3",
        isAssistant ? "bg-muted/30" : ""
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium",
          isAssistant
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isAssistant ? "AI" : "U"}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium">
            {isAssistant ? "Assistant" : "You"}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={handleCopy}
            aria-label="Copy message"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
          {message.content}
        </div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <Badge key={i} variant="secondary" className="font-mono">
                {tc.tool}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
