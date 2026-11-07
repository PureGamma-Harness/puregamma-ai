import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function OnboardingChannelsRedirect() {
  return redirectToLocalized("/onboarding/channels");
}
