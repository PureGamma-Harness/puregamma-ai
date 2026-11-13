"use client";

import { useMemo } from "react";
import { MARKET_STATUS_WORD, type MarketStatus } from "@/lib/chrono";



/** Source status and its actual timestamp, rather than a decorative live clock. */
export function MarketPresence({ locale, status = "waiting", dataAsOf, liveLabel }: {
  locale: "en" | "zh";
  status?: MarketStatus;
  dataAsOf?: string | null;
  liveLabel?: string | null;
}) {
  const zh = locale === "zh";
  const word = status === "waiting"
    ? { en: "Waiting for market data", zh: "等待市场数据" }
    : MARKET_STATUS_WORD[status];
  const asOf = useMemo(() => {
    if (!dataAsOf) return null;
    const d = new Date(dataAsOf);
    return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(d);
  }, [dataAsOf, zh]);
  const live = status === "live";
  const canShowLiveLabel = (status === "live" || status === "delayed") && Boolean(liveLabel);
  const dot = live ? "status-dot-live" : (status === "stale" || status === "waiting" ? "status-dot-warn" : "status-dot-idle");
  return (
    <div className="flex max-w-full flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-2">
      <span className="inline-flex items-center gap-2"><span className={"status-dot " + dot} aria-hidden /><span className={live ? "text-accent" : "text-muted-2"}>{zh ? word.zh : word.en}</span></span>
      {asOf ? <time dateTime={dataAsOf || undefined}>{zh ? "数据更新于 " : "As of "}{asOf} UTC</time> : null}
      {canShowLiveLabel ? <span className="text-muted-2">{liveLabel}</span> : null}
    </div>
  );
}
