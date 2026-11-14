"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link as LinkIcon, RefreshCw, Quote } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { CapabilityGate, useCapabilityGate } from "@/components/ocean/capability-gate";
import { EvidenceGraph, type EvidenceNode } from "@/components/ocean/evidence-graph";
import { ResearchTimeline, stagesForStatus } from "@/components/ocean/research-timeline";
import { StatusBadgeWithPulse } from "@/components/ocean/status-badge";
import { apiBaseUrl, getResearchRun, getResearchRunArtifacts, getResearchRunEvidence, type HarnessResearchRun, type HarnessResearchEvidence } from "@/lib/api";
import { OCEAN_POLL_INTERVAL_ACTIVE_MS, OCEAN_POLL_INTERVAL_IDLE_MS } from "@/lib/ocean";
import { type Locale, withLocale } from "@/i18n/routing";

const ACTIVE_STATUSES = new Set(["queued", "preparing", "running", "validating"]);
const TERMINAL_STATUSES = new Set(["completed", "degraded", "failed", "timed_out", "canceled", "cancelled"]);

type ConnectionMode = "sse" | "polling";

type RunEventData = {
  run_id?: string;
  status?: string;
  updated_at?: string;
  message?: string;
  verified?: boolean;
  degraded?: boolean;
};

/** A completion event also represents degraded research in the HTTP contract. */
export function researchEventStatus(eventName: string, data: RunEventData): string | null {
  if (eventName === "run.state") {
    return data.status && (ACTIVE_STATUSES.has(data.status) || TERMINAL_STATUSES.has(data.status)) ? data.status : null;
  }
  if (eventName === "run.completed") {
    if (data.status === "degraded" || data.degraded === true || data.verified === false) return "degraded";
    if (data.status === "completed" || (data.degraded === false && data.verified === true)) return "completed";
    return null; // Legacy completion without its quality flags needs a detail read.
  }
  if (eventName === "run.failed") {
    return data.status === "timed_out" || (typeof data.message === "string" && data.message.toLowerCase() === "timed out") ? "timed_out" : "failed";
  }
  return eventName === "run.canceled" ? "canceled" : null;
}

/** A retry creates a new run. An old read cannot restart or replace its terminal outcome. */
export function canApplyResearchSnapshot(current: HarnessResearchRun | null, next: HarnessResearchRun): boolean {
  if (!current || current.id !== next.id) return true;
  if (TERMINAL_STATUSES.has(current.status) && current.status !== next.status) return false;
  const order = ["queued", "preparing", "running", "validating"];
  const currentStage = order.indexOf(current.status);
  const nextStage = order.indexOf(next.status);
  if (nextStage >= 0 && currentStage > nextStage) return false;
  const currentTime = Date.parse(current.updated_at);
  const nextTime = Date.parse(next.updated_at);
  return !Number.isFinite(currentTime) || !Number.isFinite(nextTime) || nextTime >= currentTime;
}

function formatTime(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(from: string, to: string, locale: "en" | "zh") {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "-";
  const minutes = Math.max(0, Math.round((end - start) / 60_000));
  if (minutes < 1) return locale === "zh" ? "<1 分钟" : "<1 min";
  return locale === "zh" ? `${minutes} 分钟` : `${minutes} min`;
}

function sourceUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) return value;
  try { return ["https:", "http:"].includes(new URL(value).protocol) ? value : null; }
  catch { return null; }
}

