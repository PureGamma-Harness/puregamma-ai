const ASSETS = new Set(["BTC", "ETH", "SOL", "HYPE", "MSTR", "STRC"]);
const STYLES = new Set(["risk-controlled", "momentum", "macro-sensitive", "event-driven", "high-beta"]);

type Draft = { assets: string[]; style: string };
let current: Draft = { assets: ["BTC", "ETH", "SOL"], style: "risk-controlled" };
const memoryOnly = new Set<keyof Draft>();

/** Only research choices are persisted, never auth or notification recipients. */
export function readOnboardingDraft(): Draft {
  try {
    const raw = window.localStorage.getItem("pg_onboarding_assets");
    if (raw && !memoryOnly.has("assets")) {
      const values: unknown = JSON.parse(raw);
      if (Array.isArray(values) && values.every((value) => typeof value === "string" && ASSETS.has(value))) {
        current = { ...current, assets: Array.from(new Set(values)) };
      }
    }
  } catch { /* The current tab remains usable when storage is blocked or corrupt. */ }
  try {
    const style = window.localStorage.getItem("pg_onboarding_style");
    if (style && !memoryOnly.has("style") && STYLES.has(style)) current = { ...current, style };
  } catch { /* Each independent choice can recover without the other one. */ }
  return { assets: [...current.assets], style: current.style };
}

export function saveOnboardingDraft(patch: Partial<Draft>): boolean {
  current = { ...current, ...patch, assets: [...(patch.assets ?? current.assets)] };
  let saved = true;
  for (const key of ["assets", "style"] as const) {
    if (patch[key] === undefined) continue;
    try {
      window.localStorage.setItem(`pg_onboarding_${key}`, key === "assets" ? JSON.stringify(current.assets) : current.style);
      memoryOnly.delete(key);
    } catch { memoryOnly.add(key); saved = false; }
  }
  return saved;
}
