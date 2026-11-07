import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/nav";
import { isLocale, locales, type Locale } from "@/i18n/routing";
import { getMessages } from "@/lib/translations";

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://puregamma.ai";

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  if (!isLocale(params.locale)) return {};
  const messages = getMessages(params.locale);
  const title = messages.landing.seo.title;
  const description = messages.landing.seo.description;
  return {
    title,
    description,
    alternates: {
      canonical: `${baseUrl}/${params.locale}`,
      languages: {
        en: `${baseUrl}/en`,
        zh: `${baseUrl}/zh`
      }
    },
    openGraph: {
      title,
      description,
      locale: params.locale === "zh" ? "zh_CN" : "en_US",
      alternateLocale: params.locale === "zh" ? ["en_US"] : ["zh_CN"],
      url: `${baseUrl}/${params.locale}`,
      siteName: "PureGamma AI",
      images: [{ url: `${baseUrl}/logo.png`, width: 512, height: 512 }]
    },
    icons: { icon: "/logo.png", apple: "/logo.png" }
  };
}

export default async function LocaleLayout({ children, params: paramsPromise }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  if (!isLocale(params.locale)) notFound();
  const locale = params.locale as Locale;
  return <AppShell locale={locale}>{children}</AppShell>;
}