export function ResearchRunDetail({ locale, runId }: { locale: Locale; runId: string }) {
  const zh = locale === "zh";
  const load = useCallback(() => getResearchRun(runId), [runId]);
  const { state, retry, value } = useCapabilityGate(load, [runId]);
  const [snapshot, setRun] = useState<HarnessResearchRun | null>(null);
  const initialRun = value?.run?.id === runId ? value.run : null;
  const run = snapshot?.id === runId ? snapshot : initialRun;
  const [evidenceNodes, setEvidenceNodes] = useState<EvidenceNode[]>([]);
  const [artifacts, setArtifacts] = useState<{ id: string; type: string; title: string; url?: string | null; markdown?: string | null }[]>([]);
  const [evidence, setEvidence] = useState<HarnessResearchEvidence[]>([]);
  const [evidenceLoading, setEvidenceLoading] = useState(true);
  const [evidenceError, setEvidenceError] = useState(false);
  const [artifactsError, setArtifactsError] = useState(false);
  const [artifactsLoading, setArtifactsLoading] = useState(true);
  const [pollError, setPollError] = useState(false);
  const [confirmingFinalStatus, setConfirmingFinalStatus] = useState(false);
  const [refreshAttempt, setRefreshAttempt] = useState(0);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("polling");
  const sseControllerRef = useRef<AbortController | null>(null);
  const runRef = useRef<HarnessResearchRun | null>(null);
  const currentRunId = useRef(runId);
  const runRevision = useRef(0);
  currentRunId.current = runId;
  runRef.current = run;

  useEffect(() => {
    runRevision.current += 1;
    setRun(null);
    setEvidence([]);
    setEvidenceNodes([]);
    setArtifacts([]);
    setEvidenceLoading(true);
    setEvidenceError(false);
    setArtifactsError(false);
    setArtifactsLoading(true);
    setPollError(false);
    setConfirmingFinalStatus(false);
    setConnectionMode("polling");
  }, [runId]);

  const applyRun = useCallback((payload: { run?: HarnessResearchRun } | HarnessResearchRun | null, expectedRevision?: number) => {
    const next = (payload as { run?: HarnessResearchRun })?.run ?? (payload as HarnessResearchRun | null);
    if (!next || next.id !== currentRunId.current || (expectedRevision !== undefined && expectedRevision !== runRevision.current)) return false;
    if (!canApplyResearchSnapshot(runRef.current, next)) return false;
    runRevision.current += 1;
    runRef.current = next;
    setRun(next);
    if (TERMINAL_STATUSES.has(next.status)) setConfirmingFinalStatus(false);
    return true;
  }, []);

  useEffect(() => { if (initialRun) applyRun(initialRun); }, [initialRun, applyRun]);

  // Polling loop: authoritative server state. Connection trouble NEVER marks
  // the run failed — the server-side status always wins.
  useEffect(() => {
    if (state.status !== "available") return;
    let disposed = false;
    let timer = 0;
    const poll = async () => {
      const revision = runRevision.current;
      let readFailed = false;
      try {
        const payload = await getResearchRun(runId);
        if (disposed) return;
        const stillCurrent = revision === runRevision.current;
        if (applyRun(payload, revision)) setPollError(false);
        else if (stillCurrent) { setPollError(true); readFailed = true; }
      } catch {
        if (disposed) return;
        readFailed = true;
        if (revision === runRevision.current) setPollError(true);
      }
      timer = window.setTimeout(poll, !readFailed && ACTIVE_STATUSES.has(runRef.current?.status || "") ? OCEAN_POLL_INTERVAL_ACTIVE_MS : OCEAN_POLL_INTERVAL_IDLE_MS);
    };
    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [state.status, runId, applyRun, refreshAttempt]);

  // SSE stream (frozen contract). Connected once per run while active.
  // Unknown events are ignored; disconnects fall back to polling silently.
  useEffect(() => {
    if (state.status !== "available") return;
    const runStatus = run?.status;
    if (!runStatus || !ACTIVE_STATUSES.has(runStatus)) return;
    const controller = new AbortController();
    sseControllerRef.current = controller;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(idleTimeout);
      setConnectionMode("polling");
      controller.abort();
    };
    let idleTimeout = window.setTimeout(finish, 20_000);
    let refreshRequested = false;
    const refreshTerminal = () => {
      if (refreshRequested) return;
      refreshRequested = true;
      setRefreshAttempt((attempt) => attempt + 1);
    };
    (async () => {
      try {
        const response = await fetch(`${apiBaseUrl()}/api/research/runs/${encodeURIComponent(runId)}/events`, {
          credentials: "include",
          headers: { Accept: "text/event-stream" },
          signal: controller.signal,
        });
        if (settled) return;
        if (!response.ok || !response.body) {
          finish();
          return;
        }
        setConnectionMode("sse");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!settled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (settled) break;
          window.clearTimeout(idleTimeout);
          idleTimeout = window.setTimeout(finish, 20_000);
          buffer += decoder.decode(value, { stream: true });
          let boundary = buffer.indexOf("\n\n");
          while (boundary >= 0 && !settled) {
            const block = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            boundary = buffer.indexOf("\n\n");
            let eventName = "message";
            let dataText = "";
            for (const line of block.split("\n")) {
              if (line.startsWith("event:")) eventName = line.slice(6).trim();
              else if (line.startsWith("data:")) dataText += line.slice(5).trim();
            }
            if (!dataText) continue;
            // Unknown events are ignored — never crash on a new event type.
            if (!["run.queued", "run.state", "run.progress", "run.evidence", "run.completed", "run.failed", "run.canceled"].includes(eventName)) continue;
            try {
              const data = JSON.parse(dataText) as RunEventData;
              if (data.run_id && data.run_id !== runId) continue;
              const status = researchEventStatus(eventName, data);
              const current = runRef.current;
              if (status && current?.id === runId) {
                applyRun({
                  ...current,
                  status,
                  updated_at: typeof data.updated_at === "string" ? data.updated_at : current.updated_at,
                  is_degraded: status === "degraded",
                  error_message: eventName === "run.failed" && typeof data.message === "string" ? data.message : current.error_message,
                });
                if (TERMINAL_STATUSES.has(status)) refreshTerminal();
              }
              if (["run.completed", "run.failed", "run.canceled"].includes(eventName)) {
                if (!status) setConfirmingFinalStatus(true);
                refreshTerminal();
                finish();
              }
            } catch { /* malformed payload: ignore */ }
          }
        }
      } catch {
        if (!settled) setConnectionMode("polling");
      } finally {
        finish(); // A normal EOF is also a disconnect, not a live connection.
      }
    })();
    return () => {
      settled = true;
      window.clearTimeout(idleTimeout);
      controller.abort();
      sseControllerRef.current = null;
    };
  }, [state.status, runId, run?.status, applyRun]);

  useEffect(() => {
    if (state.status !== "available") return;
    const current = runRef.current;
    if (!current) return;
    let cancelled = false;
    setEvidenceLoading(true);
    setEvidenceError(false);
    getResearchRunEvidence(runId)
      .then((payload) => {
        if (cancelled) return;
        setEvidence(payload.evidence || []);
        const nodes: EvidenceNode[] = [];
        const byScope = new Map<string, { count: number; first: (typeof payload.evidence)[number] | undefined }>();
        for (const item of payload.evidence || []) {
          const scope = item.source_scope || item.provider || "source";
          const entry = byScope.get(scope) || { count: 0, first: undefined };
          entry.count += 1;
          if (!entry.first) entry.first = item;
          byScope.set(scope, entry);
        }
        for (const [scope, entry] of byScope) {
          nodes.push({ id: `source-${scope}`, kind: "source", label: scope, count: entry.count, detail: entry.first?.provider ?? undefined });
        }
        const evidence = payload.evidence || [];
        nodes.push({ id: "evidence-snapshots", kind: "evidence", label: zh ? "已采集证据" : "Evidence snapshots", count: evidence.length, status: evidence.length ? "ok" : "missing" });
        nodes.push({ id: "conclusion", kind: "conclusion", label: current.summary || (zh ? "研究结论" : "Research conclusion"), status: current.summary ? "ok" : "missing" });
        nodes.push({ id: "limitations", kind: "limitation", label: current.disclaimer || (zh ? "限制条件" : "Limitations"), status: current.disclaimer ? "ok" : "missing" });
        nodes.push({ id: "citations", kind: "citation", label: zh ? "引用/来源" : "Citations", count: current.citation_count ?? evidence.filter((item) => item.url).length });
        setEvidenceNodes(nodes);
      })
      .catch(() => { if (!cancelled) setEvidenceError(true); })
      .finally(() => { if (!cancelled) setEvidenceLoading(false); });
    return () => { cancelled = true; };
  }, [state.status, runId, run?.updated_at, zh, refreshAttempt]);

  useEffect(() => {
    if (state.status !== "available" || !runRef.current) return;
    let cancelled = false;
    setArtifactsError(false);
    setArtifactsLoading(true);
    getResearchRunArtifacts(runId)
      .then((payload) => {
        if (!cancelled) setArtifacts(payload.artifacts || []);
      })
      .catch(() => { if (!cancelled) setArtifactsError(true); })
      .finally(() => { if (!cancelled) setArtifactsLoading(false); });
    return () => { cancelled = true; };
  }, [state.status, runId, run?.status, refreshAttempt]);

  const terminal = Boolean(run && TERMINAL_STATUSES.has(run.status));
  const progress = run ? <><p className="mb-4 text-xs leading-5 text-text-pg-muted">{zh ? "阶段完成情况仅依据已记录的内容；任务状态不代表每个阶段都已成功。" : "Stage completion is shown only when recorded; the run status does not confirm every stage."}</p><ResearchTimeline locale={locale} nodes={stagesForStatus(run.status, { evidenceRecorded: evidence.length > 0, artifactRecorded: artifacts.length > 0 })} /></> : null;
  const artifact = run ? (
    <section className="min-w-0 rounded-xl border border-border-pg bg-bg-panel p-4 md:p-6">
      <h2 className="mb-3 text-sm font-semibold text-text-pg-muted">{zh ? "研究产出" : "Research artifact"}</h2>
      <p className="mb-3 max-w-[76ch] text-xs leading-5 text-text-pg-muted">{zh ? "引用检查仅确认编号与已记录来源匹配，不代表结论真实。" : "Reference checks match citation identifiers to recorded sources; they do not establish that a claim is true."}</p>
      {run.summary ? <p className="max-w-[76ch] whitespace-pre-wrap text-[0.9375rem] leading-7 text-text-pg">{run.summary}</p> : <p className="text-sm leading-6 text-text-pg-muted">{artifacts.length ? (zh ? "请在下方查看研究产出正文。" : "Read the research artifact below.") : artifactsLoading ? (zh ? "正在加载研究产出…" : "Loading research artifact…") : artifactsError ? (zh ? "研究产出暂未加载，请重试。" : "The research artifact could not be loaded. Please retry.") : (zh ? "研究结果尚未生成。" : "The research artifact has not been produced yet.")}</p>}
      {run.summary && !artifacts.length && artifactsLoading ? <p role="status" className="mt-3 text-xs leading-5 text-text-pg-dim">{zh ? "正在加载研究产出…" : "Loading research artifact…"}</p> : null}
      {artifacts.length ? <div className="mt-5 space-y-4 border-t border-border-pg pt-4">
        {artifacts.map((item, index) => <details key={item.id} open={index === 0} className="min-w-0 border-b border-border-pg pb-4 last:border-b-0 last:pb-0">
          <summary className="min-h-11 cursor-pointer break-words py-2 text-sm font-semibold text-text-pg">{item.title}<span className="ml-2 text-xs font-normal text-text-pg-dim">{item.type}</span></summary>
          <div className="mt-2 max-w-[76ch]">{item.markdown ? <Markdown content={item.markdown} headingBaseLevel={3} /> : sourceUrl(item.url) ? <a href={sourceUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 text-sm text-accent underline underline-offset-4"><LinkIcon className="h-3.5 w-3.5" aria-hidden />{zh ? "打开研究产出" : "Open research artifact"}</a> : <p className="text-sm leading-6 text-text-pg-muted">{zh ? "此产出尚无可显示的正文或链接。" : "No readable content or link has been recorded for this artifact."}</p>}</div>
        </details>)}
      </div> : null}
      <p className="mt-5 max-w-[84ch] border-t border-border-pg pt-4 text-xs leading-5 text-text-pg-muted">{run.disclaimer || (zh ? "研究结论未经人工验证，不构成事实断言或投资建议。任何自动交易建议仅作为研究结果 / 策略草案展示，不会直接执行。" : "Conclusions are not human-verified and are not factual assertions or investment advice. Any automated trading suggestion is shown strictly as research output / strategy draft and is never executed directly.")}</p>
    </section>
  ) : null;

  const sources = (
    <section className="min-w-0 rounded-xl border border-border-pg bg-bg-panel p-4 md:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Quote className="h-4 w-4 text-accent" aria-hidden />{zh ? "可追溯来源" : "Traceable sources"}</h2>
      {evidence.length ? <ol className="mt-2 divide-y divide-border-pg">
        {evidence.map((item, index) => <li key={item.id || `${item.provider}-${index}`} className="py-4">
          <div className="flex items-start gap-3"><span className="mt-0.5 text-xs tabular-nums text-text-pg-dim">[{item.citation_index ?? index + 1}]</span><div className="min-w-0 flex-1">
            {sourceUrl(item.url) ? <a href={sourceUrl(item.url)!} target="_blank" rel="noopener noreferrer" className="break-words text-sm font-medium leading-6 text-text-pg underline decoration-border-pg underline-offset-4 hover:decoration-current">{item.title || item.provider || (zh ? "研究来源" : "Research source")}</a> : <p className="break-words text-sm font-medium leading-6">{item.title || item.provider || (zh ? "研究来源" : "Research source")}</p>}
            <p className="mt-1 text-xs leading-5 text-text-pg-dim">{item.provider || item.source_scope || (zh ? "来源未标注" : "Provider not recorded")} · {formatTime(item.fetched_at, locale)}</p>
            <p className="mt-1 text-xs leading-5 text-text-pg-dim">{item.is_verified === true ? (zh ? "已记录来源 · 未经事实核验" : "Recorded source · not fact-checked") : (zh ? "来源追溯未确认" : "Source provenance unconfirmed")}</p>
            {item.excerpt ? <p className="mt-2 break-words text-sm leading-6 text-text-pg-muted">{item.excerpt}</p> : null}
            {item.verification_note ? <p className="mt-1 text-xs leading-5 text-text-pg-muted">{item.verification_note}</p> : null}
          </div></div>
        </li>)}
      </ol> : <p className="mt-3 text-sm leading-6 text-text-pg-muted">{evidenceLoading ? (zh ? "正在加载证据…" : "Loading evidence…") : evidenceError ? (zh ? "证据暂未加载，请重试。" : "Evidence could not be loaded. Please retry.") : (zh ? "此任务尚未产生证据。" : "This run has not produced evidence yet.")}</p>}
      {evidenceNodes.length ? <details className="mt-4 border-t border-border-pg pt-2"><summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-text-pg-muted">{zh ? "证据关系" : "Evidence relationships"}</summary><div className="min-w-0 pt-3"><EvidenceGraph nodes={evidenceNodes} locale={locale} /></div></details> : null}
    </section>
  );

  return (
    <section className="research-detail mx-auto w-full max-w-[1280px]" aria-labelledby="research-run-heading">
      <a href={withLocale(locale, "/research")} className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm text-text-pg-muted transition-colors hover:text-text-pg">← {zh ? "返回研究任务列表" : "Back to research runs"}</a>
      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-60"><h1 id="research-run-heading" className="pg-page-title break-words text-2xl font-semibold leading-tight tracking-tight md:text-[1.875rem]">{run ? (run.name || run.id) : (zh ? "研究任务" : "Research run")}</h1>{run ? <p className="mt-2 text-xs leading-5 text-text-pg-dim">{zh ? "更新于" : "Updated"} <time dateTime={run.updated_at}>{formatTime(run.updated_at, locale)}</time> · {zh ? "耗时" : "Duration"} {formatDuration(run.created_at, run.updated_at, locale)}</p> : null}</div>
          {run ? <div className="flex flex-col items-end gap-1.5"><StatusBadgeWithPulse domain="research" value={run.status} locale={locale} />{ACTIVE_STATUSES.has(run.status) ? <span className="text-xs text-text-pg-dim">{connectionMode === "sse" ? (zh ? "实时连接" : "Live connection") : (zh ? "连接恢复中 · 使用轮询更新" : "Reconnecting · polling updates")}</span> : null}</div> : null}
        </div>
        {run && (run.status === "degraded" || run.is_degraded) ? <p className="mt-4 rounded-lg border border-status-warning bg-bg-panel p-3 text-sm leading-6 text-status-warning">{zh ? "该任务结果已降级。请将结论视为部分结果，并核查已记录的限制。" : "This run is degraded. Treat the findings as partial and review the recorded limitations."}{run.error_message ? <span className="mt-1 block">{run.error_message}</span> : null}</p> : null}
        {run?.status === "failed" || run?.status === "timed_out" ? <p className="mt-4 rounded-lg border border-status-negative bg-bg-panel p-3 text-sm leading-6 text-status-negative">{run.error_message || (zh ? "任务失败，请查看服务端状态。" : "Run failed; see the server-side status.")}</p> : null}
      </header>
      <CapabilityGate state={state} locale={locale} title={zh ? "研究暂不可用" : "Research is not available yet"} onRetry={retry}>
        {pollError || evidenceError || artifactsError ? <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning/40 bg-bg-panel p-3 text-sm text-status-warning"><span>{zh ? "部分更新无法加载，正在显示上次确认的内容。" : "Some updates could not be loaded. Showing the last confirmed content."}</span><button type="button" onClick={() => setRefreshAttempt(value => value + 1)} className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4"><RefreshCw className="h-3.5 w-3.5" aria-hidden />{zh ? "重新加载" : "Reload"}</button></div> : null}
        {confirmingFinalStatus ? <p role="status" className="mb-4 text-sm text-text-pg-muted">{zh ? "正在确认最终任务状态…" : "Confirming final run status…"}</p> : null}
        {!run && !pollError ? <p role="status" className="text-sm text-text-pg-muted">{zh ? "正在加载研究任务…" : "Loading research run…"}</p> : null}
        {run ? <div className="space-y-5">
          {!terminal ? <section className="rounded-xl border border-border-pg bg-bg-panel p-4 md:p-5"><h2 className="mb-4 text-sm font-semibold text-text-pg-muted">{zh ? "任务时间线" : "Run timeline"}</h2>{progress}</section> : null}
          <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">{artifact}{sources}</div>
          {terminal ? <details className="rounded-xl border border-border-pg bg-bg-panel px-4 py-1 md:px-5"><summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-text-pg-muted">{zh ? "查看任务过程" : "View research process"}</summary><div className="max-w-2xl border-t border-border-pg pb-4 pt-4"><h2 className="mb-4 text-sm font-semibold">{zh ? "任务时间线" : "Run timeline"}</h2><p className="mb-4 text-xs leading-5 text-text-pg-dim">{zh ? "创建" : "Created"} <time dateTime={run.created_at}>{formatTime(run.created_at, locale)}</time></p>{progress}</div></details> : null}
        </div> : null}
      </CapabilityGate>
    </section>
  );
}
