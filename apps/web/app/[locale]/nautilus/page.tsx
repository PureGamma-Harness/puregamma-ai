import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { localizedMetadata } from "@/lib/metadata";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise; const locale = isLocale(params.locale) ? params.locale : "en"; return localizedMetadata(locale, "nautilus", "/nautilus"); }
export default async function NautilusPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} />; }
