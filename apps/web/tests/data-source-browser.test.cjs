// Real production TSX in React/StrictMode and Chromium, served as a static bundle.
const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createServer } = require('node:http');
const { mkdtemp, writeFile, readFile, rm } = require('node:fs/promises');
const { existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { chromium, expect } = require('@playwright/test');
const compilerModule = require('next/dist/compiled/webpack/webpack');
compilerModule.init();
let directory, server, browser, origin;
const pending = new Map();
const requests = [];
const row = { id: 'rss', source: 'Owned RSS', provider: 'Offline registry', type: 'rss', status: 'HEALTHY', enabled: true, configured: true, entitled: true, redistributionAllowed: false, itemsIngested: 5, quotaLimit: null, licenseStatus: 'Attribution required', retentionPolicy: 'Summary only', errorCount: 0 };

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'pg-source-status-'));
  const loader = path.join(directory, 'typescript-loader.cjs');
  await writeFile(loader, `const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=function(source){return ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;};`);
  const api = path.join(directory, 'api.ts');
  await writeFile(api, `
    export async function getDataSources(locale:string){
      const id=++window.dsProbe.reads;
      const response=await fetch('/catalog?session='+encodeURIComponent(window.dsProbe.session)+'&read='+id+'&locale='+locale,{signal:AbortSignal.timeout(8000)});
      if(!response.ok)return {mockMode:false,sources:[],unavailable:true,http_status:response.status,error_code:'HTTP_'+response.status};
      return response.json();
    }
    export async function getDataSourcePreview(id:string){
      const read=++window.dsProbe.previewReads;
      const response=await fetch('/preview?session='+encodeURIComponent(window.dsProbe.session)+'&read='+read+'&source='+encodeURIComponent(id));
      if(!response.ok)throw Object.assign(new Error('Preview request failed'),{status:response.status});
      return response.json();
    }
    const forbidden=()=>{window.dsProbe.mutations++;return Promise.reject(new Error('No provider mutations in this fixture'));};
    export const checkDataSource=forbidden,controlDataSource=forbidden,syncDataSource=forbidden;
  `);
  const icons = path.join(directory, 'icons.tsx');
  await writeFile(icons, `import React from 'react';const Icon=(props:any)=><svg width="16" height="16" aria-hidden="true"/>;export const Eye=Icon,KeyRound=Icon,Loader2=Icon,Pause=Icon,Play=Icon,RefreshCw=Icon,Settings2=Icon;`);
  const badge = path.join(directory, 'badge.tsx');
  await writeFile(badge, `import React from 'react';export function DataSourceStatusBadge({status}:{status:string}){return <span>{status}</span>}`);
  const entry = path.join(directory, 'probe.tsx');
  await writeFile(entry, `
    import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';
    import {DataSourceTable} from ${JSON.stringify(process.env.DATA_SOURCE_COMPONENT_SOURCE || path.resolve(__dirname, '../components/data-source-table.tsx'))};
    window.dsProbe={session:new URLSearchParams(location.search).get('session'),reads:0,previewReads:0,mutations:0,ready:false};
    function Probe(){const[scenario,replace]=useState(window.dsScenario);const[shown,show]=useState(true);window.dsProbe.replace=replace;window.dsProbe.show=show;useEffect(()=>{window.dsProbe.ready=true},[]);return shown?<DataSourceTable initialSources={scenario.sources} initialAvailability={scenario.metadata} locale={scenario.locale}/>:<p>View removed</p>}
    createRoot(document.getElementById('root')).render(<React.StrictMode><Probe/></React.StrictMode>);
  `);
  await new Promise((resolve, reject) => {
    const compiler = compilerModule.webpack({ mode: 'development', target: 'web', devtool: false, entry,
      output: { path: directory, filename: 'probe.js' },
      resolve: { extensions: ['.tsx', '.ts', '.js'], modules: [path.resolve(__dirname, '../node_modules'), 'node_modules'], alias: { '@/lib/api': api, '@/components/puregamma': badge, 'lucide-react': icons } },
      module: { rules: [{ test: /\.tsx?$/, use: loader }] },
    }, (error, stats) => compiler.close(closeError => {
      if (error || closeError) return reject(error || closeError);
      if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
      resolve();
    }));
  });
  const bundle = await readFile(path.join(directory, 'probe.js'));
  server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    response.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/catalog' || url.pathname === '/preview') {
      const key = url.searchParams.get('session') + ':' + (url.pathname === '/preview' ? 'preview:' : '') + url.searchParams.get('read');
      requests.push({ key, method: request.method, path: url.pathname });
      pending.set(key, response); response.once('close', () => pending.delete(key)); return;
    }
    if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
    response.setHeader('Content-Type', url.pathname === '/probe.js' ? 'text/javascript' : 'text/html; charset=utf-8');
    response.end(url.pathname === '/probe.js' ? bundle : '<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:12px;font-family:system-ui}*{box-sizing:border-box}button,a{min-height:44px}article{margin-top:16px;padding:12px;border:1px solid}svg{width:16px;height:16px}p{overflow-wrap:anywhere}</style><div id="root"></div><script src="/probe.js"></script></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
}, { timeout: 90000 });

