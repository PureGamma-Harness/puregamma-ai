import { redirectToLocalized, type LegacySearchParams } from "@/app/legacy-redirect";

export default async function ApiDocumentationRedirect({ searchParams }: { searchParams: Promise<LegacySearchParams> }) {
  return redirectToLocalized("/api", await searchParams);
}
