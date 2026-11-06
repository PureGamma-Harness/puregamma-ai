import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function NautilusRedirect() {
  return redirectToLocalized("/nautilus");
}
