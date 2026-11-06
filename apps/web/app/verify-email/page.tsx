import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function VerifyEmailRedirect() {
  return redirectToLocalized("/verify-email");
}
