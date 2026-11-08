import Link from "next/link";
import { PageHeader, ResearchCard } from "@/components/puregamma";
import { type Locale, withLocale } from "@/i18n/routing";


export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }) {
  const params = await paramsPromise;
  const locale = params.locale === "zh" ? "zh" : "en";
  return { title: locale === "zh" ? "支付已取消 | PureGamma AI" : "Payment Cancelled | PureGamma AI", description: locale === "zh" ? "支付流程已取消。" : "The payment flow was cancelled." };
}

export default async function BillingCancelPage({ params: paramsPromise }: { params: Promise<{ locale: Locale }> }) {
  const params = await paramsPromise;
  const zh = params.locale === "zh";
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={zh ? "账单" : "BILLING"} title={zh ? "已退出本次结账" : "Checkout cancelled"} description={zh ? "此次结账已结束，不会因此取消现有订阅。" : "This checkout has ended. Your existing subscription has not been cancelled."} />
      <ResearchCard>
        <p>{zh ? "你可以返回账单页查看当前套餐，或重新开始付款。" : "Return to billing to review your current plan or start a new checkout."}</p>
        <Link className="mt-4 inline-flex text-sm font-medium underline" href={withLocale(params.locale, "/billing")}>{zh ? "返回订阅页" : "Back to billing"}</Link>
      </ResearchCard>
    </div>
  );
}
