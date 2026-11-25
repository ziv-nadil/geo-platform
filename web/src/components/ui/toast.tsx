"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastItem {
  id: number;
  message: string;
}

/** Minimal error toasts: `const { toast, region } = useToasts();` render `{region}` once, call `toast("...")`. */
export function useToasts(ttlMs = 8000) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    (message: string) => {
      const id = next.current++;
      setItems((l) => [...l.slice(-3), { id, message }]);
      const t = setTimeout(() => dismiss(id), ttlMs);
      timers.current.add(t);
    },
    [dismiss, ttlMs],
  );
  const region = (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="assertive">
      {items.map((t) => (
        <div key={t.id} role="alert" data-testid="toast" className="pointer-events-auto flex items-start gap-3 rounded-md border border-bad/30 bg-surface px-4 py-3 text-sm text-ink shadow-md">
          <span className="min-w-0 flex-1">{t.message}</span>
          <button type="button" onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-ink-3 hover:text-ink">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
  return { toast, region };
}
