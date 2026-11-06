import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "策略风险 | PureGamma AI" : "Strategy Risk | PureGamma AI", description: zh ? "策略风险额度、拒绝订单与不确定性审计。" : "Strategy risk limits, rejected orders, and uncertainty audit." };
}

export default async function RiskPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} view="risk" />; }
