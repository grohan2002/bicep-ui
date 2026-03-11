"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// --------------------------------------------------------------------------
// Lightweight, self-contained toast system (no external dependency).
// Usage:
//   import { toast, Toaster } from "@/components/ui/sonner"
//   // Place <Toaster /> once at the root of your app.
//   toast("Hello world")
//   toast.success("Saved!")
//   toast.error("Something went wrong")
// --------------------------------------------------------------------------

type ToastVariant = "default" | "success" | "error" | "info" | "warning"

interface ToastMessage {
  id: string
  message: React.ReactNode
  description?: React.ReactNode
  variant: ToastVariant
  duration: number
}

type ToastListener = (toasts: ToastMessage[]) => void

let toasts: ToastMessage[] = []
let listeners: ToastListener[] = []
let idCounter = 0

function notify() {
  listeners.forEach((l) => l([...toasts]))
}

function addToast(
  message: React.ReactNode,
  options: { description?: React.ReactNode; variant?: ToastVariant; duration?: number } = {}
) {
  const id = String(++idCounter)
  const toast: ToastMessage = {
    id,
    message,
    description: options.description,
    variant: options.variant ?? "default",
    duration: options.duration ?? 4000,
  }
  toasts = [...toasts, toast]
  notify()

  if (toast.duration > 0) {
    setTimeout(() => {
      dismissToast(id)
    }, toast.duration)
  }

  return id
}

function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id)
  notify()
}

function toast(message: React.ReactNode, options?: { description?: React.ReactNode; duration?: number }) {
  return addToast(message, options)
}

toast.success = (message: React.ReactNode, options?: { description?: React.ReactNode; duration?: number }) =>
  addToast(message, { ...options, variant: "success" })

toast.error = (message: React.ReactNode, options?: { description?: React.ReactNode; duration?: number }) =>
  addToast(message, { ...options, variant: "error" })

toast.info = (message: React.ReactNode, options?: { description?: React.ReactNode; duration?: number }) =>
  addToast(message, { ...options, variant: "info" })

toast.warning = (message: React.ReactNode, options?: { description?: React.ReactNode; duration?: number }) =>
  addToast(message, { ...options, variant: "warning" })

toast.dismiss = dismissToast

// ---- Toaster component ----

interface ToasterProps {
  position?: "top-left" | "top-right" | "top-center" | "bottom-left" | "bottom-right" | "bottom-center"
  className?: string
}

const positionClasses: Record<string, string> = {
  "top-left": "top-4 left-4",
  "top-right": "top-4 right-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-left": "bottom-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
}

const variantClasses: Record<ToastVariant, string> = {
  default: "border-border bg-background text-foreground",
  success: "border-green-500/30 bg-background text-foreground",
  error: "border-destructive/30 bg-background text-foreground",
  info: "border-blue-500/30 bg-background text-foreground",
  warning: "border-yellow-500/30 bg-background text-foreground",
}

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: null,
  success: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  error: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  ),
  info: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  ),
  warning: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-500">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  ),
}

function Toaster({ position = "bottom-right", className }: ToasterProps) {
  const [currentToasts, setCurrentToasts] = React.useState<ToastMessage[]>([])

  React.useEffect(() => {
    listeners.push(setCurrentToasts)
    return () => {
      listeners = listeners.filter((l) => l !== setCurrentToasts)
    }
  }, [])

  if (currentToasts.length === 0) return null

  return (
    <div
      className={cn(
        "fixed z-[100] flex flex-col gap-2 w-[356px] max-w-[calc(100vw-2rem)]",
        positionClasses[position],
        className
      )}
    >
      {currentToasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "flex items-start gap-3 rounded-lg border p-4 shadow-lg animate-in slide-in-from-bottom-2 fade-in-0",
            variantClasses[t.variant]
          )}
        >
          {variantIcons[t.variant] && (
            <span className="mt-0.5 shrink-0">{variantIcons[t.variant]}</span>
          )}
          <div className="flex-1 space-y-1">
            <div className="text-sm font-semibold">{t.message}</div>
            {t.description && (
              <div className="text-sm text-muted-foreground">{t.description}</div>
            )}
          </div>
          <button
            type="button"
            className="shrink-0 rounded-md p-1 opacity-70 hover:opacity-100 transition-opacity"
            onClick={() => dismissToast(t.id)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  )
}

export { Toaster, toast }
