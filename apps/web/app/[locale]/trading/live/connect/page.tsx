import type { Metadata } from "next";
import { LiveTradingConsole } from "@/components/live-trading-console";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "绑定券商连接 | PureGamma AI" : "LIVE Broker Connection | PureGamma AI",
    description: zh ? "绑定仅现货、只读权限的交易所 API Key（服务器加密存储）。" : "Bind a spot-only, read-enabled exchange API key (encrypted server-side).",
  };
}

export default async function LiveTradingConnectPage({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return <LiveTradingConsole locale={locale} view="connect" />;
}
