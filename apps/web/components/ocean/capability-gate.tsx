"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList, type ReactNode } from "react";
import { Ban, RefreshCw, ServerCrash, ShieldAlert } from "lucide-react";

/**
 * Unified capabilities / feature-flag gate.
 *
 * Mapping rules (never falls back to fabricated data):
 * - 404 / 501          -> "feature not open yet" (unavailable)
 * - payload enabled=false / CAPABILITY_* codes -> unavailable (feature disabled)
 * - 401 / 403          -> unauthorized
 * - 5xx / network      -> service error, with retry
 */
export type CapabilityState =
  | { status: "loading" }
  | { status: "available" }
  | { status: "unavailable"; reason: "not_implemented" | "feature_disabled"; message?: string }
  | { status: "error"; message: string }
  | { status: "unauthorized" };

type LoadResult = unknown | { enabled?: boolean };

export function capabilityStateFromError(reason: unknown): CapabilityState {
  const raw = String((reason as Error)?.message || reason);
  if (/CAPABILITY_(DISABLED|NOT_IMPLEMENTED|PARTIAL)|HARNESS_DISABLED|MEMORY_DISABLED/.test(raw)) {
    return { status: "unavailable", reason: "feature_disabled" };
  }
  const status = (reason as Error & { status?: number })?.status ?? 0;
  if (status === 401 || status === 403) return { status: "unauthorized" };
  if (status === 404 || status === 501) return { status: "unavailable", reason: "not_implemented" };
  if (status >= 500) return { status: "error", message: "HTTP " + status };
  return { status: "error", message: (reason as Error)?.message || "Network error" };
}

export function useCapabilityGate<T = LoadResult>(
  load: () => Promise<T>,
  deps: DependencyList = []
): { state: CapabilityState; retry: () => void; value: T | undefined } {
  const [state, setState] = useState<CapabilityState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [value, setValue] = useState<T | undefined>(undefined);
  const activeRef = useRef(false);
  const generationRef = useRef(0);

  const run = useCallback(() => {
    setState({ status: "loading" });
    setValue(undefined);
    const generation = ++generationRef.current;
    const isCurrent = () => activeRef.current && generation === generationRef.current;
    Promise.resolve().then(load)
      .then((payload) => {
        if (!isCurrent()) return;
        const enabled = (payload as { enabled?: boolean })?.enabled;
        if (enabled === false) {
          setState({ status: "unavailable", reason: "feature_disabled" });
          return;
        }
        setValue(() => payload);
        setState({ status: "available" });
      })
      .catch((reason) => {
        if (!isCurrent()) return;
        setState(capabilityStateFromError(reason));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    activeRef.current = true;
    run();
    return () => {
      activeRef.current = false;
      generationRef.current += 1;
    };
  }, [run, attempt]);

  return { state, value, retry: () => setAttempt((attempt) => attempt + 1) };
}

export function CapabilityGate({ state, locale, title, onRetry, children }: {
  state: CapabilityState;
  locale: "en" | "zh";
  title?: string;
  onRetry?: () => void;
  children: ReactNode;
}) {
  const zh = locale === "zh";
  if (state.status === "loading") {
    return (
      <div role="status" aria-label={zh ? "正在加载" : "Loading"} className="grid min-h-40 place-items-center rounded-xl border border-border-pg bg-bg-panel p-6 text-sm text-text-pg-muted">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /><span className="sr-only">{zh ? "正在加载" : "Loading"}</span>
      </div>
    );
  }
  if (state.status === "available") return <>{children}</>;
  if (state.status === "unauthorized") {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-border-pg bg-bg-panel p-5">
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{zh ? "需要登录或更高权限" : "Sign-in or higher permissions required"}</p>
          <p className="mt-1 text-xs text-text-pg-muted">{zh ? "请登录后重试；当前账号没有访问该功能的权限。" : "Sign in and retry; your account is not permitted to use this feature."}</p>
        </div>
      </div>
    );
  }
  if (state.status === "error") {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-status-negative bg-bg-panel p-5">
        <ServerCrash className="mt-0.5 h-5 w-5 shrink-0 text-status-negative" aria-hidden />
        <div>
          <p className="text-sm font-semibold">{zh ? "服务异常" : "Service error"}</p>
          <p className="mt-1 text-xs text-text-pg-muted">{zh ? "暂时无法加载该功能，请稍后重试。" : "This feature could not be loaded. Please try again shortly."}</p>
          {onRetry ? (
            <button type="button" onClick={onRetry} className="pg-button pg-button-secondary mt-3 min-h-11 gap-2 px-3 text-sm">
              <RefreshCw className="h-3 w-3" aria-hidden />
              {zh ? "重试" : "Retry"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  return (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-border-pg bg-bg-panel p-5">
      <Ban className="mt-0.5 h-5 w-5 shrink-0 text-text-pg-muted" aria-hidden />
      <div>
        <p className="text-sm font-semibold">{title || (zh ? "功能暂不可用" : "Feature not available yet")}</p>
        <p className="mt-1 text-xs leading-5 text-text-pg-muted">
          {state.reason === "feature_disabled"
            ? zh ? "该功能当前未对你的账号开放。" : "This feature is not enabled for your account right now."
            : zh ? "该功能尚未开放。我们不会显示占位或模拟数据；开放后会在此显示真实数据。" : "This feature has not been opened yet. No placeholder or mock data is shown here; real data will appear once it is available."}
        </p>
        {state.message ? <p className="mt-1 text-xs text-text-pg-muted">{state.message}</p> : null}
      </div>
    </div>
  );
}
