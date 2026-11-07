const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extracted = spawnSync(process.env.PYTHON || 'python', ['-c',
  'import ast,pathlib,sys; tree=ast.parse(pathlib.Path(sys.argv[1]).read_text()); ' +
  'print(next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) ' +
  'and any(isinstance(t,ast.Name) and t.id=="_POCKET_UI" for t in n.targets)))',
  path.join(__dirname, '..', 'main.py')], { encoding: 'utf8' });
assert.equal(extracted.status, 0, extracted.stderr);
const script = extracted.stdout.match(/<script>([\s\S]*?)<\/script>/)[1];

async function browser({ secret = '', running = true } = {}) {
  const elements = new Map();
  const calls = [];
  const revoked = [];
  const listeners = new Map();
  let sequence = 0;
  const state = { secret, running, pin: '12345678', error: null };
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value: '', textContent: '', hidden: false, disabled: false,
      removeAttribute(name) { delete this[name]; },
    });
    return elements.get(id);
  }
  const context = vm.createContext({
    Headers,
    document: { getElementById: element },
    window: { addEventListener(name, callback) { listeners.set(name, callback); } },
    URL: {
      createObjectURL(blob) { assert.ok(blob instanceof Blob); return `blob:offline-${++sequence}`; },
      revokeObjectURL(value) { revoked.push(value); },
    },
    localStorage: { getItem() { throw new Error('RPC secret must not use persistent storage'); },
      setItem() { throw new Error('RPC secret must not use persistent storage'); } },
    sessionStorage: { getItem() { throw new Error('RPC secret must not use browser storage'); },
      setItem() { throw new Error('RPC secret must not use browser storage'); } },
    async fetch(url, options) {
      const headers = new Headers(options.headers);
      calls.push({ url, options, headers });
      assert.ok(url.startsWith('/rpc/'), 'RPC helper must keep same-origin paths');
      assert.equal(options.mode, 'same-origin');
      assert.equal(options.redirect, 'error');
      assert.equal(options.cache, 'no-store');
      if (state.error === 'network') throw new Error('offline network failure');
      if (state.error) return new Response('', { status: state.error });
      if (state.secret && headers.get('x-pocket-rpc-token') !== state.secret) {
        return new Response('', { status: 403 });
      }
      if (url === '/rpc/status') return Response.json({
        public: { pin: state.pin, running: state.running, url: 'https://offline.trycloudflare.com' },
        target: 'http://127.0.0.1:3000',
      });
      if (url === '/rpc/qr?kind=public') return new Response(new Uint8Array([137, 80, 78, 71]));
      assert.equal(options.method, 'POST');
      if (url === '/rpc/tunnel/stop') state.running = false;
      else if (url === '/rpc/tunnel/start') state.running = true;
      else if (url === '/rpc/pin/rotate') {
        assert.equal(headers.get('content-type'), 'application/json');
        assert.deepEqual(JSON.parse(options.body), { which: 'public' });
        state.pin = '87654321';
      } else assert.fail(`Unexpected RPC call: ${url}`);
      return Response.json({});
    },
  });
  await vm.runInContext(script, context);
  return { state, calls, revoked, listeners, element, run: (code) => vm.runInContext(code, context) };
}

async function unlock(page, token) {
  page.element('rpc-key').value = token;
  await page.run('unlock({preventDefault(){}})');
}

test('local control works without a secret and renders QR through a blob', async () => {
  const page = await browser();
  assert.equal(page.element('pub-pin').textContent, '12345678');
  assert.equal(page.element('rpc-key-form').hidden, true);
  assert.equal(page.element('tunnel-btn').disabled, false);
  assert.match(page.element('pub-qr').src, /^blob:/);
  assert.ok(page.calls.every((call) => !call.headers.has('x-pocket-rpc-token')));
});

test('secret authentication covers status, QR and actions without URL or storage exposure', async () => {
  const page = await browser({ secret: 'offline-admin-key' });
  assert.equal(page.element('rpc-key-form').hidden, false);
  assert.equal(page.element('pub-pin').textContent, '—');
  assert.equal(page.element('tunnel-btn').disabled, true);
  await unlock(page, 'wrong');
  assert.equal(page.element('rpc-key-form').hidden, false);
  const authorizedStart = page.calls.length;
  await unlock(page, 'offline-admin-key');
  assert.equal(page.element('rpc-key').value, '');
  assert.equal(page.element('rpc-key-form').hidden, true);
  assert.equal(page.element('pub-pin').textContent, '12345678');
  await page.run("rot('public')");
  assert.equal(page.element('pub-pin').textContent, '87654321');
  assert.ok(page.calls.slice(authorizedStart).every((call) =>
    call.headers.get('x-pocket-rpc-token') === 'offline-admin-key'));
  assert.ok(page.calls.every((call) => !call.url.includes('offline-admin-key')));
  assert.ok(!extracted.stdout.includes('offline-admin-key'));
});

test('rotation, stopping and page teardown revoke obsolete QR URLs', async () => {
  const page = await browser();
  const first = page.element('pub-qr').src;
  await page.run("rot('public')");
  const second = page.element('pub-qr').src;
  assert.notEqual(first, second);
  assert.ok(page.revoked.includes(first));
  await page.run('toggleTunnel()');
  assert.equal(page.state.running, false);
  assert.equal(page.element('pub-qr').hidden, true);
  assert.equal(page.element('pub-qr').src, undefined);
  assert.ok(page.revoked.includes(second));
  await page.run('toggleTunnel()');
  assert.equal(page.state.running, true);
  const last = page.element('pub-qr').src;
  page.listeners.get('beforeunload')();
  assert.ok(page.revoked.includes(last));
});

test('HTTP and network failures hide stale state and disable actions', async () => {
  for (const error of [500, 'network']) {
    const page = await browser();
    const previous = page.element('pub-qr').src;
    page.state.error = error;
    await page.run("rot('public')");
    assert.equal(page.element('pub-pin').textContent, '—');
    assert.equal(page.element('pub-qr').hidden, true);
    assert.equal(page.element('tunnel-btn').disabled, true);
    assert.ok(page.element('rpc-message').textContent);
    assert.ok(page.revoked.includes(previous));
  }
});

test('a rejected session prompts again and never persists into a fresh page', async () => {
  const page = await browser({ secret: 'offline-admin-key' });
  await unlock(page, 'offline-admin-key');
  page.state.secret = 'replacement-offline-key';
  await page.run("rot('public')");
  assert.equal(page.element('rpc-key-form').hidden, false);
  assert.equal(page.element('pub-pin').textContent, '—');
  const fresh = await browser({ secret: 'offline-admin-key' });
  assert.equal(fresh.element('rpc-key-form').hidden, false);
  assert.ok(fresh.calls.every((call) => !call.headers.has('x-pocket-rpc-token')));
});
