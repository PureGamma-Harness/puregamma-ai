const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function moduleFor(name, storage) {
  const source = fs.readFileSync(path.join(__dirname, '../lib', name + '.ts'), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { exports: {}, window: { localStorage: storage } };
  vm.runInNewContext(compiled, sandbox, { filename: name + '.ts' });
  return sandbox.exports;
}

test('auth return paths preserve local destinations and refuse browser URL normalization escapes', () => {
  const { safeReturnTo } = moduleFor('auth-navigation');
  for (const input of [null, '', 'https://outside.invalid', '//outside.invalid', '/\\outside.invalid', '/\n/outside.invalid', '/\t/outside.invalid', 'javascript:alert(1)']) {
    assert.equal(safeReturnTo(input, '/zh/chat'), '/zh/chat');
  }
  for (const input of ['/en/onboarding/channels', '/zh/reports?report=owned-id', '/portfolio#positions']) {
    assert.equal(safeReturnTo(input, '/en/chat'), input);
    assert.equal(new URL(input, 'https://puregamma.invalid').origin, 'https://puregamma.invalid');
  }
});

test('a fresh draft restores valid existing research choices and rejects corrupted values independently', () => {
  const values = new Map([['pg_onboarding_assets', '{broken'], ['pg_onboarding_style', 'momentum']]);
  const { readOnboardingDraft } = moduleFor('onboarding-draft', { getItem: (key) => values.get(key) ?? null });
  assert.equal(readOnboardingDraft().style, 'momentum');
  assert.equal(JSON.stringify(readOnboardingDraft().assets), '["BTC","ETH","SOL"]');
  values.set('pg_onboarding_assets', '["HYPE","HYPE","MSTR"]');
  assert.equal(JSON.stringify(readOnboardingDraft().assets), '["HYPE","MSTR"]');
  values.set('pg_onboarding_assets', '["unsupported"]');
  values.set('pg_onboarding_style', 'injected-style');
  assert.equal(JSON.stringify(readOnboardingDraft().assets), '["HYPE","MSTR"]');
  assert.equal(readOnboardingDraft().style, 'momentum');
});

test('storage denial retains research choices in this tab without throwing or persisting recipients', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const draft = moduleFor('onboarding-draft', storage);
  assert.equal(draft.saveOnboardingDraft({ assets: ['SOL'], style: 'event-driven' }), false);
  assert.equal(JSON.stringify(draft.readOnboardingDraft()), '{"assets":["SOL"],"style":"event-driven"}');
});

test('a write-quota failure cannot resurrect an older readable draft', () => {
  const values = new Map([['pg_onboarding_assets', '["BTC"]'], ['pg_onboarding_style', 'risk-controlled']]);
  const storage = { getItem: (key) => values.get(key) ?? null, setItem() { throw new Error('quota exceeded'); } };
  const draft = moduleFor('onboarding-draft', storage);
  draft.readOnboardingDraft();
  assert.equal(draft.saveOnboardingDraft({ assets: [], style: 'momentum' }), false);
  assert.equal(JSON.stringify(draft.readOnboardingDraft()), '{"assets":[],"style":"momentum"}');
});

test('persisted draft keys contain only research assets and style', () => {
  const values = new Map();
  const draft = moduleFor('onboarding-draft', { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) });
  assert.equal(draft.saveOnboardingDraft({ assets: ['ETH'], style: 'high-beta' }), true);
  assert.deepEqual([...values.keys()].sort(), ['pg_onboarding_assets', 'pg_onboarding_style']);
  assert.equal(JSON.stringify(draft.readOnboardingDraft()), '{"assets":["ETH"],"style":"high-beta"}');
});
