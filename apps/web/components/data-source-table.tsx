"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eye, KeyRound, Loader2, Pause, Play, RefreshCw, Settings2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { DataSourceStatusBadge } from "@/components/puregamma";
import type { Locale } from "@/i18n/routing";
import { checkDataSource, controlDataSource, DataSourcePreview, DataSourceRow, getDataSourcePreview, getDataSources, syncDataSource } from "@/lib/api";

const PRIMARY = ["rss", "fintwit", "x-twitter", "bloomberg"];
const primarySources = (rows: DataSourceRow[]) => rows.filter((row) => PRIMARY.includes(row.id)).sort((left, right) => PRIMARY.indexOf(left.id) - PRIMARY.indexOf(right.id));

export type DataSourceAvailability = { unavailable?: boolean; http_status?: number; error_code?: string };
export type DataSourceReadState = "loading" | "ready" | "empty" | "unauthorized" | "error";

export function dataSourceReadState(sources: unknown, availability: DataSourceAvailability = {}): Exclude<DataSourceReadState, "loading"> {
  const status = availability?.http_status;
  if (status === 401 || status === 403) return "unauthorized";
  if (availability?.unavailable || (status !== undefined && (status === 0 || status >= 400)) || !Array.isArray(sources) || !sources.every(row => row && typeof row === "object" && typeof row.id === "string")) return "error";
  return sources.length ? "ready" : "empty";
}

