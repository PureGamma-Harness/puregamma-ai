"use client";

import Link from "next/link";
import Image from "next/image";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, Bot, BrainCircuit, BriefcaseBusiness, ChevronDown, ChevronRight, Code2, CreditCard, FlaskConical, Gauge, HeartHandshake, LayoutDashboard, LifeBuoy, Menu, MessageCircle, Network, Newspaper, Search, Smartphone, UserRound, X, type LucideIcon } from "lucide-react";
import { AppearanceControls } from "@/components/appearance-controls";
import { WorkspaceLoading } from "@/components/workspace-feedback";
import { WorkspaceCommandMenu, type WorkspaceDestination } from "@/components/workspace-command-menu";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { LocaleProvider } from "@/components/i18n/LocaleProvider";
import type { Locale } from "@/i18n/routing";
import { stripLocale, withLocale } from "@/i18n/routing";
import { t, type TranslationKey } from "@/lib/translations";
import { getMe, AUTH_EXPIRED_EVENT } from "@/lib/api";
import { getUserStateUpdate, isIdentityUserStateEvent, USER_STATE_EVENT, type SessionUserState } from "@/lib/user-state";
import { applySurfaceTier, surfaceTierForPath } from "@/lib/visual-style";
import { Chronosphere } from "@/components/chrono/chronosphere";
import { PluginRuntime } from "@/plugins/core/runtime";
import { usePluginNavItems } from "@/plugins/core/services/navigation";

type NavItem = { href: string; labelKey: TranslationKey; icon: LucideIcon; keywords?: string };
type NavGroup = { labelKey: TranslationKey; items: NavItem[]; collapsible?: boolean };
type StoredUser = SessionUserState;
type AccountView = { state: "loading" | "known" | "unavailable" | "signed-out"; user: StoredUser | null };

const groups: NavGroup[] = [
  {
    labelKey: "common.nav.groups.workspace",
    items: [
      { href: "/dashboard", labelKey: "common.nav.dashboard", icon: LayoutDashboard },
      { href: "/chat", labelKey: "common.nav.chat", icon: Bot },
      { href: "/research", labelKey: "common.nav.research", icon: FlaskConical, keywords: "Harness" },
      { href: "/reports", labelKey: "common.nav.reports", icon: BookOpen },
      { href: "/portfolio", labelKey: "common.nav.nav", icon: BriefcaseBusiness, keywords: "NAV" },
      { href: "/news", labelKey: "common.nav.news", icon: Newspaper },
    ],
  },
  {
    labelKey: "common.nav.groups.manage",
    items: [
      { href: "/memory", labelKey: "common.nav.memory", icon: BrainCircuit },
      { href: "/secretary", labelKey: "common.nav.secretary", icon: HeartHandshake },
      { href: "/billing", labelKey: "common.nav.billing", icon: CreditCard },
      { href: "/account", labelKey: "common.nav.account", icon: UserRound },
    ],
  },
  {
    labelKey: "common.nav.groups.tools",
    collapsible: true,
    items: [
      { href: "/options", labelKey: "common.nav.options", icon: Gauge },
      { href: "/backtest", labelKey: "common.nav.backtest", icon: FlaskConical },
      { href: "/gateway", labelKey: "common.nav.gateway", icon: Network },
      { href: "/api", labelKey: "common.nav.apiDocs", icon: Code2 },
      { href: "/docs", labelKey: "common.nav.docs", icon: LifeBuoy },
      { href: "/mobile-access", labelKey: "common.nav.mobileAccess", icon: Smartphone },
      { href: "/account#imessage-bind", labelKey: "common.nav.imessage", icon: MessageCircle },
    ],
  },
];

