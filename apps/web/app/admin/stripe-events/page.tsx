import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function StripeEventsRedirect() {
  return redirectToLocalized("/admin/stripe-events");
}
