const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const webRoot = path.resolve(__dirname, "..");

// Execute the actual TypeScript modules with a tiny browser storage/document
// boundary. The root layout's real JSX is traversed to obtain its pre-paint
// script; the test does not carry a second implementation of that script.
function loadModule(file, env, window, document) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(webRoot, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports, process: { env }, window, document, Event,
    require(name) {
      if (name.endsWith(".css")) return {};
      if (name === "next/script") return function Script() {};
      return require(name);
    },
  });
  return module.exports;
}

function appearanceScript(element) {
  if (!element || typeof element !== "object") return null;
  const script = element.props?.dangerouslySetInnerHTML?.__html;
  if (element.type === "script" && script?.startsWith("(function(){try")) return script;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = appearanceScript(child);
    if (found) return found;
  }
  return null;
}

for (const defaultStyle of ["classic", "glass"]) {
  for (const saved of [null, "classic", "glass", "invalid"]) {
    test(`pre-paint and reader agree: default ${defaultStyle}, stored ${saved}`, () => {
      const document = { documentElement: { dataset: {}, style: {} } };
      const window = {
        localStorage: { getItem: (key) => key === "pg_visual_style" ? saved : null },
        matchMedia: () => ({ matches: false }),
      };
      const env = { NEXT_PUBLIC_VISUAL_STYLE_DEFAULT: defaultStyle };
      const expected = saved === "classic" || saved === "glass" ? saved : defaultStyle;
      const library = loadModule("lib/visual-style.ts", env, window, document);
      assert.equal(library.readVisualStyle(), expected);

      const layout = loadModule("app/layout.tsx", env, window, document);
      const script = appearanceScript(layout.default({ children: null }));
      assert.ok(script, "the document must include its actual pre-paint script");
      vm.runInNewContext(script, { window, document });
      assert.equal(document.documentElement.dataset.visualStyle, expected);
    });
  }
}

test("blocked storage preserves the live style and notifies every mounted control", () => {
  const document = { documentElement: { dataset: {}, style: {} } };
  const events = [];
  const window = {
    localStorage: {
      getItem() { throw new Error("Storage unavailable"); },
      setItem() { throw new Error("Storage unavailable"); },
    },
    dispatchEvent(event) { events.push(event.type); },
  };
  const library = loadModule("lib/visual-style.ts", { NEXT_PUBLIC_VISUAL_STYLE_DEFAULT: "classic" }, window, document);
  assert.equal(library.readVisualStyle(), "classic");
  library.applyVisualStyle("glass");
  assert.equal(document.documentElement.dataset.visualStyle, "glass");
  assert.deepEqual(events, [library.VISUAL_STYLE_EVENT]);
});
