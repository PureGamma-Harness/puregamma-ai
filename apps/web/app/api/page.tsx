import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function ApiDocumentationRedirect() {
  return redirectToLocalized("/api");
}
