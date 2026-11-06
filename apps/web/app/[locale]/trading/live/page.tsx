import type { Metadata } from "next";
import { LiveTradingConsole } from "@/components/live-trading-console";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "实盘总览 | PureGamma AI" : "LIVE Trading Overview | PureGamma AI",
    description: zh ? "实盘安全门、服务端 NAV、券商连接与熔断开关状态。" : "LIVE trading gates, server NAV, broker connections, and kill switch status.",
  };
}

export default async function LiveTradingOverviewPage({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return <LiveTradingConsole locale={locale} view="overview" />;
}
