import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function ResetPasswordRedirect() {
  return redirectToLocalized("/reset-password");
}
