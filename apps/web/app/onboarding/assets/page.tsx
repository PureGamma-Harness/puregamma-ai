import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function OnboardingAssetsRedirect() {
  return redirectToLocalized("/onboarding/assets");
}
