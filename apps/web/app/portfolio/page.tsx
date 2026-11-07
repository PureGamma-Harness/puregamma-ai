import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function PortfolioRedirect() {
  return redirectToLocalized("/portfolio");
}
