import type { Metadata } from "next";
import { LiveTradingConsole } from "@/components/live-trading-console";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "实盘订单 | PureGamma AI" : "LIVE Orders | PureGamma AI",
    description: zh ? "预览 → 确认两步下单、风控检查结果、订单与撤单。" : "Two-step preview → confirm orders, risk check results, order list and cancellation.",
  };
}

export default async function LiveTradingOrdersPage({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return <LiveTradingConsole locale={locale} view="orders" />;
}
