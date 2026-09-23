import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

type ToastKind = "success" | "error" | "warning" | "info" | "loading";

type ToastItem = {
  id: number;
  kind: ToastKind;
  title: string;
  message: string;
  duration?: number;
};

type ConfirmRequest = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

type NotificationContextValue = {
  showToast: (toast: Omit<ToastItem, "id">) => void;
  confirmAction: (request: Omit<ConfirmRequest, "onConfirm"> & { onConfirm: () => void | Promise<void> }) => Promise<boolean>;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    return {
      showToast: () => undefined,
      confirmAction: async () => true,
    } satisfies NotificationContextValue;
  }
  return context;
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 1100,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        width: "min(360px, calc(100vw - 24px))",
        pointerEvents: "none",
      }}
    >
      {toasts.map((toast) => {
        const accent =
          toast.kind === "success"
            ? "#22c55e"
            : toast.kind === "error"
              ? "#ef4444"
              : toast.kind === "warning"
                ? "#f59e0b"
                : toast.kind === "loading"
                  ? "#8b5cf6"
                  : "#38bdf8";
        return (
          <div
            key={toast.id}
            role="status"
            style={{
              pointerEvents: "auto",
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              background: "rgba(15, 23, 42, 0.94)",
              border: `1px solid ${accent}22`,
              borderLeft: `4px solid ${accent}`,
              borderRadius: 14,
              boxShadow: "0 18px 45px rgba(15, 23, 42, 0.28)",
              padding: "12px 14px",
              color: "#e2e8f0",
              animation: "toast-in 180ms ease-out",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                marginTop: 6,
                background: accent,
                boxShadow: `0 0 18px ${accent}`,
                flexShrink: 0,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{toast.title}</div>
              <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.5 }}>{toast.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({
  request,
  onClose,
  onConfirmStart,
}: {
  request: ConfirmRequest | null;
  onClose: () => void;
  onConfirmStart: () => void;
}) {
  if (!request) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.68)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: "min(420px, calc(100vw - 24px))",
          background: "#0f172a",
          border: "1px solid rgba(148,163,184,0.25)",
          borderRadius: 18,
          boxShadow: "0 24px 80px rgba(15, 23, 42, 0.5)",
          padding: 22,
          color: "#e2e8f0",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{request.title}</div>
        <div style={{ fontSize: 14, color: "#cbd5e1", lineHeight: 1.6 }}>{request.message}</div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 }}>
          <button className="button button-outline" type="button" onClick={onClose}>
            {request.cancelLabel || "Cancel"}
          </button>
          <button
            className={`button ${request.destructive ? "button-danger" : "button-dark"}`}
            type="button"
            onClick={async () => {
              onConfirmStart();
              await request.onConfirm();
            }}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<(() => void) | null>(null);

  const showToast = useCallback((toast: Omit<ToastItem, "id">) => {
    const id = Date.now() + Math.random();
    const nextToast: ToastItem = { ...toast, id, duration: toast.duration ?? 3200 };
    setToasts((current) => [...current, nextToast]);
  }, []);

  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, toast.duration ?? 3200),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts]);

  const confirmAction = useCallback(
    (request: Omit<ConfirmRequest, "onConfirm"> & { onConfirm: () => void | Promise<void> }) =>
      new Promise<boolean>((resolve) => {
        setConfirmCancel(() => () => resolve(false));
        setConfirmRequest({
          ...request,
          onConfirm: async () => {
            try {
              await request.onConfirm();
              resolve(true);
            } catch (cause) {
              showToast({
                kind: "error",
                title: "Action failed",
                message: (cause as Error).message || "Unable to complete that action.",
              });
              resolve(false);
            }
          },
        });
      }),
    [showToast],
  );

  const closeConfirm = useCallback(() => {
    confirmCancel?.();
    setConfirmCancel(null);
    setConfirmRequest(null);
  }, [confirmCancel]);

  const startConfirm = useCallback(() => {
    setConfirmCancel(null);
    setConfirmRequest(null);
  }, []);

  return (
    <NotificationContext.Provider value={{ showToast, confirmAction }}>
      {children}
      <ToastViewport toasts={toasts} />
      <ConfirmDialog
        request={confirmRequest}
        onClose={closeConfirm}
        onConfirmStart={startConfirm}
      />
    </NotificationContext.Provider>
  );
}
