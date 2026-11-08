"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrainCircuit, CheckCircle2, Clock3, Download, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { CapabilityGate, useCapabilityGate } from "@/components/ocean/capability-gate";
import { StatusBadge } from "@/components/ocean/status-badge";
import { clearMemory, decideMemoryProposal, deleteMemoryItem, exportMemory, getMemoryItems, getMemoryProposals, getMemorySettings, updateMemorySettings, type MemoryItem, type MemoryProposal, type MemorySettings } from "@/lib/api";
import { type Locale } from "@/i18n/routing";

type ScopeKey = "short_term" | "mid_term" | "conversation_summary" | "research_memory" | "portfolio_memory";

const SCOPES: { key: ScopeKey; en: string; zh: string; description: { en: string; zh: string } }[] = [
  { key: "short_term", en: "Short-term memory", zh: "短期记忆", description: { en: "Recent conversation context for the current working session.", zh: "当前工作会话中的近期对话上下文。" } },
  { key: "mid_term", en: "Mid-term preferences", zh: "中期偏好记忆", description: { en: "User preferences and facts proposed by the Agent, saved only after your approval.", zh: "Agent 提议的用户偏好与事实，仅在你同意后才会写入。" } },
  { key: "conversation_summary", en: "Conversation summaries", zh: "会话摘要", description: { en: "Compressed summaries used to keep long conversations coherent.", zh: "用于保持长对话连贯性的压缩摘要。" } },
  { key: "research_memory", en: "Research / project memory", zh: "项目与研究记忆", description: { en: "Findings and conclusions attached to research work.", zh: "与研究任务相关的发现与结论。" } },
  { key: "portfolio_memory", en: "Portfolio memory", zh: "组合记忆", description: { en: "Account context and risk notes for portfolio work.", zh: "用于组合工作的账户背景与风险备注。" } },
];

function latestItemTime(items: MemoryItem[], scope: string, locale: string): string | null {
  const matching = items.filter((item) => item.scope === scope && item.created_at);
  if (!matching.length) return null;
  const timestamps = matching.map(item => new Date(item.created_at).getTime()).filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toLocaleString(locale) : locale === "zh" ? "时间未核实" : "Time unverified";
}

/**
 * Memory is a trust feature, not a showcase: scope switches, consent,
 * approve/reject proposals, delete/clear/export with explicit status.
 * Disabled scopes are never injected into context — the UI says so plainly.
 */
