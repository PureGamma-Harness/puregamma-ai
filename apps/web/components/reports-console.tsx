"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Search, ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Markdown } from "@/components/markdown";
import { SendReportButton } from "@/components/actions";
import { DailyBriefControls } from "@/components/daily-brief-controls";
import { Badge, CreditCostBadge, EmptyState, PageHeader, ResearchCard, StatusDot } from "@/components/puregamma";
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

export default function ReportsPage({ locale, reports, copy, initialReportId, unavailable = false }: { locale: Locale; reports: ReportRow[]; copy: { eyebrow: string; title: string; subtitle: string; archive: Record<string, string>; detail: Record<string, string> }; filters?: string[]; initialReportId?: string; unavailable?: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(reports.find(report => report.id === initialReportId)?.id ?? reports[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [reportType, setReportType] = useState("");
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const archiveSearch = useRef<HTMLInputElement>(null);
  useEffect(() => { if (initialReportId && reports.some(report => report.id === initialReportId)) setSelectedId(initialReportId); }, [initialReportId, reports]);
  const visibleReports = useMemo(() => reports.filter(report => (!reportType || report.report_type === reportType) && `${report.title} ${report.assets.join(" ")}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [reports, reportType, query]);
  const selected = useMemo(() => visibleReports.find(report => report.id === selectedId) ?? visibleReports[0] ?? null, [visibleReports, selectedId]);
  const zh = locale === "zh";
  const selectedFreshness = selected ? reportFreshness(selected, locale) : null;
  const reportTypes = Array.from(new Set(reports.map(report => report.report_type)));
  const selectReport = (id: string) => {
    setSelectedId(id);
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

  if (unavailable) return <div className="space-y-5"><PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.subtitle} /><div role="alert" className="rounded-xl border border-status-warning/40 bg-bg-panel p-6"><h2 className="font-semibold">{zh ? "暂时无法加载报告" : "Reports could not be loaded"}</h2><p className="mt-2 text-sm leading-6 text-text-pg-muted">{zh ? "这不代表没有已保存的报告。请重试加载归档。" : "This does not mean your saved reports are empty. Retry to load the archive."}</p><button type="button" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())} className="mt-4 min-h-11 rounded-lg border border-border-pg px-4 text-sm disabled:opacity-50">{refreshing ? (zh ? "重新加载中…" : "Reloading…") : (zh ? "重试加载报告" : "Retry loading reports")}</button></div></div>;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={copy.title}
        description={copy.subtitle}
        sectionNumber="01"
        actions={<div className="flex flex-wrap gap-2"><DailyBriefControls locale={locale} /><CreditCostBadge locale={locale} cost={10} /></div>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-text-pg-dim" aria-hidden /><span className="sr-only">{zh ? "搜索报告标题或资产" : "Search reports by title or asset"}</span><input ref={archiveSearch} value={query} onChange={event => setQuery(event.target.value)} placeholder={zh ? "搜索报告标题或资产" : "Search reports by title or asset"} className="min-h-11 w-full rounded-lg border border-border-pg bg-bg-panel pl-9 pr-3 text-sm" /></label>
        <label><span className="sr-only">{zh ? "报告类型" : "Report type"}</span><select value={reportType} onChange={event => setReportType(event.target.value)} className="min-h-11 max-w-full rounded-lg border border-border-pg bg-bg-panel px-3 text-sm"><option value="">{zh ? "全部报告类型" : "All report types"}</option>{reportTypes.map(type => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <span role="status" className="text-xs text-text-pg-muted">{visibleReports.length}/{reports.length} {zh ? "份报告" : "reports"}</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <ResearchCard id="reports-archive">
          <div className="mb-4 border-b border-border-pg pb-3">
            <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-pg-muted">{copy.archive.eyebrow}</div>
            <h2 className="mt-2 font-semibold">{copy.archive.title}</h2>
          </div>
          <div className="space-y-3">
            {visibleReports.map((report, index) => {
              const freshness = reportFreshness(report, locale);
              const isSelected = report.id === selected?.id;
              return (
              <button key={report.id} type="button" onClick={() => selectReport(report.id)} aria-pressed={isSelected} aria-controls="report-detail" className={`grid w-full grid-cols-[42px_1fr] gap-3 border p-3 text-left transition  rounded-lg ${isSelected ? "border-border-pg-strong bg-bg-panel" : "border-border-pg bg-bg-panel-muted hover:border-border-pg-strong"}`}>
                <div className="text-sm text-text-pg-dim">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <div className="font-medium">{report.title}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {report.assets.slice(0, 3).map((asset) => <Badge key={asset}>{asset}</Badge>)}
                    <Badge tone="neutral"><StatusDot tone={freshness.stale ? "amber" : "emerald"} /> {freshness.label}</Badge>
                    <Badge tone="neutral">{copy.detail.language}: {(report.language || locale).toUpperCase()}</Badge>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-text-pg-muted">
                    <span>{copy.archive.created}: {formatDateTime(locale, report.created_at)}</span>
                    <span>{zh ? "报告时间" : "Report age"}: {freshness.age}</span>
                    <span className={isSelected ? "text-text-pg" : "text-text-pg underline-offset-4 hover:underline"}>{copy.archive.openReport}</span>
                  </div>
                </div>
              </button>
              );
            })}
            {!visibleReports.length ? <div><EmptyState title={reports.length ? (zh ? "没有符合条件的报告" : "No matching reports") : copy.archive.emptyTitle} description={reports.length ? (zh ? "试试其他关键词或报告类型。" : "Try another search or report type.") : copy.archive.emptyDescription} />{reports.length ? <button type="button" onClick={() => { setQuery(""); setReportType(""); archiveSearch.current?.focus(); }} className="mt-3 min-h-11 rounded-lg border border-border-pg px-3 text-sm">{zh ? "清除筛选" : "Clear filters"}</button> : null}</div> : null}
          </div>
        </ResearchCard>
        <ResearchCard className="scroll-mt-24" id="report-detail">
          {selected ? (
            <>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border-pg pb-4">
                <div>
                  <div className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-pg-muted">{copy.detail.eyebrow}</div>
                  <button type="button" onClick={() => { archiveSearch.current?.focus({ preventScroll: true }); document.getElementById("reports-archive")?.scrollIntoView({ block: "start" }); }} className="mb-3 inline-flex min-h-10 items-center gap-1.5 text-xs text-text-pg-muted lg:hidden"><ArrowLeft className="h-3.5 w-3.5" aria-hidden />{zh ? "返回归档" : "Back to archive"}</button>
                  <h2 ref={detailHeading} tabIndex={-1} className="mt-2 break-words text-xl font-semibold outline-none">{selected.title}</h2>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selected.assets.map((asset) => <Badge key={asset}>{asset}</Badge>)}
                    <Badge tone="neutral">{selected.source_intelligence_id ? (zh ? "已关联研究证据" : "Linked research evidence") : (zh ? "未记录来源" : "Source not recorded")}</Badge>
                    <Badge tone="neutral"><StatusDot tone={selectedFreshness?.stale ? "amber" : "emerald"} /> {selectedFreshness?.label} · {selectedFreshness?.age}</Badge>
                    <Badge tone="neutral">{copy.detail.language}: {(selected.language || locale).toUpperCase()}</Badge>
                  </div>
                </div>
                {!selectedFreshness?.stale ? <div className="flex flex-wrap gap-2">{["telegram", "imessage"].map((channel) => <SendReportButton key={channel} channel={channel} reportId={selected.id} />)}</div> : null}
              </div>
              {selectedFreshness?.stale ? <div className="mb-4 border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-sm leading-5 text-status-warning rounded-lg">{zh ? "此报告已过期，仅供归档查看，不能作为今日判断或再次推送。请生成新的实时简报。" : "This report is stale and is available only for archive review. It cannot be used as today’s view or sent again; generate a new live brief."}</div> : null}
              <Markdown content={selected.content_markdown} />
            </>
          ) : (
            <EmptyState title={copy.detail.noSelectionTitle} description={copy.detail.noSelectionDescription} />
          )}
        </ResearchCard>
      </div>
    </div>
  );
}
