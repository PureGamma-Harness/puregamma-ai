import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function ReportsRedirect() {
  return redirectToLocalized("/reports");
}
