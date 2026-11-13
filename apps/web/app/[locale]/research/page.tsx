import type { Metadata } from "next";
import { ResearchConsole } from "@/components/research-console";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "研究 | PureGamma AI" : "Research | PureGamma AI", description: zh ? "智能研究工作台：深度研究任务、证据与限制条件。" : "Intelligence research workbench: deep research runs, evidence, and limitations." };
}

export default async function ResearchPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  return <ResearchConsole locale={params.locale} />;
}
