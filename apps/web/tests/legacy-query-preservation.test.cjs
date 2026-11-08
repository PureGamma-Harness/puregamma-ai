const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createServer } = require('node:http');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { getURLFromRedirectError, getRedirectStatusCodeFromError } = require('next/dist/client/components/redirect');
const web = path.resolve(__dirname, '..');
const sourceRoot = process.env.LEGACY_QUERY_SOURCE_ROOT || web;

function load(relative, aliases = {}) {
  const filename = path.join(sourceRoot, relative);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, process, URLSearchParams,
    require(name) { return Object.hasOwn(aliases, name) ? aliases[name] : require(name); },
  }, { filename });
  return module.exports;
}

const routing = load('i18n/routing.ts');
let preferredLocale = 'en';
const helper = load('app/legacy-redirect.ts', {
  '@/i18n/request': { getPreferredLocale: async () => preferredLocale },
  '@/i18n/routing': routing,
});
const apiPage = load('app/api/page.tsx', { '@/app/legacy-redirect': helper });
const { middleware } = load('middleware.ts', {
  '@/i18n/routing': routing,
  '@/lib/route-access': load('lib/route-access.ts'),
  '@/lib/geoip': { isChinaIP: async () => { throw new Error('No external locale lookup allowed'); } },
});

const originalEnvironment = { auth: process.env.REQUIRE_AUTH, launch: process.env.NEXT_PUBLIC_INITIAL_LAUNCH_MODE };
test.after(() => {
  for (const [name, value] of [['REQUIRE_AUTH', originalEnvironment.auth], ['NEXT_PUBLIC_INITIAL_LAUNCH_MODE', originalEnvironment.launch]]) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function pageAliases() {
  const aliases = [];
  const visit = (directory, segments = []) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '[locale]') visit(path.join(directory, entry.name), [...segments, entry.name]);
      else if (entry.name === 'page.tsx') {
        const route = '/' + segments.filter(part => !/^\(.+\)$/.test(part)).join('/');
        if (!['/privacy', '/terms'].includes(route)) aliases.push(route);
      }
    }
  };
  visit(path.join(web, 'app'));
  return aliases.sort();
}

function pageSearchParams(search) {
  const result = Object.create(null);
  for (const key of new Set(search.keys())) {
    const values = search.getAll(key);
    result[key] = values.length === 1 ? values[0] : values;
  }
  return result;
}

async function redirectOf(run) {
  try { await run(); }
  catch (reason) {
    const location = getURLFromRedirectError(reason);
    if (!location) throw reason;
    return { location, status: getRedirectStatusCodeFromError(reason) };
  }
  throw new Error('Expected a real Next redirect');
}

