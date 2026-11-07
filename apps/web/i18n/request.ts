import { cookies, headers } from "next/headers";
import { defaultLocale, localeCookieName, localeFromAcceptLanguage, normalizeLocale, type Locale } from "./routing";
import { isChinaIP } from "@/lib/geoip";

export async function getPreferredLocale(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale);
  return localeFromAcceptLanguage((await headers()).get("accept-language")) || defaultLocale;
}

export async function getPreferredLocaleGeo(): Promise<Locale> {
  const cookieLocale = (await cookies()).get(localeCookieName)?.value;
  if (cookieLocale) return normalizeLocale(cookieLocale);
  const acceptLocale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  if (acceptLocale !== defaultLocale) return acceptLocale;
  const isCN = await isChinaIP(await headers());
  return isCN ? "zh" : defaultLocale;
}
