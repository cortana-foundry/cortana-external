"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export type ToastTone = "default" | "success" | "error";

type ToastEntry = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  toasts: ToastEntry[];
  showToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
};

const TOAST_AUTO_DISMISS_MS = 2500;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const idRef = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = "default") => {
    const trimmed = message?.trim();
    if (!trimmed) return;
    idRef.current += 1;
    const id = idRef.current;
    setToasts((current) => [...current, { id, message: trimmed, tone }]);
  }, []);

  const value = useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return { showToast: ctx.showToast };
}

const subscribeNoop = () => () => undefined;
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export function Toaster() {
  const ctx = useContext(ToastContext);
  const mounted = useSyncExternalStore(subscribeNoop, getClientSnapshot, getServerSnapshot);

  if (!ctx || !mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {ctx.toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => ctx.dismissToast(toast.id)}
        />
      ))}
    </div>,
    document.body,
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, TOAST_AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto rounded-full bg-foreground px-4 py-2 text-sm text-background shadow-lg motion-safe:animate-entrance",
        toast.tone === "success" ? "ring-1 ring-emerald-500/40" : null,
        toast.tone === "error" ? "ring-1 ring-destructive/60" : null,
      )}
    >
      {toast.message}
    </div>
  );
}
