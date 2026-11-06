import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "Runtime 运行状态 | PureGamma AI" : "Runtime Status | PureGamma AI", description: zh ? "Runtime 事件、风险检查与执行适配器状态。" : "Runtime events, risk checks, and execution adapter status." };
}

export default async function RuntimePage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} view="runtime" />; }
