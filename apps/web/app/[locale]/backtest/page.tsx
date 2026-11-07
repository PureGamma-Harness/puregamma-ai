import type { Metadata } from "next";
import { BacktestLab } from "@/components/backtest-lab";
import Script from "next/script";
import { localizedMetadata } from "@/lib/metadata";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return localizedMetadata(locale, "backtest-lab");
}

export default async function BacktestPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  return <><Script src="https://cdn.plot.ly/plotly-2.35.2.min.js" strategy="afterInteractive" /><BacktestLab locale={params.locale} /></>;
}
