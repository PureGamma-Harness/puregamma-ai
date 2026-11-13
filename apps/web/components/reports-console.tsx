"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, ArrowLeft, BookOpen, ChevronDown, Link2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { SendReportButton } from "@/components/actions";
import { DailyBriefControls } from "@/components/daily-brief-controls";
import { CreditCostBadge, EmptyState, ResearchCard, StatusDot } from "@/components/puregamma";
import { type ReportRow } from "@/lib/api";
import { formatDateTime } from "@/lib/formatters";
import type { Locale } from "@/i18n/routing";

const DAILY_REPORT_FRESH_HOURS = 36;

function reportFreshness(report: ReportRow, locale: Locale) {
  const createdAt = new Date(report.created_at).getTime();
  const ageHours = (Date.now() - createdAt) / 36e5;
  if (!Number.isFinite(ageHours) || ageHours < 0) {
    return { stale: true, age: locale === "zh" ? "时间未核实" : "Time unverified", label: locale === "zh" ? "时间未知" : "Unknown time" };
  }
  const stale = ageHours > DAILY_REPORT_FRESH_HOURS;
  const age = ageHours < 1 ? (locale === "zh" ? "刚刚" : "Just now") : ageHours >= 24
    ? locale === "zh" ? `${Math.floor(ageHours / 24)} 天前` : `${Math.floor(ageHours / 24)}d ago`
    : locale === "zh" ? `${Math.floor(ageHours)} 小时前` : `${Math.floor(ageHours)}h ago`;
  const label = stale ? (locale === "zh" ? "归档" : "Archived") : (locale === "zh" ? "近期报告" : "Recent report");
  return { stale, age, label };
}

function reportTypeLabel(type: string, locale: Locale) {
  const labels: Record<string, [string, string]> = {
    daily_market_report: ["Daily brief", "每日简报"],
    crypto_daily: ["Daily brief", "每日简报"],
    daily_brief: ["Daily brief", "每日简报"],
    portfolio_report: ["Portfolio review", "组合复盘"],
    portfolio_review: ["Portfolio review", "组合复盘"],
    portfolio_daily: ["Portfolio update", "组合日报"],
    event_report: ["Event note", "事件笔记"],
    event_note: ["Event note", "事件笔记"],
    strategy_report: ["Strategy memo", "策略备忘录"],
    strategy_memo: ["Strategy memo", "策略备忘录"],
    risk_report: ["Risk review", "风险复盘"],
    risk_review: ["Risk review", "风险复盘"],
  };
  return labels[type]?.[locale === "zh" ? 1 : 0] || type.replaceAll("_", " ");
}

