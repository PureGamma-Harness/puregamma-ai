import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function BillingCancelRedirect() {
  return redirectToLocalized("/billing/cancel");
}
