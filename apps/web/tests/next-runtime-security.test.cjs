const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

// NEXT_RUNTIME_DIR also verifies the traced standalone artifact after a build.
const root = path.resolve(process.env.NEXT_RUNTIME_DIR || path.join(__dirname, ".."));
const runtime = createRequire(path.join(root, "package.json"));
const nextPath = runtime.resolve("next/package.json");
const next = createRequire(nextPath);
const optimizer = next("./dist/server/image-optimizer.js");

test("the actual Next runtime and native optimizer use patched local dependencies", () => {
  for (const file of [nextPath, next.resolve("sharp")]) {
    assert.ok(fs.realpathSync(file).startsWith(`${fs.realpathSync(root)}${path.sep}`), `dependency escaped runtime directory: ${file}`);
  }
  const [major, minor, patch] = runtime("next/package.json").version.split(".").map(Number);
  assert.ok(major === 15 && minor === 5 && patch >= 28, "review the security floor before changing the Next release line");
  const sharp = optimizer.getSharp(1);
  const [sharpMajor, sharpMinor, sharpPatch] = sharp.versions.sharp.split(".").map(Number);
  assert.ok(sharpMajor > 0 || sharpMinor > 35 || (sharpMinor === 35 && sharpPatch >= 5));
  assert.equal(optimizer.isAvifDecodeSafe(sharp.versions.heif), true);
});

test("AVIF decoding fails closed for unknown or vulnerable libheif versions", () => {
  for (const version of [null, "unknown", "1.22.9", "1.23.1"]) {
    assert.equal(optimizer.isAvifDecodeSafe(version), false);
  }
  assert.equal(optimizer.isAvifDecodeSafe("1.23.2"), true);
});

const config = { images: { dangerouslyAllowSVG: false, minimumCacheTTL: 60 }, experimental: {} };
const params = { href: "/fixture.png", width: 8, quality: 75, mimeType: "image/webp" };

test("normal local PNG optimization still works with the patched native library", async () => {
  const sharp = optimizer.getSharp(1);
  const buffer = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#ffffff" } }).png().toBuffer();
  const result = await optimizer.imageOptimizer({ buffer, contentType: "image/png", cacheControl: null, etag: "fixture" }, params, config, { silent: true });
  assert.equal(result.error, undefined);
  assert.equal(result.contentType, "image/webp");
  assert.equal((await sharp(result.buffer).metadata()).width, 8);
});

test("SVG input remains rejected with the application's default configuration", async () => {
  const buffer = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1"/></svg>');
  await assert.rejects(
    optimizer.imageOptimizer({ buffer, contentType: "image/svg+xml", cacheControl: null, etag: "fixture-svg" }, { ...params, href: "/fixture.svg" }, config, { silent: true }),
    (error) => error.statusCode === 400 && /image type is not allowed/.test(error.message),
  );
});
