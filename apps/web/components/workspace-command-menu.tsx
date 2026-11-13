"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, FileText, Search, X, type LucideIcon } from "lucide-react";
import type { Locale } from "@/i18n/routing";
import { withLocale } from "@/i18n/routing";
import { t } from "@/lib/translations";
import { usePluginNavItems } from "@/plugins/core/services/navigation";

export type WorkspaceDestination = {
  href: string;
  label: string;
  group: string;
  keywords?: string;
  icon?: LucideIcon;
};

export function WorkspaceCommandMenu({ locale, open, destinations, onRequestOpen, onClose }: {
  locale: Locale;
  open: boolean;
  destinations: WorkspaceDestination[];
  onRequestOpen: () => void;
  onClose: () => void;
}) {
  const zh = locale === "zh";
  const pathname = usePathname();
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const pluginItems = usePluginNavItems();
  const pages = useMemo<WorkspaceDestination[]>(() => [
    ...destinations,
    ...pluginItems.filter(item => !item.disabled).map(item => ({
      href: item.href,
      label: item.labelKey ? t(locale, item.labelKey) : item.label,
      group: zh ? "交易" : "Trading",
      keywords: item.href,
    })),
  ], [destinations, pluginItems, locale, zh]);
  const matches = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return pages.filter(page => words.every(word => `${page.label} ${page.group} ${page.keywords || ""} ${page.href}`.toLocaleLowerCase().includes(word)));
  }, [pages, query]);
  const selectedIndex = Math.min(activeIndex, Math.max(0, matches.length - 1));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;
      const modal = document.querySelector("dialog[open]");
      // A draft, confirmation or history dialog owns its keyboard interaction.
      if (modal && modal !== dialogRef.current && modal.id !== "mobile-navigation") return;
      event.preventDefault();
      if (open) onClose();
      else onRequestOpen();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, onRequestOpen]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    inputRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (dialog.open) dialog.close();
      const previous = previousFocus.current;
      if (previous?.isConnected && previous.getClientRects().length && !previous.closest("dialog:not([open])")) previous.focus();
      else document.querySelector<HTMLButtonElement>('[data-testid="workspace-search-trigger"]')?.focus();
    };
  }, [open]);

  useEffect(() => { onClose(); }, [pathname, onClose]);
  useEffect(() => {
    if (open && matches.length) dialogRef.current?.querySelector(`#${CSS.escape(`${listId}-${selectedIndex}`)}`)?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIndex, matches.length, listId]);

  const navigate = (destination: WorkspaceDestination) => {
    onClose();
    router.push(withLocale(locale, destination.href));
  };

  return (
    <dialog
      ref={dialogRef}
      id="workspace-page-search"
      aria-label={zh ? "搜索工作区页面" : "Search workspace pages"}
      onCancel={onClose}
      onClose={event => {
        // close() queues its event. A previous session may finish closing after
        // showModal() reopened this dialog; it must not close the new session.
        if (!event.currentTarget.open) onClose();
      }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
      className="fixed inset-0 m-auto w-[calc(100vw-2rem)] max-w-xl overflow-hidden rounded-2xl border border-border-pg-strong bg-bg-panel p-0 text-text-pg shadow-2xl backdrop:bg-black/45 backdrop:backdrop-blur-sm"
    >
      <div className="flex max-h-[min(80dvh,640px)] flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-border-pg px-4 py-3">
          <Search className="h-[18px] w-[18px] shrink-0 text-text-pg-muted" aria-hidden />
          <input
            ref={inputRef}
            type="search"
            maxLength={120}
            role="combobox"
            aria-label={zh ? "页面名称" : "Page name"}
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listId}
            aria-activedescendant={matches.length ? `${listId}-${selectedIndex}` : undefined}
            value={query}
            placeholder={zh ? "查找工作区页面…" : "Find a workspace page…"}
            onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape") {
                // Search inputs may consume Escape to clear their value before
                // the native dialog sees it. One press should close the finder.
                event.preventDefault();
                event.stopPropagation();
                onClose();
              } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                if (matches.length) setActiveIndex((selectedIndex + (event.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
              } else if (event.key === "Enter") {
                event.preventDefault();
                if (matches[selectedIndex]) navigate(matches[selectedIndex]);
              }
            }}
            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent text-[15px] outline-none placeholder:text-text-pg-dim"
          />
          <button type="button" onClick={onClose} aria-label={zh ? "关闭页面搜索" : "Close page search"} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-pg-muted hover:bg-bg-panel-muted hover:text-text-pg">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <div id={listId} role="listbox" aria-label={zh ? "工作区页面" : "Workspace pages"} className="min-h-0 overflow-y-auto overscroll-contain p-2">
          {matches.map((destination, index) => {
            const Icon = destination.icon || FileText;
            return (
              <button
                key={destination.href}
                id={`${listId}-${index}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-label={destination.label}
                aria-selected={index === selectedIndex}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => navigate(destination)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${index === selectedIndex ? "bg-accent-soft text-text-pg" : "text-text-pg-muted hover:bg-bg-panel-muted"}`}
              >
                <Icon className={`h-[18px] w-[18px] shrink-0 ${index === selectedIndex ? "text-accent" : "text-text-pg-dim"}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{destination.label}</span>
                <span aria-hidden className="hidden text-xs text-text-pg-dim sm:inline">{destination.group}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-text-pg-dim" aria-hidden />
              </button>
            );
          })}
          {!matches.length ? <p className="px-4 py-10 text-center text-sm text-text-pg-muted">{zh ? "没有找到匹配页面。试试其他名称。" : "No matching pages. Try a different name."}</p> : null}
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border-pg px-4 py-3 text-[11px] text-text-pg-dim">
          <span role="status" aria-live="polite">{zh ? `${matches.length} 个页面` : `${matches.length} pages`}</span>
          <span>{zh ? "↑↓ 选择 · Enter 打开 · Esc 关闭" : "↑↓ to choose · Enter to open · Esc to close"}</span>
        </div>
      </div>
    </dialog>
  );
}
