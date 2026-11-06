import type { Metadata } from "next";
import { LiveTradingConsole } from "@/components/live-trading-console";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "实盘账户 | PureGamma AI" : "LIVE Account | PureGamma AI",
    description: zh ? "余额、持仓、仅追加 Ledger、对账与 Mandate 限额。" : "Balances, positions, the append-only ledger, reconciliation and mandate limits.",
  };
}

export default async function LiveTradingAccountPage({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return <LiveTradingConsole locale={locale} view="account" />;
}
