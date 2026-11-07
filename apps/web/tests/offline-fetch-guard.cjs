// Preloaded only by the standalone smoke server. A build with an accidental
// absolute production API URL must fail the test without contacting that API.
const networkFetch = globalThis.fetch;
const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);

globalThis.fetch = async function offlineFetch(input, init) {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (!loopback.has(url.hostname) || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(`Offline smoke blocked external fetch: ${url.origin}`);
  }
  // Native fetch follows redirects internally, bypassing this URL check. The
  // fixture never redirects, so reject every redirect before a second request.
  return networkFetch(input, { ...init, redirect: "error" });
};
