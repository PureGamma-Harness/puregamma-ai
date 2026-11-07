import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function LegacyInternalAdminLoginPage() {
  return redirectToLocalized("/internal/login");
}
