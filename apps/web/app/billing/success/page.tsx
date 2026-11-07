import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function BillingSuccessRedirect() {
  return redirectToLocalized("/billing/success");
}
