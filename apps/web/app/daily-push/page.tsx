import { redirectToLocalized } from "@/app/legacy-redirect";

export default async function DailyPushRedirect() {
  return redirectToLocalized("/daily-push");
}
