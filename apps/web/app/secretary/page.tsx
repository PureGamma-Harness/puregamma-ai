import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function SecretaryRedirect() {
  return redirectToLocalized("/secretary");
}
