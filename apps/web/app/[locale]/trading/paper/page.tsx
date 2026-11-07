import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "Paper 策略运行 | PureGamma AI" : "Paper Strategy Runtime | PureGamma AI", description: zh ? "模拟执行的策略运行状态、行情源与订单。" : "Paper-executed strategy runs, market feed, and orders." };
}

export default async function PaperPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} view="paper" />; }
