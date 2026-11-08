"use client";

import Link from "next/link";
import { useLocale } from "@/components/i18n/LocaleProvider";
import { withLocale } from "@/i18n/routing";

export function WorkspaceLoading() {
  const zh = useLocale() === "zh";
  return (
    <section role="status" aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-5xl space-y-5 py-8">
      <p className="text-sm text-text-pg-muted">{zh ? "正在加载工作区…" : "Loading your workspace…"}</p>
      <div aria-hidden="true" className="space-y-5 motion-safe:animate-pulse">
        <div className="h-9 w-2/3 rounded-lg bg-bg-panel-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 rounded-xl border border-border-pg bg-bg-panel" />
          <div className="h-48 rounded-xl border border-border-pg bg-bg-panel" />
        </div>
      </div>
    </section>
  );
}

export function WorkspaceRecovery({ retry }: { retry: () => void }) {
  const locale = useLocale();
  const zh = locale === "zh";
  return (
    <section role="alert" className="mx-auto my-10 max-w-xl space-y-4 rounded-xl border border-border-pg bg-bg-panel p-6">
      <h1 className="text-xl font-semibold">{zh ? "暂时无法加载此页面" : "This page could not be loaded"}</h1>
      <p className="text-sm leading-6 text-text-pg-muted">{zh ? "请重试。你也可以返回工作台后继续。" : "Please try again, or return to your dashboard to continue."}</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={retry} className="min-h-11 rounded-lg border border-border-pg-strong bg-pg-white px-4 py-2 text-sm font-semibold text-pg-black">{zh ? "重新加载" : "Try again"}</button>
        <Link href={withLocale(locale, "/dashboard")} className="inline-flex min-h-11 items-center px-2 text-sm underline underline-offset-4">{zh ? "返回工作台" : "Back to dashboard"}</Link>
      </div>
    </section>
  );
}
