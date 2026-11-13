import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const runtimeRoot = realpathSync(process.env.SITE_RUNTIME_DIR || fileURLToPath(new URL("../", import.meta.url)));
const modulesRoot = realpathSync(resolve(runtimeRoot, "node_modules"));
const projectRequire = createRequire(resolve(runtimeRoot, "package.json"));

function ownedPath(file, label) {
  assert.ok(realpathSync(file).startsWith(`${modulesRoot}${sep}`), `${label} must belong to the selected runtime: ${file}`);
  return file;
}

test("Next retains usable Sharp image processing after production-only installation", async () => {
  const nextRequire = createRequire(ownedPath(projectRequire.resolve("next/package.json"), "Next manifest"));
  ownedPath(nextRequire.resolve("next"), "Next entry");
  ownedPath(nextRequire.resolve("sharp"), "Sharp entry");
  const sharp = nextRequire("sharp");
  const bindings = Object.keys(nextRequire.cache).filter(file => /[/\\]sharp[^/\\]*\.node$/.test(file));
  assert.ok(bindings.length > 0, "Sharp must load its native image binding");
  for (const binding of bindings) ownedPath(binding, "Sharp native binding");
  const png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "#123456" },
  }).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 3);
  assert.ok(sharp.versions.vips);
});
