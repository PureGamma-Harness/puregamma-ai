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

export default async function ReportsPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  const locale = params.locale;
  const copy = getMessageNamespace(locale, "reports");
  const data = await getReports(locale);
  return <ReportsConsole locale={locale} reports={data.reports} copy={copy} filters={copy.filters} />;
}
