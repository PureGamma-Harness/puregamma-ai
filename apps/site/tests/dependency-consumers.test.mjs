import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { deflateSync } from "node:zlib";
import React from "react";

const projectRequire = createRequire(import.meta.url);
const drizzleRequire = createRequire(projectRequire.resolve("drizzle-kit/api"));
const loaderRequire = createRequire(drizzleRequire.resolve("@esbuild-kit/esm-loader"));
const core = loaderRequire("@esbuild-kit/core-utils");

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "puregamma-site-consumer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("Drizzle's legacy loader still transforms TypeScript synchronously and asynchronously", async (t) => {
  const directory = await fixture(t);
  const source = "export const answer: number = 42;";
  for (const result of [
    core.transformSync(source, join(directory, "config.ts"), { format: "cjs" }),
    await core.transform(source, join(directory, "config.ts"), { format: "cjs" }),
  ]) {
    const loaded = { exports: {} };
    new Function("module", "exports", result.code)(loaded, loaded.exports);
    assert.equal(loaded.exports.answer, 42);
    assert.ok(result.map);
  }
  const entry = join(directory, "entry.mts");
  await writeFile(entry, `${source}\nconsole.log(answer);`);
  const child = spawnSync(process.execPath, ["--loader", drizzleRequire.resolve("@esbuild-kit/esm-loader"), entry], {
    encoding: "utf8", timeout: 10_000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stdout.trim(), "42");
});

test("Drizzle generates SQL from an isolated TypeScript schema and configuration", async (t) => {
  const directory = await fixture(t);
  const schema = join(directory, "schema.ts");
  const out = join(directory, "migrations");
  const config = join(directory, "drizzle.config.ts");
  await writeFile(schema, `import { sqliteTable, text } from ${JSON.stringify(projectRequire.resolve("drizzle-orm/sqlite-core"))};
export const research = sqliteTable("research", { id: text("id").primaryKey() });`);
  await writeFile(config, `export default ${JSON.stringify({ schema, out, dialect: "sqlite" })};`);
  const child = spawnSync(process.execPath, [join(dirname(projectRequire.resolve("drizzle-kit/api")), "bin.cjs"), "generate", "--config", config], {
    cwd: directory, encoding: "utf8", timeout: 15_000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  const files = (await readdir(out)).filter(name => name.endsWith(".sql"));
  assert.equal(files.length, 1);
  assert.match(await readFile(join(out, files[0]), "utf8"), /CREATE TABLE `research`/);
});

// Build WOFF from a font already shipped with Satori's pinned HarfBuzz package.
// Compressing its real tables exercises Satori's fflate-dependent WOFF path.
function asWoff(font) {
  const count = font.readUInt16BE(4);
  const tables = [];
  let offset = 44 + count * 20;
  let sfntSize = 12 + count * 16;
  let compressed = 0;
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const length = font.readUInt32BE(at + 12);
    const start = font.readUInt32BE(at + 8);
    const original = font.subarray(start, start + length);
    const packed = deflateSync(original);
    const data = packed.length < length ? packed : original;
    if (data === packed) compressed++;
    tables.push({ tag: font.readUInt32BE(at), checksum: font.readUInt32BE(at + 4), length, offset, data });
    offset += (data.length + 3) & ~3;
    sfntSize += (length + 3) & ~3;
  }
  const result = Buffer.alloc(offset);
  result.writeUInt32BE(0x774f4646, 0);
  result.writeUInt32BE(font.readUInt32BE(0), 4);
  result.writeUInt32BE(offset, 8);
  result.writeUInt16BE(count, 12);
  result.writeUInt32BE(sfntSize, 16);
  result.writeUInt16BE(1, 20);
  for (let i = 0; i < count; i++) {
    const table = tables[i];
    const at = 44 + i * 20;
    [table.tag, table.offset, table.data.length, table.length, table.checksum].forEach((value, j) => result.writeUInt32BE(value, at + j * 4));
    table.data.copy(result, table.offset);
  }
  assert.ok(compressed > 0);
  return result;
}

test("Satori renders compressed WOFF font tables through its installed fflate", async () => {
  const ogRequire = createRequire(projectRequire.resolve("@vercel/og"));
  const satori = ogRequire("satori").default;
  const satoriRequire = createRequire(ogRequire.resolve("satori"));
  const font = await readFile(join(dirname(satoriRequire.resolve("harfbuzzjs")), "test/fonts/noto/NotoSans-Regular.ttf"));
  const svg = await satori(React.createElement("div", { style: { display: "flex", fontFamily: "Noto", fontSize: 24 } }, "PureGamma"), {
    width: 320, height: 100,
    fonts: [{ name: "Noto", data: asWoff(font), weight: 400, style: "normal" }],
  });
  assert.match(svg, /^<svg\b/);
  assert.match(svg, /<path\b[^>]*d=/);
});

test("Next's TypeScript parser keeps allowed dotfile globs and rejects unrelated files", async (t) => {
  const directory = await fixture(t);
  const nextRequire = createRequire(projectRequire.resolve("eslint-config-next"));
  const typedRequire = createRequire(nextRequire.resolve("typescript-eslint"));
  const parser = typedRequire("@typescript-eslint/parser");
  t.after(() => parser.clearCaches());
  const source = "export const value: number = 1;";
  await writeFile(join(directory, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true }, include: ["src/**/*.ts"] }));
  const filePath = join(directory, ".lint-config.ts");
  await writeFile(filePath, source);
  const options = { filePath, tsconfigRootDir: directory, projectService: { allowDefaultProject: [".lint-*.ts"] } };
  const parsed = parser.parseForESLint(source, options);
  assert.equal(parsed.ast.type, "Program");
  assert.ok(parsed.services.program);
  const unrelated = join(directory, "unrelated.ts");
  await writeFile(unrelated, source);
  assert.throws(() => parser.parseForESLint(source, { ...options, filePath: unrelated }), /not found by the project service|not included in.*allowDefaultProject/i);
});
