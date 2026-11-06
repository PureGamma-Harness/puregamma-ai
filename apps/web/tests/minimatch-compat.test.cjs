const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

// Resolve through the real consumers, not a separately installed test dependency.
const nextConfig = createRequire(require.resolve("eslint-config-next/package.json"));
const nextPlugin = createRequire(nextConfig.resolve("@next/eslint-plugin-next/package.json"));
const globConsumer = createRequire(nextPlugin.resolve("glob/package.json"));
const parserConsumer = createRequire(nextConfig.resolve("@typescript-eslint/parser/package.json"));
const estreeConsumer = createRequire(parserConsumer.resolve("@typescript-eslint/typescript-estree/package.json"));

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pg-minimatch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ["apps/web/page.tsx", "apps/admin/page.tsx", "apps/web/.hidden.tsx", "apps/api/main.py"]) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, "");
  }
  return root;
}

test("both affected dependency paths resolve patched minimatch", () => {
  for (const consumer of [globConsumer, estreeConsumer]) {
    const [major, minor, patch] = consumer("minimatch/package.json").version.split(".").map(Number);
    assert.ok(major > 11 || (major === 11 && (minor > 0 || patch >= 1)));
  }
  assert.ok(Number(nextPlugin("glob/package.json").version.split(".")[0]) >= 14);
});

test("legacy ESLint consumers retain the callable minimatch 3 API", () => {
  const eslintConsumer = createRequire(require.resolve("eslint/package.json"));
  const minimatch = eslintConsumer("minimatch");
  assert.equal(typeof minimatch, "function");
  assert.equal(minimatch("src/example.ts", "src/*.ts"), true);
  assert.equal(minimatch("src/example.js", "src/*.ts"), false);
});

test("glob still finds wildcard and brace matches, and respects ignores", (t) => {
  const cwd = fixture(t);
  const { globSync } = nextPlugin("glob");
  assert.deepEqual(globSync("apps/*/*.tsx", { cwd }).sort(), ["apps/admin/page.tsx", "apps/web/page.tsx"]);
  assert.deepEqual(globSync("apps/{admin,web}/**/*.tsx", { cwd, ignore: "apps/admin/**" }), ["apps/web/page.tsx"]);
  assert.deepEqual(globSync("apps/web/*.tsx", { cwd, dot: true }).sort(), ["apps/web/.hidden.tsx", "apps/web/page.tsx"]);
});

test("Next ESLint root-directory globs still discover projects", (t) => {
  const cwd = fixture(t);
  const { getRootDirs } = nextPlugin("./dist/utils/get-root-dirs.js");
  const roots = getRootDirs({ getCwd: () => cwd, settings: { next: { rootDir: `${cwd}/apps/{web,admin}` } } });
  assert.deepEqual(roots.map((p) => path.basename(p.replace(/\/$/, ""))).sort(), ["admin", "web"]);
});

test("TypeScript-ESLint project service still matches an allowed dotfile glob", (t) => {
  const cwd = fixture(t);
  const source = "export const value: number = 1;";
  fs.writeFileSync(path.join(cwd, "tsconfig.json"), JSON.stringify({ compilerOptions: { noEmit: true }, include: ["src/**/*.ts"] }));
  fs.mkdirSync(path.join(cwd, "src"));
  fs.writeFileSync(path.join(cwd, "src/index.ts"), source);
  const filePath = path.join(cwd, ".lint-config.ts");
  fs.writeFileSync(filePath, source);
  const parser = nextConfig("@typescript-eslint/parser");
  t.after(() => parser.clearCaches());
  const result = parser.parseForESLint(source, {
    filePath,
    tsconfigRootDir: cwd,
    projectService: { allowDefaultProject: [".lint-*.ts"] },
    loc: true,
    range: true,
  });
  assert.equal(result.ast.type, "Program");
  assert.ok(result.services.program);
});
