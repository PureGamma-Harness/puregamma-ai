import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function LoginRedirect() {
  return redirectToLocalized("/login");
}
