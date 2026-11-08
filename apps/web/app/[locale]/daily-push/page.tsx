import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { DailyPushSettings } from "@/components/daily-push-settings";
import { ErrorState, PageHeader } from "@/components/puregamma";
import { getBillingSubscription, getDailyPushPreferences } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { getMessageNamespace } from "@/lib/translations";
import { isLocale, withLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  return localizedMetadata(locale, "daily-push", "/daily-push");
}

export default async function DailyPushPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  const locale = params.locale;
  const copy = getMessageNamespace(locale, "daily-push");
  // Keep this page aligned with the single-channel preference schema exposed by the API.
  let settings: ReactNode = null;
  try {
    const [data, subscription] = await Promise.all([getDailyPushPreferences(locale), getBillingSubscription(locale)]);
    if (!subscription.unavailable && subscription.plan && data?.preference && Array.isArray(data.history)) {
      settings = <DailyPushSettings initial={data.preference} initialHistory={data.history} locale={locale} plan={subscription.plan} />;
    }
  } catch (error) {
    unstable_rethrow(error);
    // Do not fabricate editable preferences when a required read failed.
  }
  const zh = locale === "zh";
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.subtitle} sectionNumber="06" />
      {settings || <section role="alert" className="space-y-3">
        <ErrorState title={zh ? "每日推送设置暂不可用" : "Daily delivery settings are unavailable"} description={zh ? "无法确认推送设置或账户权限。请重新加载后再修改设置或发送测试。" : "Delivery preferences or account access could not be confirmed. Reload before changing settings or sending a test."} />
        <a href={withLocale(locale, "/daily-push")} className="inline-flex min-h-11 items-center rounded-lg border border-border-pg px-4 text-sm">{zh ? "重试加载设置" : "Retry loading settings"}</a>
      </section>}
    </div>
  );
}
