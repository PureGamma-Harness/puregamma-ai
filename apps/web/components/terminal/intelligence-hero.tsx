"use client";

import type { ReactNode } from "react";

import { CommandSurface } from "@/components/terminal/command-surface";
import { MarketPresence } from "@/components/terminal/market-presence";
import type { MarketStatus } from "@/lib/chrono";
import type { Locale } from "@/i18n/routing";

/**
 * The dashboard hero: an open intelligence workspace, not a centered title.
 * A compact workspace heading, actual data presence and an immediately usable
 * question surface. The input is never hidden for an entrance sequence.
 */
export function IntelligenceHero({ locale, eyebrow, title, byline, status, dataAsOf, liveLabel }: {
  locale: Locale;
  eyebrow: string;
  title: string;
  byline: string;
  status?: MarketStatus;
  dataAsOf?: string | null;
  liveLabel?: string | null;
}) {
  return (
    <div className="hub-hero">
      <MotionStage className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="pg-metadata mb-2">{eyebrow}</p>
          <h1 className="pg-page-title">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{byline}</p>
        </div>
        <MarketPresence locale={locale} status={status} dataAsOf={dataAsOf} liveLabel={liveLabel} />
      </MotionStage>
      <div className="mt-5"><CommandSurface locale={locale} /></div>
    </div>
  );
}

/** Inline stage marker (wrapped so the hero stays one semantic unit). */
function MotionStage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={className} data-chrono-enter>{children}</div>;
}
