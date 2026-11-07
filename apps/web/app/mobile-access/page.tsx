import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function MobileAccessRedirect() {
  return redirectToLocalized("/mobile-access");
}
