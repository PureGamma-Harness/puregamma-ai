import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function DataSourcesRedirect() {
  return redirectToLocalized("/data-sources");
}
