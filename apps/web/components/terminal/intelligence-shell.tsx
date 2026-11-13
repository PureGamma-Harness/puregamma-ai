import type { ReactNode } from "react";
import { Display, DisplayEyebrow } from "@/components/terminal/editorial";

/**
 * Shared intelligence-workspace frame (Chat / Research / Secretary).
 * One restrained workspace header followed by the working surface. Domain
 * routes that own their own h1 render that header instead of nesting this one.
 *
 * `compact` shrinks that header for surfaces whose working area must fit the
 * viewport. Chat passes it: at 1440x900 the full-height header pushed the
 * composer ~110px below the fold, so the product's primary control could not be
 * reached without scrolling. The header collapses to a single line instead of
 * being removed, so the surface still identifies itself.
 */
export function IntelligenceShell({ eyebrow, title, children, byline, compact = false }: {
  eyebrow: string;
  title: string;
  byline?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="intelligence-shell">
        <header className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <DisplayEyebrow>{eyebrow}</DisplayEyebrow>
          <Display as="h1" size="md" className="pg-page-title">{title}</Display>
          {byline ? <p className="pg-metadata hidden md:block">{byline}</p> : null}
        </header>
        {children}
      </div>
    );
  }
  return (
    <div className="intelligence-shell">
      <header className="pg-page-header">
        <DisplayEyebrow>{eyebrow}</DisplayEyebrow>
        <Display as="h1" size="lg" className="pg-page-title mt-2">{title}</Display>
        {byline ? <p className="pg-page-description">{byline}</p> : null}
      </header>
      {children}
    </div>
  );
}