function reportListDate(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? (locale === "zh" ? "时间未知" : "Unknown time")
    : date.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

export default function ReportsPage({ locale, reports, copy, initialReportId, unavailable = false }: { locale: Locale; reports: ReportRow[]; copy: { eyebrow: string; title: string; subtitle: string; archive: Record<string, string>; detail: Record<string, string> }; filters?: string[]; initialReportId?: string; unavailable?: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(reports.find(report => report.id === initialReportId)?.id ?? reports[0]?.id ?? null);
  const [reading, setReading] = useState(() => reports.some(report => report.id === initialReportId));
  const [query, setQuery] = useState("");
  const [reportType, setReportType] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const archiveSearch = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initialReportId && reports.some(report => report.id === initialReportId)) { setSelectedId(initialReportId); setReading(true); } }, [initialReportId, reports]);
  const visibleReports = useMemo(() => reports.filter(report => (!reportType || report.report_type === reportType) && `${report.title} ${report.assets.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [reports, reportType, query]);
  const selected = useMemo(() => visibleReports.find(report => report.id === selectedId) ?? visibleReports[0] ?? null, [visibleReports, selectedId]);
  const showReader = reading && selected !== null;
  const zh = locale === "zh";
  const selectedFreshness = selected ? reportFreshness(selected, locale) : null;
  const reportTypes = Array.from(new Set(reports.map(report => report.report_type)));
  const selectReport = (id: string) => {
    setSelectedId(id);
    setReading(true);
    const url = new URL(window.location.href);
    url.searchParams.set("report", id);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    if (window.matchMedia("(max-width: 1023px)").matches) {
      window.requestAnimationFrame(() => {
        detailHeading.current?.focus({ preventScroll: true });
        document.getElementById("report-detail")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
      });
    }
  };

  const backToArchive = () => {
    setReading(false);
    window.requestAnimationFrame(() => {
      archiveSearch.current?.focus({ preventScroll: true });
      document.getElementById("reports-archive")?.scrollIntoView({ block: "start" });
    });
  };

  const header = (
    <header className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 flex-1">
        <h1 className="pg-page-title flex items-center gap-3 text-2xl font-semibold tracking-tight md:text-[1.875rem]"><BookOpen className="h-6 w-6 shrink-0 text-accent" aria-hidden />{copy.title}</h1>
        <p className="mt-2 hidden max-w-2xl text-sm leading-6 text-text-pg-muted sm:block">{copy.subtitle}</p>
      </div>
      {!unavailable ? <details className="static shrink-0">
        <summary aria-label={zh ? "生成简报" : "Generate brief"} className="pg-button flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg border border-border-pg bg-bg-panel px-3 text-sm font-medium text-text-pg transition-colors hover:bg-bg-panel-muted [&::-webkit-details-marker]:hidden">
          {zh ? "生成简报" : "New brief"}<ChevronDown className="h-4 w-4 text-text-pg-dim" aria-hidden />
        </summary>
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(360px,calc(100vw-2rem))] rounded-xl border border-border-pg bg-bg-panel p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{zh ? "每日研究简报" : "Daily research brief"}</h2><CreditCostBadge locale={locale} cost={10} /></div>
          <p className="mb-4 text-xs leading-5 text-text-pg-muted">{zh ? "选择简报语言。生成后会更新你的报告归档。" : "Choose a language. Your report library refreshes after generation."}</p>
          <div className="[&>div]:flex-wrap [&_button]:grow"><DailyBriefControls locale={locale} /></div>
        </div>
      </details> : null}
    </header>
  );

  if (unavailable) return <div className="reports-workspace mx-auto w-full max-w-[1280px] space-y-6">{header}<div role="alert" className="rounded-xl border border-status-warning/40 bg-bg-panel p-6"><h2 className="font-semibold">{zh ? "暂时无法加载报告" : "Reports could not be loaded"}</h2><p className="mt-2 text-sm leading-6 text-text-pg-muted">{zh ? "这不代表没有已保存的报告。请重试加载归档。" : "This does not mean your saved reports are empty. Retry to load the archive."}</p><button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="pg-button mt-4 min-h-11 rounded-lg border border-border-pg px-4 text-sm disabled:opacity-50">{refreshing ? (zh ? "重新加载中…" : "Reloading…") : (zh ? "重试加载报告" : "Retry loading reports")}</button></div></div>;

  return (
    <div className="reports-workspace mx-auto w-full max-w-[1280px] space-y-5">
      {header}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[248px_minmax(0,1fr)]">
        <ResearchCard id="reports-archive" className={`min-w-0 scroll-mt-24 ${showReader ? "max-lg:!hidden" : ""}`}>
          <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{copy.archive.title}</h2><span role="status" className="text-xs tabular-nums text-text-pg-dim">{visibleReports.length}/{reports.length}</span></div>
          <div className="mb-4 space-y-2">
            <label className="relative block min-w-0"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-pg-dim" aria-hidden /><span className="sr-only">{zh ? "搜索报告标题或资产" : "Search reports by title or asset"}</span><input ref={archiveSearch} value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? "搜索报告" : "Search reports"} className="pg-input min-h-11 w-full rounded-lg border border-border-pg bg-bg-panel pl-9 pr-3 text-sm" /></label>
            <label className="block"><span className="sr-only">{zh ? "报告类型" : "Report type"}</span><select value={reportType} onChange={event => setReportType(event.target.value)} className="pg-input min-h-11 w-full max-w-full rounded-lg border border-border-pg bg-bg-panel px-3 text-sm"><option value="">{zh ? "全部报告类型" : "All report types"}</option>{reportTypes.map(type => <option key={type} value={type}>{reportTypeLabel(type, locale)}</option>)}</select></label>
          </div>
          <div className="space-y-1.5">
            {visibleReports.map(report => {
              const freshness = reportFreshness(report, locale);
              const isSelected = report.id === selected?.id;
              return <button key={report.id} type="button" onClick={() => selectReport(report.id)} aria-pressed={isSelected} aria-controls="report-detail" className={`block min-h-11 w-full min-w-0 rounded-lg border px-3 py-3 text-left transition-colors ${isSelected ? "border-accent bg-accent-soft" : "border-transparent bg-transparent hover:border-border-pg hover:bg-bg-panel-muted"}`}>
                <span className={`block break-words text-sm font-medium leading-5 ${isSelected ? "text-accent" : "text-text-pg"}`}>{report.title}</span>
                <span className="mt-1.5 block break-words text-xs leading-5 text-text-pg-muted">{report.assets.length ? report.assets.slice(0, 3).join(" · ") : reportTypeLabel(report.report_type, locale)}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-pg-dim"><time dateTime={report.created_at} title={formatDateTime(locale, report.created_at)}>{reportListDate(report.created_at, locale)}</time><span aria-hidden>·</span><StatusDot tone={freshness.stale ? "amber" : "emerald"} /><span>{freshness.stale ? freshness.label : freshness.age}</span></span>
              </button>;
            })}
            {!visibleReports.length ? <div><EmptyState title={reports.length ? (zh ? "没有符合条件的报告" : "No matching reports") : copy.archive.emptyTitle} description={reports.length ? (zh ? "试试其他关键词或报告类型。" : "Try another search or report type.") : copy.archive.emptyDescription} />{reports.length ? <button type="button" onClick={() => { setQuery(""); setReportType(""); archiveSearch.current?.focus(); }} className="pg-button mt-3 min-h-11 rounded-lg border border-border-pg px-3 text-sm">{zh ? "清除筛选" : "Clear filters"}</button> : null}</div> : null}
          </div>
        </ResearchCard>
        <ResearchCard className={`min-w-0 scroll-mt-24 ${showReader ? "" : "max-lg:!hidden"}`} id="report-detail" role="article" aria-labelledby={selected ? "selected-report-title" : undefined}>
          {selected ? <>
            <header className="mb-5 border-b border-border-pg pb-4">
              <h2 id="selected-report-title" ref={detailHeading} tabIndex={-1} className="break-words text-xl font-semibold leading-7 tracking-tight outline-none md:text-2xl md:leading-8">{selected.title}</h2>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-text-pg-muted">{selected.assets.length ? <span className="max-w-full break-words font-medium text-text-pg">{selected.assets.join(" · ")}</span> : null}<span>{(selected.language || locale).toUpperCase()}</span><span aria-hidden>·</span><StatusDot tone={selectedFreshness?.stale ? "amber" : "emerald"} /><span>{selectedFreshness?.label} · {selectedFreshness?.age}</span></p>
                <button type="button" onClick={backToArchive} className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-accent lg:hidden"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />{zh ? "返回归档" : "Back to archive"}</button>
              </div>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs leading-5 text-text-pg-dim"><Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />{selected.source_intelligence_id ? (zh ? "已关联研究证据" : "Linked research evidence") : (zh ? "未记录来源" : "Source not recorded")}</p>
            </header>
            {selectedFreshness?.stale ? <div className="mb-5 rounded-lg border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm leading-6 text-status-warning">{zh ? "此报告已过期，仅供归档查看，不能作为今日判断或再次推送。请生成新的实时简报。" : "This report is stale and is available only for archive review. It cannot be used as today’s view or sent again; generate a new live brief."}</div> : null}
            <div className="mx-auto max-w-[76ch]"><Markdown content={selected.content_markdown} headingBaseLevel={3} /></div>
            <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border-pg pt-4">
              <p className="text-xs leading-5 text-text-pg-dim">{copy.archive.created}: <time dateTime={selected.created_at}>{formatDateTime(locale, selected.created_at)}</time></p>
              {!selectedFreshness?.stale ? <div className="flex flex-wrap gap-2">{["telegram", "imessage"].map(channel => <SendReportButton key={channel} channel={channel} reportId={selected.id} />)}</div> : null}
            </footer>
          </> : <EmptyState title={copy.detail.noSelectionTitle} description={copy.detail.noSelectionDescription} />}
        </ResearchCard>
      </div>
    </div>
  );
}
