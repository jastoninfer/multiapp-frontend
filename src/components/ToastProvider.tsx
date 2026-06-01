import { createContext, PropsWithChildren, useCallback, useContext, useMemo, useRef, useState } from "react";

interface ToastItem {
  id: number;
  message: string;
}

interface ToastContextValue {
  notify: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 4200;
const TOAST_DEDUPE_MS = 1200;

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(1);
  const recentMessagesRef = useRef(new Map<string, number>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message: string) => {
    const normalized = message.trim();
    if (!normalized) return;

    const now = Date.now();
    const lastShownAt = recentMessagesRef.current.get(normalized) ?? 0;
    if (now - lastShownAt < TOAST_DEDUPE_MS) return;
    recentMessagesRef.current.set(normalized, now);

    const id = nextIdRef.current;
    nextIdRef.current += 1;
    setItems((current) => [...current.slice(-2), { id, message: normalized }]);
    window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
  }, [dismiss]);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {items.map((item) => (
          <div className="toast" role="status" key={item.id}>
            <span>{item.message}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}>x</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used within ToastProvider");
  return value;
}