export function DataSourceTable({ initialSources, initialAvailability = {}, locale }: {
  initialSources: DataSourceRow[]; initialAvailability?: DataSourceAvailability; locale: Locale; labels?: Record<string, string>;
}) {
  const { unavailable: initialUnavailable, http_status: initialHttpStatus, error_code: initialErrorCode } = initialAvailability;
  const initialState = dataSourceReadState(initialSources, initialAvailability);
  const [catalog, setCatalog] = useState<DataSourceRow[]>(Array.isArray(initialSources) ? initialSources : []);
  const [readState, setReadState] = useState<DataSourceReadState>(initialState);
  const [availability, setAvailability] = useState(initialAvailability);
  const [hasSuccess, setHasSuccess] = useState(initialState === "ready" || initialState === "empty");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState("");
  const [preview, setPreview] = useState<DataSourcePreview | null>(null);
  const mounted = useRef(false);
  const lifecycle = useRef(0);
  const requestId = useRef(0);
  const reading = useRef(false);
  const acting = useRef(false);
  const zh = locale === "zh";

  useEffect(() => {
    mounted.current = true;
    lifecycle.current += 1;
    requestId.current += 1;
    reading.current = false; acting.current = false;
    const metadata = { unavailable: initialUnavailable, http_status: initialHttpStatus, error_code: initialErrorCode };
    const next = dataSourceReadState(initialSources, metadata);
    setReadState(next); setAvailability(metadata);
    setCatalog(Array.isArray(initialSources) ? initialSources : []);
    setHasSuccess(next === "ready" || next === "empty");
    setBusy(""); setError(""); setPreviewId(""); setPreview(null);
    return () => { mounted.current = false; lifecycle.current += 1; requestId.current += 1; };
  }, [initialSources, initialUnavailable, initialHttpStatus, initialErrorCode, locale]);

  const refresh = useCallback(async () => {
    if (reading.current) return;
    const scope = lifecycle.current, request = ++requestId.current;
    const current = () => mounted.current && lifecycle.current === scope && requestId.current === request;
    reading.current = true;
    setReadState("loading"); setError("");
    try {
      const result = await getDataSources(locale);
      if (!current()) return;
      const next = dataSourceReadState(result.sources, result);
      setAvailability({ unavailable: result.unavailable, http_status: result.http_status, error_code: result.error_code });
      setReadState(next);
      if (next === "ready" || next === "empty") {
        setCatalog(result.sources); setHasSuccess(true); setPreviewId(""); setPreview(null);
      } else if (next === "unauthorized") {
        // A retry after denial must not resurrect a formerly privileged cache.
        setCatalog([]); setHasSuccess(false); setPreviewId(""); setPreview(null);
      }
    } catch {
      if (current()) {
        setAvailability({ unavailable: true, error_code: "READ_FAILED" });
        setReadState("error");
      }
    } finally { if (current()) reading.current = false; }
  }, [locale]);

  const sources = hasSuccess && readState !== "unauthorized" ? primarySources(catalog) : [];
  const retained = hasSuccess && catalog.length > 0 && readState !== "ready" && readState !== "empty" && readState !== "unauthorized";
  const blocked = readState !== "ready" || Boolean(busy);
  const replace = (source: DataSourceRow) => setCatalog(rows => rows.map(row => row.id === source.id ? source : row));
  const revokeDeniedAccess = (reason: unknown) => {
    const status = (reason as { status?: unknown } | null)?.status;
    if (status !== 401 && status !== 403) return false;
    setAvailability({ unavailable: true, http_status: status });
    setReadState("unauthorized");
    setCatalog([]); setHasSuccess(false); setPreviewId(""); setPreview(null); setError("");
    return true;
  };
  const act = async (id: string, action: "sync" | "toggle" | "check") => {
    if (readState !== "ready" || reading.current || acting.current) return;
    const scope = lifecycle.current;
    const current = () => mounted.current && lifecycle.current === scope;
    acting.current = true; setBusy(`${id}:${action}`); setError("");
    try {
      const source = catalog.find(row => row.id === id);
      if (!source) return;
      if (action === "sync") {
        await syncDataSource(id);
        if (current()) await refresh();
      } else {
        const result = action === "toggle" ? await controlDataSource(id, !source.enabled) : await checkDataSource(id);
        if (current()) replace(result.source);
      }
    } catch (reason) {
      if (current() && !revokeDeniedAccess(reason)) setError(zh ? "操作结果未能确认。请刷新来源状态后再试。" : "The operation could not be confirmed. Refresh source status before trying again.");
    } finally { if (current()) { acting.current = false; setBusy(""); } }
  };
  const inspect = async (id: string) => {
    if (readState !== "ready" || reading.current || acting.current) return;
    if (previewId === id) { setPreviewId(""); setPreview(null); return; }
    const scope = lifecycle.current;
    const current = () => mounted.current && lifecycle.current === scope;
    acting.current = true; setBusy(`${id}:preview`); setError("");
    try {
      const result = await getDataSourcePreview(id);
      if (current()) { setPreview(result); setPreviewId(id); }
    } catch (reason) { if (current() && !revokeDeniedAccess(reason)) setError(zh ? "暂时无法读取预览，请稍后重试。" : "Preview could not be loaded. Please try again."); }
    finally { if (current()) { acting.current = false; setBusy(""); } }
  };

  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-text-pg-muted">{readState === "ready" || readState === "empty" ? (zh ? `已读取 ${catalog.length} 个来源 · 当前展示 ${sources.length} 个主要来源` : `${catalog.length} sources read · ${sources.length} primary sources shown`) : (zh ? "数据源状态" : "Data source status")}</p>
      <button type="button" disabled={readState === "loading" || Boolean(busy)} onClick={() => void refresh()} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-pg px-3 py-2 text-sm font-medium disabled:opacity-40">
        <RefreshCw className={`h-4 w-4 ${readState === "loading" ? "animate-spin" : ""}`} aria-hidden />{readState === "error" || readState === "unauthorized" ? (zh ? "重试来源状态" : "Retry source status") : (zh ? "刷新来源状态" : "Refresh source status")}
      </button>
    </div>
    {readState === "loading" ? <p role="status" className="rounded-xl border border-border-pg bg-bg-panel p-4 text-sm text-text-pg-muted">{zh ? "正在读取数据源状态…" : "Loading source status…"}{retained ? (zh ? " 下方保留上次确认的信息，更新完成前无法操作。" : " Last confirmed information remains below; actions are paused until the update completes.") : ""}</p> : null}
    {readState === "unauthorized" ? <div role="alert" className="rounded-xl border border-status-warning bg-bg-panel p-4 text-sm">
      <h2 className="font-semibold">{availability.http_status === 403 ? (zh ? "当前账户无权查看数据源" : "This account cannot view data sources") : (zh ? "请登录后查看数据源" : "Sign in to view data sources")}</h2>
      <p className="mt-2 text-text-pg-muted">{zh ? "权限确认前不会显示来源信息。登录或获得访问权限后可重试。" : "Source information is hidden until access is confirmed. Sign in or obtain access, then retry."}</p>
      {availability.http_status === 401 ? <a href={`/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/data-sources`)}`} className="mt-3 inline-flex min-h-11 items-center underline underline-offset-4">{zh ? "前往登录" : "Go to sign in"}</a> : null}
    </div> : null}
    {readState === "error" ? <div role="alert" className="rounded-xl border border-status-warning bg-bg-panel p-4 text-sm">
      <h2 className="font-semibold">{zh ? "暂时无法读取来源状态" : "Source status could not be loaded"}</h2>
      <p className="mt-2 text-text-pg-muted">{retained ? (zh ? "下方保留上次确认的信息，可能已过期。请重试后再操作。" : "The last confirmed information remains below and may be stale. Retry before making changes.") : availability.http_status && availability.http_status >= 500 ? (zh ? "数据源服务暂时不可用，请稍后重试。" : "The source service is temporarily unavailable. Please retry shortly.") : (zh ? "来源信息尚未确认，请重试。这不代表没有已配置的来源。" : "Source information could not be confirmed. Retry; this does not mean no sources are configured.")}</p>
    </div> : null}
    {readState === "empty" ? <div role="status" className="rounded-xl border border-dashed border-border-pg bg-bg-panel p-5 text-sm"><h2 className="font-semibold">{zh ? "尚无已配置的数据源" : "No data sources configured"}</h2><p className="mt-2 text-text-pg-muted">{zh ? "来源列表已成功读取，目前没有已配置的来源。你可以稍后重新检查。" : "The catalog was read successfully and contains no configured sources. You can check again later."}</p></div> : null}
    {hasSuccess && readState !== "unauthorized" && catalog.length > 0 && sources.length === 0 ? <p role="status" className="rounded-xl border border-border-pg bg-bg-panel p-5 text-sm text-text-pg-muted">{zh ? `已读取 ${catalog.length} 个来源，但不在此主要来源面板的展示范围内。` : `${catalog.length} sources were read, but they are outside this primary-source panel's display scope.`}</p> : null}
    {error ? <div role="alert" className="border border-status-negative p-3 text-sm text-status-negative rounded-lg">{error}</div> : null}
    <div className="grid gap-4 lg:grid-cols-2" aria-busy={readState === "loading"}>
      {sources.map((source) => {
        const isBusy = busy.startsWith(`${source.id}:`);
        const quota = source.quotaLimit == null ? "-" : `${source.quotaRemaining ?? 0} / ${source.quotaLimit}`;
        return <article key={source.id} aria-label={source.source} className="min-w-0 border border-border-pg bg-bg-panel rounded-lg">
          <div className="flex items-start justify-between gap-4 border-b border-border-pg p-4">
            <div className="min-w-0"><p className="text-xs uppercase text-text-pg-dim">{source.type}</p><h2 className="mt-1 text-base font-semibold">{source.source}</h2><p className="mt-1 truncate text-xs text-text-pg-muted">{source.provider}</p></div>
            <div className="shrink-0 text-right"><DataSourceStatusBadge locale={locale} status={source.status} />{retained ? <p className="mt-1 text-xs text-status-warning">{zh ? "上次确认 · 待刷新" : "Last confirmed · refresh required"}</p> : null}</div>
          </div>
          <dl className="grid grid-cols-2 gap-x-5 gap-y-4 p-4 text-sm sm:grid-cols-3">
            <Metric label={zh ? "最近同步" : "Last sync"} value={source.lastSync ? new Date(source.lastSync).toLocaleString(locale) : "-"} />
            <Metric label={zh ? "标准化条数" : "Normalized"} value={String(source.itemsIngested)} />
            <Metric label={zh ? "当前配额" : "Quota"} value={quota} />
            <Metric label={zh ? "错误次数" : "Errors"} value={String(source.errorCount ?? 0)} />
            <Metric label={zh ? "账号数量" : "Accounts"} value={source.id === "fintwit" ? String(source.accountCount ?? 0) : "-"} />
            <Metric label={zh ? "配置状态" : "Configuration"} value={source.configured ? (zh ? "已配置" : "Configured") : (zh ? "需要处理" : "Action required")} />
            <Metric label={zh ? "数据新鲜度" : "Freshness"} value={source.sourceTimestamp ? new Date(source.sourceTimestamp).toLocaleString(locale) : "-"} />
            <Metric label={zh ? "套餐权限" : "Entitlement"} value={source.entitled ? (zh ? "可用" : "Allowed") : (zh ? "需要升级" : "Upgrade required")} />
            <Metric label={zh ? "再分发" : "Redistribution"} value={source.redistributionAllowed ? (zh ? "允许" : "Allowed") : (zh ? "受限" : "Restricted")} />
          </dl>
          <div className="space-y-2 border-t border-border-pg px-4 py-3 text-xs text-text-pg-muted">
            <p className="flex gap-2"><KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{source.licenseStatus || "-"}</span></p>
            <p>{zh ? "保留策略" : "Retention"}: {source.retentionPolicy || "-"}</p>
            {source.error ? <p className="text-status-warning" title={source.error}>{source.error}</p> : null}
            {source.failureReason && source.failureReason !== source.error ? <p className="text-status-warning">{source.failureReason}</p> : null}
            {source.isMock ? <p className="font-semibold text-status-warning">MOCK / DEMO</p> : null}
          </div>
          <div className="flex items-center gap-2 border-t border-border-pg p-3">
            <IconButton title={zh ? "手动同步" : "Sync now"} disabled={blocked || isBusy || !source.enabled} onClick={() => act(source.id, "sync")} icon={busy === `${source.id}:sync` ? Loader2 : RefreshCw} spin={busy === `${source.id}:sync`} />
            <IconButton title={source.enabled ? (zh ? "暂停" : "Pause") : (zh ? "恢复" : "Resume")} disabled={blocked || isBusy} onClick={() => act(source.id, "toggle")} icon={source.enabled ? Pause : Play} />
            <IconButton title={zh ? "配置检查" : "Check configuration"} disabled={blocked || isBusy} onClick={() => act(source.id, "check")} icon={Settings2} />
            <IconButton title={zh ? "数据预览" : "Preview data"} disabled={blocked || isBusy} onClick={() => inspect(source.id)} icon={busy === `${source.id}:preview` ? Loader2 : Eye} spin={busy === `${source.id}:preview`} />
          </div>
          {previewId === source.id && preview ? <div className="border-t border-border-pg bg-bg-panel-muted p-4"><p className="mb-3 text-xs font-semibold uppercase text-text-pg-muted">{zh ? "最近标准化数据" : "Recent normalized data"}</p><div className="space-y-3">{preview.normalized.slice(0, 5).map((item) => <div key={item.id} className="border-l-2 border-border-pg-strong pl-3"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs text-text-pg-muted">{item.sourceName} · {item.symbols.join(", ") || (zh ? "无明确资产" : "No explicit asset")} · {item.sentiment.label || "neutral"}</p>{item.url ? <a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-text-pg-dim hover:underline">{item.url}</a> : null}</div>)}{!preview.normalized.length ? <p className="text-xs text-text-pg-muted">{zh ? "暂无标准化数据" : "No normalized documents yet"}</p> : null}</div></div> : null}
        </article>;
      })}
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs text-text-pg-dim">{label}</dt><dd className="mt-1 truncate font-medium" title={value}>{value}</dd></div>; }
function IconButton({ title, disabled, onClick, icon: Icon, spin = false }: { title: string; disabled: boolean; onClick: () => void; icon: LucideIcon; spin?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className="grid h-11 w-11 place-items-center border border-border-pg hover:border-border-pg-strong disabled:cursor-not-allowed disabled:opacity-35 rounded-lg" title={title} aria-label={title}><Icon className={`h-4 w-4 ${spin ? "animate-spin" : ""}`} /></button>; }
