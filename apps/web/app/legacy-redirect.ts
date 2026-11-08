import { redirect } from "next/navigation";
import { getPreferredLocale } from "@/i18n/request";
import { withLocale } from "@/i18n/routing";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

export async function redirectToLocalized(path: string, searchParams: LegacySearchParams = {}): Promise<never> {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) value.forEach(item => params.append(name, item));
    else if (value !== undefined) params.append(name, value);
  }
  const destination = withLocale(await getPreferredLocale(), path);
  const query = params.toString();
  redirect(query ? `${destination}${destination.includes("?") ? "&" : "?"}${query}` : destination);
}
