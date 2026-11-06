import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function SignupRedirect() {
  return redirectToLocalized("/signup");
}
