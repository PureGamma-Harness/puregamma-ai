const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");

// Resolve through the packages that consume these dependencies. A patched
// top-level PostCSS installation does not replace Next's pinned copy.
const projectRoot = fs.realpathSync(path.join(__dirname, ".."));
const nextConsumer = createRequire(require.resolve("next/package.json"));
const postcssConsumer = createRequire(nextConsumer.resolve("postcss"));
const cordisConsumer = createRequire(require.resolve("cordis/package.json"));
const loaderConsumer = createRequire(cordisConsumer.resolve("@cordisjs/loader/package.json"));

function assertPatchedLocalDependency(consumer, name, minimum) {
  for (const file of [consumer.resolve(name), consumer.resolve(`${name}/package.json`)]) {
    assert.ok(
      fs.realpathSync(file).startsWith(`${projectRoot}${path.sep}`),
      `${name} resolved outside this installation: ${file}`,
    );
  }
  const version = consumer(`${name}/package.json`).version;
  assert.match(version, /^\d+\.\d+\.\d+$/, `${name} must use a stable release`);
  const actual = version.split(".").map(Number);
  const difference = actual.findIndex((value, index) => value !== minimum[index]);
  assert.ok(
    difference === -1 || actual[difference] > minimum[difference],
    `${name} ${version} is below the patched minimum ${minimum.join(".")}`,
  );
}

test("Next and Cordis loader resolve patched dependencies from this installation", () => {
  assertPatchedLocalDependency(nextConsumer, "postcss", [8, 5, 23]);
  assertPatchedLocalDependency(postcssConsumer, "source-map-js", [1, 2, 2]);
  assertPatchedLocalDependency(loaderConsumer, "js-yaml", [4, 3, 2]);
});

test("Next's PostCSS consumer transforms CSS and preserves usable source maps", async () => {
  const postcss = nextConsumer("postcss");
  const { SourceMapConsumer, SourceMapGenerator } = postcssConsumer("source-map-js");
  const css = ".sample {\n  display: flex;\n  color: #112233;\n}\n";
  const result = await postcss([{
    postcssPlugin: "dependency-compat-fixture",
    Declaration(declaration) {
      if (declaration.prop === "color") declaration.value = "#445566";
    },
  }]).process(css, {
    from: path.join(projectRoot, "fixture-input.css"),
    to: path.join(projectRoot, "fixture-output.css"),
    map: { inline: false, annotation: false, sourcesContent: true },
  });

  assert.match(result.css, /display: flex;/);
  assert.match(result.css, /color: #445566;/);
  assert.equal(result.warnings().length, 0);
  assert.ok(result.map);
  const map = result.map.toJSON();
  assert.equal(map.version, 3);
  assert.deepEqual(map.sourcesContent, [css]);
  const consumer = new SourceMapConsumer(map);
  const original = consumer.originalPositionFor({ line: 3, column: 2 });
  assert.equal(original.source, "fixture-input.css");
  assert.equal(original.line, 3);
  const roundTrip = SourceMapGenerator.fromSourceMap(consumer).toJSON();
  assert.deepEqual(roundTrip.sourcesContent, [css]);
});

test("Cordis loader's YAML consumer retains ordinary configuration semantics", () => {
  const yaml = loaderConsumer("js-yaml");
  const source = [
    "defaults: &defaults",
    "  enabled: true",
    "  retries: 2",
    "plugins:",
    "  - <<: *defaults",
    "    name: research",
    "    assets: [BTC, ETH]",
    "    description: |",
    "      Research configuration.",
    "      No external services are called.",
    "",
  ].join("\n");
  const parsed = yaml.load(source);
  assert.deepEqual(parsed, {
    defaults: { enabled: true, retries: 2 },
    plugins: [{
      enabled: true,
      retries: 2,
      name: "research",
      assets: ["BTC", "ETH"],
      description: "Research configuration.\nNo external services are called.\n",
    }],
  });
  assert.deepEqual(yaml.load(yaml.dump(parsed)), parsed);
});
