"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Bell, Info, Mail, MessageCircle, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/puregamma";
import { OnboardingProgress } from "@/components/onboarding-progress";
import { normalizeLocale, withLocale, type Locale } from "@/i18n/routing";
import { extractApiError, getMe, saveOnboarding } from "@/lib/api";
import { readOnboardingDraft, saveOnboardingDraft } from "@/lib/onboarding-draft";
import { getMessageNamespace, t } from "@/lib/translations";

const channelIcons: Record<string, LucideIcon> = { email: Mail, telegram: MessageCircle, imessage: Bell };

export default function LocalizedOnboardingChannelsPage() {
  const params = useParams<{ locale: string }>();
  const locale = normalizeLocale(params.locale);
  const zh = locale === "zh";
  const router = useRouter();
  const copy = getMessageNamespace(locale, "onboarding").channels;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [channels, setChannels] = useState<Record<string, boolean>>({ email: true });
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [account, setAccount] = useState<{ email: string; plan: string } | null>(null);

  useEffect(() => {
    let active = true;
    getMe().then(({ user }) => { if (active) setAccount({ email: user.email, plan: user.plan }); }).catch(() => { /* Email setup can continue; the server checks the session on save. */ });
    return () => { active = false; };
  }, []);

  const telegramAllowed = Boolean(account && ["Pro", "Max", "Enterprise"].includes(account.plan));
  const activeChannels = Object.entries(channels).filter(([id, enabled]) => enabled && (id === "email" || (id === "telegram" && telegramAllowed))).map(([id]) => id);

  const handleComplete = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || !activeChannels.length) return;
    setBusy(true);
    setError("");
    const draft = readOnboardingDraft();
    try {
      await saveOnboarding({
        preferred_assets: draft.assets,
        preferred_style: draft.style,
        notification_channels: activeChannels,
        email_recipient: "",
        telegram_chat_id: recipients.telegram?.trim() || "",
        imessage_recipient: "",
      });
      // The server has committed. A local cache failure must not turn success
      // into a login redirect or submit the mutation again.
      saveOnboardingDraft(draft);
      try {
        localStorage.setItem("pg_onboarding_done", "true");
        localStorage.setItem("pg_onboarding_channels", JSON.stringify(activeChannels));
      } catch { /* Cookie/session and server preferences remain authoritative. */ }
      router.push(withLocale(locale, "/dashboard"));
    } catch (cause) {
      if (extractApiError(cause).status === 401) {
        const returnTo = encodeURIComponent(withLocale(locale, "/onboarding/channels"));
        router.push(`${withLocale(locale, "/login")}?returnTo=${returnTo}`);
      } else {
        setError(zh ? "暂时无法保存设置。你的选择仍在，请重试。" : "Your settings could not be saved. Your choices are still here; please try again.");
      }
    } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-3xl py-8">
      <OnboardingProgress locale={locale} step={3} />
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-text-pg-muted"><span>{copy.step}</span><span className="text-text-pg">{copy.kicker}</span></div>
        <h1 className="mt-4 text-3xl font-semibold">{copy.title}</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-text-pg-muted">{copy.subtitle}</p>
      </header>
      <form onSubmit={handleComplete} aria-busy={busy} className="space-y-3">
        {error ? <p role="alert" className="rounded-lg border border-border-pg bg-bg-panel-muted p-4 text-sm text-status-negative">{error}</p> : null}
        <fieldset disabled={busy} className="space-y-3">
          <legend className="sr-only">{zh ? "选择接收方式" : "Choose delivery channels"}</legend>
          {copy.items.map((channel) => {
            const Icon = channelIcons[channel.id] ?? Mail;
            const locked = channel.id === "imessage" || (channel.id === "telegram" && !telegramAllowed);
            const active = !locked && Boolean(channels[channel.id]);
            const controlId = `delivery-${channel.id}`;
            return (
              <section key={channel.id} className={`rounded-xl border p-5 ${active ? "border-border-pg-strong bg-bg-panel-muted" : "border-border-pg bg-bg-panel"}`}>
                <label htmlFor={controlId} className={`flex items-start gap-3 ${locked ? "text-text-pg-muted" : "cursor-pointer"}`}>
                  <Icon className="mt-1 h-5 w-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{channel.label}</span>{channel.planRequired ? <Badge tone="amber">{t(locale, "onboarding.channels.required", { plan: channel.planRequired })}</Badge> : <Badge tone="emerald">{copy.free}</Badge>}</span>
                    <span className="mt-1.5 block text-sm leading-5 text-text-pg-muted">{channel.description}</span>
                  </span>
                  <input id={controlId} type="checkbox" checked={active} disabled={locked} onChange={(event) => setChannels((value) => ({ ...value, [channel.id]: event.target.checked }))} className="mt-1 h-5 w-5 shrink-0 accent-current" aria-describedby={`${controlId}-hint`} />
                </label>
                {channel.id === "email" ? <p id={`${controlId}-hint`} className="mt-3 break-words text-sm text-text-pg-muted">{zh ? "简报发送至你的账户邮箱" : "Briefs are sent to your account email"}{account?.email ? `: ${account.email}` : "."}</p> : locked ? <p id={`${controlId}-hint`} className="mt-3 text-xs text-text-pg-muted">{channel.id === "imessage" ? (zh ? "完成设置后，可在接收设置中验证号码并启用。" : "After setup, verify your number in delivery settings to enable this channel.") : (zh ? "登录 Pro 或更高套餐账户后可选择。" : "Sign in with a Pro or higher plan to select this channel.")}</p> : <p id={`${controlId}-hint`} className="sr-only">{channel.description}</p>}
                {active && channel.id === "telegram" ? <div className="mt-4">
                  <label htmlFor="telegram-recipient" className="mb-2 block text-sm font-medium">{zh ? "Telegram Chat ID 或用户名" : "Telegram Chat ID or username"}</label>
                  <input id="telegram-recipient" name="telegram_chat_id" type="text" required maxLength={160} value={recipients.telegram || ""} onChange={(event) => setRecipients((value) => ({ ...value, telegram: event.target.value }))} placeholder={channel.placeholder} className="w-full rounded-lg border border-border-pg bg-bg-panel px-3 py-2 text-sm" />
                </div> : null}
              </section>
            );
          })}
        </fieldset>
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border-pg bg-bg-panel-muted px-4 py-3 !mt-8">
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-text-pg-muted"><Info className="h-4 w-4 shrink-0" aria-hidden="true" />{selectedLabel(locale, activeChannels.length)}</p>
          <button type="submit" disabled={busy || !activeChannels.length} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-pg-strong bg-pg-white px-5 py-2.5 text-sm font-semibold text-pg-black disabled:cursor-not-allowed disabled:opacity-40">{busy ? copy.settingUp : copy.complete}{!busy ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}</button>
        </div>
      </form>
      <p className="mt-4 text-center text-xs text-text-pg-dim">{copy.footer}</p>
    </div>
  );
}

function selectedLabel(locale: Locale, count: number): string {
  return t(locale, count === 1 ? "onboarding.channels.selectedSingular" : "onboarding.channels.selected", { count });
}
