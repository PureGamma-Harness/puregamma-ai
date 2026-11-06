import type { Metadata } from "next";
import { StrategyRuntimeConsole } from "@/components/strategy-runtime-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "模拟仓位 | PureGamma AI" : "Paper Positions | PureGamma AI", description: zh ? "模拟执行仓位、订单与账户权益。" : "Paper positions, orders, and account equity." };
}

export default async function PositionsPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise; return <StrategyRuntimeConsole locale={params.locale} view="positions" />; }
