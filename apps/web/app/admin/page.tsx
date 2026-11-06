import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function AdminRedirect() {
  return redirectToLocalized("/admin");
}
