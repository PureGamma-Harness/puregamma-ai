const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const webRoot = path.resolve(__dirname, "..");
const compiledModules = new Map();

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// Load the actual API, state producer, routing, and translation modules. Only
// browser storage/events and the transport are substitutes; no session or
// request implementation is reproduced in this test.
function browserRuntime(fetchResponse, initialUser) {
  const values = new Map(initialUser ? [["pg_user", JSON.stringify(initialUser)]] : []);
  const events = [];
  const requests = [];
  const window = new EventTarget();
  window.location = {
    pathname: "/en/chat",
    origin: "https://puregamma.invalid",
    href: "https://puregamma.invalid/en/chat",
  };
  window.localStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  for (const name of ["puregamma:user-state", "pg:auth-expired"]) {
    window.addEventListener(name, (event) => events.push(event));
  }
  const context = vm.createContext({
    window, Event, CustomEvent, AbortController, URL,
    process: { env: { NEXT_PUBLIC_API_URL: "https://api.puregamma.invalid" } },
    fetch(url, options) {
      requests.push({ url, options });
      return fetchResponse(url, options);
    },
  });
  const modules = new Map();
  function load(relative) {
    const filename = path.join(webRoot, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    if (filename.endsWith(".json")) return JSON.parse(fs.readFileSync(filename, "utf8"));
    let code = compiledModules.get(filename);
    if (!code) {
      code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      }).outputText;
      compiledModules.set(filename, code);
    }
    const module = { exports: {} };
    modules.set(filename, module);
    const execute = vm.runInContext(`(function(require, module, exports) {\n${code}\n})`, context, { filename });
    execute((specifier) => {
      assert.ok(specifier.startsWith("@/"), `Unexpected browser dependency: ${specifier}`);
      const relativeImport = specifier.slice(2);
      return load(relativeImport.endsWith(".json") ? relativeImport : `${relativeImport}.ts`);
    }, module, module.exports);
    return module.exports;
  }
  return {
    api: load("lib/api.ts"),
    state: load("lib/user-state.ts"),
    window, events, requests,
    storedUser: () => JSON.parse(values.get("pg_user") || "null"),
    userEvents: () => events.filter((event) => event.type === "puregamma:user-state"),
    authEvents: () => events.filter((event) => event.type === "pg:auth-expired"),
  };
}

function okResponse(payload) {
  return { ok: true, status: 200, json: async () => payload };
}

const confirmedUser = { id: "owner-current", email: "current@example.invalid", plan: "pro", credit_balance: 500 };

test("a partial balance keeps compatibility fields without authenticating cached identity", () => {
  const runtime = browserRuntime(() => { throw new Error("No transport expected"); }, confirmedUser);
  runtime.state.publishCreditBalance(425);
  const [event] = runtime.userEvents();
  assert.equal(event.detail.id, confirmedUser.id, "existing merged event consumers retain their shape");
  assert.equal(runtime.state.isIdentityUserStateEvent(event), false);
  assert.equal(JSON.stringify(runtime.state.getUserStateUpdate(event)), '{"credit_balance":425}');
  assert.deepEqual(runtime.storedUser(), { ...confirmedUser, credit_balance: 425 });

  const forgedDetail = new CustomEvent(runtime.state.USER_STATE_EVENT, { detail: confirmedUser });
  assert.equal(runtime.state.isIdentityUserStateEvent(forgedDetail), false);
  assert.equal(runtime.state.getUserStateUpdate(forgedDetail), null);
});

test("only a full identity producer confirms identity, while replacement clears stale fields", () => {
  const runtime = browserRuntime(() => { throw new Error("No transport expected"); }, confirmedUser);
  const nextUser = { id: "owner-next", email: "next@example.invalid" };
  runtime.state.syncUserStateFromPayload({ user: nextUser });
  const [event] = runtime.userEvents();
  assert.equal(runtime.state.isIdentityUserStateEvent(event), true);
  assert.equal(JSON.stringify(runtime.state.getUserStateUpdate(event)), JSON.stringify(nextUser));
  assert.deepEqual(runtime.storedUser(), nextUser);

  runtime.state.publishUserState({ id: " " }, true);
  assert.equal(runtime.state.isIdentityUserStateEvent(runtime.userEvents()[1]), false);
});

