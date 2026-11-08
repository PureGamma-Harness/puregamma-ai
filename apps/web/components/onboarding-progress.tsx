import Link from "next/link";
import { withLocale, type Locale } from "@/i18n/routing";

export function OnboardingProgress({ locale, step }: { locale: Locale; step: 1 | 2 | 3 }) {
  const labels = locale === "zh" ? ["研究资产", "研究风格", "接收方式"] : ["Assets", "Research style", "Delivery"];
  const paths = ["assets", "style", "channels"];
  return (
    <nav aria-label={locale === "zh" ? "首次设置进度" : "Setup progress"} className="mb-7">
      <ol className="grid grid-cols-3 gap-2 text-xs">
        {labels.map((label, index) => (
          <li key={paths[index]} className={`min-w-0 border-b-2 pb-3 ${index + 1 <= step ? "border-border-pg-strong text-text-pg" : "border-border-pg text-text-pg-muted"}`}>
            {index + 1 < step ? (
              <Link href={withLocale(locale, `/onboarding/${paths[index]}`)} className="inline-flex min-h-10 items-center gap-2 underline-offset-4 hover:underline">
                <span aria-hidden="true">{index + 1}</span>{label}
              </Link>
            ) : (
              <span className="inline-flex min-h-10 items-center gap-2" aria-current={index + 1 === step ? "step" : undefined}>
                <span aria-hidden="true">{index + 1}</span>{label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
