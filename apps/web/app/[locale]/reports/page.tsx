import type { Metadata } from "next";
import ReportsConsole from "@/components/reports-console";
import { getReports } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { getMessageNamespace } from "@/lib/translations";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return localizedMetadata(locale, "reports", "/reports");
}

export default async function ReportsPage({ params: paramsPromise, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<{ report?: string | string[] }> }) {
  const params = await paramsPromise;
  const locale = params.locale;
  const copy = getMessageNamespace(locale, "reports");
  const data = await getReports(locale);
  const report = (await searchParams).report;
  const initialReportId = typeof report === "string" ? report : undefined;
  return <ReportsConsole locale={locale} reports={data.reports} copy={copy} filters={copy.filters} initialReportId={initialReportId} unavailable={data.unavailable} />;
}
