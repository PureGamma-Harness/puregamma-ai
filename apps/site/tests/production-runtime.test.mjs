import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

const projectRequire = createRequire(process.env.SITE_RUNTIME_DIR
  ? resolve(process.env.SITE_RUNTIME_DIR, "package.json")
  : new URL("../package.json", import.meta.url));

test("Next retains usable Sharp image processing after production-only installation", async () => {
  const nextRequire = createRequire(projectRequire.resolve("next/package.json"));
  const sharp = nextRequire("sharp");
  const png = await sharp({
    create: { width: 2, height: 3, channels: 4, background: "#123456" },
  }).png().toBuffer();
  const metadata = await sharp(png).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 2);
  assert.equal(metadata.height, 3);
  assert.ok(sharp.versions.vips);
});
