const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { test } = require("node:test");

async function withGuard(fetchImplementation, run) {
  const originalFetch = globalThis.fetch;
  const guardPath = require.resolve("./offline-fetch-guard.cjs");
  globalThis.fetch = fetchImplementation;
  delete require.cache[guardPath];
  require(guardPath);
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    delete require.cache[guardPath];
  }
}

test("offline fetch permits exact loopback hosts and blocks external reads before transport", async () => {
  const calls = [];
  await withGuard(async (input, init) => {
    calls.push({ input, init });
    return new Response("offline");
  }, async () => {
    for (const url of ["https://provider.example.invalid/api", "http://api.localhost:1234/api", "http://localhost.example.invalid/api", "http://127.0.0.1.example.invalid/api", "file:///tmp/api"]) {
      await assert.rejects(fetch(url), /Offline smoke blocked external fetch/);
    }
    assert.equal(calls.length, 0);
    for (const url of ["http://127.0.0.1:1234/api", "http://localhost:1234/api", "http://[::1]:1234/api"]) {
      await fetch(new Request(url), { redirect: "follow", headers: { Cookie: "pg_session=smoke-only" } });
    }
    assert.equal(calls.length, 3);
    for (const { init } of calls) {
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Cookie, "pg_session=smoke-only");
    }
  });
});

test("offline native fetch rejects redirects without sending the redirected request", async () => {
  let redirectedRequests = 0;
  const server = createServer((request, response) => {
    if (request.url === "/redirect") {
      response.writeHead(302, { Location: "/destination" });
    } else {
      if (request.url === "/destination") redirectedRequests += 1;
      response.writeHead(200);
    }
    response.end("offline");
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    await withGuard(globalThis.fetch, async () => {
      assert.equal((await fetch(`${origin}/direct`)).status, 200);
      await assert.rejects(fetch(`${origin}/redirect`, { redirect: "follow" }));
      assert.equal(redirectedRequests, 0);
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
