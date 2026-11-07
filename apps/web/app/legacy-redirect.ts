import { redirect } from "next/navigation";
import { getPreferredLocale } from "@/i18n/request";
import { withLocale } from "@/i18n/routing";

export async function redirectToLocalized(path: string): Promise<never> {
  redirect(withLocale(await getPreferredLocale(), path));
}
