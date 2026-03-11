"use client";

import { useEffect } from "react";
import { useConversionStore } from "@/lib/store";

export function StoreHydration() {
  useEffect(() => {
    const key = "bicep-converter-history";
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const history = JSON.parse(raw);
        useConversionStore.getState().setHistory(history);
      }
    } catch {
      // ignore parse errors
    }
  }, []);
  return null;
}
