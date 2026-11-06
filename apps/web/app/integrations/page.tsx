import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function IntegrationsRedirect() {
  return redirectToLocalized("/integrations");
}
