/** A browser navigation target must remain a local path after URL parsing. */
export function safeReturnTo(value: string | null | undefined, fallback: string): string {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}
