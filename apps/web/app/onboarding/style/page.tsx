import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function OnboardingStyleRedirect() {
  return redirectToLocalized("/onboarding/style");
}
