import Link from "next/link";
import { PageHeader, ResearchCard } from "@/components/puregamma";
import { type Locale, withLocale } from "@/i18n/routing";


export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = params.locale === "zh" ? "zh" : "en";
  return { title: locale === "zh" ? "确认付款状态 | PureGamma AI" : "Check Payment Status | PureGamma AI", description: locale === "zh" ? "返回账单页查看付款、订阅与充值状态。" : "Review payment, subscription and top-up status in billing." };
}

export default async function BillingSuccessPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  const zh = params.locale === "zh";
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={zh ? "账单" : "BILLING"} title={zh ? "付款状态待确认" : "Payment pending confirmation"} description={zh ? "请返回账单页查看已确认的付款状态与当前套餐。" : "Return to billing to review the confirmed payment status and your current plan."} />
      <ResearchCard>
        <p>{zh ? "如果你已完成付款，套餐与余额更新可能需要片刻。此页面不代表付款已成功，请以账单页中的状态为准。" : "If you completed checkout, plan and balance updates may take a moment. This page does not confirm a successful payment; check billing for the current status."}</p>
        <Link className="mt-4 inline-flex text-sm font-medium underline" href={withLocale(params.locale, "/billing")}>{zh ? "返回订阅页" : "Back to billing"}</Link>
      </ResearchCard>
    </div>
  );
}
