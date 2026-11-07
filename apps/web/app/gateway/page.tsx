import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function GatewayRedirect() {
  return redirectToLocalized("/gateway");
}