after(async () => {
  if (browser) await browser.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function pageFor(scenario, run) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const session = randomUUID();
  const errors = [], outside = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(scenario => { window.dsScenario = scenario; }, { sources: [], metadata: {}, locale: 'en', ...scenario });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin !== origin) { outside.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  async function settleResponse(kind, read, body, status = 200) {
    const key = `${session}:${kind === 'preview' ? 'preview:' : ''}${read}`;
    await expect.poll(() => pending.has(key)).toBeTruthy();
    const response = pending.get(key);
    response.writeHead(status, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(body));
  }
  async function disconnect(read) {
    const key = `${session}:${read}`;
    await expect.poll(() => pending.has(key)).toBeTruthy(); pending.get(key).destroy();
  }
  try {
    await page.goto(`${origin}/?session=${session}`);
    await page.waitForFunction(() => window.dsProbe?.ready);
    await run(page, { settle: (read, body, status) => settleResponse('catalog', read, body, status), settlePreview: (read, body, status) => settleResponse('preview', read, body, status), disconnect });
    assert.equal(await page.evaluate(() => window.dsProbe.mutations), 0);
    assert.deepEqual(errors, []); assert.deepEqual(outside, []);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.ok(requests.filter(request => request.key.startsWith(session + ':')).every(request => request.method === 'GET'));
  } finally { await context.close(); }
}

test('successful empty catalogs do not masquerade as access failure or auto-fetch', async () => {
  await pageFor({}, async page => {
    await expect(page.getByRole('heading', { name: 'No data sources configured', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => window.dsProbe.reads), 0);
  });
});

test('non-primary-only catalogs remain nonempty without expanding panel scope', async () => {
  await pageFor({ sources: [{ ...row, id: 'custom-archive' }] }, async page => {
    await expect(page.getByRole('status')).toContainText('1 sources were read, but they are outside');
    await expect(page.getByRole('heading', { name: 'No data sources configured' })).toHaveCount(0);
    await expect(page.getByRole('article')).toHaveCount(0);
    assert.equal(await page.evaluate(() => window.dsProbe.reads), 0);
  });
});

test('SSR permission metadata hides source cards and gives distinct bilingual access recovery', async () => {
  for (const locale of ['en', 'zh']) for (const status of [401, 403]) await pageFor({ locale, sources: [row], metadata: { unavailable: true, http_status: status } }, async page => {
    const title = status === 403 ? (locale === 'zh' ? '当前账户无权查看数据源' : 'This account cannot view data sources') : (locale === 'zh' ? '请登录后查看数据源' : 'Sign in to view data sources');
    await expect(page.getByRole('alert')).toContainText(title);
    await expect(page.getByRole('article')).toHaveCount(0);
    if (status === 401) await expect(page.getByRole('link')).toHaveAttribute('href', `/${locale}/login?returnTo=${encodeURIComponent(`/${locale}/data-sources`)}`);
    else await expect(page.getByRole('link')).toHaveCount(0);
  });
});

test('service failure retries through an announced current loading state to real rows', async () => {
  await pageFor({ metadata: { unavailable: true, http_status: 503 } }, async (page, { settle }) => {
    await expect(page.getByRole('alert')).toContainText('source service is temporarily unavailable');
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Loading source status');
    await expect(page.getByRole('button', { name: 'Refresh source status', exact: true })).toBeDisabled();
    await settle(1, { mockMode: false, sources: [row] });
    await expect(page.getByRole('article', { name: 'Owned RSS' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
});

test('failed refresh retains explicitly stale rows and disables actions until success', async () => {
  await pageFor({ sources: [row] }, async (page, { settle }) => {
    await page.getByRole('button', { name: 'Refresh source status', exact: true }).click();
    await expect(page.getByRole('article')).toContainText('Last confirmed · refresh required');
    await settle(1, { detail: 'Private upstream body must not be displayed' }, 503);
    await expect(page.getByRole('alert')).toContainText('last confirmed information');
    await expect(page.locator('body')).not.toContainText('Private upstream body');
    const article = page.getByRole('article');
    for (const button of await article.getByRole('button').all()) await expect(button).toBeDisabled();
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await settle(2, { mockMode: false, sources: [{ ...row, enabled: false, status: 'PAUSED' }] });
    await expect(article).toContainText('PAUSED');
    await expect(article).not.toContainText('Last confirmed');
    await expect(article.getByRole('button', { name: 'Resume', exact: true })).toBeEnabled();
  });
});

test('obsolete success cannot unlock a newer denial and obsolete failure cannot erase new rows', async () => {
  await pageFor({ sources: [row] }, async (page, { settle }) => {
    await page.getByRole('button', { name: 'Refresh source status', exact: true }).click();
    await page.evaluate(() => window.dsProbe.replace({ sources: [], metadata: { unavailable: true, http_status: 403 }, locale: 'en' }));
    await expect(page.getByRole('alert')).toContainText('This account cannot view');
    await settle(1, { mockMode: false, sources: [row] });
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('This account cannot view');
  });
  await pageFor({ metadata: { unavailable: true, http_status: 503 } }, async (page, { settle }) => {
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await page.evaluate(row => window.dsProbe.replace({ sources: [row], metadata: {}, locale: 'en' }), row);
    await expect(page.getByRole('article')).toBeVisible();
    await settle(1, {}, 503);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('article')).toBeVisible();
  });
});

test('network rejection is recoverable and later successful empty data remains empty', async () => {
  await pageFor({ sources: [row] }, async (page, { settle, disconnect }) => {
    await page.getByRole('button', { name: 'Refresh source status', exact: true }).click();
    await disconnect(1);
    await expect(page.getByRole('alert')).toContainText('Source status could not be loaded', { timeout: 11000 });
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await settle(2, { mockMode: false, sources: [] });
    await expect(page.getByRole('heading', { name: 'No data sources configured', exact: true })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
  });
});

test('unmounted pending reads cannot update a later source view', async () => {
  await pageFor({ sources: [row] }, async (page, { settle }) => {
    await page.getByRole('button', { name: 'Refresh source status', exact: true }).click();
    await page.evaluate(() => window.dsProbe.show(false));
    await expect(page.getByText('View removed', { exact: true })).toBeVisible();
    await settle(1, { mockMode: false, sources: [{ ...row, source: 'Obsolete private source' }] });
    await page.evaluate(() => window.dsProbe.show(true));
    await expect(page.getByRole('article', { name: 'Owned RSS' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Obsolete private source');
  });
});

test('a permission denial clears cached rows across pending and failed retries', async () => {
  await pageFor({ sources: [row] }, async (page, { settle }) => {
    await page.getByRole('button', { name: 'Refresh source status', exact: true }).click();
    await settle(1, {}, 403);
    await expect(page.getByRole('alert')).toContainText('This account cannot view');
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Loading source status');
    await expect(page.getByRole('article')).toHaveCount(0);
    await settle(2, {}, 503);
    await expect(page.getByRole('alert')).toContainText('Source status could not be loaded');
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await settle(3, { mockMode: false, sources: [{ ...row, source: 'New confirmed source' }] });
    await expect(page.getByRole('article', { name: 'New confirmed source' })).toBeVisible();
  });
});

test('preview permission loss clears privileged cards across pending and failed catalog retries', async () => {
  for (const status of [401, 403]) await pageFor({ sources: [row] }, async (page, { settle, settlePreview }) => {
    await page.getByRole('button', { name: 'Preview data', exact: true }).click();
    await settlePreview(1, {}, status);
    await expect(page.getByRole('alert')).toContainText(status === 403 ? 'This account cannot view' : 'Sign in to view');
    await expect(page.getByRole('article')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Loading source status');
    await expect(page.getByRole('article')).toHaveCount(0);
    await settle(1, {}, 503);
    await expect(page.getByRole('alert')).toContainText('Source status could not be loaded');
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.getByRole('button', { name: 'Retry source status', exact: true }).click();
    await settle(2, { mockMode: false, sources: [{ ...row, source: 'New authorized source' }] });
    await expect(page.getByRole('article', { name: 'New authorized source' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeEnabled();
  });
});
