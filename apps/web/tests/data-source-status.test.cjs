const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const web = path.resolve(__dirname, '..');
let response = { mockMode: false, sources: [] };
let table;
function load(filename, aliases = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require(name) {
    if (name in aliases) return aliases[name];
    if (name === '@/components/puregamma') return new Proxy({}, { get: () => () => null });
    if (name === 'lucide-react') return new Proxy({}, { get: () => () => null });
    if (name === '@/lib/api') return {};
    return require(name);
  } });
  return module.exports;
}
table = load(path.join(web, 'components/data-source-table.tsx'));
const classify = table.dataSourceReadState;

test('successful empty and non-primary catalogs differ from read failures', () => {
  assert.equal(classify([], {}), 'empty');
  assert.equal(classify([{ id: 'custom-archive' }], {}), 'ready');
  assert.equal(classify([{ id: 'rss' }], {}), 'ready');
  assert.equal(classify([], { unavailable: true, http_status: 0, error_code: 'NETWORK_ERROR' }), 'error');
  assert.equal(classify([], { http_status: 0 }), 'error');
  assert.equal(classify([], { unavailable: true, http_status: 503 }), 'error');
});

test('access denials cannot be interpreted as empty or available catalogs', () => {
  for (const status of [401, 403]) {
    assert.equal(classify([], { unavailable: true, http_status: status }), 'unauthorized');
    assert.equal(classify([{ id: 'rss' }], { http_status: status }), 'unauthorized');
  }
  assert.equal(classify(null), 'error');
  assert.equal(classify([null]), 'error');
  assert.equal(classify([{}]), 'error');
});

test('actual server page preserves selected availability metadata in client props', async () => {
  const page = load(path.join(web, 'app/[locale]/data-sources/page.tsx'), {
    '@/components/data-source-table': table,
    '@/lib/api': { getDataSources: async () => response },
    '@/lib/metadata': { localizedMetadata: () => ({}) },
    '@/lib/translations': { getMessageNamespace: () => ({ flow: [] }) },
    '@/i18n/routing': { isLocale: locale => ['en', 'zh'].includes(locale) },
  });
  function find(element) {
    if (!element || typeof element !== 'object') return null;
    if (element.type === table.DataSourceTable) return element.props;
    for (const child of [element.props?.children].flat(Infinity)) { const found = find(child); if (found) return found; }
    return null;
  }
  for (const metadata of [{ unavailable: true, http_status: 401, error_code: 'HTTP_401' }, { unavailable: true, http_status: 503, error_code: 'HTTP_503' }, { unavailable: true, http_status: 0, error_code: 'NETWORK_ERROR' }, { unavailable: false, http_status: 200, error_code: undefined }]) {
    response = { mockMode: false, sources: [], ...metadata };
    const props = find(await page.default({ params: Promise.resolve({ locale: 'zh' }) }));
    assert.ok(props);
    assert.equal(props.locale, 'zh');
    for (const field of ['unavailable', 'http_status', 'error_code']) assert.equal(props.initialAvailability[field], metadata[field]);
    assert.equal(props.initialSources, response.sources);
  }
});

test('actual getDataSources keeps its data contract and marks fallback unavailable', () => {
  const source = fs.readFileSync(path.join(web, 'lib/api.ts'), 'utf8');
  const ast = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getDataSources');
  assert.ok(declaration);
  const code = ts.transpileModule(declaration.getText(ast), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} }; let observed;
  vm.runInNewContext(code, { module, exports: module.exports, defaultLocale: 'en', api: (url, options) => { observed = { url, options }; return {}; } });
  module.exports.getDataSources('zh');
  assert.equal(observed.url, '/admin/data-sources');
  assert.equal(observed.options.locale, 'zh');
  assert.deepEqual(JSON.parse(JSON.stringify(observed.options.fallback)), { mockMode: false, sources: [], unavailable: true });
});
