"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
  skipDelayDuration?: number
}

const TooltipDelayContext = React.createContext<number>(200)

function TooltipProvider({
  children,
  delayDuration = 200,
}: TooltipProviderProps) {
  return (
    <TooltipDelayContext.Provider value={delayDuration}>
      {children}
    </TooltipDelayContext.Provider>
  )
}

interface TooltipContextValue {
  open: boolean
  onOpenChange: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
}

const TooltipContext = React.createContext<TooltipContextValue | undefined>(undefined)

function useTooltipContext() {
  const context = React.useContext(TooltipContext)
  if (!context) {
    throw new Error("Tooltip components must be used within a Tooltip provider")
  }
  return context
}

interface TooltipProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

function Tooltip({ open: controlledOpen, defaultOpen = false, onOpenChange, children }: TooltipProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen)
  const triggerRef = React.useRef<HTMLElement | null>(null)

  const isControlled = controlledOpen !== undefined
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen

  const handleOpenChange = React.useCallback(
    (newOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(newOpen)
      }
      onOpenChange?.(newOpen)
    },
    [isControlled, onOpenChange]
  )

  return (
    <TooltipContext.Provider value={{ open: isOpen, onOpenChange: handleOpenChange, triggerRef }}>
      {children}
    </TooltipContext.Provider>
  )
}

interface TooltipTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const TooltipTrigger = React.forwardRef<HTMLButtonElement, TooltipTriggerProps>(
  ({ children, asChild, ...props }, ref) => {
    const { onOpenChange, triggerRef } = useTooltipContext()
    const delayDuration = React.useContext(TooltipDelayContext)
    const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleMouseEnter = React.useCallback(() => {
      timeoutRef.current = setTimeout(() => {
        onOpenChange(true)
      }, delayDuration)
    }, [delayDuration, onOpenChange])

    const handleMouseLeave = React.useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      onOpenChange(false)
    }, [onOpenChange])

    const setRefs = React.useCallback(
      (node: HTMLButtonElement | null) => {
        triggerRef.current = node
        if (typeof ref === "function") {
          ref(node)
        } else if (ref) {
          ref.current = node
        }
      },
      [ref, triggerRef]
    )

    return (
      <button
        ref={setRefs}
        type="button"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={() => onOpenChange(true)}
        onBlur={() => onOpenChange(false)}
        {...props}
      >
        {children}
      </button>
    )
  }
)
TooltipTrigger.displayName = "TooltipTrigger"

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
}

const TooltipContent = React.forwardRef<HTMLDivElement, TooltipContentProps>(
  ({ className, side = "top", sideOffset = 4, children, ...props }, ref) => {
    const { open, triggerRef } = useTooltipContext()
    const [position, setPosition] = React.useState({ top: 0, left: 0 })
    const contentRef = React.useRef<HTMLDivElement | null>(null)

    React.useEffect(() => {
      if (!open || !triggerRef.current) return

      const trigger = triggerRef.current
      const rect = trigger.getBoundingClientRect()

      const newPosition = { top: 0, left: 0 }

      switch (side) {
        case "top":
          newPosition.top = rect.top - sideOffset
          newPosition.left = rect.left + rect.width / 2
          break
        case "bottom":
          newPosition.top = rect.bottom + sideOffset
          newPosition.left = rect.left + rect.width / 2
          break
        case "left":
          newPosition.top = rect.top + rect.height / 2
          newPosition.left = rect.left - sideOffset
          break
        case "right":
          newPosition.top = rect.top + rect.height / 2
          newPosition.left = rect.right + sideOffset
          break
      }

      setPosition(newPosition)
    }, [open, side, sideOffset, triggerRef])

    if (!open) return null

    const transformOrigin = {
      top: "translate(-50%, -100%)",
      bottom: "translate(-50%, 0)",
      left: "translate(-100%, -50%)",
      right: "translate(0, -50%)",
    }

    return (
      <div
        ref={(node) => {
          contentRef.current = node
          if (typeof ref === "function") ref(node)
          else if (ref) ref.current = node
        }}
        role="tooltip"
        style={{
          position: "fixed",
          top: position.top,
          left: position.left,
          transform: transformOrigin[side],
          zIndex: 50,
        }}
        className={cn(
          "overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
