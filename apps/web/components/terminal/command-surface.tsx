"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ScanSearch } from "lucide-react";
import { LiquidLens } from "@/components/terminal/liquid-lens";
import { withLocale, type Locale } from "@/i18n/routing";

const CHIPS = [
  { en: "BTC outlook", zh: "BTC 市场观察", prompt: "What changed in BTC today, and which sources support it?", promptZh: "今天 BTC 有哪些重要变化？请列出支持这些变化的来源。" },
  { en: "Compare risks", zh: "比较资产风险", prompt: "Compare the current risks in BTC and ETH, and explain the limits of the available evidence.", promptZh: "比较 BTC 与 ETH 的当前风险，并说明现有证据的限制。" },
  { en: "Portfolio exposure", zh: "检查组合敞口", prompt: "Help me review my portfolio exposure and identify what data is still missing.", promptZh: "帮我检查组合敞口，并指出还缺少哪些数据。" },
];

/**
 * The primary AI work surface on the dashboard. Enter routes into the Agent
 * conversation (Chat); chips pre-write honest example prompts. Never a fake
 * capability — the destination is a real, existing workflow.
 */
export function CommandSurface({ locale }: { locale: Locale }) {
  const router = useRouter();
  const zh = locale === "zh";
  const [value, setValue] = useState("");

  const go = (q: string) => {
    const question = Array.from(q.trim()).slice(0, 4000).join("");
    router.push(withLocale(locale, question ? `/chat?topic=${encodeURIComponent(question)}` : "/chat"));
  };

  const submit = (e: FormEvent) => { e.preventDefault(); go(value); };

  return (
    <LiquidLens className="command-surface">
      <form onSubmit={submit} className="flex items-center gap-3">
        <ScanSearch className="h-4 w-4 shrink-0 text-accent" aria-hidden />
        <input value={value} onChange={(e) => setValue(e.target.value)}
          placeholder={zh ? "向 PureGamma 询问市场、你的组合或一个风险情景……" : "Ask PureGamma about the market, your portfolio, or a risk scenario…"}
          maxLength={4000}
          className="command-input" aria-label={zh ? "向 PureGamma 提问" : "Ask PureGamma"} />
        <button type="submit" className="command-submit" aria-label={zh ? "打开对话" : "Open a conversation"}><span className="command-submit-label">{zh ? "打开草稿" : "Open draft"}</span><ArrowUpRight className="h-4 w-4" aria-hidden /></button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {CHIPS.map((chip) => (
          <button key={chip.en} type="button" className="command-chip" onClick={() => go(zh ? chip.promptZh : chip.prompt)}>
            {zh ? chip.zh : chip.en}
          </button>
        ))}
      </div>
    </LiquidLens>
  );
}
