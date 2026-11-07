import type { Metadata } from "next";
import { DailyPushSettings } from "@/components/daily-push-settings";
import { PageHeader } from "@/components/puregamma";
import { getBillingSubscription, getDailyPushPreferences } from "@/lib/api";
import { localizedMetadata } from "@/lib/metadata";
import { getMessageNamespace } from "@/lib/translations";
import { isLocale, type Locale } from "@/i18n/routing";

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
  const [data, subscription] = await Promise.all([getDailyPushPreferences(locale), getBillingSubscription(locale)]);
  return <div className="space-y-5"><PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.subtitle} sectionNumber="06" /><DailyPushSettings initial={data.preference} initialHistory={data.history} locale={locale} plan={subscription.plan} /></div>;
}
