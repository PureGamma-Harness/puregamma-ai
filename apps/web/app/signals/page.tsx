import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function SignalsRedirect() {
  return redirectToLocalized("/signals");
}
