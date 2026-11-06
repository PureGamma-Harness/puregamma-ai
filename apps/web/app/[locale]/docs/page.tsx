import type { Metadata } from "next";
import { DocsEmbed } from "@/components/docs-embed";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const zh = isLocale(params.locale) && params.locale === "zh";
  return {
    title: zh ? "帮助文档 | PureGamma AI" : "Documentation | PureGamma AI",
    description: zh
      ? "PureGamma AI 使用手册:快速上手、功能指南、订阅与 Credits、常见问题。"
      : "PureGamma AI user guide: getting started, features, billing & credits, FAQ."
  };
}

export default async function DocsPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  return <DocsEmbed />;
}
