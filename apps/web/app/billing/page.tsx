import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function BillingRedirect() {
  return redirectToLocalized("/billing");
}
