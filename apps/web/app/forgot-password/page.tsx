import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function ForgotPasswordRedirect() {
  return redirectToLocalized("/forgot-password");
}
