import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { GlobalMarketTerminal } from "@/components/global-market-terminal";
import { HyperliquidMarketPanel } from "@/components/hyperliquid-market-panel";
import { Markdown } from "@/components/markdown";
import { TodayActivity } from "@/components/today-activity";
import { EmptyState, ErrorState } from "@/components/puregamma";
import { TerminalPanel } from "@/components/terminal/editorial";
import { IntelligenceHero } from "@/components/terminal/intelligence-hero";

import { PortfolioNav } from "@/components/terminal/portfolio-nav";
import type { MarketStatus } from "@/lib/chrono";
import { ChronoEntrance } from "@/components/chrono/chrono-entrance";
import { ChronoSlices } from "@/components/chrono/chrono-slices";
import { getDashboard, type ReportRow } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { getMessageNamespace } from "@/lib/translations";
import { isLocale, type Locale, withLocale } from "@/i18n/routing";

function fmtDate(value: string, locale: Locale) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric" });
}

function isFreshMarketBrief(report: ReportRow): boolean {
  if (!new Set(["daily_market_report", "crypto_daily"]).has(report.report_type)) return false;
  const createdAt = new Date(report.created_at).getTime();
  return Number.isFinite(createdAt) && Date.now() - createdAt <= 36 * 60 * 60 * 1000;
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return localizedMetadata(locale, "dashboard", "/dashboard");
}