test('all33 legacy aliases plus root preserve locale and query values over HTTP', async () => {
  process.env.NEXT_PUBLIC_INITIAL_LAUNCH_MODE = 'false';
  const aliases = pageAliases();
  assert.equal(aliases.length, 34);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const result = await middleware(new NextRequest(url, { headers: request.headers }));
      let status = result.status, location = result.headers.get('location');
      if (!location && aliases.includes(url.pathname)) {
        preferredLocale = /pg_locale=zh(?:;|$)/.test(request.headers.cookie || '') ? 'zh' : 'en';
        const page = url.pathname === '/api' ? apiPage : load(`app${url.pathname}/page.tsx`, {
          '@/app/legacy-redirect': helper,
          '@/i18n/routing': routing,
          '@/i18n/request': { getPreferredLocale: async () => preferredLocale },
        });
        ({ status, location } = await redirectOf(() => page.default({ searchParams: Promise.resolve(pageSearchParams(url.searchParams)) })));
      }
      response.writeHead(status, location ? { Location: location } : {}); response.end();
    } catch (reason) { response.writeHead(500); response.end(String(reason)); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  // NextURL canonicalizes numeric loopback hosts to localhost.
  const origin = `http://localhost:${server.address().port}`;
  const query = new URLSearchParams([
    ['route_audit', 'retained'], ['tag', 'BTC'], ['tag', 'ETH'], ['empty', ''],
    ['topic', '证据 & BTC/ETH? # %'], ['returnTo', '//outside.invalid/path?x=1&y=2'],
  ]);
  try {
    for (const locale of ['en', 'zh']) for (const alias of aliases) {
      const response = await fetch(`${origin}${alias}?${query}`, { redirect: 'manual', headers: { Cookie: `pg_session=offline; pg_locale=${locale}` } });
      assert.equal(response.status, 307, alias);
      const destination = new URL(response.headers.get('location'), origin);
      assert.equal(destination.origin, origin, alias);
      assert.equal(destination.pathname, `/${locale}${alias === '/' ? '' : alias}`, alias);
      for (const key of new Set(query.keys())) assert.deepEqual(destination.searchParams.getAll(key), query.getAll(key), `${locale}${alias}:${key}`);
    }
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});

test('actual API-documentation page serializes repeated, blank and redirect-looking values as query data', async () => {
  for (const locale of ['en', 'zh']) {
    preferredLocale = locale;
    const { location, status } = await redirectOf(() => apiPage.default({ searchParams: Promise.resolve({
      tag: ['BTC', '', 'ETH'], blank: '', ignored: undefined, returnTo: 'https://outside.invalid/?next=/admin', token: 'a&b=c+#%/中文',
    }) }));
    assert.equal(status, 307);
    const destination = new URL(location, 'https://local.invalid');
    assert.equal(destination.origin, 'https://local.invalid');
    assert.equal(destination.pathname, `/${locale}/api`);
    assert.deepEqual(destination.searchParams.getAll('tag'), ['BTC', '', 'ETH']);
    assert.equal(destination.searchParams.get('blank'), '');
    assert.equal(destination.searchParams.has('ignored'), false);
    assert.equal(destination.searchParams.get('returnTo'), 'https://outside.invalid/?next=/admin');
    assert.equal(destination.searchParams.get('token'), 'a&b=c+#%/中文');
  }
});

test('existing single-argument page redirect callers remain compatible', async () => {
  preferredLocale = 'zh';
  const result = await redirectOf(() => helper.redirectToLocalized('/reports'));
  assert.equal(result.location, '/zh/reports');
  assert.equal(result.status, 307);
});

test('bare API documentation and every API-prefix request retain the existing middleware bypass', async () => {
  for (const route of ['/api', '/api/agent/conversations?cursor=one', '/api/auth/callback?token=one', '/apiary?unchanged=true']) {
    const result = await middleware(new NextRequest(`https://local.invalid${route}`));
    assert.equal(result.status, 200, route);
    assert.equal(result.headers.get('location'), null, route);
    assert.equal(result.headers.get('x-middleware-next'), '1', route);
  }
});

test('auth returnTo and default initial-launch hiding preserve their existing boundaries', async () => {
  process.env.REQUIRE_AUTH = 'true';
  delete process.env.NEXT_PUBLIC_INITIAL_LAUNCH_MODE;
  for (const locale of ['en', 'zh']) {
    const pathname = `/${locale}/account`;
    const search = '?tab=credits&returnTo=https%3A%2F%2Foutside.invalid%2F';
    const result = await middleware(new NextRequest(`https://local.invalid${pathname}${search}`));
    const login = new URL(result.headers.get('location'));
    assert.equal(login.origin, 'https://local.invalid');
    assert.equal(login.pathname, `/${locale}/login`);
    assert.equal(login.searchParams.get('returnTo'), pathname + search);
    const hidden = await middleware(new NextRequest(`https://local.invalid/${locale}/data-sources?route_audit=hidden`));
    const dashboard = new URL(hidden.headers.get('location'));
    assert.equal(dashboard.pathname, `/${locale}/dashboard`);
    assert.equal(dashboard.search, '');
  }
});
