"use client";

import { useRef, useState } from "react";
import { Copy, CreditCard, KeyRound, Loader2, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { Badge, EmptyState, MetricCard, ResearchCard } from "@/components/puregamma";
import { OperationConfirmation } from "@/components/operation-confirmation";
import { UsagePanel } from "@/components/usage-panel";
import { changeGatewayKeyStatus, createGatewayKey, createGatewayTopup, rotateGatewayKey, type GatewayDashboard, type GatewayKey, type GatewayRequest, type GatewayUsage } from "@/lib/api";
import type { Locale } from "@/i18n/routing";

type Props = { locale: Locale; dashboard: GatewayDashboard; initialKeys: GatewayKey[]; initialRequests: GatewayRequest[]; initialUsage: GatewayUsage; keysUnavailable?: boolean; requestsUnavailable?: boolean };
type KeyConfirmation = { key: GatewayKey; action: "rotate" | "revoked" };
const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border-pg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";
const money = (value: string) => value.trim() && Number.isFinite(Number(value)) ? `$${Number(value).toFixed(4)}` : "—";
const usdCents = (value: string): bigint | null => {
  const text = value.trim();
  if (text.length > 24 || !/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
};

export function GatewayConsole({ locale, dashboard, initialKeys, initialRequests, initialUsage, keysUnavailable = false, requestsUnavailable = false }: Props) {
  const zh = locale === "zh";
  const [keys, setKeys] = useState(initialKeys);
  const [keyName, setKeyName] = useState(zh ? "默认密钥" : "Default key");
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const secretInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<KeyConfirmation | null>(null);
  const [topupAmount, setTopupAmount] = useState(dashboard.wallet.topup_min_usd);
  const [topupBusy, setTopupBusy] = useState(false);
  const [amountError, setAmountError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const unavailable = Boolean(dashboard.unavailable);
  const keyLimit = keys.filter((key) => key.status !== "revoked").length >= 10;
  const keyActionsDisabled = busy || topupBusy || unavailable || keysUnavailable || Boolean(oneTimeKey);
  const metric = (value: string) => unavailable ? "—" : money(value);

  const copy = async () => {
    if (!oneTimeKey) return;
    setError("");
    try {
      await navigator.clipboard.writeText(oneTimeKey);
      setMessage(zh ? "已复制，请将密钥保存在安全位置。" : "Copied. Save the key in a secure place.");
    } catch {
      setMessage("");
      setError(zh ? "无法访问剪贴板。请选中并复制下方密钥，然后安全保存。" : "Clipboard is unavailable. Please select and copy the key below, then save it securely.");
      secretInput.current?.focus();
      secretInput.current?.select();
    }
  };
  const create = async () => {
    if (keyActionsDisabled || keyLimit) return;
    const name = keyName.trim();
    setError(""); setMessage("");
    if (!name) { setError(zh ? "请为密钥填写一个便于识别的名称。" : "Enter a name to identify this key."); return; }
    setBusy(true);
    try {
      const created = await createGatewayKey(name);
      setKeys((current) => [created.api_key, ...current]);
      setOneTimeKey(created.key);
      setMessage(zh ? "密钥已创建。离开前请安全保存。" : "Key created. Save it securely before leaving.");
    } catch {
      setError(zh ? "无法创建密钥，请稍后重试。每个账户最多保留 10 个未撤销密钥。" : "Could not create a key. Please try again. Each account can keep up to 10 non-revoked keys.");
    } finally { setBusy(false); }
  };
  const topup = async () => {
    if (topupBusy || busy || oneTimeKey || unavailable) return;
    const amount = usdCents(topupAmount);
    const minimum = usdCents(dashboard.wallet.topup_min_usd);
    const maximum = usdCents(dashboard.wallet.topup_max_usd);
    setAmountError(""); setError(""); setMessage("");
    if (amount === null) { setAmountError(zh ? "请输入最多两位小数的美元金额。" : "Enter a USD amount with at most two decimals."); return; }
    if (minimum === null || maximum === null || amount < minimum || amount > maximum) {
      setAmountError(zh ? `金额须为 $${dashboard.wallet.topup_min_usd}–$${dashboard.wallet.topup_max_usd}。` : `Enter an amount from $${dashboard.wallet.topup_min_usd} to $${dashboard.wallet.topup_max_usd}.`);
      return;
    }
    setTopupBusy(true);
    try {
      const checkout = await createGatewayTopup(topupAmount.trim(), locale);
      window.location.assign(checkout.checkout_url);
    } catch {
      setError(zh ? "暂时无法开始付款。余额未发生变化，请稍后重试。" : "Could not start checkout. Your balance is unchanged; please try again.");
    } finally { setTopupBusy(false); }
  };
  const update = async (key: GatewayKey, action: "active" | "paused" | "revoked" | "rotate") => {
    if (keyActionsDisabled) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (action === "rotate") {
        const replacement = await rotateGatewayKey(key.id);
        setKeys((current) => [replacement.api_key, ...current.map((item) => item.id === key.id ? { ...item, status: "revoked" as const } : item)]);
        setOneTimeKey(replacement.key);
        setMessage(zh ? "密钥已轮换，旧密钥已撤销。请安全保存新密钥。" : "Key rotated and the old key revoked. Save the new key securely.");
      } else {
        await changeGatewayKeyStatus(key.id, action);
        setKeys((current) => current.map((item) => item.id === key.id ? { ...item, status: action } : item));
        setMessage(action === "revoked" ? (zh ? `${key.name} 已撤销。` : `${key.name} revoked.`) : (zh ? "密钥状态已更新。" : "Key status updated."));
      }
      setConfirmation(null);
    } catch {
      setError(zh ? "操作未完成，请重试。现有密钥状态未在此页面更改。" : "The operation could not be confirmed. Please try again. The key status shown here is unchanged.");
    } finally { setBusy(false); }
  };
  const ask = (key: GatewayKey, action: KeyConfirmation["action"]) => { setError(""); setMessage(""); setConfirmation({ key, action }); };

  return <div className="min-w-0 space-y-5">
    <ResearchCard className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl"><h2 className="text-lg font-semibold">{zh ? "连接你的研究工具" : "Connect your research tools"}</h2><p className="mt-2 text-sm leading-6 text-text-pg-muted">{zh ? "创建专用密钥、安全保存，再连接支持 OpenAI API 的应用。随时在这里查看余额与使用记录。" : "Create a dedicated key, save it securely, then connect an OpenAI-compatible app. Review its balance and usage here."}</p></div>
        <a href="#gateway-keys" className={button}>{zh ? "管理密钥" : "Manage keys"}<KeyRound className="h-4 w-4" aria-hidden /></a>
      </div>
    </ResearchCard>
    {unavailable ? <div role="alert" className="rounded-xl border border-status-warning bg-bg-panel p-4 text-sm"><p>{zh ? "Gateway 暂时不可用。余额未知，当前无法更改密钥或充值。" : "Gateway is temporarily unavailable. Balances are unknown and key changes and top-ups are paused."}</p><button type="button" onClick={() => window.location.reload()} className={`${button} mt-3`}>{zh ? "重新加载 Gateway" : "Reload Gateway"}</button></div> : null}
    <div className="grid grid-cols-2 gap-3 [&_.text-2xl]:break-words xl:grid-cols-5">
      <div data-testid="gateway-balance" className="col-span-2 xl:col-span-1"><MetricCard label={zh ? "API 可用余额" : "API balance"} value={metric(dashboard.wallet.available_balance_usd)} detail={zh ? "独立预付 USD 余额" : "Separate prepaid USD balance"} tone="emerald" /></div>
      <MetricCard label={zh ? "今日消费" : "Today"} value={metric(dashboard.spend_usd.today)} detail={zh ? "按已确认价格计费" : "At approved retail pricing"} tone="cyan" />
      <MetricCard label={zh ? "本月消费" : "This month"} value={metric(dashboard.spend_usd.month)} detail={dashboard.subscription.plan || (zh ? "套餐信息不可用" : "Plan unavailable")} tone="amber" />
      <MetricCard label={zh ? "累计消费" : "Lifetime"} value={metric(dashboard.spend_usd.lifetime)} detail={keysUnavailable ? (zh ? "密钥信息不可用" : "Key information unavailable") : `${keys.filter((key) => key.status !== "revoked").length} / 10 ${zh ? "个有效密钥" : "non-revoked keys"}`} tone="cyan" />
      <MetricCard label={zh ? "月度限额" : "Monthly limit"} value={unavailable ? "—" : Number(dashboard.account.monthly_spend_limit_usd) > 0 ? money(dashboard.account.monthly_spend_limit_usd) : (zh ? "不限额" : "Unlimited")} detail={unavailable ? (zh ? "账户状态未知" : "Account status unknown") : dashboard.account.status === "active" ? (zh ? "Gateway 已启用" : "Gateway active") : (zh ? "Gateway 已暂停" : "Gateway suspended")} tone="neutral" />
    </div>


    <ResearchCard className="min-w-0" id="gateway-keys">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-semibold">{zh ? "API 密钥" : "API keys"}</h2><p className="mt-2 break-all font-mono text-xs text-text-pg-muted">https://api.puregamma.ai/v1</p></div>
        <form onSubmit={(event) => { event.preventDefault(); void create(); }} className="w-full max-w-sm"><label htmlFor="gateway-key-name" className="block text-sm font-medium">{zh ? "密钥名称" : "Key name"}</label><div className="mt-2 flex flex-wrap gap-2"><input id="gateway-key-name" value={keyName} maxLength={80} disabled={keyActionsDisabled || keyLimit} onChange={(event) => setKeyName(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-pg bg-bg-panel-muted px-3 py-2 text-sm" /><button type="submit" disabled={keyActionsDisabled || keyLimit} className={`${button} bg-pg-white text-pg-black`}>{busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <KeyRound className="h-4 w-4" aria-hidden />}{zh ? "创建密钥" : "Create key"}</button></div></form>
      </div>
      {keysUnavailable ? <p role="alert" className="mt-4 text-sm text-status-warning">{zh ? "无法读取密钥，请重新加载后再管理。" : "Could not load keys. Reload before managing them."}</p> : null}
      {keyLimit ? <p className="mt-3 text-sm text-text-pg-muted">{zh ? "已达到 10 个有效密钥的上限，可先撤销不再使用的密钥。" : "You have 10 non-revoked keys. Revoke an unused key before creating another."}</p> : null}
      {oneTimeKey ? <section aria-label={zh ? "保存新密钥" : "Save your new key"} className="mt-4 rounded-xl border border-status-positive bg-bg-panel-muted p-4"><h3 className="text-sm font-semibold">{zh ? "仅显示一次，请先安全保存" : "Shown once — save it securely"}</h3><p className="mt-2 text-sm text-text-pg-muted">{zh ? "离开页面后将无法再次查看完整密钥。请勿在聊天或截图中分享。" : "The full key cannot be retrieved after you leave. Keep it out of chats and screenshots."}</p><label htmlFor="gateway-new-key" className="sr-only">{zh ? "新 API 密钥" : "New API key"}</label><input ref={secretInput} id="gateway-new-key" type="text" readOnly value={oneTimeKey} autoComplete="off" spellCheck={false} onFocus={(event) => event.currentTarget.select()} className="mt-3 min-h-11 w-full rounded-lg border border-border-pg bg-bg-app px-3 py-2 font-mono text-xs" /><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void copy()} className={button} aria-label={zh ? "复制密钥" : "Copy key"}><Copy className="h-4 w-4" aria-hidden />{zh ? "复制" : "Copy"}</button><button type="button" onClick={() => { setOneTimeKey(null); setError(""); setMessage(zh ? "完整密钥已从此页面移除。" : "The full key has been removed from this page."); }} className={button}>{zh ? "已安全保存，隐藏密钥" : "Saved securely — hide key"}</button></div></section> : null}
      {message ? <p role="status" className="mt-3 text-sm text-status-positive">{message}</p> : null}
      {error && !confirmation ? <p role="alert" className="mt-3 text-sm text-status-negative">{error}</p> : null}
      {keys.length ? <div role="region" aria-label={zh ? "API 密钥列表，可横向滚动" : "API keys, scroll horizontally"} tabIndex={0} className="relative mt-4 max-w-full overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="text-left text-xs text-text-pg-muted"><tr><th scope="col" className="py-3">{zh ? "名称" : "Name"}</th><th scope="col">{zh ? "前缀" : "Prefix"}</th><th scope="col">{zh ? "状态" : "Status"}</th><th scope="col">RPM</th><th scope="col">{zh ? "最后调用" : "Last used"}</th><th scope="col" className="text-right">{zh ? "操作" : "Actions"}</th></tr></thead><tbody>{keys.map((key) => <tr key={key.id} className="border-t border-border-pg"><th scope="row" className="max-w-48 break-words py-3 pr-3 text-left font-medium">{key.name}</th><td className="font-mono text-xs">{key.prefix}…{key.last_four}</td><td><Badge tone={key.status === "active" ? "emerald" : key.status === "paused" ? "amber" : "neutral"}>{key.status}</Badge></td><td>{key.rate_limit_rpm}</td><td className="text-xs text-text-pg-muted">{key.last_used_at ? new Date(key.last_used_at).toLocaleString(locale) : "—"}</td><td><div className="flex justify-end gap-1">{key.status === "active" || key.status === "paused" ? <><button aria-label={`${key.status === "active" ? (zh ? "暂停" : "Pause") : (zh ? "恢复" : "Resume")} ${key.name}`} type="button" disabled={keyActionsDisabled} onClick={() => void update(key, key.status === "active" ? "paused" : "active")} className={button}>{key.status === "active" ? <Pause className="h-4 w-4" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}</button><button aria-label={`${zh ? "轮换" : "Rotate"} ${key.name}`} type="button" disabled={keyActionsDisabled} onClick={() => ask(key, "rotate")} className={button}><RefreshCw className="h-4 w-4" aria-hidden /></button><button aria-label={`${zh ? "撤销" : "Revoke"} ${key.name}`} type="button" disabled={keyActionsDisabled} onClick={() => ask(key, "revoked")} className={`${button} text-status-negative`}><Trash2 className="h-4 w-4" aria-hidden /></button></> : null}</div></td></tr>)}</tbody></table></div> : !keysUnavailable ? <div className="mt-4"><EmptyState title={zh ? "尚未创建 API 密钥" : "No API keys yet"} description={zh ? "为你的应用创建一个专用密钥。" : "Create a dedicated key for your app."} /></div> : null}
    </ResearchCard>

    <ResearchCard className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-xl"><h2 className="font-semibold">{zh ? "充值 API 余额" : "Add API balance"}</h2><p className="mt-2 text-sm leading-6 text-text-pg-muted">{zh ? "已确认的美元付款将 1:1 计入 API 余额，不影响订阅、套餐或 Credits。" : "Confirmed USD payments are credited 1:1 to your API balance, separately from subscriptions, plans and Credits."}</p></div>
        <form noValidate onSubmit={(event) => { event.preventDefault(); void topup(); }} className="w-full max-w-md">
          <label htmlFor="gateway-topup" className="block text-sm font-medium">{zh ? "充值金额（USD）" : "Top-up amount (USD)"}</label>
          <div className="mt-2 flex flex-wrap gap-2"><input id="gateway-topup" value={topupAmount} onChange={(event) => { setTopupAmount(event.target.value); setAmountError(""); }} disabled={topupBusy || unavailable} aria-invalid={Boolean(amountError)} aria-describedby="gateway-topup-help gateway-topup-error" inputMode="decimal" type="text" maxLength={24} autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border-pg bg-bg-panel-muted px-3 py-2 text-sm" /><button type="submit" disabled={topupBusy || busy || Boolean(oneTimeKey) || unavailable} className={`${button} bg-pg-white text-pg-black`}>{topupBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CreditCard className="h-4 w-4" aria-hidden />}{zh ? "前往 Stripe 付款" : "Pay with Stripe"}</button></div>
          <p id="gateway-topup-help" className="mt-2 text-xs text-text-pg-muted">${dashboard.wallet.topup_min_usd}–${dashboard.wallet.topup_max_usd} · {zh ? "最多两位小数" : "Up to two decimals"}</p>
          <p id="gateway-topup-error" role={amountError ? "alert" : undefined} className="mt-1 text-sm text-status-negative">{amountError}</p>
        </form>
      </div>
    </ResearchCard>


    <ResearchCard className="min-w-0"><UsagePanel locale={locale} initialUsage={initialUsage} /></ResearchCard>

    <div className="grid min-w-0 gap-4 xl:grid-cols-3">
      <ResearchCard className="min-w-0"><h2 className="font-semibold">{zh ? "模型使用" : "Model usage"}</h2>{unavailable ? <p className="mt-3 text-sm text-text-pg-muted">{zh ? "用量暂不可用" : "Usage unavailable"}</p> : dashboard.models.length ? <div className="mt-3 space-y-2">{dashboard.models.map((model) => <div key={model.model} className="flex items-center justify-between gap-3 border-t border-border-pg py-2 text-sm"><div className="min-w-0"><div className="break-words font-medium">{model.model}</div><div className="text-xs text-text-pg-muted">{model.requests} {zh ? "次请求" : "requests"} · {model.input_tokens + model.output_tokens} tokens</div></div><span className="shrink-0">{money(model.cost_usd)}</span></div>)}</div> : <div className="mt-3"><EmptyState title={zh ? "暂无模型用量" : "No model usage"} description={zh ? "完成调用后会在这里汇总。" : "Completed calls will appear here."} /></div>}</ResearchCard>
      <ResearchCard className="min-w-0"><h2 className="font-semibold">{zh ? "最近请求" : "Recent requests"}</h2>{requestsUnavailable ? <p className="mt-3 text-sm text-text-pg-muted">{zh ? "请求记录暂不可用" : "Request history unavailable"}</p> : initialRequests.length ? <div className="mt-3 space-y-2">{initialRequests.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-border-pg py-2 text-sm"><div className="min-w-0"><div className="break-words font-medium">{item.model}</div><div className="text-xs text-text-pg-muted">{item.input_tokens} in / {item.output_tokens} out · {item.latency_ms}ms</div></div><div className="shrink-0 text-right"><Badge tone={item.status === "success" ? "emerald" : "red"}>{item.http_status}</Badge><div className="mt-1 text-xs">{money(item.cost_usd)}</div></div></div>)}</div> : <div className="mt-3"><EmptyState title={zh ? "暂无调用记录" : "No requests yet"} description={zh ? "请求历史不保存提示词内容。" : "Request history never stores prompt contents."} /></div>}</ResearchCard>
      <ResearchCard className="min-w-0"><h2 className="font-semibold">{zh ? "余额记录" : "Wallet activity"}</h2>{unavailable ? <p className="mt-3 text-sm text-text-pg-muted">{zh ? "余额记录暂不可用" : "Wallet activity unavailable"}</p> : dashboard.wallet_ledger.length ? <div className="mt-3 space-y-2">{dashboard.wallet_ledger.map((entry) => <div key={entry.id} className="flex items-center justify-between gap-3 border-t border-border-pg py-2 text-sm"><div className="min-w-0"><div className="font-medium">{entry.entry_type === "topup" ? (zh ? "Stripe 充值" : "Stripe top-up") : (zh ? "API 调用" : "API usage")}</div><div className="text-xs text-text-pg-muted">{new Date(entry.created_at).toLocaleString(locale)}</div></div><div className="shrink-0 text-right"><div className={Number(entry.amount_usd) >= 0 ? "text-status-positive" : "text-text-pg"}>{Number(entry.amount_usd) >= 0 ? "+" : ""}{money(entry.amount_usd)}</div><div className="text-xs text-text-pg-muted">{zh ? "余额" : "Balance"} {money(entry.balance_after_usd)}</div></div></div>)}</div> : <div className="mt-3"><EmptyState title={zh ? "暂无充值或用量" : "No wallet activity"} description={zh ? "已确认的充值和 API 调用会显示在这里。" : "Confirmed top-ups and API usage will appear here."} /></div>}</ResearchCard>
    </div>
    <OperationConfirmation open={Boolean(confirmation)} title={confirmation?.action === "rotate" ? (zh ? "轮换 API 密钥？" : "Rotate API key?") : (zh ? "撤销 API 密钥？" : "Revoke API key?")} target={confirmation ? `${confirmation.key.name} · ${confirmation.key.prefix}…${confirmation.key.last_four}` : ""} description={confirmation?.action === "rotate" ? (zh ? "旧密钥将立即失效。请准备好用新密钥更新所有使用此密钥的应用。" : "The old key will stop working immediately. Be ready to update every app using it with the new key.") : (zh ? "此密钥将永久失效，使用它的应用将无法继续调用。此操作无法撤销。" : "This key will permanently stop working and connected apps will lose access. This cannot be undone.")} confirmLabel={confirmation?.action === "rotate" ? (zh ? "轮换密钥" : "Rotate key") : (zh ? "撤销密钥" : "Revoke key")} cancelLabel={zh ? "保留密钥" : "Keep key"} busy={busy} error={error} onCancel={() => { setConfirmation(null); setError(""); }} onConfirm={() => { if (confirmation) void update(confirmation.key, confirmation.action); }} />
  </div>;
}
