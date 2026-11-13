"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarClock, Database, FileSearch, FlaskConical, Plus, RefreshCw, Search, X } from "lucide-react";
import { CapabilityGate, capabilityStateFromError, type CapabilityState } from "@/components/ocean/capability-gate";
import { Button } from "@/components/ui";
import { StatusBadgeWithPulse } from "@/components/ocean/status-badge";
import { createResearchRun, getResearchRuns, type HarnessResearchRun } from "@/lib/api";
import { type Locale, withLocale } from "@/i18n/routing";

const ACTIVE_STATUSES = new Set(["queued", "preparing", "running", "validating"]);
const DATA_SOURCES = [
  { id: "market", en: "Market data", zh: "市场数据" },
  { id: "news", en: "News", zh: "新闻" },
  { id: "options", en: "Options", zh: "期权" },
  { id: "earnings", en: "Earnings", zh: "财报" },
];

function formatTime(value: string, locale: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ResearchConsole({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const router = useRouter();
  const [state, setState] = useState<CapabilityState>({ status: "loading" });
  const [runs, setRuns] = useState<HarnessResearchRun[]>([]);
  const [total, setTotal] = useState(0);
  const [lastRefresh, setLastRefresh] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [sources, setSources] = useState<string[]>(["market", "news"]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const mounted = useRef(false);
  const loaded = useRef(false);
  const version = useRef(0);
  const inFlight = useRef(false);
  const creating = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    const request = ++version.current;
    inFlight.current = true;
    setRefreshing(true);
    setRefreshError(false);
    if (!loaded.current) setState({ status: "loading" });
    try {
      const payload = await getResearchRuns();
      if (!mounted.current || request !== version.current) return;
      const rows = Array.isArray(payload.runs) ? payload.runs : [];
      setRuns(rows);
      setTotal(payload.total ?? rows.length);
      setLastRefresh(new Date().toISOString());
      loaded.current = true;
      setState({ status: "available" });
    } catch (error) {
      if (!mounted.current || request !== version.current) return;
      const next = capabilityStateFromError(error);
      if (loaded.current && next.status === "error") setRefreshError(true);
      else {
        loaded.current = false;
        setRuns([]);
        setState(next);
      }
    } finally {
      if (request === version.current) {
        inFlight.current = false;
        if (mounted.current) setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; version.current += 1; inFlight.current = false; };
  }, [refresh]);

  useEffect(() => {
    if (state.status !== "available" || !runs.some(run => ACTIVE_STATUSES.has(run.status))) return;
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [state.status, runs, refresh]);

  useEffect(() => { if (showForm) questionRef.current?.focus(); }, [showForm]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating.current || !prompt.trim() || !sources.length) return;
    creating.current = true;
    setSubmitting(true);
    setFormError("");
    try {
      const result = await createResearchRun({ name: name.trim() || Array.from(prompt.trim()).slice(0, 40).join(""), prompt: prompt.trim(), data_sources: sources, skill: "harness_deep_research" });
      router.push(withLocale(locale, `/research/${encodeURIComponent(result.run.id)}`));
    } catch (error) {
      const detail = (error as { payload?: { detail?: { message?: string } | string } })?.payload?.detail;
      const unavailable = capabilityStateFromError(error).status === "unavailable";
      const quotaExceeded = (error as { status?: number })?.status === 429;
      const fallback = unavailable ? (zh ? "你的账号暂未开放深度研究。问题已保留。" : "Deep research is not enabled for your account. Your question is kept.") : quotaExceeded ? (zh ? "研究额度已用尽。请检查套餐额度后重试，问题已保留。" : "Your research allowance has been reached. Check your plan limits before retrying; your question is kept.") : zh ? "无法创建任务。问题已保留，请稍后重试。" : "The run could not be created. Your question is kept; try again shortly.";
      setFormError(typeof detail === "string" ? detail : typeof detail === "object" && detail ? detail.message || fallback : fallback);
    } finally {
      creating.current = false;
      setSubmitting(false);
    }
  };

  const activeCount = runs.filter(run => ACTIVE_STATUSES.has(run.status)).length;
  const matching = runs.filter(run => {
    const statusMatches = filter === "all" || (filter === "active" ? ACTIVE_STATUSES.has(run.status) : filter === "completed" ? run.status === "completed" : ["failed", "canceled", "cancelled"].includes(run.status));
    return statusMatches && `${run.name} ${run.summary || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  });

  return (
    <section className="research-workspace mx-auto w-full max-w-[1180px]" aria-labelledby="research-heading">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1 basis-60">
          <h1 id="research-heading" className="pg-page-title flex items-center gap-3 text-2xl font-semibold tracking-tight md:text-[1.875rem]">
            <FlaskConical className="h-6 w-6 shrink-0 text-accent" aria-hidden />
            {zh ? "研究任务" : "Research"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-pg-muted">{zh ? "提出问题，追溯证据，保存你的研究结论。" : "Investigate a question, follow the evidence, and keep your findings together."}</p>
        </div>
        {state.status === "available" ? <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => void refresh()} disabled={refreshing} aria-label={zh ? "刷新研究任务" : "Refresh research runs"} className="w-11 !px-0"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden /></Button>
          <Button type="button" aria-expanded={showForm} aria-controls="research-create-form" disabled={submitting} onClick={() => setShowForm(value => !value)}>
            {showForm ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
            {showForm ? (zh ? "收起" : "Close") : (zh ? "新建研究任务" : "New research run")}
          </Button>
        </div> : null}
      </header>
      <CapabilityGate state={state} locale={locale} title={zh ? "深度研究暂不可用" : "Deep research is not available yet"} onRetry={() => void refresh()}>
        <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-text-pg-muted">
          <span><strong className="font-semibold tabular-nums text-text-pg">{total}</strong> {zh ? "个研究任务" : "research runs"}</span>
          <span className="inline-flex items-center gap-2"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${activeCount ? "bg-accent" : "bg-border-pg-strong"}`} /><strong className="font-semibold tabular-nums text-text-pg">{activeCount}</strong> {zh ? "个进行中（当前列表）" : "active in this list"}</span>
        </div>
          {showForm ? <form id="research-create-form" onSubmit={event => void submit(event)} className="mb-6 space-y-4 rounded-xl border border-border-pg bg-bg-panel p-4 md:p-5">
            <div><h2 className="font-semibold">{zh ? "你想弄清楚什么？" : "What would you like to understand?"}</h2><p className="mt-1 text-xs leading-5 text-text-pg-muted">{zh ? "说明标的、时间范围和需要验证的假设，让研究更有针对性。" : "Include an asset, a time horizon, and a hypothesis to make the research focused."}</p></div>
            <label className="block text-sm font-medium" htmlFor="research-question">{zh ? "研究问题" : "Research question"}<textarea ref={questionRef} id="research-question" value={prompt} maxLength={4000} required onChange={event => setPrompt(event.target.value)} rows={4} disabled={submitting} aria-describedby="research-question-hint" placeholder={zh ? "例如：近90天BTC资金费率与价格偏离的关系，哪些证据支持或反对？" : "For example: what evidence supports or challenges a link between BTC funding rates and price over the last 90 days?"} className="mt-2 block w-full rounded-lg border border-border-pg bg-bg-app px-3 py-3 text-base font-normal leading-6 text-text-pg placeholder:text-text-pg-dim focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" /></label>
            <p id="research-question-hint" className="text-right text-xs tabular-nums text-text-pg-dim">{prompt.length}/4000</p>
            <label className="block text-sm font-medium" htmlFor="research-name">{zh ? "任务名称（可选）" : "Run name (optional)"}<input id="research-name" value={name} maxLength={120} onChange={event => setName(event.target.value)} disabled={submitting} className="mt-2 block min-h-11 w-full rounded-lg border border-border-pg bg-bg-app px-3 py-2 font-normal" /></label>
            <fieldset><legend className="mb-2 text-sm font-medium">{zh ? "证据来源 · 至少选择一个" : "Evidence sources · choose at least one"}</legend><div className="flex flex-wrap gap-2">{DATA_SOURCES.map(source => <button key={source.id} type="button" disabled={submitting} aria-pressed={sources.includes(source.id)} onClick={() => setSources(previous => previous.includes(source.id) ? previous.filter(id => id !== source.id) : [...previous, source.id])} className={`min-h-11 rounded-lg border px-3 text-sm ${sources.includes(source.id) ? "border-border-pg-strong bg-bg-panel-muted text-text-pg" : "border-border-pg text-text-pg-muted"}`}>{zh ? source.zh : source.en}</button>)}</div></fieldset>
            {formError ? <p role="alert" className="rounded-lg border border-status-negative/40 p-3 text-sm text-status-negative">{formError}</p> : null}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-pg pt-4"><p className="max-w-md text-xs leading-5 text-text-pg-muted">{zh ? "任务与积分额度由你的套餐决定。创建失败时问题会保留。" : "Your plan determines run and credit limits. Your question stays here if creation fails."}</p><Button type="submit" disabled={submitting || !prompt.trim() || !sources.length} className="px-5">{submitting ? (zh ? "创建中…" : "Creating…") : (zh ? "开始研究" : "Start research")}</Button></div>
          </form> : null}
          {refreshError ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning/40 p-3 text-sm text-status-warning"><span>{zh ? "无法刷新，正在显示上次加载的任务。" : "Refresh failed. Showing the last loaded runs."}</span><button type="button" disabled={refreshing} onClick={() => void refresh()} className="min-h-10 underline underline-offset-4">{zh ? "重试" : "Retry"}</button></div> : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 basis-44"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-pg-dim" aria-hidden /><span className="sr-only">{zh ? "搜索已加载的研究任务" : "Search loaded research runs"}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? "搜索研究任务" : "Search research runs"} className="pg-input min-h-11 w-full rounded-lg border border-border-pg bg-bg-panel pl-9 pr-3 text-sm" /></label>
          <label className="min-w-0"><span className="sr-only">{zh ? "筛选任务状态" : "Filter run status"}</span><select value={filter} onChange={event => setFilter(event.target.value)} className="pg-input min-h-11 max-w-full rounded-lg border border-border-pg bg-bg-panel px-3 text-sm"><option value="all">{zh ? "全部状态" : "All statuses"}</option><option value="active">{zh ? "进行中" : "In progress"}</option><option value="completed">{zh ? "已完成" : "Completed"}</option><option value="stopped">{zh ? "失败或取消" : "Failed or canceled"}</option></select></label>
        </div>
        {lastRefresh ? <p role="status" className="mb-3 text-xs leading-5 text-text-pg-dim">{zh ? `当前列表 ${matching.length}/${runs.length} 项 · 更新于 ` : `${matching.length} of ${runs.length} loaded runs · Updated `}{formatTime(lastRefresh, locale)}{total > runs.length ? (zh ? " · 仅搜索当前加载的最近任务" : " · Search covers the recent runs loaded here") : ""}</p> : null}
        {matching.length ? <ul className="divide-y divide-border-pg overflow-hidden rounded-xl border border-border-pg bg-bg-panel" aria-label={zh ? "研究任务列表" : "Research runs"}>
          {matching.map(run => <li key={run.id}>
            <Link href={withLocale(locale, `/research/${encodeURIComponent(run.id)}`)} className="group block px-4 py-4 transition-colors hover:bg-bg-panel-muted focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1"><h2 className="break-words text-[0.9375rem] font-semibold leading-6 text-text-pg">{run.name || (zh ? "未命名研究" : "Untitled research")}</h2>{run.summary ? <p className="mt-1 line-clamp-2 max-w-3xl text-sm leading-6 text-text-pg-muted">{run.summary}</p> : null}</div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-text-pg-dim transition-transform group-hover:translate-x-0.5" aria-hidden />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-text-pg-dim">
                <StatusBadgeWithPulse domain="research" value={run.status} locale={locale} />
                <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" aria-hidden /><time dateTime={run.updated_at}>{formatTime(run.updated_at, locale)}</time></span>
                <span className="inline-flex items-center gap-1.5"><Database className="h-3.5 w-3.5" aria-hidden />{Array.isArray(run.data_sources) ? `${run.data_sources.length} ${zh ? "来源" : "sources"}` : (zh ? "来源未记录" : "Sources not recorded")}</span>
                <span className="inline-flex items-center gap-1.5"><FileSearch className="h-3.5 w-3.5" aria-hidden />{typeof run.evidence_count === "number" ? `${run.evidence_count} ${zh ? "证据" : "evidence"}` : (zh ? "证据数量未记录" : "Evidence count not recorded")}</span>
              </div>
            </Link>
          </li>)}
        </ul> : <div className="rounded-xl border border-dashed border-border-pg bg-bg-panel px-5 py-10 text-center"><FileSearch className="mx-auto h-7 w-7 text-text-pg-dim" aria-hidden /><h2 className="mt-3 font-semibold">{runs.length ? (zh ? "没有符合条件的任务" : "No matching runs") : (zh ? "从一个好问题开始。" : "Start with a good question.")}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-pg-muted">{runs.length ? (zh ? "试试其他关键词或状态筛选。" : "Try another search or status filter.") : (zh ? "新建研究任务，记录假设、收集证据并跟踪结论。" : "Create a research run to investigate a hypothesis, collect evidence, and keep your findings together.")}</p><Button type="button" variant="secondary" onClick={() => { if (runs.length) { setQuery(""); setFilter("all"); } else setShowForm(true); }} className="mt-4">{runs.length ? (zh ? "清除筛选" : "Clear filters") : (zh ? "创建第一个任务" : "Create your first run")}</Button></div>}
      </CapabilityGate>
    </section>
  );
}
