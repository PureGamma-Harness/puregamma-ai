import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function BillingIntentsRedirect() {
  return redirectToLocalized("/admin/billing-intents");
}
