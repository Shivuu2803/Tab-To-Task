import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

type Tone = 'info' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: Tone;
}

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

export const useToast = () => useContext(ToastContext);

/**
 * A write to chrome.storage can fail — the 10MB quota, a corrupted profile, a
 * browser shutting down mid-call. Before this, those failures were unhandled
 * rejections: the user's edit silently vanished with no message. Every
 * mutation now reports through here.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Tone = 'error') => {
    setToasts((current) => [...current, { id: Date.now() + Math.random(), message, tone }]);
  }, []);

  // Stable across renders. A fresh closure per toast would re-run each row's
  // timer effect whenever any toast is added, restarting the older timers.
  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      {toasts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-2 bottom-2 z-50 space-y-1.5">
          {toasts.map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const styles =
    toast.tone === 'error'
      ? 'bg-red-600 text-white'
      : 'bg-slate-800 text-white dark:bg-slate-700';

  // `alert` for errors so a screen reader interrupts; `status` waits its turn.

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto rounded-lg px-3 py-2 text-xs shadow-lg ${styles}`}
    >
      {toast.message}
    </div>
  );
}

/**
 * Wraps a storage mutation so a failure becomes a visible message instead of a
 * silent no-op. Returns whether the action succeeded.
 */
export function useGuardedAction() {
  const toast = useToast();
  return useCallback(
    async (action: () => Promise<unknown>, failureMessage: string): Promise<boolean> => {
      try {
        await action();
        return true;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        toast(`${failureMessage} ${detail}`.trim());
        return false;
      }
    },
    [toast],
  );
}
