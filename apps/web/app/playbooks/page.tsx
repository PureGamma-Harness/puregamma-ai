import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function PlaybooksRedirect() {
  return redirectToLocalized("/playbooks");
}