export default async function DashboardPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  const locale = params.locale;
  const zh = locale === "zh";
  const copy = getMessageNamespace(locale, "dashboard");
  const { market, subscription, reports } = await getDashboard(locale);

  const status: MarketStatus = (market as { unavailable?: boolean }).unavailable || market.assets.length === 0 ? "waiting" : (market.mockMode ? "stale" : "live");
  const liveAssets = typeof market.live_assets === "number" ? market.live_assets : null;
  const recentReports: ReportRow[] = Array.isArray(reports.reports) ? reports.reports.slice(0, 4) : [];
  // An archived report must never be displayed as the dashboard's current
  // market thesis.  Users can still inspect it in Research Desk with an
  // explicit stale label.
  const latest = reports.reports.find(isFreshMarketBrief);
  const dataAsOf = market.assets.reduce<string | null>((latestTimestamp, asset) => {
    if (!asset.timestamp || Number.isNaN(new Date(asset.timestamp).getTime())) return latestTimestamp;
    if (!latestTimestamp || new Date(asset.timestamp).getTime() > new Date(latestTimestamp).getTime()) return asset.timestamp;
    return latestTimestamp;
  }, null);
  const liveLabel = status === "live" && liveAssets !== null && liveAssets > 0 ? (zh ? `${liveAssets} 个实时资产` : `${liveAssets} live assets`) : null;

  return (
    <ChronoSlices className="dashboard-briefing">
      <ChronoEntrance>
        <IntelligenceHero
          locale={locale}
          eyebrow={copy.heroEyebrow}
          title={copy.heroTitle}
          byline={copy.heroByline}
          status={status}
          dataAsOf={dataAsOf}
          liveLabel={liveLabel}
        />
      </ChronoEntrance>

      <nav className="workflow-strip chrono-slice" data-chrono-slice aria-label={zh ? "研究工作流程" : "Research workflows"}>
        {[
          { path: "/research", title: zh ? "研究工作台" : "Research desk", detail: zh ? "从研究问题追溯到资料与证据" : "Follow a research question to its sources" },
          { path: "/reports", title: zh ? "证据与报告" : "Evidence & reports", detail: zh ? "阅读市场简报与历史研究结果" : "Read market briefs and previous findings" },
          { path: "/portfolio", title: zh ? "组合背景" : "Portfolio context", detail: zh ? "检查持仓、敞口与数据新鲜度" : "Review holdings, exposure, and data freshness" },
        ].map((workflow, index) => (
          <Link key={workflow.path} href={withLocale(locale, workflow.path)} className="workflow-link">
            <span className="workflow-index" aria-hidden>0{index + 1}</span>
            <span><strong>{workflow.title}</strong><small>{workflow.detail}</small></span>
            <ArrowUpRight className="mt-0.5 h-4 w-4 text-muted-2" aria-hidden />
          </Link>
        ))}
      </nav>

      <div className="hub-grid">
        <div className="hub-col">
          <div className="section-row"><h2 className="text-sm font-semibold tracking-tight">{copy.sectionThesis}</h2><span className="text-xs text-muted-2">{copy.sectionThesisDetail}</span></div>
          <div className="chrono-slice" data-chrono-slice>
            <TerminalPanel>
              {latest ? <Markdown content={latest.content_markdown} headingBaseLevel={3} /> : <><EmptyState title={copy.noBrief} description={copy.noBriefDesc} /><Link href={withLocale(locale, "/reports")} className="pg-button pg-button-secondary mt-4">{zh ? "查看研究报告" : "Open reports"}<ArrowUpRight className="h-4 w-4" aria-hidden /></Link></>}
            </TerminalPanel>
          </div>
          <div className="section-row"><h2 className="text-sm font-semibold tracking-tight">{copy.sectionTrail}</h2><span className="text-xs text-muted-2">{copy.sectionTrailDetail}</span></div>
          <div className="chrono-slice" data-chrono-slice>
            <TerminalPanel>
              {recentReports.length === 0 ? <p className="text-sm text-muted">{copy.evidenceEmpty}</p> :
                <ul className="divide-y divide-border">
                  {recentReports.map((report) => (<li key={report.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={withLocale(locale, `/reports?report=${encodeURIComponent(report.id)}`)} className="min-w-0 rounded-sm hover:underline" aria-label={zh ? `在报告中阅读：${report.title}` : `Read in reports: ${report.title}`}>
                      <div className="truncate text-sm font-medium text-text-pg">{report.title}</div>
                      <div className="mt-0.5 text-[0.7rem] text-muted-2">{report.assets.length ? report.assets.join(" · ") : (zh ? "已保存的研究报告" : "Saved research report")}</div>
                    </Link>
                    <span className="shrink-0 text-[0.7rem] tabular-nums text-muted-2">{fmtDate(report.created_at, locale)}</span>
                  </li>))}
                </ul>}
            </TerminalPanel>
          </div>
        </div>

        <div className="hub-col">
          {subscription.unavailable ? <div className="chrono-slice" data-chrono-slice><ErrorState title={copy.accountBillingUnavailable} description={copy.accountBillingUnavailableDesc} /></div> : null}
          <PortfolioNav locale={locale} />
          <div className="section-row"><h2 className="text-sm font-semibold tracking-tight">{copy.sectionPulse}</h2><span className="text-xs text-muted-2">{copy.sectionPulseDetail}</span></div>
          <div className="chrono-slice" data-chrono-slice><GlobalMarketTerminal locale={locale} /></div>
        </div>
      </div>

      <section className="chrono-slice" data-chrono-slice aria-label={zh ? "市场观察" : "Market watch"}>
        <div className="section-row"><h2 className="text-sm font-semibold tracking-tight">{zh ? "市场观察" : "Market watch"}</h2><span className="text-xs text-muted-2">{zh ? "Hyperliquid · 市场数据" : "Hyperliquid · market data"}</span></div>
        <HyperliquidMarketPanel locale={locale} />
      </section>

      <section className="chrono-slice" data-chrono-slice aria-label={zh ? "今日决策" : "Today decisions"}>
        <div className="section-row"><h2 className="text-sm font-semibold tracking-tight">{copy.sectionToday}</h2><span className="text-xs text-muted-2">{copy.sectionTodayDetail}</span></div>
        <TodayActivity locale={locale} />
      </section>

      <div className="chrono-slice" data-chrono-slice>
        <Link href={withLocale(locale, "/onboarding/assets")} className="terminal-panel flex items-center justify-between gap-4 transition hover:border-foreground/30">
          <div>
            <div className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-muted">{zh ? "首次设置" : "First-time setup"}</div>
            <div className="mt-1 text-sm font-medium">{zh ? "连接数据源、配置通知与阅读偏好" : "Connect data sources, notifications, and reading preferences"}</div>
          </div>
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-2" aria-hidden />
        </Link>
      </div>
    </ChronoSlices>
  );
}
