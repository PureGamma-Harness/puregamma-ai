import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const projectRequire = createRequire(import.meta.url);
const processors = ["next", "@tailwindcss/postcss", "vite"].map((name) => {
  const consumerRequire = createRequire(projectRequire.resolve(name));
  const postcssPath = consumerRequire.resolve("postcss");
  return { name, postcss: consumerRequire("postcss"), require: createRequire(postcssPath) };
});

function runBounded(script, ...modulePaths) {
  const child = spawnSync(process.execPath, ["--max-old-space-size=64", "-e", script, ...modulePaths], {
    encoding: "utf8",
    timeout: 2_000,
    maxBuffer: 16_384,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
}

for (const { name, postcss } of processors) {
  test(`${name} transforms CSS and bounds automatic source-map loading`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "puregamma-css-map-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const styles = join(directory, "styles");
    await mkdir(styles);
    const previousMap = {
      version: 3,
      file: "input.css",
      sources: ["original.css"],
      sourcesContent: [".source { color: purple }"],
      names: [],
      mappings: "AAAA",
    };
    const privateContent = "PRIVATE_SOURCE_MAP_CONTENT";
    await writeFile(join(styles, "input.css.map"), JSON.stringify(previousMap));
    await writeFile(join(directory, "private.map"), JSON.stringify({
      ...previousMap,
      sourcesContent: [privateContent],
    }));

    const transform = (annotation, from) => postcss([{
      postcssPlugin: "puregamma-color-transform",
      Declaration(declaration) {
        if (declaration.prop === "color") declaration.value = "rebeccapurple";
      },
    }]).process(`.source { color: purple }\n/*# sourceMappingURL=${annotation} */`, {
      from,
      to: join(styles, "output.css"),
      map: { inline: false, annotation: false },
    });

    const legitimate = await transform("input.css.map", join(styles, "input.css"));
    assert.match(legitimate.css, /color: rebeccapurple/);
    assert.ok(legitimate.map.toJSON().sourcesContent.includes(previousMap.sourcesContent[0]));

    // A CSS comment cannot choose a map outside its directory, or load any
    // filesystem map when there is no trusted input filename.
    for (const [annotation, from] of [
      ["../private.map", join(styles, "input.css")],
      [join(directory, "private.map"), undefined],
    ]) {
      const result = await transform(annotation, from);
      assert.match(result.css, /color: rebeccapurple/);
      assert.doesNotMatch(JSON.stringify(result.map.toJSON()), new RegExp(privateContent));
    }
  });
}

const mapConsumers = [
  ...processors,
  { name: "@tailwindcss/node", require: createRequire(projectRequire.resolve("@tailwindcss/node")) },
];

for (const consumer of mapConsumers) {
  test(`${consumer.name} reads ordinary maps and rejects amplifying indexed offsets`, () => {
    const { SourceMapConsumer, SourceMapGenerator } = consumer.require("source-map-js");
    const generator = new SourceMapGenerator({ file: "output.css" });
    generator.addMapping({
      generated: { line: 1, column: 0 },
      original: { line: 2, column: 3 },
      source: "original.css",
    });
    generator.setSourceContent("original.css", ".source { color: purple }");
    const ordinary = new SourceMapConsumer(generator.toJSON());
    assert.deepEqual(ordinary.originalPositionFor({ line: 1, column: 0 }), {
      source: "original.css", line: 2, column: 3, name: null,
    });
    assert.equal(SourceMapGenerator.fromSourceMap(ordinary).toJSON().sourcesContent[0],
      ".source { color: purple }");

    // Construct only the tiny input, without expanding its implied lines.
    // A subprocess bounds memory and time even against an old dependency.
    runBounded(`
      const assert = require("node:assert/strict");
      const { SourceMapConsumer } = require(process.argv[1]);
      const basic = { version: 3, sources: ["original.css"], names: [], mappings: "AAAA" };
      const indexed = (line, map) => ({
        version: 3, sections: [{ offset: { line, column: 0 }, map }],
      });
      assert.throws(() => new SourceMapConsumer(indexed(10_000_001, basic)),
        /offset line must not exceed/i);
      assert.throws(() => new SourceMapConsumer(indexed(6_000_000,
        indexed(6_000_000, basic))), /offset line must not exceed/i);
    `, consumer.require.resolve("source-map-js"));
  });
}

for (const consumer of processors) {
  test(`${consumer.name} ID generators handle non-positive sizes without looping`, () => {
    // A child process bounds both memory and execution time if an old
    // dependency reintroduces a synchronous infinite loop.
    runBounded(`
      const assert = require("node:assert/strict");
      const secure = require(process.argv[1]);
      const nonSecure = require(process.argv[2]);
      assert.match(secure.nanoid(), /^[A-Za-z0-9_-]{21}$/);
      assert.match(nonSecure.customAlphabet("abc", 8)(), /^[abc]{8}$/);
      assert.equal(nonSecure.nanoid(-1), "");
      assert.equal(nonSecure.customAlphabet("abc", -1)(), "");
      assert.equal(secure.customAlphabet("abc", 0)(), "");
      assert.equal(secure.customRandom("abc", 0, secure.random)(), "");
    `, consumer.require.resolve("nanoid"), consumer.require.resolve("nanoid/non-secure"));
  });
}

test("the production CSS keeps site layout rules and generated Tailwind utilities", async () => {
  const directory = new URL("../dist/client/_next/static/css/", import.meta.url);
  const files = (await readdir(directory)).filter((name) => name.endsWith(".css"));
  assert.ok(files.length > 0, "the build emitted no CSS assets");
  const css = (await Promise.all(files.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.doesNotMatch(css, /@import\s+["']tailwindcss["']/);
  const root = projectRequire("postcss").parse(css);
  const declarations = (selector) => {
    const result = new Map();
    root.walkRules((rule) => {
      if (rule.selectors.includes(selector)) {
        rule.walkDecls((declaration) => result.set(declaration.prop, declaration.value));
      }
    });
    return result;
  };
  assert.equal(declarations(".hero").get("display"), "grid");
  assert.ok(declarations(".hero").has("grid-template-columns"));
  assert.equal(declarations(".antialiased").get("-webkit-font-smoothing"), "antialiased");
  assert.equal(declarations(".button").get("display"), "inline-flex");
});
