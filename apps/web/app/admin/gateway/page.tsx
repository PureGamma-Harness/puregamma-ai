import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function GatewayAdministrationRedirect() {
  return redirectToLocalized("/admin/gateway");
}
