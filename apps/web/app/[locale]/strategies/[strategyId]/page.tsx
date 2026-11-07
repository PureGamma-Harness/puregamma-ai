import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string; strategyId: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? `策略详情 ${params.strategyId} | PureGamma AI` : `Strategy ${params.strategyId} | PureGamma AI`, description: zh ? "策略版本详情、数据源与执行控制。" : "Strategy version details, sources, and execution controls." };
}

export default async function StrategyDetailPage({ params: paramsPromise }: { params: Promise<{ locale: Locale; strategyId: string }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} view="detail" strategyId={params.strategyId} />; }
