import type { Metadata } from "next";
import { AgentChat } from "@/components/agent-chat";
import { isLocale, type Locale } from "@/i18n/routing";

export async function generateMetadata({ params: paramsPromise }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const params = await paramsPromise;
  const locale = isLocale(params.locale) ? params.locale : "en";
  const zh = locale === "zh";
  return { title: zh ? "Agent 对话 | PureGamma AI" : "Agent Chat | PureGamma AI", description: zh ? "与研究 Agent 对话：策略、事件、风险与投资笔记。" : "Chat with your research Agent about strategies, events, risk, and notes." };
}

export default async function ChatPage({ params: paramsPromise, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<{ topic?: string | string[]; prompt?: string | string[] }> }) {
  const params = await paramsPromise;
  const query = await searchParams;
  // Preserve the canonical topic even when blank or invalid. The old dashboard
  // spelling is a fallback only when topic is absent, never an automatic send.
  const seed = query.topic === undefined ? query.prompt : query.topic;
  const initialPrompt = typeof seed === "string" ? Array.from(seed.trim()).slice(0, 4000).join("") : "";
  return <AgentChat locale={params.locale} initialPrompt={initialPrompt} />;
}
