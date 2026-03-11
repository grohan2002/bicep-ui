"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2 } from "lucide-react";
import { useConversionStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "@/components/chat/chat-message";

export function DeployChatPanel() {
  const messages = useConversionStore((s) => s.deployMessages);
  const streamingText = useConversionStore((s) => s.deployStreamingText);
  const activeToolName = useConversionStore((s) => s.deployActiveToolName);
  const deploymentStatus = useConversionStore((s) => s.deploymentStatus);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);

  const isNearBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // Auto-scroll only when near bottom
  useEffect(() => {
    if (isNearBottom()) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
      });
    }
  }, [messages, streamingText, activeToolName, isNearBottom]);

  // Track scroll position for scroll-to-bottom button
  const handleScroll = useCallback(() => {
    setShowScrollBtn(!isNearBottom());
  }, [isNearBottom]);

  const isActive =
    deploymentStatus === "deploying" ||
    deploymentStatus === "testing" ||
    deploymentStatus === "destroying";

  if (messages.length === 0 && !isActive) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Run a deployment to see the agent conversation
      </div>
    );
  }

  return (
    <div className="relative h-full">
      <ScrollArea
        ref={scrollRef}
        className="h-full"
        onScroll={handleScroll}
      >
        {messages.map((msg, i) => (
          <ChatMessage key={i} message={msg} />
        ))}

        {/* Streaming text preview */}
        {isActive && streamingText && (
          <div className="flex gap-3 bg-muted/30 px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-xs font-medium">
              DA
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-medium">Deploy Agent</span>
                <span className="text-xs text-muted-foreground">streaming...</span>
              </div>
              <div className="text-sm leading-relaxed whitespace-pre-wrap break-words text-foreground/90">
                {streamingText}
              </div>
            </div>
          </div>
        )}

        {/* Active tool indicator */}
        {activeToolName && (
          <div className="flex items-center gap-2 px-4 py-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <Badge variant="secondary" className="font-mono text-xs">
              {activeToolName}
            </Badge>
          </div>
        )}
      </ScrollArea>

      {/* Scroll-to-bottom button */}
      {showScrollBtn && (
        <Button
          variant="outline"
          size="icon"
          className="absolute bottom-2 right-2 h-7 w-7 rounded-full shadow-md"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