export function MemoryConsole({ locale }: { locale: Locale }) {
  const zh = locale === "zh";
  const gate = useCapabilityGate(() => getMemorySettings(), []);
  const [savedSettings, setSettings] = useState<MemorySettings | null>(null);
  const settings = savedSettings ?? gate.value?.settings ?? null;
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [proposals, setProposals] = useState<MemoryProposal[]>([]);
  const [busy, setBusy] = useState("");
  const [reading, setReading] = useState(true);
  const [readErrors, setReadErrors] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [consentPrompt, setConsentPrompt] = useState<ScopeKey | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<"all" | "short_term" | "mid_term" | null>(null);
  const [exportUrl, setExportUrl] = useState<{ url: string; expires_at: string } | null>(null);

  const mounted = useRef(false);
  const snapshotVersion = useRef(0);
  const readingRef = useRef(false);
  const actionRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; snapshotVersion.current += 1; readingRef.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    if (readingRef.current) return;
    readingRef.current = true;
    const version = ++snapshotVersion.current;
    setReading(true);
    const [settingsResult, itemsResult, proposalsResult] = await Promise.allSettled([
      getMemorySettings(),
      Promise.all([getMemoryItems("short_term"), getMemoryItems("mid_term")]).then(([shortTerm, midTerm]) => [...(shortTerm.items || []), ...(midTerm.items || [])]),
      getMemoryProposals(),
    ]);
    if (!mounted.current || version !== snapshotVersion.current) return;
    if (settingsResult.status === "fulfilled") setSettings(settingsResult.value.settings);
    if (itemsResult.status === "fulfilled") setItems(itemsResult.value);
    if (proposalsResult.status === "fulfilled") setProposals(proposalsResult.value.proposals || []);
    setReadErrors([...(settingsResult.status === "rejected" ? ["settings"] : []), ...(itemsResult.status === "rejected" ? ["items"] : []), ...(proposalsResult.status === "rejected" ? ["proposals"] : [])]);
    readingRef.current = false;
    setReading(false);
  }, []);

  useEffect(() => {
    if (gate.state.status !== "available") return;
    refresh().catch(() => undefined);
  }, [gate.state.status, refresh]);

  const beginAction = (key: string) => {
    if (actionRef.current || readingRef.current) return false;
    actionRef.current = true;
    snapshotVersion.current += 1;
    setBusy(key);
    setError("");
    setNotice("");
    return true;
  };

  const toggleScope = async (key: ScopeKey, nextValue: boolean) => {
    if (!settings) return;
    if (!beginAction(key)) return;
    try {
      const patch: Partial<MemorySettings> = { [`${key}_enabled`]: nextValue } as Partial<MemorySettings>;
      const updated = await updateMemorySettings(patch, false);
      setSettings(updated.settings);
      if (updated.settings[`${key}_enabled` as keyof MemorySettings] !== nextValue) {
        setError(zh ? "未能应用所选设置，请检查当前状态后重试。" : "The requested setting was not applied. Check its current state before retrying.");
        return;
      }
      setNotice(nextValue ? (zh ? `已开启「${SCOPES.find((item) => item.key === key)?.zh}」。` : `Enabled "${SCOPES.find((item) => item.key === key)?.en}".`) : (zh ? "已关闭，此类记忆不再用于回答。" : "Disabled. This memory type is no longer used in answers."));
    } catch (reason) {
      const raw = String((reason as Error)?.message || reason);
      if (/CONSENT_REQUIRED/.test(raw)) setConsentPrompt(key);
      else setError(zh ? "无法更新记忆设置，请稍后重试。" : "Memory settings could not be updated. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const grantConsent = async () => {
    if (!consentPrompt || !settings) return;
    if (!beginAction(`consent:${consentPrompt}`)) return;
    setError("");
    try {
      const patch = { [`${consentPrompt}_enabled`]: true } as Partial<MemorySettings>;
      const updated = await updateMemorySettings(patch, true);
      setSettings(updated.settings);
      setConsentPrompt(null);
      setNotice(zh ? "已同意。之后 Agent 只会写入你批准的记忆条目。" : "Consent granted. The Agent will only write memory items you approve.");
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const approve = async (proposal: MemoryProposal) => {
    if (!beginAction(`proposal:${proposal.id}`)) return;
    setError("");
    try {
      await decideMemoryProposal(proposal.id, "approve");
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      await refresh();
      setNotice(zh ? "已写入记忆。" : "Memory item saved.");
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const reject = async (proposal: MemoryProposal) => {
    if (!beginAction(`proposal:${proposal.id}`)) return;
    setError("");
    try {
      await decideMemoryProposal(proposal.id, "reject");
      setProposals((current) => current.filter((item) => item.id !== proposal.id));
      setNotice(zh ? "已拒绝该记忆提议。" : "Proposal rejected.");
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const removeItem = async (item: MemoryItem) => {
    if (!beginAction(`delete:${item.id}`)) return;
    setError("");
    try {
      await deleteMemoryItem(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setConfirmDelete(null);
      setNotice(zh ? "已删除该记忆条目。" : "Memory item deleted.");
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const clear = async (scope: "all" | "short_term" | "mid_term") => {
    if (!beginAction("clear")) return;
    setError("");
    try {
      const result = await clearMemory(scope);
      setConfirmClear(null);
      setNotice(zh ? `已清空 ${result.cleared} 条记忆。` : `Cleared ${result.cleared} memory item(s).`);
      await refresh();
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const exportAll = async () => {
    if (!beginAction("export")) return;
    setError("");
    try {
      setExportUrl(await exportMemory());
      setNotice(zh ? "导出链接已生成（有时效）。" : "Export link generated (expires).");
    } catch (reason) {
      setError(zh ? "无法完成此记忆操作，请稍后重试。" : "This memory action could not be completed. Please try again.");
    } finally {
      actionRef.current = false;
      setBusy("");
    }
  };

  const scopedItems = (scope: string) => items.filter((item) => item.scope === scope);
  const scopeEnabled = (key: ScopeKey) => settings?.[`${key}_enabled` as keyof MemorySettings] === true;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-text-pg-dim">
          <BrainCircuit className="h-4 w-4" aria-hidden />
          {zh ? "记忆与授权" : "Memory & consent"}
        </div>
        <h1 className="mt-3 text-2xl font-semibold leading-tight md:text-3xl">{zh ? "Agent 记忆" : "Agent memory"}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-pg-muted">
          {zh
            ? "记忆是信任功能：每类记忆可独立开关；Agent 提议的记忆必须经你同意才会写入；关闭后不会再用于回答。"
            : "Choose what the Agent can remember. Review suggestions before saving, and turn off or delete memories at any time."}
        </p>
      </header>

      <CapabilityGate state={gate.state} locale={locale} title={zh ? "Memory 服务暂不可用" : "Memory service not available yet"} onRetry={gate.retry}>
        {notice ? <div className="mb-4 border border-status-positive p-3 text-sm text-status-positive rounded-lg" role="status">{notice}</div> : null}
        {error ? <div className="mb-4 border border-status-negative p-3 text-sm text-status-negative rounded-lg" role="alert">{error}</div> : null}

        {readErrors.length ? <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning/40 p-3 text-sm text-status-warning"><span>{zh ? "部分记忆数据无法加载，正在显示上次确认的内容。请重试以获取更新。" : "Some memory data could not be loaded. Showing the last confirmed content; retry to refresh."}</span><button type="button" disabled={reading || !!busy} onClick={() => { if (!actionRef.current) void refresh(); }} className="min-h-10 underline underline-offset-4">{zh ? "重试加载记忆" : "Retry loading memory"}</button></div> : null}
        {reading ? <p role="status" className="mb-4 text-sm text-text-pg-muted">{zh ? "正在加载记忆与提议…" : "Loading memory and proposals…"}</p> : null}
        {settings ? (
          <>
            <section className="border border-border-pg bg-bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-pg p-4">
                <h2 className="font-semibold">{zh ? "记忆开关" : "Memory scopes"}</h2>
                <span className="text-xs text-text-pg-dim">{zh ? "保留期" : "Retention"}: {settings.retention_days} {zh ? "天" : "days"}</span>
              </div>
              <div className="divide-y divide-border-pg">
                {SCOPES.map((scope) => {
                  const enabled = scopeEnabled(scope.key);
                  const latest = latestItemTime(items, scope.key, locale);
                  return (
                    <div key={scope.key} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-text-pg">{zh ? scope.zh : scope.en}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${enabled ? "border-status-positive/30 text-status-positive" : "border-border-pg text-text-pg-muted"}`}>{enabled ? (zh ? "开启" : "On") : (zh ? "关闭" : "Off")}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-text-pg-muted">{zh ? scope.description.zh : scope.description.en}</p>
                        <p className="mt-1 text-[11px] text-text-pg-dim">
                          {enabled
                            ? zh ? "已开启：经你批准的记忆可帮助个性化后续回答。" : "On: approved memories can personalize future answers."
                            : zh ? "已关闭：此类记忆不再用于回答。" : "Off: this memory type will not be used in answers."}
                          {latest ? <> · {zh ? "最后更新" : "Last updated"} {latest}</> : <> · {scope.key !== "short_term" && scope.key !== "mid_term" ? (zh ? "条目不在此列表中展示" : "items are not listed here") : reading ? (zh ? "正在加载条目" : "loading items") : readErrors.includes("items") ? (zh ? "条目未加载" : "items not loaded") : (zh ? "暂无条目" : "no items")}</>}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={zh ? scope.zh : scope.en}
                        disabled={!!busy || reading || (readErrors.includes("settings") && !enabled)}
                        onClick={() => void toggleScope(scope.key, !enabled)}
                        className={`h-8 w-14 border p-1 disabled:opacity-50 rounded-lg ${enabled ? "border-border-pg-strong" : "border-border-pg"}`}
                      >
                        <span className={`block h-5 w-5 transition-transform ${enabled ? "translate-x-6 bg-text-pg" : "translate-x-0 bg-text-pg-dim"}`} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>

            {consentPrompt ? (
              <div role="group" aria-label={zh ? "记忆授权" : "Memory consent"} className="mt-4 border border-status-warning bg-bg-panel p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-status-warning" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{zh ? "开启记忆需要你的同意" : "Consent required to enable memory"}</p>
                    <p className="mt-1 text-xs leading-5 text-text-pg-muted">
                      {zh
                        ? `开启「${SCOPES.find((item) => item.key === consentPrompt)?.zh}」后，Agent 可以提议写入此类记忆条目，但每条都必须经你批准才会生效。你可以随时关闭或删除。`
                        : `Enabling "${SCOPES.find((item) => item.key === consentPrompt)?.en}" lets the Agent propose memory items of this type; nothing is saved until you approve each proposal. You can disable or delete at any time.`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void grantConsent()} disabled={!!busy || reading || readErrors.includes("settings")} className="inline-flex items-center gap-1.5 border border-border-pg-strong px-3 py-2 text-xs font-medium disabled:opacity-40 rounded-lg"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{zh ? "同意并开启" : "Agree and enable"}</button>
                      <button type="button" onClick={() => setConsentPrompt(null)} disabled={!!busy} className="border border-border-pg px-3 py-2 text-xs rounded-lg">{zh ? "暂不开启" : "Not now"}</button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            <section className="mt-4 border border-border-pg bg-bg-panel">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-pg p-4">
                <h2 className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4" aria-hidden />{zh ? "待批准的记忆提议" : "Pending memory proposals"}</h2>
                <span className="text-xs text-text-pg-dim">{reading || readErrors.includes("proposals") ? "—" : proposals.length} {zh ? "条待处理" : "pending"}</span>
              </div>
              {proposals.length === 0 ? (
                <p className="p-4 text-sm text-text-pg-muted">{reading ? (zh ? "正在加载提议…" : "Loading proposals…") : readErrors.includes("proposals") ? (zh ? "提议尚未加载，请重试。" : "Proposals have not loaded. Please retry.") : (zh ? "暂无待批准的提议。" : "No proposals awaiting approval.")}</p>
              ) : (
                <ul className="divide-y divide-border-pg">
                  {proposals.map((proposal) => (
                    <li key={proposal.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="border border-border-pg px-1.5 py-0.5 uppercase text-text-pg-muted rounded-lg">{proposal.scope}</span>
                          <span className="border border-border-pg px-1.5 py-0.5 uppercase text-text-pg-dim rounded-lg">{proposal.kind}</span>
                          <span className="text-text-pg-dim">{new Date(proposal.created_at).toLocaleString(locale)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-text-pg">{proposal.content_preview}</p>
                        <p className="mt-1 text-[11px] text-text-pg-dim">{zh ? "来源" : "Source"}: {proposal.source}</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" onClick={() => void approve(proposal)} disabled={!!busy || reading || readErrors.includes("proposals")} className="inline-flex items-center gap-1 border border-border-pg-strong px-2.5 py-1.5 text-xs font-medium disabled:opacity-40 rounded-lg"><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />{zh ? "批准写入" : "Approve"}</button>
                        <button type="button" onClick={() => void reject(proposal)} disabled={!!busy || reading} className="inline-flex items-center gap-1 border border-border-pg px-2.5 py-1.5 text-xs disabled:opacity-40 rounded-lg"><XCircle className="h-3.5 w-3.5" aria-hidden />{zh ? "拒绝" : "Reject"}</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4 border border-border-pg bg-bg-panel">
              <div className="border-b border-border-pg p-4">
                <h2 className="font-semibold">{zh ? "已保存的记忆条目" : "Saved memory items"}</h2>
              </div>
              {items.length === 0 ? (
                <p className="p-4 text-sm text-text-pg-muted">{reading ? (zh ? "正在加载条目…" : "Loading saved items…") : readErrors.includes("items") ? (zh ? "记忆条目尚未加载，请重试。" : "Saved items have not loaded. Please retry.") : (zh ? "暂无已保存的记忆条目。" : "No saved memory items.")}</p>
              ) : (
                <ul className="divide-y divide-border-pg">
                  {items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="border border-border-pg px-1.5 py-0.5 uppercase text-text-pg-muted rounded-lg">{item.scope}</span>
                          <StatusBadge domain="research" value={item.status === "saved" ? "completed" : item.status} locale={locale} />
                          <span className="text-text-pg-dim">{new Date(item.created_at).toLocaleString(locale)}</span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-text-pg">{item.content_preview}</p>
                      </div>
                      {confirmDelete === item.id ? (
                        <div className="flex shrink-0 gap-2">
                          <button type="button" onClick={() => void removeItem(item)} disabled={!!busy || reading} className="border border-status-negative px-2.5 py-1.5 text-xs font-medium text-status-negative disabled:opacity-40 rounded-lg">{zh ? "确认删除" : "Confirm delete"}</button>
                          <button type="button" onClick={() => setConfirmDelete(null)} disabled={!!busy} className="border border-border-pg px-2.5 py-1.5 text-xs rounded-lg">{zh ? "取消" : "Cancel"}</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setConfirmDelete(item.id)} disabled={!!busy || reading} className="inline-flex shrink-0 items-center gap-1 border border-border-pg px-2.5 py-1.5 text-xs text-text-pg-muted hover:border-status-negative hover:text-status-negative rounded-lg"><Trash2 className="h-3.5 w-3.5" aria-hidden />{zh ? "删除" : "Delete"}</button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-4 flex flex-wrap gap-2 border border-border-pg bg-bg-panel p-4">
              {confirmClear ? (
                <>
                  <p className="w-full text-xs text-status-warning">{zh ? "清空操作不可撤销。确认清空所选范围的记忆？" : "Clearing is irreversible. Confirm clearing the selected memories?"}</p>
                  <button type="button" onClick={() => void clear(confirmClear)} disabled={!!busy || reading} className="border border-status-negative px-3 py-2 text-xs font-medium text-status-negative disabled:opacity-40 rounded-lg">{zh ? "确认清空" : "Confirm clear"}</button>
                  <button type="button" onClick={() => setConfirmClear(null)} disabled={!!busy} className="border border-border-pg px-3 py-2 text-xs rounded-lg">{zh ? "取消" : "Cancel"}</button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => setConfirmClear("all")} disabled={!!busy || reading} className="inline-flex items-center gap-1.5 border border-border-pg px-3 py-2 text-xs hover:border-status-negative hover:text-status-negative rounded-lg"><Trash2 className="h-3.5 w-3.5" aria-hidden />{zh ? "清空全部记忆" : "Clear all memory"}</button>
                  <button type="button" onClick={() => setConfirmClear("short_term")} disabled={!!busy || reading} className="inline-flex items-center gap-1.5 border border-border-pg px-3 py-2 text-xs hover:border-status-negative hover:text-status-negative rounded-lg"><Trash2 className="h-3.5 w-3.5" aria-hidden />{zh ? "清空短期记忆" : "Clear short-term"}</button>
                  <button type="button" onClick={() => setConfirmClear("mid_term")} disabled={!!busy || reading} className="inline-flex items-center gap-1.5 border border-border-pg px-3 py-2 text-xs hover:border-status-negative hover:text-status-negative rounded-lg"><Trash2 className="h-3.5 w-3.5" aria-hidden />{zh ? "清空中期记忆" : "Clear mid-term"}</button>
                  <button type="button" onClick={() => void exportAll()} disabled={!!busy || reading} className="inline-flex items-center gap-1.5 border border-border-pg px-3 py-2 text-xs disabled:opacity-40 rounded-lg"><Download className="h-3.5 w-3.5" aria-hidden />{zh ? "导出记忆" : "Export memory"}</button>
                </>
              )}
            </section>

            {exportUrl ? (
              <p className="mt-3 text-xs text-text-pg-muted" role="status">
                {zh ? "导出链接" : "Export link"}: <a href={exportUrl.url} target="_blank" rel="noreferrer" className="text-ocean-cyan hover:underline">{exportUrl.url.slice(0, 72)}…</a> · {zh ? "有效期至" : "expires"} {new Date(exportUrl.expires_at).toLocaleString(locale)}
              </p>
            ) : null}
          </>
        ) : null}
      </CapabilityGate>
    </div>
  );
}
