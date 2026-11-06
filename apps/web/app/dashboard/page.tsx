import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function DashboardRedirect() {
  return redirectToLocalized("/dashboard");
}
