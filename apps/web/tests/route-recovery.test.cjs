const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const web = process.env.ROUTE_RECOVERY_SOURCE || path.resolve(__dirname, '..');
const compilerOptions = { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 };

const adminSource = fs.readFileSync(path.join(web, 'components/admin-credit-console.tsx'), 'utf8');
const ast = ts.createSourceFile('admin.tsx', adminSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'messageFromError');
assert.ok(declaration, 'load the actual production parser');
const parserModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(declaration.getText(ast), { compilerOptions }).outputText + '\nmodule.exports=messageFromError;', { module: parserModule, Error });
const message = parserModule.exports;
const fallback = 'Localized recovery';
const errorCases = [
  ['structured API detail', new Error(JSON.stringify({ detail: { code: 'CAPABILITY_NOT_IMPLEMENTED', message: 'Service unavailable' } })), 'Service unavailable'],
  ['legacy string detail', new Error(JSON.stringify({ detail: 'Permission denied' })), 'Permission denied'],
  ['validation array', new Error(JSON.stringify({ detail: [{ loc: ['body'], msg: 'invalid' }] })), fallback],
  ['unsupported detail object', new Error(JSON.stringify({ detail: { code: 'UNKNOWN', message: { nested: true } } })), fallback],
  ['null envelope', new Error('null'), fallback],
  ['numeric envelope', new Error('7'), fallback],
  ['empty detail', new Error(JSON.stringify({ detail: '' })), fallback],
  ['plain error', new Error('Network interrupted'), 'Network interrupted'],
  ['empty error', new Error(''), fallback],
  ['unknown thrown object', { detail: { message: 'untrusted object' } }, fallback],
];
for (const [name, error, expected] of errorCases) {
  test(`admin recovery safely renders ${name}`, () => {
    const actual = message(error, fallback);
    assert.equal(actual, expected);
    assert.equal(typeof actual, 'string');
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement('div', null, actual)));
  });
}

function DailyPushSettings() { return null; }
function loadDaily(preferences, subscription) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(web, 'app/[locale]/daily-push/page.tsx'), 'utf8');
  const mocks = {
    '@/components/daily-push-settings': { DailyPushSettings },
    '@/components/puregamma': {
      PageHeader: props => React.createElement('h1', null, props.title),
      ErrorState: props => React.createElement('div', null, props.title, props.description),
    },
    '@/lib/api': { getDailyPushPreferences: preferences, getBillingSubscription: subscription },
    '@/lib/metadata': { localizedMetadata: () => ({}) },
    '@/lib/translations': { getMessageNamespace: () => ({ title: 'Delivery preferences', subtitle: 'Account settings' }) },
    '@/i18n/routing': { isLocale: value => ['en', 'zh'].includes(value), withLocale: (locale, route) => `/${locale}${route}` },
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions }).outputText, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name) });
  return module.exports.default;
}
function find(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of [element.props?.children].flat(Infinity)) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}
const preference = { enabled: false, channel: 'email', timezone: 'UTC', local_time: '09:00' };
const history = [];
for (const locale of ['en', 'zh']) {
  test(`daily delivery preserves confirmed settings for ${locale}`, async () => {
    const page = loadDaily(async () => ({ preference, history }), async () => ({ plan: 'Pro' }));
    const tree = await page({ params: Promise.resolve({ locale }) });
    const settings = find(tree, element => element.type === DailyPushSettings);
    assert.ok(settings);
    assert.equal(settings.props.initial, preference);
    assert.equal(settings.props.initialHistory, history);
    assert.equal(settings.props.locale, locale);
    assert.equal(settings.props.plan, 'Pro');
    assert.equal(find(tree, element => element.props?.role === 'alert'), null);
  });
  test(`daily delivery recovers without editable controls for ${locale}`, async () => {
    for (const failure of ['preferences', 'subscription', 'billing-unavailable', 'missing-preference', 'invalid-history']) {
      const page = loadDaily(async () => {
        if (failure === 'preferences') throw new Error('{"detail":{"code":"DENIED","message":"Access unavailable"}}');
        return { preference: failure === 'missing-preference' ? null : preference, history: failure === 'invalid-history' ? null : history };
      }, async () => {
        if (failure === 'subscription') throw new Error('Network interrupted');
        return { plan: 'Pro', unavailable: failure === 'billing-unavailable' };
      });
      const tree = await page({ params: Promise.resolve({ locale }) });
      assert.equal(find(tree, element => element.type === DailyPushSettings), null, failure);
      assert.ok(find(tree, element => element.props?.role === 'alert'), failure);
      const retry = find(tree, element => element.type === 'a');
      assert.equal(retry?.props.href, `/${locale}/daily-push`, failure);
      assert.equal(retry.props.children, locale === 'zh' ? '重试加载设置' : 'Retry loading settings');
      assert.match(renderToStaticMarkup(tree), locale === 'zh' ? /每日推送设置暂不可用/ : /Daily delivery settings are unavailable/);
    }
  });
}