test("an active identity read forwards cancellation and publishes its actual user exactly once", async () => {
  const runtime = browserRuntime(async () => okResponse({ user: confirmedUser }));
  const controller = new AbortController();
  const result = await runtime.api.getMe(controller.signal);
  assert.deepEqual(result.user, confirmedUser);
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].url, "https://api.puregamma.invalid/me");
  assert.equal(runtime.requests[0].options.signal, controller.signal);
  assert.equal(runtime.requests[0].options.credentials, "include");
  assert.equal(runtime.requests[0].options.cache, "no-store");
  assert.equal(runtime.userEvents().length, 1);
  assert.equal(runtime.state.isIdentityUserStateEvent(runtime.userEvents()[0]), true);
  assert.deepEqual(runtime.storedUser(), confirmedUser);
});

for (const status of [401, 402]) {
  test(`cancel before late HTTP ${status} headers prevents auth and billing side effects`, async () => {
    const started = deferred();
    const headers = deferred();
    const runtime = browserRuntime(() => { started.resolve(); return headers.promise; }, confirmedUser);
    const controller = new AbortController();
    const pending = runtime.api.getMe(controller.signal);
    const outcome = pending.then(() => null, (error) => error);
    await started.promise;
    controller.abort();
    headers.resolve({ ok: false, status, text: async () => "Expired response" });
    const error = await outcome;
    assert.equal(runtime.authEvents().length, 0);
    assert.equal(runtime.window.location.href, "https://puregamma.invalid/en/chat");
    assert.equal(runtime.userEvents().length, 0);
    assert.deepEqual(runtime.storedUser(), confirmedUser);
    assert.equal(error?.name, "AbortError");
  });
}

test("cancel during late JSON cannot overwrite a newer confirmed settlement", async () => {
  const started = deferred();
  const body = deferred();
  const runtime = browserRuntime(async () => ({
    ok: true, status: 200,
    json() { started.resolve(); return body.promise; },
  }), confirmedUser);
  const controller = new AbortController();
  const pending = runtime.api.getMe(controller.signal);
  const outcome = pending.then(() => null, (error) => error);
  await started.promise;
  runtime.state.publishCreditBalance(425);
  controller.abort();
  body.resolve({ user: { ...confirmedUser, credit_balance: 500 } });
  const error = await outcome;
  assert.equal(runtime.userEvents().length, 1, "only the newer settlement should publish");
  assert.equal(runtime.userEvents()[0].detail.credit_balance, 425);
  assert.deepEqual(runtime.storedUser(), { ...confirmedUser, credit_balance: 425 });
  assert.equal(error?.name, "AbortError");
});

test("an uncancelled 401 still expires the protected session", async () => {
  const runtime = browserRuntime(async () => ({ ok: false, status: 401, text: async () => "Unauthorized" }), confirmedUser);
  await assert.rejects(runtime.api.getMe(), (error) => error.status === 401);
  assert.equal(runtime.authEvents().length, 1);
  assert.equal(runtime.userEvents().length, 0);
});

test("a transient identity failure preserves known client state without inventing a balance", async () => {
  const runtime = browserRuntime(async () => ({ ok: false, status: 503, text: async () => "Temporarily unavailable" }), confirmedUser);
  await assert.rejects(runtime.api.getMe(), (error) => error.status === 503);
  assert.equal(runtime.authEvents().length, 0);
  assert.equal(runtime.userEvents().length, 0);
  assert.deepEqual(runtime.storedUser(), confirmedUser);
});
