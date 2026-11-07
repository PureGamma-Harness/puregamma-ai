import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function NewsRedirect() {
  return redirectToLocalized("/news");
}
