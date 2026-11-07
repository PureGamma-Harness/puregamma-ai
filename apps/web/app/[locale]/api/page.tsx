import type { Metadata } from "next";
import { ApiDocsEmbed } from "@/components/api-docs-embed";
import { isLocale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "API 文档 | PureGamma AI" : "API Documentation | PureGamma AI",
    description: zh
      ? "PureGamma OpenAI 兼容 API 的接入、用量、计费与安全说明。"
      : "Integration, usage, billing, and security documentation for the PureGamma OpenAI-compatible API.",
  };
}

export default function ApiDocumentationPage() {
  return <ApiDocsEmbed />;
}