function isCurrentPath(pathname: string, href: string) {
  if (href.includes("#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationGroups({ locale, pathname, onNavigate }: { locale: Locale; pathname: string; onNavigate?: () => void }) {
  return <>{groups.map(group => {
    const items = <div className="space-y-0.5">{group.items.map(item => {
      const Icon = item.icon;
      const active = isCurrentPath(pathname, item.href);
      return <Link key={item.href} href={withLocale(locale, item.href)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-active" : ""}`}>
        <Icon className="nav-icon" aria-hidden />{t(locale, item.labelKey)}
      </Link>;
    })}</div>;
    return group.collapsible ? <details key={group.labelKey} className="group" open={group.items.some(item => isCurrentPath(pathname, item.href))}>
      <summary className="mb-1 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-3 text-[11px] font-medium text-text-pg-dim hover:bg-bg-panel-muted hover:text-text-pg [&::-webkit-details-marker]:hidden">
        {t(locale, group.labelKey)}<ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>{items}
    </details> : <div key={group.labelKey}>
      <div className="mb-2 px-3 text-[11px] font-medium text-text-pg-dim">{t(locale, group.labelKey)}</div>{items}
    </div>;
  })}</>;
}

function currentPageLabel(pathname: string, locale: Locale) {
  if (pathname === "/") return locale === "zh" ? "首页" : "Home";
  const item = groups.flatMap(group => group.items).find(item => isCurrentPath(pathname, item.href));
  if (item) return t(locale, item.labelKey);
  if (pathname.startsWith("/onboarding")) return locale === "zh" ? "首次设置" : "Setup";
  if (pathname.startsWith("/admin")) return locale === "zh" ? "管理" : "Administration";
  return locale === "zh" ? "工作区" : "Workspace";
}

function AuthExpiredRedirector({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    const handler = () => {
      const returnTo = stripLocale(pathname || "/");
      router.replace(withLocale(locale, `/login?returnTo=${encodeURIComponent(returnTo)}`));
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, [locale, pathname, router]);
  return null;
}

/**
 * Nav items registered by Cordis plugins (currently the LIVE trading
 * console). Disabled items are honest placeholders — a plugin may advertise
 * a surface the server has not enabled, and that must read as "not enabled",
 * never as a fake working entry.
 */
function PluginNavSection({ locale, onNavigate }: { locale: Locale; onNavigate?: () => void }) {
  const items = usePluginNavItems();
  const pathname = usePathname();
  if (!items.length) return null;
  const activePathname = stripLocale(pathname);
  return (
    <div>
      <div className="mb-2 px-3 text-[11px] font-medium text-text-pg-dim">{t(locale, "common.nav.groups.trading")}</div>
      <div className="space-y-1">
        {items.map((item) => {
          const label = item.labelKey ? t(locale, item.labelKey) : item.label;
          const active = activePathname.startsWith(item.href);
          if (item.disabled) {
            return (
              <span key={item.href} aria-disabled="true" title={label} className="flex cursor-not-allowed items-center gap-2 border border-transparent px-3 py-2 text-sm text-text-pg-dim opacity-70">
                {label}
              </span>
            );
          }
          return (
            <Link key={item.href} href={withLocale(locale, item.href)} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`nav-item ${active ? "nav-active" : ""}`}>
              {label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

const subscribeToRenderPhase = () => () => {};
const clientRenderPhase = () => true;
const serverRenderPhase = () => false;

function MainContentFallback({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(subscribeToRenderPhase, clientRenderPhase, serverRenderPhase);
  // Preserve real, visible content in static documents. During client retries,
  // the fallback must work without the still-pending page module.
  return client ? <WorkspaceLoading /> : children;
}

export function AppShell({ children, locale }: { children: ReactNode; locale: Locale }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const pathname = usePathname();
  const closeNavigation = useCallback(() => setMobileNavOpen(false), []);
  const closeCommands = useCallback(() => setCommandOpen(false), []);
  const openCommands = useCallback(() => { setMobileNavOpen(false); setCommandOpen(true); }, []);
  const destinations = useMemo<WorkspaceDestination[]>(() => groups.flatMap(group => group.items.map(item => ({
    href: item.href,
    label: t(locale, item.labelKey),
    group: t(locale, group.labelKey),
    keywords: `${t("en", item.labelKey)} ${t("zh", item.labelKey)} ${item.keywords || ""}`,
    icon: item.icon,
  }))), [locale]);
  useEffect(() => { document.documentElement.lang = locale === "zh" ? "zh-CN" : "en"; }, [locale]);
  useEffect(() => { setMobileNavOpen(false); }, [pathname, locale]);
  useEffect(() => {
    applySurfaceTier(surfaceTierForPath(pathname || "/"));
    return () => applySurfaceTier(null);
  }, [pathname]);
  return (
    <LocaleProvider locale={locale}>
      <PluginRuntime>
        <div className="relative min-h-screen">
          <a href="#main-content" className="skip-navigation">{locale === "zh" ? "跳至主要内容" : "Skip to main content"}</a>
          <Chronosphere />
          <AuthExpiredRedirector locale={locale} />
          <SidebarNav locale={locale} />
          <MobileNavDrawer locale={locale} open={mobileNavOpen} onClose={closeNavigation} onSearch={openCommands} />
          <WorkspaceCommandMenu locale={locale} open={commandOpen} destinations={destinations} onRequestOpen={openCommands} onClose={closeCommands} />
          <div className="lg:pl-[calc(var(--pg-rail-width)+24px)]">
            <TopStatusBar locale={locale} mobileNavOpen={mobileNavOpen} commandOpen={commandOpen} onMenuClick={() => setMobileNavOpen(true)} onSearch={openCommands} />
            <main id="main-content" tabIndex={-1} className="shell-main mx-auto w-full max-w-[1440px]">
              {/* Isolate pending page modules from shared navigation. Keep the
                  landmark outside the boundary: Fizz may outline even completed
                  large content into a hidden streamed segment. */}
              <Suspense fallback={<MainContentFallback>{children}</MainContentFallback>}>
                {children}
              </Suspense>
            </main>
          </div>
        </div>
      </PluginRuntime>
    </LocaleProvider>
  );
}

export function MobileNavDrawer({ locale, open, onClose, onSearch }: { locale: Locale; open: boolean; onClose: () => void; onSearch: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const activePathname = stripLocale(pathname);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    // Native modality makes the background inert, contains keyboard focus,
    // and restores the opening control when the dialog closes.
    if (!dialog.open) dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      if (dialog.open) dialog.close();
    };
  }, [open]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const dismissOnDesktop = () => { if (desktop.matches && open) onClose(); };
    dismissOnDesktop();
    desktop.addEventListener("change", dismissOnDesktop);
    return () => desktop.removeEventListener("change", dismissOnDesktop);
  }, [open, onClose]);
  return (
    <dialog ref={dialogRef} id="mobile-navigation" aria-label={locale === "zh" ? "主导航" : "Primary navigation"} className="mobile-nav-dialog" onCancel={onClose} onClose={onClose} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <Link href={withLocale(locale, "/")} onClick={onClose} className="flex min-w-0 items-center gap-2.5 font-semibold text-text-pg">
          <Image src="/logo.png" alt="" width={24} height={24} />PureGamma AI
        </Link>
        <button type="button" autoFocus onClick={onClose} aria-label={locale === "zh" ? "关闭导航" : "Close navigation"} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-pg-muted hover:bg-bg-panel-muted hover:text-text-pg"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      <button type="button" onClick={onSearch} className="mt-4 flex min-h-11 shrink-0 items-center gap-3 rounded-lg border border-border-pg bg-bg-panel-muted px-3 text-left text-sm text-text-pg-muted">
        <Search className="h-4 w-4" aria-hidden />{locale === "zh" ? "查找页面" : "Search pages"}
      </button>
      <nav className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto" aria-label={locale === "zh" ? "主导航" : "Primary navigation"}>
        <NavigationGroups locale={locale} pathname={activePathname} onNavigate={onClose} />
        <PluginNavSection locale={locale} onNavigate={onClose} />
      </nav>
      <div className="mt-3 shrink-0 border-t border-border-pg pt-3" data-testid="nav-secondary-controls">
        <span className="text-[11px] text-text-pg-dim">{locale === "zh" ? "语言与显示" : "Language & display"}</span>
        <div className="mt-2 flex flex-wrap items-center gap-2"><LanguageSwitcher compact /><AppearanceControls locale={locale} /></div>
      </div>
    </dialog>
  );
}

export function SidebarNav({ locale }: { locale: Locale }) {
  const pathname = stripLocale(usePathname());
  const navigationRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const navigation = navigationRef.current;
    if (!navigation) return;
    const revealCurrentPage = () => {
      if (!navigation.getClientRects().length) return;
      const current = navigation.querySelector<HTMLElement>('a[aria-current="page"]');
      if (!current) return;
      const viewport = navigation.getBoundingClientRect();
      const item = current.getBoundingClientRect();
      if (!viewport.height || !item.height) return;
      const inset = 4;
      // Scroll only this rail region; revealing the current page must not move
      // the document, main content, or keyboard focus.
      if (item.top < viewport.top + inset) navigation.scrollTop += item.top - viewport.top - inset;
      else if (item.bottom > viewport.bottom - inset) navigation.scrollTop += item.bottom - viewport.bottom + inset;
    };
    revealCurrentPage();
    const observer = new ResizeObserver(revealCurrentPage);
    observer.observe(navigation);
    return () => observer.disconnect();
  }, [pathname, locale]);
  return (
    <aside className="shell-rail hidden flex-col px-3 py-5 lg:flex">
      <Link href={withLocale(locale, "/")} className="mx-3 flex min-h-9 items-center gap-2.5 font-semibold tracking-tight text-text-pg">
        <Image src="/logo.png" alt="" width={25} height={25} /><span className="text-[15px]">PureGamma <span className="font-normal text-text-pg-dim">AI</span></span>
      </Link>
      <div className="mx-3 mt-1 text-[11px] text-text-pg-dim">{locale === "zh" ? "研究工作区" : "Research workspace"}</div>
      <nav ref={navigationRef} className="shell-nav mt-7 min-h-0 flex-1 space-y-5 overflow-y-auto" aria-label={locale === "zh" ? "主导航" : "Primary navigation"}>
        <NavigationGroups locale={locale} pathname={pathname} />
        <PluginNavSection locale={locale} />
      </nav>
      <div className="mt-4 shrink-0 border-t border-border-pg px-2 pt-3">
        <div className="mb-2 text-[11px] text-text-pg-dim">{locale === "zh" ? "语言与字号" : "Language & text size"}</div>
        <div className="flex flex-wrap items-center justify-between gap-1"><LanguageSwitcher compact /><AppearanceControls locale={locale} showThemeAndStyle={false} /></div>
      </div>
    </aside>
  );
}

function financialFields(user: StoredUser): StoredUser {
  const update: StoredUser = {};
  if (typeof user.credit_balance === "number" && Number.isFinite(user.credit_balance) && user.credit_balance >= 0) update.credit_balance = user.credit_balance;
  if (typeof user.plan === "string" && user.plan.trim()) update.plan = user.plan;
  return update;
}

function useAccountView() {
  const [account, setAccount] = useState<AccountView>({ state: "loading", user: null });
  useEffect(() => {
    let active = true;
    let signedOut = false;
    let confirmed: StoredUser | null = null;
    let pendingFinancial: StoredUser = {};
    let inFlight: AbortController | null = null;
    const refresh = async () => {
      if (!active || inFlight) return;
      const controller = new AbortController();
      inFlight = controller;
      try {
        const result = await getMe(controller.signal);
        if (!active || controller.signal.aborted) return;
        if (!result.user || typeof result.user.id !== "string" || !result.user.id.trim()) {
          if (!confirmed) setAccount({ state: "unavailable", user: null });
          return;
        }
        confirmed = { ...result.user, ...pendingFinancial };
        pendingFinancial = {};
        signedOut = false;
        setAccount({ state: "known", user: confirmed });
      } catch (error) {
        if (!active || controller.signal.aborted) return;
        if ((error as { status?: number } | null)?.status === 401) {
          signedOut = true;
          confirmed = null;
          pendingFinancial = {};
          setAccount({ state: "signed-out", user: null });
        } else if (!confirmed) setAccount({ state: "unavailable", user: null });
      } finally {
        if (inFlight === controller) inFlight = null;
      }
    };
    const handleUserState = (event: Event) => {
      const detail = (event as CustomEvent<StoredUser>).detail;
      if (!active || !detail || typeof detail !== "object" || Array.isArray(detail)) return;
      const update = getUserStateUpdate(event) || financialFields(detail);
      if (!isIdentityUserStateEvent(event)) {
        // Detail may contain a cached identity merged by publishUserState.
        // Only the original financial delta belongs to a partial update.
        if (signedOut) return;
        const financial = financialFields(update);
        if (!Object.keys(financial).length) return;
        if (!confirmed) {
          pendingFinancial = { ...pendingFinancial, ...financial };
          return;
        }
        inFlight?.abort();
        confirmed = { ...confirmed, ...financial };
        setAccount({ state: "known", user: confirmed });
        return;
      }
      inFlight?.abort();
      const sameUser = !confirmed?.id || confirmed.id === update.id;
      confirmed = sameUser ? { ...update, ...pendingFinancial } : { ...update };
      pendingFinancial = {};
      signedOut = false;
      setAccount({ state: "known", user: confirmed });
    };
    const handleVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener(USER_STATE_EVENT, handleUserState);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    const timer = window.setInterval(refresh, 60_000);
    void refresh();
    return () => {
      active = false;
      inFlight?.abort();
      window.clearInterval(timer);
      window.removeEventListener(USER_STATE_EVENT, handleUserState);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
  return account;
}

export function TopStatusBar({ locale, onMenuClick, onSearch, mobileNavOpen = false, commandOpen = false }: { locale: Locale; onMenuClick: () => void; onSearch: () => void; mobileNavOpen?: boolean; commandOpen?: boolean }) {
  const account = useAccountView();
  const pathname = stripLocale(usePathname() || "/");
  const zh = locale === "zh";
  const user = account.user;
  const credits = user?.credit_balance;
  const knownCredits = typeof credits === "number" && Number.isFinite(credits) && credits >= 0;
  const name = user?.name || user?.email || (zh ? "账户" : "Account");
  return (
    <header className="shell-chrome">
      <div className="flex min-h-[var(--pg-header-height)] w-full items-center justify-between gap-3 px-4 lg:px-6">
        <button type="button" onClick={onMenuClick} aria-expanded={mobileNavOpen} aria-controls="mobile-navigation" aria-haspopup="dialog" aria-label={zh ? "打开导航" : "Open navigation"} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-text-pg-muted hover:bg-bg-panel-muted lg:hidden" data-testid="nav-menu-button"><Menu className="h-[18px] w-[18px]" aria-hidden /></button>
        <Link href={withLocale(locale, "/")} className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[15px] font-semibold text-text-pg lg:hidden" data-testid="nav-brand">
          <Image src="/logo.png" alt="" width={20} height={20} /><span>PureGamma AI</span><span className="sr-only">{zh ? "，返回首页" : ", back to home"}</span>
        </Link>
        <nav className="hidden min-w-0 items-center gap-2 text-[13px] lg:flex" aria-label={zh ? "当前位置" : "Breadcrumb"}>
          <span className="shrink-0 text-text-pg-dim">{zh ? "工作区" : "Workspace"}</span><ChevronRight className="h-3 w-3 shrink-0 text-text-pg-dim" aria-hidden /><span className="truncate font-medium text-text-pg" aria-current="page">{currentPageLabel(pathname, locale)}</span>
        </nav>
        <div className="flex min-w-0 shrink-0 items-center gap-2 lg:ml-auto lg:gap-3">
          <button type="button" onClick={onSearch} data-testid="workspace-search-trigger" aria-haspopup="dialog" aria-controls="workspace-page-search" aria-expanded={commandOpen} aria-label={zh ? "查找页面" : "Search pages"} className="flex h-11 w-11 shrink-0 items-center justify-center gap-2.5 rounded-lg text-text-pg-muted hover:bg-bg-panel-muted hover:text-text-pg lg:w-auto lg:justify-start lg:border lg:border-border-pg lg:px-3">
            <Search className="h-[17px] w-[17px]" aria-hidden /><span className="hidden text-xs lg:inline">{zh ? "查找页面" : "Search pages"}</span><kbd className="ml-2 hidden rounded border border-border-pg px-1.5 py-0.5 font-sans text-[10px] text-text-pg-dim xl:inline">⌘ / Ctrl K</kbd>
          </button>
          <div className="hidden items-center border-l border-border-pg pl-2 lg:flex"><AppearanceControls locale={locale} showFontScale={false} /></div>
          <div className="hidden min-w-[112px] items-center justify-end gap-2 border-l border-border-pg pl-3 lg:flex" aria-label={zh ? "账户状态" : "Account status"} aria-busy={account.state === "loading"} data-testid="account-summary" data-account-state={account.state}>
            {account.state === "loading" ? <span role="status" className="text-xs text-text-pg-dim">{zh ? "正在读取账户…" : "Loading account…"}</span> : user ? <>
              <div className="hidden text-right xl:block">
                {typeof user.plan === "string" && user.plan.trim() ? <div className="text-[11px] font-medium text-text-pg">{user.plan}</div> : <div className="text-[11px] text-text-pg-dim">{zh ? "方案暂不可用" : "Plan unavailable"}</div>}
                <div className="mt-0.5 text-[11px] tabular-nums text-text-pg-muted" data-testid="account-credits">{knownCredits ? `${credits.toLocaleString(zh ? "zh-CN" : "en-US")} ${zh ? "积分" : "credits"}` : t(locale, "common.topbar.credits")}</div>
              </div>
              <Link href={withLocale(locale, "/account")} aria-label={zh ? `打开账户：${name}` : `Open account: ${name}`} title={name} className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-border-pg bg-bg-panel-muted text-xs font-semibold text-text-pg hover:border-border-pg-strong">
                {user.avatar_url ? <Image src={user.avatar_url} alt="" width={36} height={36} unoptimized className="h-full w-full object-cover" /> : <span aria-hidden>{Array.from(name.trim())[0]?.toLocaleUpperCase() || <UserRound className="h-4 w-4" />}</span>}
              </Link>
            </> : account.state === "signed-out" ? <>
              <Link href={withLocale(locale, "/login")} className="grid min-h-11 place-items-center whitespace-nowrap rounded-lg px-3 text-xs font-medium text-text-pg-muted hover:bg-bg-panel-muted">{t(locale, "common.nav.signin")}</Link>
              <Link href={withLocale(locale, "/signup")} className="pg-button min-h-11 whitespace-nowrap px-3 text-xs">{t(locale, "common.nav.signup")}</Link>
            </> : <Link href={withLocale(locale, "/account")} className="text-xs text-text-pg-muted">{zh ? "账户暂不可用" : "Account unavailable"}</Link>}
          </div>
        </div>
      </div>
    </header>
  );
}
