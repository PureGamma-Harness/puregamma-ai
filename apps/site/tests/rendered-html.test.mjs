import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function render(t) {
  process.env.WRANGLER_SEND_METRICS = "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/rendered-html-test.log";
  const { unstable_dev } = await import("wrangler");
  const worker = await unstable_dev(
    fileURLToPath(new URL("../dist/server/index.js", import.meta.url)),
    {
      config: fileURLToPath(new URL("../dist/server/wrangler.json", import.meta.url)),
      local: true,
      ip: "127.0.0.1",
      port: 0,
      inspectorPort: 0,
      persist: false,
      logLevel: "error",
      experimental: {
        disableExperimentalWarning: true,
        disableDevRegistry: true,
        enableContainers: false,
        forceLocal: true,
        testMode: true,
        watch: false,
      },
    },
  );
  t.after(() => worker.stop());
  return worker.fetch("/", { headers: { accept: "text/html" } });
}

test("server-renders the PureGamma commercial preview", async (t) => {
  const response = await render(t);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>PureGamma AI — 研究、组合与受控执行<\/title>/i);
  assert.match(html, /Research Agent/);
  assert.match(html, /Portfolio Intelligence/);
  assert.match(html, /EXECUTION<\/small><strong>PAPER/);
  assert.match(html, /申请首批访问/);
  assert.match(html, /非投资建议，不承诺收益/);
  assert.match(html, /mailto:hello@puregamma\.ai/);
  assert.doesNotMatch(html, /Codex is working|Your site is taking shape|react-loading-skeleton/i);
});

test("resolves relative schema references through the installed Ajv consumers", () => {
  const projectRequire = createRequire(import.meta.url);
  const rscRequire = createRequire(projectRequire.resolve("react-server-dom-webpack/package.json"));
  const webpackRequire = createRequire(rscRequire.resolve("webpack/package.json"));
  const schemaRequire = createRequire(webpackRequire.resolve("schema-utils/package.json"));
  const formatsRequire = createRequire(schemaRequire.resolve("ajv-formats/package.json"));

  for (const consumerRequire of [schemaRequire, formatsRequire]) {
    const Ajv = consumerRequire("ajv");
    const validator = new Ajv();
    validator.addSchema({
      $id: "https://schemas.example.test/definitions.json",
      definitions: { ticker: { type: "string", pattern: "^[A-Z]{1,5}$" } },
    });
    const validate = validator.compile({
      $id: "https://schemas.example.test/document.json",
      type: "object",
      properties: { ticker: { $ref: "./shared/../definitions.json#/definitions/ticker" } },
      required: ["ticker"],
      additionalProperties: false,
    });
    assert.equal(validate({ ticker: "PG" }), true);
    assert.equal(validate({ ticker: 123 }), false);
  }
});

test("keeps launch claims and metadata aligned with the current product", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Nautilus paper mode/);
  assert.match(page, /Stripe production keys", "PENDING/);
  assert.match(page, /实盘、转账与提现能力默认关闭/);
  assert.match(page, /非投资建议，不承诺收益/);
  assert.doesNotMatch(page, /guaranteed return|保证收益|codex-preview|SkeletonPreview/i);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /summary_large_image/);
  assert.match(packageJson, /"test": "npm run build && node --test tests\/rendered-html\.test\.mjs"/);
});
